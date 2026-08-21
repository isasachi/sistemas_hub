import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { StoredInputs, StoredSnapshot } from './stored'

// Cliente lazy singleton para el historial de la calculadora (espeja landing/db.ts).
// A diferencia de las otras tools, la sesión se crea al FINAL (al llegar al resultado),
// no al empezar el wizard.
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

// KPIs para el preview de la card (evita recalcular en el listado). La vista detalle
// sí recalcula al vuelo desde `inputs` para quedar consistente con el modelo.
// La forma la define `stored.ts`, que es donde vive el discriminador precio/rentabilidad.
export type CalcSnapshot = StoredSnapshot

export interface CalcSessionRow {
  id: string
  created_at: string
  inputs: StoredInputs
  snapshot: StoredSnapshot
}

export async function createCalcSession(
  userId: string,
  inputs: StoredInputs,
  snapshot: StoredSnapshot
): Promise<string> {
  const { data, error } = await getDb()
    .from('calc_sessions')
    .insert({ user_id: userId, inputs, snapshot })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

/**
 * El ÚNICO escritor del hub que no lee la sesión antes, y por eso necesita su propia
 * comprobación de pertenencia: el resto de las rutas carga con `getX(id, uid)` y corta
 * en null, así que la guarda del loader las cubre. Ésta escribía directo, o sea con el
 * UUID ajeno se sobrescribía el P&G guardado de otro — sin auth, sin cuota y sin LLM.
 *
 * Devuelve si escribió algo, por el mismo motivo que los deletes: un UPDATE que no
 * matchea no es error, y `{ok:true}` sobre datos ajenos intactos es éxito silencioso.
 */
export async function updateCalcSession(
  id: string,
  uid: string | null,
  inputs: StoredInputs,
  snapshot: StoredSnapshot
): Promise<boolean> {
  if (!uid) return false
  const { error, count } = await getDb()
    .from('calc_sessions')
    .update({ inputs, snapshot }, { count: 'exact' })
    .eq('id', id)
    .eq('user_id', uid)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

/**
 * PERTENENCIA — ver la nota larga en `lib/db.ts` (`getSession`). En corto: el `uid`
 * llega resuelto por quien llama (`readUserId`: usuario autenticado o cookie `ph_uid`),
 * un `uid` nulo devuelve null, y las filas legadas sin `user_id` quedan fuera del
 * alcance de todos — igual que ya lo estaban en los listados del historial.
 */
export async function getCalcSession(id: string, uid: string | null): Promise<CalcSessionRow | null> {
  if (!uid) return null
  const { data, error } = await getDb()
    .from('calc_sessions')
    .select('id, created_at, inputs, snapshot')
    .eq('id', id)
    .eq('user_id', uid)
    .single()
  if (error) return null
  return data as CalcSessionRow
}

export async function listCalcSessions(userId: string): Promise<CalcSessionRow[]> {
  const { data, error } = await getDb()
    .from('calc_sessions')
    .select('id, created_at, inputs, snapshot')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as CalcSessionRow[]
}

/**
 * Devuelve si borró algo — ver `deleteSession` en `lib/db.ts`. Un DELETE que no
 * matchea no es error en PostgREST, así que sin el `count` la ruta respondería
 * `{ok:true}` sobre una sesión ajena que sigue viva.
 */
export async function deleteCalcSession(id: string, uid: string | null): Promise<boolean> {
  if (!uid) return false
  const { error, count } = await getDb()
    .from('calc_sessions')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', uid)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}
