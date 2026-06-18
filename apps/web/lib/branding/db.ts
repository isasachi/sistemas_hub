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

export async function createBrandingSession(): Promise<string> {
  const { data, error } = await getDb()
    .from('branding_sessions')
    .insert({ step: 0 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
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
