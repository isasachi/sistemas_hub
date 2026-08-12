import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VideoSessionResponse } from './types'

// Cliente lazy singleton dedicado al wizard de video (espeja landing/db.ts).
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

export async function createVideoSession(userId?: string): Promise<string> {
  const { data, error } = await getDb()
    .from('video_sessions')
    .insert({ step: 0, user_id: userId ?? null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

// Fila de preview para el historial (columnas mínimas, no toda la sesión).
export interface VideoListRow {
  id: string
  created_at: string
  step: number
  product_name: string | null
  video_url: string | null
  character_url: string | null
  product_url: string | null
}

export async function listVideoSessions(userId: string): Promise<VideoListRow[]> {
  const { data, error } = await getDb()
    .from('video_sessions')
    .select('id, created_at, step, product_name, video_url, character_url, product_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as VideoListRow[]
}

export async function getVideoSession(id: string): Promise<VideoSessionResponse | null> {
  const { data, error } = await getDb()
    .from('video_sessions')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as VideoSessionResponse
}

export async function deleteVideoSession(id: string): Promise<void> {
  const { error } = await getDb().from('video_sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function updateVideoSession(
  id: string,
  patch: Partial<Omit<VideoSessionResponse, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await getDb().from('video_sessions').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
