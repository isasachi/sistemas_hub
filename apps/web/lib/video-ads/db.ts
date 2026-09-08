import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VideoSessionResponse } from './types'

// Cliente lazy singleton dedicado al wizard de video (espeja landing/db.ts).
let _db: SupabaseClient | null = null

function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _db
}

export async function createVideoSession(userId?: string): Promise<string> {
  const { data, error } = await getDb()
    .from('video_sessions')
    .insert({ step: 0, user_id: userId ?? null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

// Fila de preview para el historial (columnas mínimas, no toda la sesión).
export interface VideoListRow {
  id: string
  created_at: string
  step: number
  product_name: string | null
  video_url: string | null
  character_url: string | null
  product_url: string | null
  // Señal angosta de "¿terminó el render?" — NO `!!video_url` (ese se estampa con el
  // primer lote listo). Ver render_done en types.ts / la migración
  // 20260812000003_video_render_done.sql. Se selecciona sola, sin `lotes` (jsonb con
  // los prompts de cada lote, miles de caracteres) para no arrastrar ese peso en una
  // lista de 24 filas.
  render_done: boolean
}

export async function listVideoSessions(userId: string): Promise<VideoListRow[]> {
  const { data, error } = await getDb()
    .from('video_sessions')
    .select('id, created_at, step, product_name, video_url, character_url, product_url, render_done')
    .eq('user_id', userId)
    // Se filtra al LEER, además de no crear la fila hasta el primer insumo: una sesión
    // fantasma vieja sigue en la base y no se borra —sería una migración destructiva para
    // arreglar un problema de presentación— pero no tiene por qué empujar el trabajo real
    // hacia abajo del listado. Mismo criterio y mismo filtro que las otras tres tools
    // (`listAdSessions` por `reference_url`, landing por `product_name`, branding por
    // `brand_name`). ⚠️ El `step` NO sirve de discriminante: nace en 0 y una sesión real
    // también pasa por 0.
    .not('reference_video_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as VideoListRow[]
}

/**
 * PERTENENCIA — el `uid` llega resuelto por quien llama (`readUserId`: el usuario
 * autenticado o la cookie `ph_uid`), un `uid` nulo devuelve null, y una fila de otro
 * dueño es indistinguible de una que no existe. NO se endurece a `getUser()` a secas:
 * la mayoría de las sesiones están claveadas por COOKIE, y exigir cuenta las dejaría
 * a todas fuera del alcance de su propio dueño.
 */
export async function getVideoSession(id: string, uid: string | null): Promise<VideoSessionResponse | null> {
  if (!uid) return null
  const { data, error } = await getDb()
    .from('video_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', uid)
    .single()
  if (error) return null
  return data as VideoSessionResponse
}

/**
 * Devuelve si borró algo. Un DELETE que no matchea NO es error en PostgREST, así que
 * sin el `count` la ruta respondería `{ok:true}` sobre una sesión ajena que sigue viva.
 */
export async function deleteVideoSession(id: string, uid: string | null): Promise<boolean> {
  if (!uid) return false
  const { error, count } = await getDb()
    .from('video_sessions')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', uid)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

export async function updateVideoSession(
  id: string,
  patch: Partial<Omit<VideoSessionResponse, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await getDb().from('video_sessions').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Escritura CONDICIONAL, específica del render por lotes (fix round 2, único caller:
 * `generate-lotes/route.ts`) — NO una variante genérica de `updateVideoSession`, a
 * propósito: el resto de las rutas de video-ads no necesita ni debe cargar con esta
 * semántica.
 *
 * Cierra el race de un doble POST concurrente sobre una sesión NUEVA: dos requests
 * que llegan casi al mismo tiempo pueden ambos leer `lotes: null` antes de que
 * cualquiera escriba, pasar el guard secuencial (que también lee `lotes` antes de
 * escribir) y crear DOS juegos de tareas pagadas en KIE — con solo una sobreviviendo
 * en la fila, la otra queda huérfana y sin forma de verse. Es el mismo defecto que
 * el guard secuencial cierra para el doble-submit NO concurrente, pero ese guard por
 * sí solo no alcanza acá porque lee y escribe en pasos separados sin nada que
 * los ate.
 *
 * La condición `lotes IS NULL` en el UPDATE hace que la escritura que gana sea
 * observable por la que pierde ANTES de gastar en KIE: se llama con un `patch` de
 * lotes "idle" (sin `taskId`, sin plata gastada todavía) ANTES del loop de creación,
 * no después — si ya se hubiera gastado antes de este chequeo, ganar o perder la
 * escritura ya no evitaría el gasto duplicado, solo escondería uno de los dos
 * resultados. Si la condición no se cumple (0 filas afectadas), alguien más ya
 * reclamó la sesión — el caller corta ahí, sin haber llamado a KIE.
 *
 * Deliberadamente angosto: solo protege la transición `lotes: null → lotes: [...]`,
 * no cualquier escritura futura de `lotes` (eso pediría un lock real o un campo de
 * versión). Una sesión que ya fue tocada una vez (aunque haya fallado por completo y
 * quedado con placeholders `idle`, sin ningún `taskId`) ya no pasa por esta función
 * — vuelve a las escrituras normales de `updateVideoSession`, con el mismo residual
 * de no-atomicidad que el resto del módulo acepta.
 *
 * @returns `true` si la condición se cumplió y la fila quedó reclamada; `false` si
 * otra escritura ganó la carrera (el caller debe tratar la sesión como ya tomada).
 */
export async function claimFreshLotes(
  id: string,
  patch: Pick<VideoSessionResponse, 'step' | 'lotes' | 'duration' | 'render_done'>
): Promise<boolean> {
  const { data, error } = await getDb()
    .from('video_sessions')
    .update(patch)
    .eq('id', id)
    .is('lotes', null)
    .select('id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}
