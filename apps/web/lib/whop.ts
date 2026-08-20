/**
 * Suscripción vía Whop — plan único, $29/mes, 3 días de prueba, desbloquea ACCESO
 * al área privada (/dashboard y /tools/*).
 *
 * Whop entra SOLO como capa de pago/entitlement. La identidad sigue siendo Supabase
 * Auth: no se usa "Sign in with Whop" ni la app embebida, porque migrar sesiones no
 * compraría nada y rompería el login que ya existe.
 *
 * Flujo: el hub crea una checkout configuration server-side con el `user.id` de
 * Supabase en `metadata` → el usuario paga en Whop → Whop llama al webhook →
 * el webhook escribe `user_entitlements` → el gate lee esa tabla.
 *
 * ⚠️ La API de Whop NUNCA se consulta en el path de request: el webhook es la única
 * escritura y el hub solo lee su propia tabla (mismo criterio que la regla de costo
 * de buscador-productos).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const WHOP_API = process.env.WHOP_API_BASE ?? 'https://api.whop.com/api/v1'

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
 * De los 9 estados de membership de Whop (`trialing`, `active`, `past_due`,
 * `completed`, `canceled`, `expired`, `unresolved`, `drafted`, `canceling`), estos
 * tres dan acceso.
 *
 * ⚠️ `trialing` NO es opcional, y es la razón por la que el entitlement cuelga del
 * MEMBERSHIP y no del pago: el plan tiene 3 días de prueba y durante esos días no
 * existe ningún `payment.succeeded`. Un gate colgado de los eventos de pago dejaría
 * al usuario afuera exactamente durante la prueba que lo trajo.
 *
 * `canceling` = pidió cancelar pero el período ya pagado sigue corriendo; quitarle el
 * acceso antes de que termine sería cobrarle por algo que no puede usar.
 *
 * ponytail: `past_due` NO da acceso. Whop reintenta el cobro (dunning) y al recuperarlo
 * manda `membership.activated`, que lo devuelve a `active`. Si hiciera falta un período
 * de gracia, se agrega una palabra acá.
 */
export function grantsAccess(status: string): boolean {
  return status === 'trialing' || status === 'active' || status === 'canceling'
}

/**
 * Usuarios previos al paywall, con acceso de por vida (los 3 demo de LOGIN_ALLOWLIST).
 *
 * ponytail: por env y no por filas sembradas en la tabla. Son 3 correos conocidos y
 * fijos; una migración que los inserte tendría que resolver sus `auth.users.id` por
 * email, y quedaría desincronizada si alguno se recrea. Env es reversible y no deja
 * datos muertos. Si esto crece más allá de un puñado, pasa a ser una columna.
 */
export function isGrandfathered(email: string | null | undefined): boolean {
  if (!email) return false
  const list = (process.env.WHOP_GRANDFATHERED_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

/**
 * ¿Este usuario puede entrar al área privada?
 *
 * ⚠️ Fail-CLOSED ante un error de DB, al revés que `gen-quota.ts`. Ese módulo fail-abre
 * a propósito porque es un backstop de COSTO; esto es un paywall. Y el modo de fallo
 * casi no existe: si Supabase no responde, `getUser()` ya habría fallado antes y el
 * usuario ni siquiera llega acá.
 */
export async function hasAccess(userId: string, email?: string | null): Promise<boolean> {
  if (isGrandfathered(email)) return true

  const { data, error } = await getDb()
    .from('user_entitlements').select('status').eq('user_id', userId)
  if (error) {
    console.error('[whop] leyendo entitlement:', error.message)
    return false
  }
  return (data ?? []).some((row) => grantsAccess(row.status as string))
}

/**
 * Guarda el entitlement. Upsert sobre la PK `whop_membership_id`: la entrega de
 * webhooks es at-least-once con reintentos, así que el mismo evento llega repetido y
 * la idempotencia tiene que salir de la tabla, no de lógica en el handler.
 */
export async function saveEntitlement(row: Entitlement): Promise<void> {
  const { error } = await getDb()
    .from('user_entitlements')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'whop_membership_id' })
  if (error) throw new Error(`guardando entitlement: ${error.message}`)
}

/** Fila lista para escribir en `user_entitlements`. */
export type Entitlement = {
  whop_membership_id: string
  user_id: string
  status: string
  renewal_period_end: string | null
}

/**
 * Traduce un evento de webhook a la fila que hay que guardar, o `null` si el evento
 * no nos toca. Puro a propósito: es la lógica que decide quién tiene acceso, y así se
 * testea sin red ni DB.
 *
 * Los eventos de membership que Whop expone son `activated`, `deactivated`,
 * `trial_ending_soon` y `cancel_at_period_end_changed`. Los dos primeros son los que
 * mueven el acceso; el estado real sale SIEMPRE del payload (`data.status`), nunca se
 * infiere del nombre del evento — así un `activated` de una membership que ya está
 * `past_due` no otorga acceso por el solo hecho de llamarse "activated".
 *
 * Devuelve `null` (en vez de lanzar) para cualquier evento desconocido: el handler
 * tiene que responder 2xx igual, porque un no-2xx dispara reintentos por ~3 días y
 * termina desactivando el endpoint.
 */
export function entitlementFromEvent(evt: unknown): Entitlement | null {
  const e = evt as { type?: string; data?: Record<string, unknown> }
  if (e?.type !== 'membership.activated' && e?.type !== 'membership.deactivated') return null

  const d = e.data ?? {}
  const id = typeof d.id === 'string' ? d.id : null
  const status = typeof d.status === 'string' ? d.status : null
  const userId = (d.metadata as Record<string, unknown> | undefined)?.supabase_user_id
  // Sin cualquiera de los tres la fila no sirve para nada: sin `id` no hay
  // idempotencia, sin `status` no se puede decidir y sin `user_id` no sabemos de quién
  // es el pago. Se descarta y se loguea en vez de escribir una fila a medias.
  if (!id || !status || typeof userId !== 'string') return null

  const end = d.renewal_period_end
  return {
    whop_membership_id: id,
    user_id: userId,
    status,
    renewal_period_end: typeof end === 'string' ? end : null,
  }
}

/**
 * Crea la checkout configuration y devuelve la URL a la que mandar al usuario.
 *
 * El `metadata.supabase_user_id` es lo que ata el pago a la cuenta del hub. Whop lo
 * documenta explícito: "Payments and memberships created from a checkout session
 * inherit its metadata", así que vuelve en el webhook. La alternativa —un link de
 * plan pelado y mapear por email— se rompe la primera vez que alguien paga con un
 * correo distinto al de su cuenta.
 */
export async function createCheckout(userId: string, redirectUrl: string): Promise<string> {
  const res = await fetch(`${WHOP_API}/checkout_configurations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.WHOP_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: process.env.WHOP_PLAN_ID,
      redirect_url: redirectUrl,
      metadata: { supabase_user_id: userId },
    }),
  })
  if (!res.ok) throw new Error(`whop checkout ${res.status}: ${await res.text()}`)

  const { purchase_url: url } = (await res.json()) as { purchase_url?: string }
  if (!url) throw new Error('whop checkout: respuesta sin purchase_url')
  // La doc describe el campo como "/checkout/ch_xxx/", o sea puede venir relativo.
  return url.startsWith('http') ? url : `https://whop.com${url}`
}
