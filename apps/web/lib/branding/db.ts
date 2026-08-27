import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BrandingSessionResponse } from './types'

// Cliente lazy singleton dedicado al wizard de branding. No reutiliza lib/db.ts
// porque ese está cableado a la tabla `sessions` (generador-anuncios).

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

// `userId` es OBLIGATORIO — ver el mismo comentario en lib/landing/db.ts.
export async function createBrandingSession(userId: string): Promise<string> {
  const { data, error } = await getDb()
    .from('branding_sessions')
    .insert({ step: 0, user_id: userId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

// Fila de preview para el historial (columnas mínimas, no toda la sesión).
export interface BrandingListRow {
  id: string
  created_at: string
  step: number
  brand_name: string | null
  logo_url: string | null
  mockup_url: string | null
}

export async function listBrandingSessions(userId: string): Promise<BrandingListRow[]> {
  // ⚠️ NO SE LISTAN LAS SESIONES VACÍAS. El wizard crea la fila al MONTAR la página, así
  // que abrir la tool y no hacer nada deja una sesión en el historial — y en dev, con el
  // StrictMode de React montando dos veces, deja DOS. Medido sobre la base: 40 de 107 filas de `branding_sessions` no tienen marca.
  // Una sesión sin marca es una que el usuario nunca empezó: no hay nada
  // que abrir ni que borrar, solo ruido que empuja hacia abajo el trabajo real.
  //
  // Se filtra al LEER y no se borran filas: son inofensivas, y borrarlas es una migración
  // destructiva para arreglar un problema de presentación. El `step` no sirve de
  // discriminante (nace en 0 y una sesión real también pasa por 0).
  const { data, error } = await getDb()
    .from('branding_sessions')
    .select('id, created_at, step, brand_name, logo_url, mockup_url')
    .eq('user_id', userId)
    .not('brand_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as BrandingListRow[]
}

/**
 * PERTENENCIA — ver la nota larga en `lib/db.ts` (`getSession`). En corto: el `uid`
 * llega resuelto por quien llama (`readUserId`: usuario autenticado o cookie `ph_uid`),
 * un `uid` nulo devuelve null, y las filas legadas sin `user_id` quedan fuera del
 * alcance de todos — igual que ya lo estaban en los listados del historial.
 */
export async function getBrandingSession(id: string, uid: string | null): Promise<BrandingSessionResponse | null> {
  if (!uid) return null
  const { data, error } = await getDb()
    .from('branding_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', uid)
    .single()
  if (error) return null
  return data as BrandingSessionResponse
}

export async function updateBrandingSession(
  id: string,
  patch: Partial<Omit<BrandingSessionResponse, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await getDb()
    .from('branding_sessions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
}

/**
 * Devuelve si borró algo — ver `deleteSession` en `lib/db.ts`. Un DELETE que no
 * matchea no es error en PostgREST, así que sin el `count` la ruta respondería
 * `{ok:true}` sobre una sesión ajena que sigue viva.
 */
export async function deleteBrandingSession(id: string, uid: string | null): Promise<boolean> {
  if (!uid) return false
  const { error, count } = await getDb()
    .from('branding_sessions')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', uid)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}
