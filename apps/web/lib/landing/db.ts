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

export async function createLandingSession(): Promise<string> {
  const { data, error } = await getDb()
    .from('landing_sessions')
    .insert({ step: 0 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
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
