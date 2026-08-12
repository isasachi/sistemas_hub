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
}

export async function listVideoSessions(userId: string): Promise<VideoListRow[]> {
  const { data, error } = await getDb()
    .from('video_sessions')
    .select('id, created_at, step, product_name, video_url, character_url, product_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as VideoListRow[]
}

export async function getVideoSession(id: string): Promise<VideoSessionResponse | null> {
  const { data, error } = await getDb()
    .from('video_sessions')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as VideoSessionResponse
}

export async function deleteVideoSession(id: string): Promise<void> {
  const { error } = await getDb().from('video_sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
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
  patch: Pick<VideoSessionResponse, 'step' | 'lotes' | 'duration'>
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
