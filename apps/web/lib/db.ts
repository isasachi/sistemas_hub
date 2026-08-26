import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SessionResponse } from './types'

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

export async function createSession(userId?: string): Promise<string> {
  const { data, error } = await getDb()
    .from('sessions')
    .insert({ step: 0, user_id: userId ?? null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

// Fila de preview para el historial (columnas mínimas, no toda la sesión).
export interface AnuncioListRow {
  id: string
  created_at: string
  step: number
  product_name: string | null
  image_url: string | null
}

export async function listSessions(userId: string): Promise<AnuncioListRow[]> {
  // ⚠️ NO SE LISTAN LAS SESIONES VACÍAS. El wizard crea la fila al MONTAR la página, así
  // que abrir la tool y no hacer nada deja una sesión en el historial — y en dev, con el
  // StrictMode de React montando dos veces, deja DOS. Medido sobre la base: 103 de 144 filas de `sessions` no tienen referencia.
  // Una sesión sin imagen de referencia es una que el usuario nunca empezó: no hay nada
  // que abrir ni que borrar, solo ruido que empuja hacia abajo el trabajo real.
  //
  // Se filtra al LEER y no se borran filas: son inofensivas, y borrarlas es una migración
  // destructiva para arreglar un problema de presentación. El `step` no sirve de
  // discriminante (nace en 0 y una sesión real también pasa por 0).
  const { data, error } = await getDb()
    .from('sessions')
    .select('id, created_at, step, product_name, image_url')
    .eq('user_id', userId)
    .not('reference_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as AnuncioListRow[]
}

/**
 * PERTENENCIA — el `uid` no es opcional, y esa es la mitad que importa.
 *
 * Hasta el 2026-08-21 esto filtraba solo por `id`: con el UUID de otro se leía su
 * sesión entera (fotos del producto, copy, marca). La identidad es la misma que usa
 * el resto del hub (`readUserId`): el usuario autenticado o la cookie anónima
 * `ph_uid` — por eso `user_id` es `text` y no `uuid`.
 *
 * ⚠️ `uid` nulo devuelve null: sin identidad no hay nada que reclamar. Y las filas
 * legadas con `user_id` nulo (203 de 338 al 2026-08-21) quedan fuera del alcance de
 * todos, lo que NO le quita nada a nadie: `listSessions` ya filtra por `user_id`, así
 * que hoy son inalcanzables desde la UI. Lo único que cambia es que tampoco se llegue
 * por id.
 *
 * ⚠️ El `uid` llega resuelto, esto NO lee cookies: `tests/lib/db.test.ts` carga este
 * módulo de verdad (solo mockea `@supabase/supabase-js`), y meterle `next/headers`
 * obligaría a simular un scope de request en toda la suite.
 */
export async function getSession(id: string, uid: string | null): Promise<SessionResponse | null> {
  if (!uid) return null
  const { data, error } = await getDb()
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', uid)
    .single()
  if (error) return null
  return data as SessionResponse
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<SessionResponse, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await getDb()
    .from('sessions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
}

/**
 * Devuelve si borró algo. Un DELETE que no matchea NO es un error en PostgREST, así
 * que sin el `count` la ruta respondería `{ok:true}` sobre una sesión ajena que sigue
 * viva — éxito silencioso, el peor modo de fallo. Borrar además no cuesta cuota, o sea
 * `checkGenQuota` nunca lo frenó: esta comprobación es el único gate que tiene.
 */
export async function deleteSession(id: string, uid: string | null): Promise<boolean> {
  if (!uid) return false
  const { error, count } = await getDb()
    .from('sessions')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', uid)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}
