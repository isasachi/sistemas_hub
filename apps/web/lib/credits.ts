/**
 * Créditos de imagen por plan: 30 (plan 1), 100 (plan 2), 180 (plan 3) por período
 * de facturación. Cada imagen generada consume 1.
 *
 * Se apoya en `ph_gen_usage`, la misma tabla que ya escribe `recordGenQuota` — una
 * fila por generación exitosa, con `user_id`, `kind` y `gen_day`. No hace falta una
 * tabla de saldo: el saldo ES el conteo de esas filas en el período, y así no existe
 * el estado desincronizado clásico ("descontó el crédito pero la imagen falló").
 *
 * ⚠️ ESTO NO CUENTA VIDEO. `IMAGE_KINDS` de gen-quota.ts incluye `video-character`,
 * `video-generation` y `video-forensic` porque son igual de caros que una imagen y
 * comparten el cap per-step — pero el video lo paga el usuario con SU propia API key
 * de KIE y viene incluido en los tres planes, así que no puede comerse los créditos
 * que se le vendieron para anuncios, branding y landing. Por eso `CREDIT_KINDS` es
 * una lista aparte y no un `filter` sobre la otra.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PLANS, type Tier } from '@ph/shared'
import { getUser } from './supabase/server'
import { getAccess, type Access } from './whop'

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
 * Los kinds que gastan un crédito: las imágenes de anuncios, branding y landing.
 * Match por prefijo porque `landing-section` viaja como `landing-section:${type}`.
 *
 * `anuncios-image` lo registran tanto `generate-image` como `refine-image`, así que
 * una regeneración cuesta un crédito. Es lo pedido: "cada imagen generada consume 1".
 */
export const CREDIT_KINDS = [
  'branding-identidad', 'branding-logo', 'branding-etiqueta', 'branding-mockup',
  'anuncios-image',
  'landing-section',
]

export function isCreditKind(kind: string): boolean {
  return CREDIT_KINDS.some((k) => kind === k || kind.startsWith(k + ':'))
}

/**
 * Piso absoluto del conteo. Sin esto, el primer período de un usuario que ya venía
 * usando el hub (los grandfathered, que arrastran meses de `ph_gen_usage`) arrancaría
 * con los créditos gastados de entrada.
 *
 * Es una fecha y no una migración que borre filas: esas filas siguen alimentando el
 * backstop global diario y la visibilidad de costo.
 */
const EPOCH = process.env.CREDITS_EPOCH ?? '2026-08-20'

/**
 * Inicio del período de facturación en curso: la última fecha con el mismo día del
 * mes que la renovación, en o antes de hoy.
 *
 * Anclado a `renewal_period_end` y NO al mes calendario: quien se suscribe el 28
 * recibiría sus créditos el 28 y otra tanda el 1, o sea dos meses de créditos por un
 * pago. Se calcula desde el día del mes en vez de restarle un mes a la fecha guardada
 * para que se auto-corrija si el webhook de renovación se demora y `renewal_period_end`
 * queda viejo — con la resta, una fecha vencida abriría una ventana infinita y el
 * usuario no volvería a recibir créditos nunca.
 *
 * Sin fecha de renovación (grandfathered) el ancla es el día 1.
 */
export function periodStart(renewalEnd: string | null, now = new Date()): Date {
  const anclaRaw = renewalEnd ? new Date(renewalEnd) : null
  const ancla = anclaRaw && !Number.isNaN(anclaRaw.getTime()) ? anclaRaw.getUTCDate() : 1

  // El día del ancla puede no existir en este mes (renovación el 31, febrero).
  const enMes = (y: number, m: number) => {
    const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    return new Date(Date.UTC(y, m, Math.min(ancla, ultimo)))
  }
  const esteMes = enMes(now.getUTCFullYear(), now.getUTCMonth())
  // `Date.UTC` con mes -1 rueda al diciembre anterior solo.
  return esteMes <= now ? esteMes : enMes(now.getUTCFullYear(), now.getUTCMonth() - 1)
}

/** Primer `gen_day` que cuenta para el período (nunca antes del EPOCH). */
export function periodStartDay(renewalEnd: string | null, now = new Date()): string {
  const dia = periodStart(renewalEnd, now).toISOString().slice(0, 10)
  return dia < EPOCH ? EPOCH : dia
}

/**
 * Créditos de cortesía que un admin le sumó al usuario (migración 20260821000001).
 *
 * ⚠️ ES UN SUMANDO Y NO UN "RESET" DEL PERÍODO. El saldo ES el conteo de filas de
 * `ph_gen_usage`, así que resetear significaría BORRAR esas filas — las mismas que
 * alimentan el backstop global diario y la única visibilidad del costo real de
 * Gemini/OpenAI. Compensar sumando no destruye ese dato.
 *
 * ponytail: es una lectura por PK más en el gate de generación. Es la misma tabla que
 * el gate ya toca para otras cosas y el índice es la PK; si alguna vez pesa, el
 * upgrade es resolverlo junto con `access` en `currentCreditOwner`.
 *
 * Fail-open a 0, igual que el resto de gen-quota: control de costo, no paywall.
 */
export async function getCreditBonus(userId: string): Promise<number> {
  const { data, error } = await getDb()
    .from('user_settings').select('credit_bonus').eq('user_id', userId).maybeSingle()
  if (error) {
    console.error('[credits] leyendo credit_bonus:', error.message)
    return 0
  }
  const n = Number(data?.credit_bonus ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export async function setCreditBonus(userId: string, bonus: number): Promise<void> {
  const { error } = await getDb().from('user_settings').upsert(
    { user_id: userId, credit_bonus: Math.max(0, Math.floor(bonus)), updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(`guardando credit_bonus: ${error.message}`)
}

export interface CreditStatus {
  tier: Tier
  limite: number
  usados: number
  restantes: number
  /** Primer día contado, `YYYY-MM-DD`. */
  desde: string
}

/**
 * Cuántos créditos le quedan a un usuario. Solo lectura.
 *
 * `access` null = no encontramos suscripción (por ejemplo, una llamada con la cookie
 * anónima en vez de una sesión). Se le aplica el plan MÁS BAJO: no es una frontera de
 * seguridad —la cookie se borra y vuelve a cero— pero es estrictamente mejor que el
 * ilimitado de hoy y no rompe ningún flujo existente.
 */
export async function creditStatus(userId: string, access: Access | null): Promise<CreditStatus> {
  const tier: Tier = access?.tier ?? 1
  const bonus = await getCreditBonus(userId)
  const limite = PLANS[tier].creditos + bonus
  const desde = periodStartDay(access?.renewalPeriodEnd ?? null)

  // Se traen los kinds y se filtran en JS en vez de armar el `or(...like...)` de
  // PostgREST: `landing-section` necesita match por prefijo y el filtro quedaría
  // ilegible por ahorrar unos KB. El volumen está acotado por lo que una persona
  // puede generar en un mes.
  // ponytail: tope de 5.000 filas. Los kinds de texto comparten la tabla y el
  // backstop global permite 500/día, así que un usuario muy pesado podría pasarse
  // y quedarse con créditos sin contar. Falla ABIERTO, que es el lado correcto para
  // un control de costo. Si alguna vez importa, el upgrade es contar en Postgres con
  // un `or(...like...)` en vez de filtrar en JS.
  const { data, error } = await getDb()
    .from('ph_gen_usage')
    .select('kind')
    .eq('user_id', userId)
    .gte('gen_day', desde)
    .limit(5_000)
  if (error) {
    // Fail-OPEN, igual que el resto de gen-quota: con la DB caída no bloqueamos, y el
    // backstop global diario sigue siendo la red. Esto es control de costo, no el
    // paywall (ese sí fail-cierra, en whop.ts).
    console.error('[credits] leyendo consumo:', error.message)
    return { tier, limite, usados: 0, restantes: limite, desde }
  }

  const usados = (data ?? []).filter((r) => isCreditKind(r.kind as string)).length
  return { tier, limite, usados, restantes: Math.max(0, limite - usados), desde }
}

/**
 * A quién se le cobran los créditos: su id y su plan. Se resuelve una vez por
 * request y se puede pasar a `checkGenQuota`.
 *
 * ⚠️ EXISTE POR EL STREAM DE BRANDING. `generador-branding/generar` llama a
 * `checkGenQuota` DENTRO del `ReadableStream`, o sea con los headers de la respuesta
 * ya enviados (su propio comentario lo dice), y ahí leer las cookies de la request es
 * frágil. Esa ruta resuelve el owner ANTES de abrir el stream y lo pasa. Nótese que
 * es el OWNER y no el saldo: el saldo se vuelve a contar en cada llamada, así que las
 * 4 etapas de una corrida de branding sí se descuentan entre sí.
 */
export interface CreditOwner {
  userId: string
  access: Access | null
}

export async function currentCreditOwner(): Promise<CreditOwner | null> {
  const user = await getUser().catch(() => null)
  if (!user) return null
  return { userId: user.id, access: await getAccess(user.id, user.email) }
}

/** El estado de créditos del usuario de ESTA request (o null si no hay sesión). */
export async function currentCreditStatus(): Promise<CreditStatus | null> {
  const owner = await currentCreditOwner()
  return owner ? creditStatus(owner.userId, owner.access) : null
}

/**
 * Gate de créditos, para llamar ANTES de generar. Devuelve un 429 listo o null.
 *
 * Por defecto resuelve la suscripción desde la SESIÓN y no desde un `userId` que le
 * pasen: el tier de los grandfathered depende del email, y ese dato solo lo tiene
 * `getUser()`. Como efecto útil, 16 de las 17 rutas caras no cambiaron de firma.
 * La excepción es el stream de branding, que pasa su `owner` ya resuelto (ver
 * `CreditOwner`).
 *
 * ⚠️ Sin sesión no hay créditos que contar y se deja pasar. No es un agujero nuevo:
 * `/api/*` está fuera del matcher de `proxy.ts` y esas rutas nunca pidieron sesión
 * (ver AGENTS.md, "esto gatea la UI y nada más"). Lo que las topa ahí sigue siendo el
 * backstop global diario. Cerrar eso es exigir sesión en las 17 rutas, que es otro
 * cambio.
 */
export async function checkCredits(
  kind: string,
  owner?: CreditOwner | null,
): Promise<{ blocked: Response | null; credits: CreditStatus | null }> {
  if (!isCreditKind(kind)) return { blocked: null, credits: null }

  const quien = owner !== undefined ? owner : await currentCreditOwner()
  if (!quien) return { blocked: null, credits: null }

  const credits = await creditStatus(quien.userId, quien.access)
  if (credits.restantes <= 0) {
    return {
      blocked: Response.json(
        {
          error:
            `Usaste tus ${credits.limite} imágenes de este período. ` +
            'Cambia de plan o espera a que se renueve tu suscripción.',
          credits,
        },
        { status: 429 },
      ),
      credits,
    }
  }
  return { blocked: null, credits }
}
