/**
 * Roles del hub: `admin` y `operador`.
 *
 * `operador` es el usuario normal — el nombre sale de `lib/tools.ts`, que ya llama así
 * a quien usa las herramientas ("etapa del flujo del operador").
 *
 * ⚠️ SIN MATRIZ DE PERMISOS. Un solo rol privilegiado no necesita una: ver el
 * razonamiento en la migración 20260821000001.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getUser } from './supabase/server'

export type Role = 'admin' | 'operador'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  operador: 'Operador',
}

/** Normaliza cualquier entrada. Lo que no sea 'admin' es 'operador'. */
export function toRole(v: unknown): Role {
  return v === 'admin' ? 'admin' : 'operador'
}

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
 * Los admins de arranque, por env.
 *
 * ⚠️ TIENE QUE EXISTIR: el rol vive en una columna que solo un admin puede escribir,
 * así que sin una vía externa NADIE podría nombrarse el primero. Mismo patrón (y mismo
 * argumento) que `WHOP_GRANDFATHERED_EMAILS` en whop.ts: un puñado de correos fijos y
 * conocidos, reversible con una variable y sin dejar datos muertos.
 *
 * También es la salida de emergencia si alguien se quita el rol a sí mismo por error.
 */
export function isBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const lista = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return lista.includes(email.toLowerCase())
}

/**
 * El rol guardado de un usuario.
 *
 * ⚠️ Fail-CLOSED: sin fila, con la columna en null o ante un error de DB devuelve
 * `operador`. Es un gate de privilegio, no un control de costo — el criterio es el de
 * `hasAccess` en whop.ts, no el de gen-quota.ts.
 */
export async function getRole(userId: string): Promise<Role> {
  const { data, error } = await getDb()
    .from('user_settings').select('role').eq('user_id', userId).maybeSingle()
  if (error) {
    console.error('[roles] leyendo rol:', error.message)
    return 'operador'
  }
  return toRole(data?.role)
}

export async function isAdmin(userId: string, email?: string | null): Promise<boolean> {
  return isBootstrapAdmin(email) || (await getRole(userId)) === 'admin'
}

export async function setRole(userId: string, role: Role): Promise<void> {
  const { error } = await getDb().from('user_settings').upsert(
    { user_id: userId, role, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(`guardando rol: ${error.message}`)
}

/**
 * El admin de ESTA request, o null.
 *
 * ⚠️ Toda mutación del panel arranca por acá y NUNCA por un id que venga del cliente.
 * Un server action es un endpoint público: si el id del admin saliera del formulario,
 * cualquiera podría otorgarse el plan 3 (ver el mismo comentario en
 * app/cuenta/actions.ts, y la nota de AGENTS.md sobre `/api/*` fuera del gate).
 */
export async function currentAdmin(): Promise<{ id: string; email: string | null } | null> {
  const user = await getUser().catch(() => null)
  if (!user) return null
  if (!(await isAdmin(user.id, user.email))) return null
  return { id: user.id, email: user.email ?? null }
}
