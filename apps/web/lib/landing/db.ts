import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { LandingSessionResponse, LandingSection } from './types'

// Cliente lazy singleton dedicado al wizard de landing (espeja branding/db.ts).
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

// `userId` es OBLIGATORIO: con el parámetro opcional, un call site que lo omitía
// escribía user_id null en silencio y la sesión no aparecía nunca en el historial.
// Que sea requerido hace que tsc marque el hueco en vez de la base.
export async function createLandingSession(userId: string): Promise<string> {
  const { data, error } = await getDb()
    .from('landing_sessions')
    .insert({ step: 0, user_id: userId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

// Fila de preview para el historial (columnas mínimas, no toda la sesión).
export interface LandingListRow {
  id: string
  created_at: string
  step: number
  product_name: string | null
  product_photo_urls: string[] | null
  sections: { imageUrl: string | null; status: string }[] | null
}

export async function listLandingSessions(userId: string): Promise<LandingListRow[]> {
  const { data, error } = await getDb()
    .from('landing_sessions')
    .select('id, created_at, step, product_name, product_photo_urls, sections')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as LandingListRow[]
}

export async function getLandingSession(id: string): Promise<LandingSessionResponse | null> {
  const { data, error } = await getDb()
    .from('landing_sessions')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as LandingSessionResponse
}

// Claim ATÓMICO de la clasificación (2026-08-15). Espeja `claimFreshLotes` de video-ads.
//
// POR QUÉ: `classify/route.ts` decide si clasificar leyendo la sesión, y dos llamadas solapadas
// leen las dos "sin clasificar" antes de que cualquiera escriba — el guard de idempotencia no las
// ve. Medido con dos POST concurrentes: las dos llamaron a Gemini y devolvieron clasificaciones
// DISTINTAS (`supplement_skin_female/rostro` y `joint_mobility/rodilla`). Con escritura ciega gana
// la última, y el navegador pinta la respuesta de SU fetch — así que la pantalla puede mostrar un
// nicho y la base tener otro, que es de donde después sale el ADN.
//
// El `.is('niche_id', null)` hace que gane el PRIMERO que escribe; el que pierde se entera (false)
// y devuelve lo que quedó guardado, así base y UI dicen siempre lo mismo.
export async function claimClassification(
  id: string,
  patch: Pick<LandingSessionResponse, 'niche_id' | 'demographic_id' | 'body_focus'>
): Promise<boolean> {
  const { data, error } = await getDb()
    .from('landing_sessions')
    .update(patch)
    .eq('id', id)
    .is('niche_id', null)
    .select('id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

export async function updateLandingSession(
  id: string,
  patch: Partial<Omit<LandingSessionResponse, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await getDb()
    .from('landing_sessions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
}

export async function deleteLandingSession(id: string): Promise<void> {
  const { error } = await getDb().from('landing_sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Fase 6 (paralelización): upsert ATÓMICO de UNA sección en el array jsonb `sections` vía RPC
// `landing_upsert_section` (FOR UPDATE + reconstrucción por `type`). Reemplaza el read-modify-write
// del array completo, que perdía updates cuando el cliente genera las secciones en paralelo. La RPC
// también sube `step` a ≥5. Devuelve la sección tal cual para que el caller la retorne al cliente.
export async function upsertLandingSection(id: string, section: LandingSection): Promise<void> {
  const { error } = await getDb().rpc('landing_upsert_section', { p_id: id, p_section: section })
  if (error) throw new Error(error.message)
}
