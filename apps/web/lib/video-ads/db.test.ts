import { describe, it, expect, vi, beforeEach } from 'vitest'

// Solo se prueba `claimFreshLotes` (fix round 2): es la única pieza de este módulo
// con semántica no trivial (escritura CONDICIONAL) — el resto son pass-through
// directos a Supabase sin lógica propia que valga la pena mockear.
//
// Cada paso de la cadena es su propio mock hoisted (no una función inline nueva por
// llamada) para poder afirmar CON QUÉ argumentos se llamó cada uno — no solo que la
// cadena tenga la forma correcta, sino que la condición sea específicamente sobre
// la columna `lotes` y el valor `null` (fix round 3: un filtro sobre otra columna
// pasaría igual con una aserción que solo mira la forma de la cadena).
const { mockSelect, mockIs, mockEq, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockSelect = vi.fn()
  const mockIs = vi.fn(() => ({ select: mockSelect }))
  const mockEq = vi.fn(() => ({ is: mockIs }))
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ update: mockUpdate }))
  return { mockSelect, mockIs, mockEq, mockUpdate, mockFrom }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('claimFreshLotes', () => {
  const patch = { step: 6, lotes: [], duration: 0, render_done: false }

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

  it('la condición es específicamente `lotes IS NULL` sobre la fila del id dado, no cualquier filtro', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: 's1' }], error: null })
    const { claimFreshLotes } = await import('./db')
    await claimFreshLotes('s1', patch)

    expect(mockUpdate).toHaveBeenCalledWith(patch)
    expect(mockEq).toHaveBeenCalledWith('id', 's1')
    expect(mockIs).toHaveBeenCalledWith('lotes', null)
  })
})
