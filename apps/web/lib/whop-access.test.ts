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

import { cancelPreviousMemberships, cancelSubscription, getAccess, hasAccess } from './whop'

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
      tier: 2, status: 'active', renewalPeriodEnd: '2026-09-20T00:00:00Z', grandfathered: false, bajaA: null, cancelable: true,
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
      tier: 3, status: null, renewalPeriodEnd: null, grandfathered: true, bajaA: null, cancelable: false,
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

  // ⚠️ El evento de cancelación reescribe la fila VIEJA después de la nueva y le sube
  // el `updated_at`. Con la regla vieja ("la más reciente es menor") una subida se
  // leía como bajada, y una bajada real perdía el aviso y el botón de cancelar.
  it('subida: el evento de cancelación de la vieja NO la vuelve baja', async () => {
    filas = [
      fila('active', 3, null, { updated_at: '2026-08-21T00:00:00Z' }),
      fila('canceling', 1, null, { updated_at: '2026-08-22T00:00:00Z' }),
    ]
    expect((await getAccess('u1'))?.bajaA).toBeNull()
  })

  it('bajada: con la vieja ya cancelándose (y más reciente) sigue marcando la baja', async () => {
    filas = [
      fila('canceling', 3, null, { updated_at: '2026-08-22T00:00:00Z', whop_membership_id: 'mem_a' }),
      fila('active', 1, null, { updated_at: '2026-08-21T00:00:00Z', whop_membership_id: 'mem_b' }),
    ]
    const a = await getAccess('u1')
    expect(a?.bajaA).toBe(1)
    // El plan nuevo se va a renovar: el botón tiene que seguir.
    expect(a?.cancelable).toBe(true)
  })

  it('bajada con TODO cancelado: ni aviso de baja ni botón', async () => {
    filas = [
      fila('canceling', 3, null, { updated_at: '2026-08-21T00:00:00Z', whop_membership_id: 'mem_a' }),
      fila('canceling', 1, null, { updated_at: '2026-08-22T00:00:00Z', whop_membership_id: 'mem_b' }),
    ]
    const a = await getAccess('u1')
    expect(a?.bajaA).toBeNull()
    expect(a?.cancelable).toBe(false)
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

  // ⚠️ La cortesía del panel admin no existe en Whop: el cancel da 404, lanzaba y
  // cortaba el bucle antes de llegar a la membership real.
  it('salta las filas manual: y las que ya están cancelándose', async () => {
    filas = [
      { whop_membership_id: 'manual:u1', status: 'active' },
      { whop_membership_id: 'mem_ya', status: 'canceling' },
      { whop_membership_id: 'mem_vieja', status: 'active' },
    ]
    await cancelPreviousMemberships('u1', 'mem_nueva')
    expect(llamadas.map((l) => l.url)).toEqual([expect.stringContaining('/memberships/mem_vieja/cancel')])
  })
})

/** "Cancelar suscripción" de Mi cuenta. */
describe('cancelSubscription', () => {
  let urls: string[] = []

  beforeEach(() => {
    urls = []
    vi.stubEnv('WHOP_API_KEY', 'k')
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      urls.push(url)
      expect(JSON.parse(String(init.body))).toEqual({ cancellation_mode: 'at_period_end' })
      return { ok: true, status: 200, text: async () => '' } as Response
    })
  })

  // En plena bajada conviven dos memberships vivas: cancelar solo una dejaría la
  // otra cobrando el mes siguiente.
  it('cancela TODAS las vivas, al fin del período', async () => {
    filas = [
      { whop_membership_id: 'mem_a', status: 'active' },
      { whop_membership_id: 'mem_b', status: 'trialing' },
      { whop_membership_id: 'mem_muerta', status: 'expired' },
    ]
    expect(await cancelSubscription('u1')).toBe(2)
    expect(urls).toEqual([
      expect.stringContaining('/memberships/mem_a/cancel'),
      expect.stringContaining('/memberships/mem_b/cancel'),
    ])
  })

  it('devuelve 0 si solo hay cortesía o ya estaba cancelándose', async () => {
    filas = [
      { whop_membership_id: 'manual:u1', status: 'active' },
      { whop_membership_id: 'mem_a', status: 'canceling' },
    ]
    expect(await cancelSubscription('u1')).toBe(0)
    expect(urls).toEqual([])
  })
  // Un 4xx que NO es "ya estaba cancelándose" es un fallo: resolver con un conteo le
  // prometería al usuario que no se le cobra más.
  it('un 4xx cualquiera rechaza, aunque mencione "cancel"', async () => {
    filas = [{ whop_membership_id: 'mem_a', status: 'active' }]
    vi.stubGlobal('fetch', async () =>
      ({ ok: false, status: 403, text: async () => 'Cannot cancel membership' }) as Response)
    await expect(cancelSubscription('u1')).rejects.toThrow(/mem_a/)
  })

  it('"set to cancel at period end" cuenta como ya cancelándose', async () => {
    filas = [{ whop_membership_id: 'mem_a', status: 'active' }]
    vi.stubGlobal('fetch', async () =>
      ({ ok: false, status: 422, text: async () => 'Membership is set to cancel at period end' }) as Response)
    expect(await cancelSubscription('u1')).toBe(1)
  })

  // Whop sigue reintentando el cobro de un past_due: saltarlo le prometía al usuario
  // "no se te volverá a cobrar" y el reintento le cobraba igual.
  it('cancela también un past_due', async () => {
    filas = [{ whop_membership_id: 'mem_pd', status: 'past_due' }]
    expect(await cancelSubscription('u1')).toBe(1)
    expect(urls).toEqual([expect.stringContaining('/memberships/mem_pd/cancel')])
  })

  // Una que falla no deja a las demás sin intentar, y el error dice cuántas salieron.
  it('si una falla, igual intenta las demás y lanza con el parcial', async () => {
    filas = [
      { whop_membership_id: 'mem_a', status: 'active' },
      { whop_membership_id: 'mem_b', status: 'active' },
    ]
    const intentadas: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      intentadas.push(url)
      return url.includes('mem_a')
        ? ({ ok: false, status: 500, text: async () => 'boom' }) as Response
        : ({ ok: true, status: 200, text: async () => '' }) as Response
    })
    await expect(cancelSubscription('u1')).rejects.toThrow(/1 de 2.*mem_a/)
    expect(intentadas).toHaveLength(2)
  })
})

/** Cuándo hay algo que cancelar: decide el botón de Mi cuenta. */
describe('getAccess · cancelable', () => {
  it('una cortesía manual: sola no es cancelable', async () => {
    filas = [fila('active', 2, null, { whop_membership_id: 'manual:u1' })]
    expect((await getAccess('u1'))?.cancelable).toBe(false)
  })

  // Whop sigue reintentando el cobro de un past_due aunque no dé acceso.
  it('un past_due al lado del plan vivo cuenta', async () => {
    filas = [
      fila('canceling', 2, null, { whop_membership_id: 'mem_a' }),
      fila('past_due', 1, null, { whop_membership_id: 'mem_b' }),
    ]
    expect((await getAccess('u1'))?.cancelable).toBe(true)
  })
})
