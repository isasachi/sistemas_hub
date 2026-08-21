/**
 * El gate de créditos sin sesión.
 *
 * Va en su propio archivo porque `credits.test.ts` importa solo funciones puras y no
 * mockea nada; esto necesita simular `getUser`/`getAccess`, y meterle `vi.mock` a ese
 * archivo le cambiaría el modo de carga a los ~30 tests que ya tiene.
 *
 * Lo que fija: hasta el 2026-08-21 una petición sin cookie de sesión no resolvía owner
 * y `checkCredits` DEJABA PASAR. El agujero no era de anónimos — era que el propio
 * comprador podía saltarse el tope que le vendimos mandando el mismo POST sin la
 * cookie. Un tope evadible quitando una cookie no es un tope.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const { getUser, getAccess } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAccess: vi.fn(),
}))

vi.mock('./supabase/server', () => ({ getUser }))
vi.mock('./whop', () => ({ getAccess }))
// El conteo real pega contra Supabase; acá solo importa la decisión de dejar pasar o no.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ gte: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })) })),
      })),
    })),
  })),
}))

const AUTH_DISABLED = process.env.AUTH_DISABLED

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  delete process.env.AUTH_DISABLED
})
afterEach(() => {
  if (AUTH_DISABLED === undefined) delete process.env.AUTH_DISABLED
  else process.env.AUTH_DISABLED = AUTH_DISABLED
})

describe('checkCredits sin sesión', () => {
  it('RECHAZA con 401 un kind de imagen', async () => {
    getUser.mockResolvedValue(null)
    const { checkCredits } = await import('./credits')
    const { blocked } = await checkCredits('anuncios-image')
    expect(blocked?.status).toBe(401)
  })

  it('deja pasar los kinds que NO son de crédito', async () => {
    // Las rutas de texto nunca cobraron crédito; exigirles sesión sería un cambio de
    // comportamiento que nadie pidió y rompería caminos que hoy funcionan.
    getUser.mockResolvedValue(null)
    const { checkCredits } = await import('./credits')
    const { blocked } = await checkCredits('video-generation')
    expect(blocked).toBeNull()
  })

  it('AUTH_DISABLED deja pasar, para no romper el loop local', async () => {
    process.env.AUTH_DISABLED = 'true'
    getUser.mockResolvedValue(null)
    const { checkCredits } = await import('./credits')
    const { blocked } = await checkCredits('anuncios-image')
    expect(blocked).toBeNull()
  })

  it('con owner explícito nulo también rechaza', async () => {
    // El stream de branding pasa su owner ya resuelto porque no puede leer cookies a
    // mitad del SSE. Que lo pase explícito no lo exime: si resolvió null, tampoco hay
    // sesión, y dejarlo pasar reabriría el mismo hueco por la puerta del parámetro.
    const { checkCredits } = await import('./credits')
    const { blocked } = await checkCredits('anuncios-image', null)
    expect(blocked?.status).toBe(401)
    expect(getUser).not.toHaveBeenCalled()
  })
})
