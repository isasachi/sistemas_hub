/**
 * Suscripción vía Whop — TRES planes (ver `PLANS` en @ph/shared): $29.90, $69.90 y
 * $89.90 al mes, SIN prueba gratis (`trial_period_days` es null en los tres planes,
 * verificado contra la API el 2026-08-21). Desbloquean el ACCESO al área privada (/dashboard y
 * /tools/*) y, según el tier, cuánto sirve el buscador y cuántos créditos de imagen
 * entran en el período.
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
import { PLANS, toTier, type Tier } from '@ph/shared'

const WHOP_API = process.env.WHOP_API_BASE ?? 'https://api.whop.com/api/v1'

/**
 * El plan de Whop de cada tier. Son tres links de checkout distintos en el
 * dashboard, no un plan con precios variables: Whop ata el precio a la
 * suscripción, así que bajar/subir el precio de un plan no mueve a quien ya
 * está adentro.
 */
export function whopPlanId(tier: Tier): string | undefined {
  return process.env[`WHOP_PLAN_ID_${tier}`]
}

/** Tier al que corresponde un plan de Whop, o null si no es ninguno nuestro. */
function tierOfPlan(planId: string | null): Tier | null {
  if (!planId) return null
  for (const t of [1, 2, 3] as const) if (whopPlanId(t) === planId) return t
  return null
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
 * De los 9 estados de membership de Whop (`trialing`, `active`, `past_due`,
 * `completed`, `canceled`, `expired`, `unresolved`, `drafted`, `canceling`), estos
 * tres dan acceso.
 *
 * ⚠️ `trialing` SE QUEDA aunque hoy no haya prueba gratis, y no es código muerto por
 * descuido. Durante una prueba no existe ningún `payment.succeeded`, así que un gate
 * colgado de los eventos de pago dejaría al usuario afuera justo durante la prueba
 * que lo trajo — es la razón por la que el entitlement cuelga del MEMBERSHIP y no del
 * pago. Borrar la rama solo se ganaría el derecho a dejar afuera a alguien que pagó el
 * día que se habilite una prueba en Whop, que es un cambio de una casilla allá y de
 * cero acá.
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
export async function getAccess(
  userId: string,
  email?: string | null,
): Promise<Access | null> {
  // Grandfathered = el tier MÁS ALTO. Son los 3 usuarios previos al paywall: el
  // cambio no puede quitarles nada de lo que ya usaban.
  if (isGrandfathered(email)) {
    return { tier: 3, status: null, renewalPeriodEnd: null, grandfathered: true }
  }

  const { data, error } = await getDb()
    .from('user_entitlements')
    .select('status,tier,renewal_period_end')
    .eq('user_id', userId)
  if (error) {
    console.error('[whop] leyendo entitlement:', error.message)
    return null
  }

  // Un usuario puede tener varias filas (canceló una y compró otra, o subió de
  // plan). Vale la MEJOR de las que dan acceso: quitarle el plan caro porque
  // arrastra una membership vieja cancelada sería cobrarle de más.
  const vivas = (data ?? []).filter((r) => grantsAccess(r.status as string))
  if (!vivas.length) return null
  const mejor = vivas.reduce((a, b) => (toTier(b.tier) > toTier(a.tier) ? b : a))
  return {
    tier: toTier(mejor.tier),
    status: (mejor.status as string | null) ?? null,
    renewalPeriodEnd: (mejor.renewal_period_end as string | null) ?? null,
    grandfathered: false,
  }
}

/** Lo que el hub sabe de la suscripción de un usuario. */
export interface Access {
  tier: Tier
  /** Estado de la membership en Whop. null = grandfathered (no hay fila). */
  status: string | null
  /** Fin del período pagado — ancla del reinicio de créditos. */
  renewalPeriodEnd: string | null
  /** Usuario previo al paywall: acceso de por vida, sin fila en la tabla. */
  grandfathered: boolean
}

/** ¿Este usuario puede entrar al área privada? */
export async function hasAccess(userId: string, email?: string | null): Promise<boolean> {
  return (await getAccess(userId, email)) !== null
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
  tier: Tier
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
  const meta = d.metadata as Record<string, unknown> | undefined
  const id = typeof d.id === 'string' ? d.id : null
  const status = typeof d.status === 'string' ? d.status : null
  const userId = meta?.supabase_user_id
  // Sin cualquiera de los tres la fila no sirve para nada: sin `id` no hay
  // idempotencia, sin `status` no se puede decidir y sin `user_id` no sabemos de quién
  // es el pago. Se descarta y se loguea en vez de escribir una fila a medias.
  if (!id || !status || typeof userId !== 'string') return null

  const end = d.renewal_period_end
  return {
    whop_membership_id: id,
    user_id: userId,
    status,
    tier: tierFromEvent(d, meta),
    renewal_period_end: typeof end === 'string' ? end : null,
  }
}

/**
 * Qué plan compró. Tres fuentes, en orden de cuánto se puede confiar en ellas:
 *
 *   1. `metadata.tier` — lo escribe NUESTRO checkout, y Whop documenta explícito que
 *      "payments and memberships created from a checkout session inherit its
 *      metadata". Es exactamente el mismo mecanismo por el que llega el
 *      `supabase_user_id`: si ese funciona, este también, y no agrega ninguna
 *      suposición nueva sobre la forma del sobre.
 *   2. `data.plan_id` mapeado contra `WHOP_PLAN_ID_{1,2,3}` — red por si alguien
 *      compra desde un link pegado en Whop, fuera de nuestro checkout.
 *   3. Tier 1.
 *
 * ⚠️ El fallback es al plan MÁS BAJO y se loguea. Equivocarse hacia arriba regala el
 * plan caro; equivocarse hacia abajo es un reclamo visible que se arregla en la
 * tabla. Entre un error silencioso y uno ruidoso, este tiene que ser ruidoso.
 */
function tierFromEvent(
  d: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
): Tier {
  const enMeta = meta?.tier
  if (typeof enMeta === 'string' || typeof enMeta === 'number') {
    const t = toTier(enMeta)
    // `toTier` cae a 1 ante basura; solo confiamos si el valor era realmente un tier.
    if (String(t) === String(enMeta)) return t
  }

  const plan = typeof d.plan_id === 'string' ? d.plan_id : null
  const porPlan = tierOfPlan(plan)
  if (porPlan) return porPlan

  console.error(
    `[whop] sin tier en el evento (metadata.tier=${String(enMeta)}, plan_id=${plan}); ` +
    'cae al plan 1 — revisar WHOP_PLAN_ID_1/2/3 y el metadata del checkout',
  )
  return 1
}

/**
 * Crea la checkout configuration del plan pedido y devuelve la URL de pago.
 *
 * `metadata` es lo que ata el pago a la cuenta Y al plan. Whop lo documenta
 * explícito: "Payments and memberships created from a checkout session inherit its
 * metadata", así que las dos cosas vuelven en el webhook. La alternativa —un link de
 * plan pelado y mapear por email— se rompe la primera vez que alguien paga con un
 * correo distinto al de su cuenta.
 *
 * El `tier` viaja en metadata Y queda implícito en el `plan_id`: son dos caminos
 * independientes para el mismo dato, y `tierFromEvent` los prueba en ese orden.
 */
export async function createCheckout(
  userId: string,
  tier: Tier,
  redirectUrl: string,
): Promise<string> {
  const planId = whopPlanId(tier)
  if (!planId) throw new Error(`whop checkout: falta WHOP_PLAN_ID_${tier} (${PLANS[tier].nombre})`)

  const res = await fetch(`${WHOP_API}/checkout_configurations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.WHOP_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: planId,
      redirect_url: redirectUrl,
      metadata: { supabase_user_id: userId, tier: String(tier) },
    }),
  })
  if (!res.ok) throw new Error(`whop checkout ${res.status}: ${await res.text()}`)

  const { purchase_url: url } = (await res.json()) as { purchase_url?: string }
  if (!url) throw new Error('whop checkout: respuesta sin purchase_url')
  // La doc describe el campo como "/checkout/ch_xxx/", o sea puede venir relativo. El
  // host se deriva de WHOP_API_BASE para que apuntar al sandbox no mande el checkout
  // al dominio de producción.
  if (url.startsWith('http')) return url
  const host = WHOP_API.includes('sandbox') ? 'https://sandbox.whop.com' : 'https://whop.com'
  return `${host}${url}`
}
