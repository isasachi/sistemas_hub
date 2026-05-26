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

export async function createSession(): Promise<string> {
  const { data, error } = await getDb()
    .from('sessions')
    .insert({ step: 0 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function getSession(id: string): Promise<SessionResponse | null> {
  const { data, error } = await getDb()
    .from('sessions')
    .select('*')
    .eq('id', id)
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
