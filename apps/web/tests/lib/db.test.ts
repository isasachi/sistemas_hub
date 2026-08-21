import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionResponse } from '@/lib/types'

// `eq` es ENCADENABLE porque las lecturas ahora acotan por dos columnas
// (`.eq('id').eq('user_id')`) — ver la nota de pertenencia en lib/db.ts. `eqCalls`
// registra los pares para poder afirmar que el filtro por dueño realmente se aplica:
// sin eso el test pasaría igual con la query vieja, que es el bug que esto cierra.
const { mockSingle, mockFrom, mockDelete, eqCalls } = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockDelete = vi.fn()
  const eqCalls: Array<[string, unknown]> = []
  const chain = () => {
    const self: Record<string, unknown> = {
      eq: vi.fn((col: string, val: unknown) => { eqCalls.push([col, val]); return self }),
      select: vi.fn(() => self),
      single: mockSingle,
      then: undefined,
    }
    return self
  }
  const mockFrom = vi.fn(() => ({
    insert: vi.fn(() => ({ select: vi.fn(() => ({ single: mockSingle })) })),
    select: vi.fn(() => chain()),
    update: vi.fn(() => chain()),
    // El delete resuelve como promesa: devuelve { error, count } sin pasar por single.
    delete: vi.fn(() => {
      const self: Record<string, unknown> = {
        eq: vi.fn((col: string, val: unknown) => { eqCalls.push([col, val]); return self }),
        then: (res: (v: unknown) => unknown) => res(mockDelete()),
      }
      return self
    }),
  }))
  return { mockSingle, mockFrom, mockDelete, eqCalls }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  eqCalls.length = 0
})

describe('createSession', () => {
  it('returns session id', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'abc-123' }, error: null })
    const { createSession } = await import('@/lib/db')
    const id = await createSession()
    expect(id).toBe('abc-123')
  })

  it('throws on error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const { createSession } = await import('@/lib/db')
    await expect(createSession()).rejects.toThrow('DB error')
  })
})

describe('getSession', () => {
  it('returns session data', async () => {
    const fakeSession: Partial<SessionResponse> = { id: 's1', step: 0 }
    mockSingle.mockResolvedValue({ data: fakeSession, error: null })
    const { getSession } = await import('@/lib/db')
    const session = await getSession('s1', 'u1')
    expect(session?.id).toBe('s1')
  })

  it('returns null on error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const { getSession } = await import('@/lib/db')
    const session = await getSession('bad-id', 'u1')
    expect(session).toBeNull()
  })

  // ── Pertenencia (2026-08-21) ────────────────────────────────────────────────
  // Antes esto filtraba solo por id: con el UUID de otro se leía su sesión entera.

  it('acota la query al dueño, no solo al id', async () => {
    mockSingle.mockResolvedValue({ data: { id: 's1' }, error: null })
    const { getSession } = await import('@/lib/db')
    await getSession('s1', 'u1')
    expect(eqCalls).toEqual([['id', 's1'], ['user_id', 'u1']])
  })

  it('sin identidad no devuelve NADA, y ni siquiera consulta', async () => {
    // El punto no es solo el null: es que un uid nulo no puede convertirse en
    // "todas las filas". Si esto llegara a la DB, `.eq('user_id', null)` dependería
    // de la semántica de NULL de SQL para no matchear — funcionaría por accidente.
    mockSingle.mockResolvedValue({ data: { id: 's1' }, error: null })
    const { getSession } = await import('@/lib/db')
    expect(await getSession('s1', null)).toBeNull()
    expect(eqCalls).toEqual([])
  })
})

describe('deleteSession — pertenencia', () => {
  it('borra y confirma cuando la sesión es del usuario', async () => {
    mockDelete.mockReturnValue({ error: null, count: 1 })
    const { deleteSession } = await import('@/lib/db')
    expect(await deleteSession('s1', 'u1')).toBe(true)
    expect(eqCalls).toEqual([['id', 's1'], ['user_id', 'u1']])
  })

  it('devuelve false cuando no borró nada (sesión ajena)', async () => {
    // Un DELETE que no matchea NO es error en PostgREST: sin mirar el count la ruta
    // respondía {ok:true} sobre una sesión ajena que sigue viva. Éxito silencioso.
    mockDelete.mockReturnValue({ error: null, count: 0 })
    const { deleteSession } = await import('@/lib/db')
    expect(await deleteSession('de-otro', 'u1')).toBe(false)
  })

  it('sin identidad no borra ni consulta', async () => {
    const { deleteSession } = await import('@/lib/db')
    expect(await deleteSession('s1', null)).toBe(false)
    expect(eqCalls).toEqual([])
  })
})

describe('updateSession', () => {
  it('resolves without error on success', async () => {
    mockSingle.mockResolvedValue({ data: { id: 's1', step: 1 }, error: null })
    const { updateSession } = await import('@/lib/db')
    await expect(updateSession('s1', { step: 1 })).resolves.toBeUndefined()
  })
})
