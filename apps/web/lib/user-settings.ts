/**
 * Ajustes de la cuenta: perfil (nombre, teléfono, foto) y la API key de KIE con la
 * que se renderiza el video (BYOK — el render lo paga el usuario, por eso el
 * generador de video viene incluido en los tres planes).
 *
 * ⚠️ NO hay datos de facturación. Se probaron y se quitaron (migración
 * 20260820000003): los comprobantes los emite Whop como merchant-of-record, así que
 * pedir RUC y dirección fiscal era juntar datos que nadie iba a leer.
 *
 * Tabla `user_settings` (migraciones 20260820000001 a 20260820000003), RLS on sin
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

/**
 * Lo que se puede mostrar de la cuenta.
 *
 * ⚠️ NO incluye la API key de KIE. La key se lee por su propia función y nunca
 * viaja al cliente: una key en el DOM es una key en el historial del navegador y
 * en cualquier captura de pantalla. Para confirmar que está cargada alcanza con
 * `maskKey`.
 */
export interface UserProfile {
  fullName: string | null
  phone: string | null
  avatarUrl: string | null
}

const VACIO: UserProfile = { fullName: null, phone: null, avatarUrl: null }

/** Columna de DB → campo del perfil. Una sola tabla de nombres para leer y escribir. */
const COLUMNA = {
  fullName: 'full_name',
  phone: 'phone',
  avatarUrl: 'avatar_url',
} as const satisfies Record<keyof UserProfile, string>

export async function getProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await getDb()
    .from('user_settings')
    .select(Object.values(COLUMNA).join(','))
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    // Fail-open a vacío: un perfil que no se pudo leer deja la pantalla en blanco,
    // no la rompe. Nada de acceso ni de dinero depende de estos campos.
    console.error('[settings] leyendo perfil:', error.message)
    return VACIO
  }
  if (!data) return VACIO

  const row = data as unknown as Record<string, string | null>
  const leer = (k: keyof UserProfile) => (row[COLUMNA[k]] ?? null) || null
  return {
    fullName: leer('fullName'),
    phone: leer('phone'),
    avatarUrl: leer('avatarUrl'),
  }
}

/**
 * Guarda SOLO los campos que vienen en `patch`.
 *
 * ⚠️ Parcial a propósito: la pantalla tiene dos formularios sobre la MISMA fila
 * (perfil y avatar). Escribir el objeto entero desde cualquiera de ellos borraría
 * lo que cargó el otro — subir una foto no puede vaciar el nombre.
 */
export async function saveProfile(userId: string, patch: Partial<UserProfile>): Promise<void> {
  const fila: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }
  for (const [campo, valor] of Object.entries(patch)) {
    const col = COLUMNA[campo as keyof UserProfile]
    // Un string vacío es "borralo", y por eso se normaliza a null: así la lectura
    // no tiene que distinguir '' de ausente en cada uso.
    if (col) fila[col] = typeof valor === 'string' ? valor.trim() || null : valor ?? null
  }
  const { error } = await getDb().from('user_settings').upsert(fila, { onConflict: 'user_id' })
  if (error) throw new Error(`guardando perfil: ${error.message}`)
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
