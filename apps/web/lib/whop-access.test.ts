import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * `getAccess` es lo que decide QUÉ PLAN tiene alguien: de acá salen los rangos del
 * buscador y los créditos de imagen. Va en su propio archivo porque necesita mockear
 * `@supabase/supabase-js` a nivel de módulo, y whop.test.ts prueba la parte pura.
 */
let filas: unknown[] | null = []
let errorDb: string | null = null

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: filas, error: errorDb ? { message: errorDb } : null }),
      }),
    }),
  }),
}))

import { cancelPreviousMemberships, getAccess, hasAccess } from './whop'

const fila = (
  status: string,
  tier: number | null,
  end: string | null = null,
  extra: Record<string, unknown> = {},
) => ({ status, tier, renewal_period_end: end, ...extra })

beforeEach(() => {
  filas = []
  errorDb = null
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k')
  vi.stubEnv('WHOP_GRANDFATHERED_EMAILS', 'viejo@jrhub.pe')
})

describe('getAccess', () => {
  it('devuelve el tier de la membership viva', async () => {
    filas = [fila('active', 2, '2026-09-20T00:00:00Z')]
    expect(await getAccess('u1')).toEqual({
      tier: 2, status: 'active', renewalPeriodEnd: '2026-09-20T00:00:00Z', grandfathered: false, bajaA: null,
    })
  })

  // Quien sube de plan arrastra la membership vieja cancelada. Quedarse con la peor
  // sería cobrarle el plan caro y servirle el barato.
  it('con varias filas gana el tier MÁS ALTO de las que dan acceso', async () => {
    filas = [fila('canceled', 3), fila('active', 1), fila('trialing', 2)]
    expect((await getAccess('u1'))?.tier).toBe(2)
  })

  it('sin ninguna membership viva no hay acceso', async () => {
    filas = [fila('expired', 3), fila('past_due', 3)]
    expect(await getAccess('u1')).toBeNull()
  })

  // Los 3 usuarios previos al paywall no pueden perder nada con este cambio.
  it('grandfathered entra como plan 3, sin importar la tabla', async () => {
    errorDb = 'no debería consultarse'
    // `status` null es la marca de que NO hay fila en la tabla: el grandfathering
    // sale del env, no de una membership de Whop.
    expect(await getAccess('u1', 'VIEJO@jrhub.pe')).toEqual({
      tier: 3, status: null, renewalPeriodEnd: null, grandfathered: true, bajaA: null,
    })
  })

  // Fail-CLOSED: esto es un paywall, no un backstop de costo (gen-quota fail-abre).
  it('un error de DB no da acceso', async () => {
    errorDb = 'boom'
    filas = null
    expect(await getAccess('u1')).toBeNull()
    expect(await hasAccess('u1')).toBe(false)
  })

  // Una fila escrita antes de que existiera la columna vale como plan 1, nunca como 3.
  it('tier nulo cae al plan 1', async () => {
    filas = [fila('active', null)]
    expect((await getAccess('u1'))?.tier).toBe(1)
  })
})

/**
 * ⚠️ LA BAJA EN CURSO. Whop no tiene endpoint de cambio de plan, así que contratar
 * uno nuevo deja DOS memberships vivas hasta que la vieja termina su período. Como
 * `getAccess` se queda con el tier más alto —correcto: es lo que el usuario pagó—,
 * alguien que se pasa a un plan menor seguiría viendo el plan viejo y ninguna señal
 * de que su compra se aplicó. `bajaA` es esa señal.
 */
describe('getAccess · baja de plan en curso', () => {
  it('marca a qué plan baja cuando la membership más RECIENTE es de tier menor', async () => {
    filas = [
      fila('active', 3, '2026-09-20T00:00:00Z', { updated_at: '2026-08-01T00:00:00Z' }),
      fila('active', 1, '2026-09-25T00:00:00Z', { updated_at: '2026-08-21T00:00:00Z' }),
    ]
    const a = await getAccess('u1')
    // Sirve el tier alto (lo pagó) y avisa que va a bajar al 1.
    expect(a?.tier).toBe(3)
    expect(a?.bajaA).toBe(1)
  })

  // Al SUBIR no hay nada que avisar: la nueva membership ya es la que manda.
  it('una subida no se marca como baja', async () => {
    filas = [
      fila('active', 1, null, { updated_at: '2026-08-01T00:00:00Z' }),
      fila('active', 3, null, { updated_at: '2026-08-21T00:00:00Z' }),
    ]
    const a = await getAccess('u1')
    expect(a?.tier).toBe(3)
    expect(a?.bajaA).toBeNull()
  })

  it('con una sola membership no hay baja', async () => {
    filas = [fila('active', 2, null, { updated_at: '2026-08-21T00:00:00Z' })]
    expect((await getAccess('u1'))?.bajaA).toBeNull()
  })

  // Una membership MUERTA no puede disparar el aviso: no es un cambio en curso.
  it('una fila cancelada más reciente no cuenta como baja', async () => {
    filas = [
      fila('active', 3, null, { updated_at: '2026-08-01T00:00:00Z' }),
      fila('expired', 1, null, { updated_at: '2026-08-21T00:00:00Z' }),
    ]
    expect((await getAccess('u1'))?.bajaA).toBeNull()
  })
})

/**
 * ⚠️ EL CAMBIO DE PLAN AUTOMÁTICO. Esto es lo que reemplaza al aviso de "acuérdate
 * de cancelar la anterior": si no corre, el usuario paga DOS suscripciones.
 */
describe('cancelPreviousMemberships', () => {
  let llamadas: Array<{ url: string; body: unknown }> = []

  beforeEach(() => {
    llamadas = []
    vi.stubEnv('WHOP_API_KEY', 'k')
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      llamadas.push({ url, body: JSON.parse(String(init.body)) })
      return { ok: true, status: 200, text: async () => '' } as Response
    })
  })

  it('cancela las otras memberships vivas y NO la que se acaba de activar', async () => {
    filas = [
      { whop_membership_id: 'mem_vieja', status: 'active' },
      { whop_membership_id: 'mem_nueva', status: 'active' },
    ]
    await cancelPreviousMemberships('u1', 'mem_nueva')

    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toContain('/memberships/mem_vieja/cancel')
  })

  // ⚠️ `immediate` le quitaría acceso que YA PAGÓ. Con `at_period_end` no se pierde
  // nada y la bajada ocurre en el borde natural del período.
  it('cancela al FIN DEL PERÍODO, nunca al instante', async () => {
    filas = [{ whop_membership_id: 'mem_vieja', status: 'active' }]
    await cancelPreviousMemberships('u1', 'mem_nueva')
    expect(llamadas[0].body).toEqual({ cancellation_mode: 'at_period_end' })
  })

  // Una membership ya muerta no se toca: sería una llamada al pedo y un error de Whop.
  it('ignora las memberships que ya no dan acceso', async () => {
    filas = [
      { whop_membership_id: 'mem_expirada', status: 'expired' },
      { whop_membership_id: 'mem_cancelada', status: 'canceled' },
    ]
    await cancelPreviousMemberships('u1', 'mem_nueva')
    expect(llamadas).toHaveLength(0)
  })

  // ⚠️ La entrega del webhook es at-least-once y nuestra fila sigue diciendo `active`
  // hasta que llegue el `deactivated`, así que este cancel SE REPITE. Que Whop diga
  // "ya estaba cancelándose" no puede tratarse como un fallo.
  it('no lanza si Whop dice que ya estaba cancelándose', async () => {
    filas = [{ whop_membership_id: 'mem_vieja', status: 'active' }]
    vi.stubGlobal('fetch', async () =>
      ({ ok: false, status: 422, text: async () => 'Membership already cancelling' }) as Response)
    await expect(cancelPreviousMemberships('u1', 'mem_nueva')).resolves.toBeUndefined()
  })

  it('un fallo real sí lanza, para que el webhook lo loguee', async () => {
    filas = [{ whop_membership_id: 'mem_vieja', status: 'active' }]
    vi.stubGlobal('fetch', async () =>
      ({ ok: false, status: 500, text: async () => 'boom' }) as Response)
    await expect(cancelPreviousMemberships('u1', 'mem_nueva')).rejects.toThrow(/mem_vieja/)
  })
})
