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

import { getAccess, hasAccess } from './whop'

const fila = (status: string, tier: number | null, end: string | null = null) =>
  ({ status, tier, renewal_period_end: end })

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
      tier: 2, renewalPeriodEnd: '2026-09-20T00:00:00Z', grandfathered: false,
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
    expect(await getAccess('u1', 'VIEJO@jrhub.pe')).toEqual({
      tier: 3, renewalPeriodEnd: null, grandfathered: true,
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
