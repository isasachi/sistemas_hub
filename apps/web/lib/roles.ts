/**
 * Roles del hub: `admin`, `gestor` y `operador`.
 *
 * `operador` es el usuario normal — el nombre sale de `lib/tools.ts`, que ya llama así
 * a quien usa las herramientas ("etapa del flujo del operador").
 *
 * `gestor` está DEBAJO de `admin`: entra al panel y hace todo lo que hace un admin
 * (cortesías, créditos) MENOS cambiar roles. Esa es la única diferencia, y es la que
 * importa: un gestor que pudiera tocar roles podría nombrarse admin a sí mismo.
 *
 * ⚠️ LOS PERMISOS SON DOS PREDICADOS (`puedeEntrarAlPanel`, `puedeCambiarRoles`), NO
 * UNA TABLA. Con una sola rebanada distinta entre los dos roles privilegiados, una
 * matriz en la DB respondería lo mismo que estos dos `if` a cambio de una tabla, un
 * join y una pantalla. Si aparece una segunda diferencia, va otro predicado acá.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getUser } from './supabase/server'

export { ROLES, ROLE_LABEL, toRole, puedeEntrarAlPanel, puedeCambiarRoles } from './role-defs'
export type { Role, PanelRole } from './role-defs'
import { toRole, puedeEntrarAlPanel, type PanelRole, type Role } from './role-defs'

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

/**
 * El rol con el que este usuario entra al panel, o null si no entra.
 *
 * Los de `ADMIN_EMAILS` son admin aunque la columna diga otra cosa: es la salida de
 * emergencia, y no puede depender de lo que diga la DB.
 */
export async function panelRole(userId: string, email?: string | null): Promise<PanelRole | null> {
  if (isBootstrapAdmin(email)) return 'admin'
  const r = await getRole(userId)
  return puedeEntrarAlPanel(r) ? r : null
}

export async function setRole(userId: string, role: Role): Promise<void> {
  const { error } = await getDb().from('user_settings').upsert(
    { user_id: userId, role, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(`guardando rol: ${error.message}`)
}

/**
 * Quien opera el panel en ESTA request (admin o gestor), o null.
 *
 * ⚠️ Toda mutación del panel arranca por acá y NUNCA por un id que venga del cliente.
 * Un server action es un endpoint público: si el id del admin saliera del formulario,
 * cualquiera podría otorgarse el plan 3 (ver el mismo comentario en
 * app/cuenta/actions.ts, y la nota de AGENTS.md sobre `/api/*` fuera del gate).
 */
export async function currentStaff(): Promise<{ id: string; email: string | null; role: PanelRole } | null> {
  const user = await getUser().catch(() => null)
  if (!user) return null
  const role = await panelRole(user.id, user.email)
  if (!role) return null
  return { id: user.id, email: user.email ?? null, role }
}
