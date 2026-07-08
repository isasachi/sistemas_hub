import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { LandingSessionResponse } from './types'

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

export async function createLandingSession(userId?: string): Promise<string> {
  const { data, error } = await getDb()
    .from('landing_sessions')
    .insert({ step: 0, user_id: userId ?? null })
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
