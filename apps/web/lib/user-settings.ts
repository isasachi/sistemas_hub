/**
 * Ajustes por usuario. Hoy son uno solo: la API key de KIE con la que se
 * renderiza el video (BYOK — el render lo paga el usuario, por eso el generador
 * de video viene incluido en los tres planes).
 *
 * Tabla `user_settings` (migración 20260820000001_plan_tiers.sql), RLS on sin
 * políticas → solo el service role.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getUser } from './supabase/server'

let _db: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return _db
}

export async function getKieKey(userId: string): Promise<string | null> {
  const { data, error } = await getDb()
    .from('user_settings').select('kie_api_key').eq('user_id', userId).maybeSingle()
  if (error) {
    console.error('[settings] leyendo kie_api_key:', error.message)
    return null
  }
  return ((data?.kie_api_key as string | null) ?? null) || null
}

/** La key del usuario de ESTA request, o null (sin sesión o sin cargarla). */
export async function currentKieKey(): Promise<string | null> {
  const user = await getUser().catch(() => null)
  return user ? getKieKey(user.id) : null
}

/** Guarda (o borra, con string vacío) la key del usuario. */
export async function setKieKey(userId: string, key: string | null): Promise<void> {
  const limpia = (key ?? '').trim()
  const { error } = await getDb().from('user_settings').upsert(
    { user_id: userId, kie_api_key: limpia || null, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(`guardando kie_api_key: ${error.message}`)
}

/**
 * Cómo se le muestra al usuario que la key está cargada, sin devolvérsela.
 * Una key en el DOM es una key en el historial del navegador y en cualquier
 * captura de pantalla; para confirmar que está guardada alcanza con la cola.
 */
export function maskKey(key: string | null): string | null {
  if (!key) return null
  return key.length <= 6 ? '••••' : `••••${key.slice(-4)}`
}
