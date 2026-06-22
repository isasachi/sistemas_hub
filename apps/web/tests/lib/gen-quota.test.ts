import { describe, it, expect, vi, beforeEach } from 'vitest'

// Estado del "DB" mockeado. Las dos queries de conteo se distinguen por si se
// aplicó un .eq('user_id', ...) (per-user) o no (global).
const state = vi.hoisted(() => ({
  globalCount: 0,
  userCount: 0,
  globalErr: null as { message: string } | null,
  inserts: [] as Record<string, unknown>[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => {
      const filters: Record<string, unknown> = {}
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => { filters[col] = val; return builder },
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row)
          return Promise.resolve({ error: null })
        },
        // El builder de count es thenable: resuelve { count, error } según los filtros.
        then: (resolve: (v: unknown) => unknown) => {
          const isUser = 'user_id' in filters
          return Promise.resolve({
            count: isUser ? state.userCount : state.globalCount,
            error: isUser ? null : state.globalErr,
          }).then(resolve)
        },
      }
      return builder
    },
  })),
}))

// gen-quota importa session.ts (→ next/headers); lo cortamos para no cargar el runtime de Next.
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  state.globalCount = 0
  state.userCount = 0
  state.globalErr = null
  state.inserts = []
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
  process.env.SUPABASE_URL = 'http://test'
})

describe('guardGeneration', () => {
  it('permite y registra cuando ambos topes están bajo el límite', async () => {
    const { guardGeneration } = await import('@/lib/gen-quota')
    const r = await guardGeneration('user-1', 'branding-logo')
    expect(r.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ user_id: 'user-1', kind: 'branding-logo' })
  })

  it('corta por tope GLOBAL aunque el usuario sea nuevo (un atacante que limpia cookies no lo evade)', async () => {
    const { guardGeneration, GLOBAL_DAILY_LIMIT } = await import('@/lib/gen-quota')
    state.globalCount = GLOBAL_DAILY_LIMIT
    const r = await guardGeneration(null, 'branding-logo')
    expect(r.ok).toBe(false)
    expect(state.inserts).toHaveLength(0) // no registra cuando rechaza
  })

  it('corta por tope POR-USUARIO con global aún disponible', async () => {
    const { guardGeneration, USER_DAILY_LIMIT } = await import('@/lib/gen-quota')
    state.globalCount = 0
    state.userCount = USER_DAILY_LIMIT
    const r = await guardGeneration('heavy-user', 'branding-logo')
    expect(r.ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
  })

  it('fail-open ante error de DB (no bloquea al usuario por un fallo transitorio)', async () => {
    const { guardGeneration } = await import('@/lib/gen-quota')
    state.globalErr = { message: 'connection reset' }
    const r = await guardGeneration('user-1', 'branding-logo')
    expect(r.ok).toBe(true)
  })

  it('sin userId solo evalúa el tope global (no consulta per-user)', async () => {
    const { guardGeneration, USER_DAILY_LIMIT } = await import('@/lib/gen-quota')
    state.userCount = USER_DAILY_LIMIT + 5 // irrelevante: sin userId no se mira
    const r = await guardGeneration(null, 'anuncios-image')
    expect(r.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
  })
})
