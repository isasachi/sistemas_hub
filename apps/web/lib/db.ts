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
  const { data, error } = await getDb()
    .from('sessions')
    .select('id, created_at, step, product_name, image_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as AnuncioListRow[]
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

export async function deleteSession(id: string): Promise<void> {
  const { error } = await getDb().from('sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
