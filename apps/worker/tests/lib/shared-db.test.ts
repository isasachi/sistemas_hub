import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del cliente Supabase: un builder encadenable que registra cada llamada y,
// al await-earse, resuelve `result`. Sirve para inspeccionar filtros y payloads.
const { calls, result } = vi.hoisted(() => {
  const calls: { method: string; args: unknown[] }[] = []
  const result: { data: unknown; error: unknown } = { data: [], error: null }
  return { calls, result }
})

vi.mock('@supabase/supabase-js', () => {
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
        return (...args: unknown[]) => {
          calls.push({ method: prop, args })
          return chain
        }
      },
    },
  )
  return { createClient: vi.fn(() => ({ from: (...a: unknown[]) => { calls.push({ method: 'from', args: a }); return chain } })) }
})

beforeEach(() => {
  calls.length = 0
  result.data = []
  result.error = null
  process.env.SUPABASE_URL = 'http://test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
})

describe('upsertProducts — cost rule #3: NUNCA sobrescribe score/analysis', () => {
  it('el payload del upsert solo lleva campos del scraper (sin score ni analysis)', async () => {
    const { upsertProducts } = await import('@ph/shared')
    await upsertProducts([
      { id: 'p1', niche: 'rodilla', page_id: 'pg', name: 'AdvX', raw_data: { ad_count: 50, days_running: 20 } },
    ])
    const upsert = calls.find((c) => c.method === 'upsert')
    expect(upsert).toBeTruthy()
    const rows = upsert!.args[0] as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('score')
    expect(rows[0]).not.toHaveProperty('analysis')
    expect(rows[0]).not.toHaveProperty('analyzed_at')
    expect(rows[0]).toMatchObject({ id: 'p1', niche: 'rodilla', page_id: 'pg' })
    // onConflict por id (preserva la fila previa salvo los campos enviados)
    expect(upsert!.args[1]).toMatchObject({ onConflict: 'id' })
  })

  it('no llama a la DB con lista vacía', async () => {
    const { upsertProducts } = await import('@ph/shared')
    await upsertProducts([])
    expect(calls.find((c) => c.method === 'upsert')).toBeUndefined()
  })
})

describe('getProductsToAnalyze — cost rule #3: gate score IS NULL', () => {
  it('filtra por score null (solo analiza una vez)', async () => {
    result.data = []
    const { getProductsToAnalyze } = await import('@ph/shared')
    await getProductsToAnalyze('rodilla', 50)
    const isCall = calls.find((c) => c.method === 'is')
    expect(isCall).toBeTruthy()
    expect(isCall!.args).toEqual(['score', null])
    // y filtra por nicho
    expect(calls.find((c) => c.method === 'eq' && (c.args as unknown[])[0] === 'niche')).toBeTruthy()
  })

  it('ordena por prescore desc y recorta a limit', async () => {
    // dos filas: la de mayor longevidad/volumen debe quedar primera
    result.data = [
      { id: 'lo', niche: 'rodilla', raw_data: { ad_count: 40, days_running: 12 }, score: null, analysis: null },
      { id: 'hi', niche: 'rodilla', raw_data: { ad_count: 200, days_running: 90 }, score: null, analysis: null },
    ]
    const { getProductsToAnalyze } = await import('@ph/shared')
    const out = await getProductsToAnalyze('rodilla', 1)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('hi')
  })
})
