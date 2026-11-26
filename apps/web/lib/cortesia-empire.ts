/**
 * Registro free directo a Legacy Empire de cortesía, por link con código.
 *
 * ⚠️ EL CÓDIGO ES LA ÚNICA LLAVE DEL PLAN DE $89.90. El link `/registro/empire?codigo=X`
 * es público por diseño (se comparte), así que quien tenga el link tiene Empire: si se
 * filtra, se cambia `EMPIRE_CORTESIA_CODIGOS` y el viejo deja de servir al instante. Las
 * cuentas ya creadas con él conservan la cortesía (se revocan una a una desde /admin).
 * Sin la env, el registro está APAGADO: ningún código es válido. Fail-closed, como el
 * paywall — esto regala plan, no es un control de costo.
 *
 * La cortesía es la misma fila `manual:<userId>` que otorga el panel (lib/admin.ts), sin
 * vencimiento: el panel la ve, la puede revocar o ponerle fecha, y `pickAccess` la
 * resuelve igual que cualquier otra. No hay un tipo de usuario nuevo.
 *
 * ⚠️ LA CUENTA SE CREA SIN CONTRASEÑA y eso es a propósito: se entra con un enlace al
 * correo (magic link) o con Google si el correo es de Gmail. El enlace es también la
 * prueba de que el correo es suyo — sin él nadie entra a esa cuenta, así que otorgar la
 * cortesía antes del primer clic no le da nada a quien escribió un correo ajeno.
 */
import { timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { otorgarCortesia } from './admin'

/** Tier de Legacy Empire. Literal y no `toTier(3)`: este módulo regala exactamente este. */
export const TIER_EMPIRE = 3 as const

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

function codigosVigentes(): string[] {
  return (process.env.EMPIRE_CORTESIA_CODIGOS ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

/**
 * ¿Este código abre el registro a Empire? Comparación en tiempo constante: el código es
 * un secreto y un `===` deja adivinarlo carácter por carácter midiendo la respuesta.
 */
export function codigoEmpireValido(codigo: string | null | undefined): boolean {
  const pedido = Buffer.from(String(codigo ?? '').trim())
  if (pedido.length === 0) return false
  let ok = false
  for (const c of codigosVigentes()) {
    const vigente = Buffer.from(c)
    // timingSafeEqual exige el mismo largo; el largo distinto ya es un "no".
    if (vigente.length === pedido.length && timingSafeEqual(vigente, pedido)) ok = true
  }
  return ok
}

export type ResultadoCuenta =
  | { ok: true; userId: string }
  | { ok: false; motivo: 'existe' | 'error' }

const yaExiste = (m: string) => {
  const s = m.toLowerCase()
  return s.includes('already') || s.includes('exists') || s.includes('registered')
}

/**
 * Crea la cuenta (sin contraseña) y le otorga Empire de cortesía.
 *
 * ⚠️ NO otorga a una cuenta que YA EXISTE (`motivo: 'existe'`): quien llena el formulario
 * no probó que el correo sea suyo. El dueño de esa cuenta inicia sesión y abre el link
 * logueado (`activarEmpire`), y ahí la sesión ES la prueba.
 *
 * `email_confirm: true` porque el correo se confirma con el propio enlace de entrada: un
 * usuario no confirmado recibiría el correo de "confirma tu registro" en vez del enlace
 * para entrar, y eso exige una segunda vuelta.
 *
 * Si la cortesía no se puede escribir, la cuenta se BORRA: una cuenta sin plan haría que
 * el reintento choque con "ya existe" y mandaría al usuario a un login que no sabe usar.
 */
export async function crearCuentaEmpire(email: string): Promise<ResultadoCuenta> {
  const db = getDb()
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true })
  if (error || !data.user) {
    if (error && yaExiste(error.message)) return { ok: false, motivo: 'existe' }
    console.error('[registro-empire] creando usuario:', error?.message ?? 'sin usuario')
    return { ok: false, motivo: 'error' }
  }

  const userId = data.user.id
  try {
    await otorgarCortesia(userId, TIER_EMPIRE, null)
  } catch (err) {
    console.error('[registro-empire] cortesía:', err instanceof Error ? err.message : String(err))
    const { error: borrar } = await db.auth.admin.deleteUser(userId)
    if (borrar) console.error('[registro-empire] no se pudo deshacer la cuenta:', borrar.message)
    return { ok: false, motivo: 'error' }
  }
  return { ok: true, userId }
}
