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

export async function createBrandingSession(userId?: string): Promise<string> {
  const { data, error } = await getDb()
    .from('branding_sessions')
    .insert({ step: 0, user_id: userId ?? null })
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
  const { data, error } = await getDb()
    .from('branding_sessions')
    .select('id, created_at, step, brand_name, logo_url, mockup_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as BrandingListRow[]
}

export async function getBrandingSession(id: string): Promise<BrandingSessionResponse | null> {
  const { data, error } = await getDb()
    .from('branding_sessions')
    .select('*')
    .eq('id', id)
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

export async function deleteBrandingSession(id: string): Promise<void> {
  const { error } = await getDb().from('branding_sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
