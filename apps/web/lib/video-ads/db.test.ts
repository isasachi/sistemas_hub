import { describe, it, expect, vi, beforeEach } from 'vitest'

// Solo se prueba `claimFreshLotes` (fix round 2): es la única pieza de este módulo
// con semántica no trivial (escritura CONDICIONAL) — el resto son pass-through
// directos a Supabase sin lógica propia que valga la pena mockear.
const { mockSelect, mockFrom } = vi.hoisted(() => {
  const mockSelect = vi.fn()
  const mockFrom = vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn(() => ({
          select: mockSelect,
        })),
      })),
    })),
  }))
  return { mockSelect, mockFrom }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('claimFreshLotes', () => {
  const patch = { step: 6, lotes: [], duration: 0 }

  it('true cuando la condición `lotes IS NULL` se cumple: la fila queda reclamada', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: 's1' }], error: null })
    const { claimFreshLotes } = await import('./db')
    expect(await claimFreshLotes('s1', patch)).toBe(true)
  })

  // El caso que motiva la función: otro request concurrente ya escribió `lotes`
  // primero, así que la condición `IS NULL` ya no se cumple y Postgres no actualiza
  // ninguna fila — 0 filas devueltas, no un error.
  it('false cuando otra escritura ya ganó la carrera (0 filas afectadas, sin error)', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null })
    const { claimFreshLotes } = await import('./db')
    expect(await claimFreshLotes('s1', patch)).toBe(false)
  })

  it('null/undefined en `data` también se lee como "no reclamado", no como crash', async () => {
    mockSelect.mockResolvedValue({ data: null, error: null })
    const { claimFreshLotes } = await import('./db')
    expect(await claimFreshLotes('s1', patch)).toBe(false)
  })

  it('lanza si Supabase devuelve error (mismo contrato que updateVideoSession)', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { claimFreshLotes } = await import('./db')
    await expect(claimFreshLotes('s1', patch)).rejects.toThrow('boom')
  })
})
