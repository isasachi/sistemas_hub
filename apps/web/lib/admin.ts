/**
 * Lectura del panel de administración. Solo consultas: las escrituras están en
 * `app/admin/actions.ts`, que es donde vive el gate de rol.
 *
 * ⚠️ EL EMAIL NO ESTÁ EN NINGUNA TABLA NUESTRA. `user_entitlements` guarda un
 * `user_id` uuid y `user_settings` tampoco tiene correo: la única fuente es
 * `auth.users`, que se lee con `auth.admin.listUsers()` (service role) y NO se puede
 * joinear con PostgREST contra nuestras tablas. Por eso el cruce se hace en memoria.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PLANS, toTier, type Tier } from '@ph/shared'
import {
  pickAccess, isGrandfathered, saveEntitlement,
  type Access, type EntitlementRow,
} from './whop'
import { toRole, type Role } from './roles'
import { creditStatus, isCreditKind, type CreditStatus } from './credits'

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
 * El id de membership de una cortesía otorgada desde el panel.
 *
 * ⚠️ Es DETERMINISTA por usuario, y eso es lo que hace la acción idempotente: otorgar
 * dos veces actualiza la misma fila en vez de dejar dos cortesías sueltas que después
 * hay que revocar de a una. Y `whop_membership_id` es la PK de la tabla, así que el
 * upsert la respeta solo.
 *
 * Convive con la fila real de Whop sin pisarla: son dos filas del mismo `user_id` y
 * `pickAccess` se queda con el tier más alto de las vivas.
 */
export const manualMembershipId = (userId: string) => `manual:${userId}`
export const esManual = (id: string) => id.startsWith('manual:')

/**
 * Otorga (o cambia) la cortesía de un usuario. Upsert sobre la PK, así que repetirlo
 * no acumula filas.
 *
 * ⚠️ `renewal_period_end` va en null a propósito: no hay período pagado que anclar.
 * `periodStart` (credits.ts) trata el null anclando los créditos al día 1 del mes,
 * que es exactamente lo que ya hace con los grandfathered.
 */
export async function otorgarCortesia(userId: string, tier: Tier): Promise<void> {
  await saveEntitlement({
    whop_membership_id: manualMembershipId(userId),
    user_id: userId,
    status: 'active',
    tier,
    renewal_period_end: null,
  })
}

/**
 * Quita la cortesía. Borra la fila en vez de marcarla cancelada: una fila muerta con
 * id `manual:` solo confunde la ficha, y si el usuario tiene además una membership
 * real de Whop ésa sigue intacta y vuelve a mandar sola.
 *
 * ⚠️ NO toca las memberships reales de Whop, y no debe hacerlo: el webhook es la
 * única escritura de esas filas (AGENTS.md), así que "revocarlas" acá duraría hasta
 * el siguiente evento. Cancelar un plan pagado se hace en Whop.
 */
export async function quitarCortesia(userId: string): Promise<void> {
  const { error } = await getDb()
    .from('user_entitlements')
    .delete()
    .eq('whop_membership_id', manualMembershipId(userId))
  if (error) throw new Error(`quitando cortesía: ${error.message}`)
}

export interface AdminUser {
  id: string
  email: string | null
  fullName: string | null
  role: Role
  /** Alta en el hub (auth.users). */
  createdAt: string | null
  lastSignInAt: string | null
  /** El acceso vigente. null = no puede entrar al área privada. */
  access: Access | null
  /** Tiene una cortesía escrita desde este panel. */
  manual: boolean
  /**
   * Último estado conocido aunque ya no dé acceso ('canceled', 'past_due'…).
   *
   * Existe porque `access` en null no distingue "nunca pagó" de "se le venció", y
   * ésa es justo la diferencia que un admin necesita ver antes de decidir si le
   * regala acceso o le pide que revise su tarjeta.
   */
  ultimoEstado: string | null
  creditBonus: number
}

/**
 * Todos los usuarios del hub.
 *
 * ponytail: trae TODO y cruza en JS — 3 consultas fijas, sin importar cuántos
 * usuarios haya. `listUsers` pagina de a 1000 y acá se recorren hasta 10 páginas
 * (10.000 usuarios); pasado eso la lista se corta y hay que paginar de verdad. Es el
 * mismo techo que `creditStatus` ya acepta con sus 5.000 filas, y a la escala de hoy
 * (decenas de usuarios) cualquier otra cosa es infraestructura para nadie.
 */
export async function listUsuarios(): Promise<AdminUser[]> {
  const db = getDb()

  const auth: { id: string; email?: string; created_at?: string; last_sign_in_at?: string }[] = []
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listando usuarios: ${error.message}`)
    auth.push(...(data?.users ?? []))
    if ((data?.users?.length ?? 0) < 1000) break
  }

  const [ent, set] = await Promise.all([
    db.from('user_entitlements')
      .select('whop_membership_id,user_id,status,tier,renewal_period_end,updated_at'),
    db.from('user_settings').select('user_id,role,full_name,credit_bonus'),
  ])
  if (ent.error) throw new Error(`leyendo entitlements: ${ent.error.message}`)
  if (set.error) throw new Error(`leyendo ajustes: ${set.error.message}`)

  const porUsuario = new Map<string, Record<string, unknown>[]>()
  for (const fila of ent.data ?? []) {
    const uid = String(fila.user_id)
    porUsuario.set(uid, [...(porUsuario.get(uid) ?? []), fila])
  }
  const ajustes = new Map((set.data ?? []).map((r) => [String(r.user_id), r]))

  return auth
    .map((u): AdminUser => {
      const filas = porUsuario.get(u.id) ?? []
      const aj = ajustes.get(u.id)
      // El grandfathered no tiene fila: su acceso depende del email (whop.ts).
      const grand = isGrandfathered(u.email)
      const access = grand
        ? { tier: 3 as Tier, status: null, renewalPeriodEnd: null, grandfathered: true, bajaA: null }
        : pickAccess(filas as EntitlementRow[])

      // El más recién tocado, dé acceso o no: es lo que explica un `access` en null.
      const reciente = filas.reduce<Record<string, unknown> | null>(
        (a, b) => (!a || String(b.updated_at ?? '') > String(a.updated_at ?? '') ? b : a), null)

      return {
        id: u.id,
        email: u.email ?? null,
        fullName: (aj?.full_name as string | null) ?? null,
        role: toRole(aj?.role),
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        access,
        manual: filas.some((f) => esManual(String(f.whop_membership_id ?? ''))),
        ultimoEstado: (reciente?.status as string | null) ?? null,
        creditBonus: Number(aj?.credit_bonus ?? 0),
      }
    })
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
}

export async function getUsuario(id: string): Promise<AdminUser | null> {
  // ponytail: reusa la lista completa en vez de una consulta por id. Con decenas de
  // usuarios son los mismos 3 round-trips y una sola definición de cómo se arma la
  // ficha. Si la lista alguna vez necesita paginación de verdad, esto pasa a ser un
  // `listUsers` de una página + un `.eq('user_id', id)`.
  return (await listUsuarios()).find((u) => u.id === id) ?? null
}

/** Créditos del período de un usuario cualquiera (no el de la sesión). */
export function creditosDe(u: AdminUser): Promise<CreditStatus> {
  return creditStatus(u.id, u.access)
}

// ── Consumo (ph_gen_usage) ────────────────────────────────────────────────────

/**
 * Cuántas generaciones registró cada quién en los últimos N días.
 *
 * Es la única visibilidad que existe del costo real de Gemini/OpenAI: `ph_gen_usage`
 * lleva una fila por generación exitosa desde que existe el gate de cuota.
 *
 * ponytail: UNA consulta y todo el agrupado en JS. Tope de 20.000 filas — el backstop
 * global permite 500/día, así que cubre 40 días completos a tope absoluto. Pasado eso
 * el resumen subestima; se nota porque el total se queda clavado en 20.000.
 */
export interface ConsumoResumen {
  total: number
  /** Solo las generaciones que gastan crédito (imágenes). */
  imagenes: number
  porKind: { kind: string; total: number }[]
  porUsuario: { userId: string; total: number }[]
  /** Generaciones de hoy, contra el backstop global diario. */
  hoy: number
}

export async function consumo(dias = 30, userId?: string): Promise<ConsumoResumen> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10)
  const hoyYmd = new Date().toISOString().slice(0, 10)

  let q = getDb().from('ph_gen_usage').select('user_id,kind,gen_day').gte('gen_day', desde)
  if (userId) q = q.eq('user_id', userId)
  const { data, error } = await q.limit(20_000)
  if (error) {
    // Fail-open a vacío: es una pantalla de lectura, no un gate. Un panel en cero es
    // mejor que un 500 que además tapa la lista de usuarios.
    console.error('[admin] leyendo consumo:', error.message)
    return { total: 0, imagenes: 0, porKind: [], porUsuario: [], hoy: 0 }
  }

  const filas = data ?? []
  const cuenta = (clave: (r: (typeof filas)[number]) => string) => {
    const m = new Map<string, number>()
    for (const r of filas) {
      const k = clave(r)
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m].map(([k, total]) => ({ k, total })).sort((a, b) => b.total - a.total)
  }

  return {
    total: filas.length,
    imagenes: filas.filter((r) => isCreditKind(String(r.kind))).length,
    porKind: cuenta((r) => String(r.kind)).map(({ k, total }) => ({ kind: k, total })),
    porUsuario: cuenta((r) => String(r.user_id ?? '')).map(({ k, total }) => ({ userId: k, total })),
    hoy: filas.filter((r) => String(r.gen_day) === hoyYmd).length,
  }
}

// ── Actividad (tablas de sesiones) ────────────────────────────────────────────

/**
 * Las tablas de sesión, una por tool. Todas ganaron `user_id text` en la migración
 * 20260708000001 y todas tienen `created_at`.
 */
const TABLAS_SESION: { tabla: string; tool: string }[] = [
  { tabla: 'sessions', tool: 'Anuncios' },
  { tabla: 'video_sessions', tool: 'Video Ads' },
  { tabla: 'landing_sessions', tool: 'Landing' },
  { tabla: 'branding_sessions', tool: 'Branding' },
  { tabla: 'calc_sessions', tool: 'Costos' },
]

export interface Actividad {
  tool: string
  total: number
  ultima: string | null
}

/**
 * Cuántas sesiones abrió el usuario en cada tool y cuándo fue la última.
 *
 * Una consulta por tabla, en paralelo: `count: 'exact'` devuelve el total de la
 * tabla entera y el `limit(1)` ordenado trae la fecha de la última, así que sale
 * todo en un solo viaje por tool en vez de dos.
 *
 * Una tabla que falle cuenta 0 en vez de romper la ficha: `sessions` se creó en una
 * migración condicional y puede no existir en todos los entornos.
 */
export async function actividad(userId: string): Promise<Actividad[]> {
  return Promise.all(
    TABLAS_SESION.map(async ({ tabla, tool }) => {
      const { data, count, error } = await getDb()
        .from(tabla)
        .select('created_at', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) {
        console.error(`[admin] leyendo ${tabla}:`, error.message)
        return { tool, total: 0, ultima: null }
      }
      return { tool, total: count ?? 0, ultima: (data?.[0]?.created_at as string) ?? null }
    }),
  )
}

/** Lo que incluye un plan, derivado de PLANS y nunca escrito a mano. */
export const resumenPlan = (tier: Tier) =>
  `${PLANS[tier].porRango} productos/rango · ${PLANS[tier].creditos} créditos`

export { toTier }
