import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase: una tabla en memoria de filas { session_id, kind, gen_day }.
const rows: Array<{ session_id: string | null; kind: string; gen_day: string }> = []
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      // .select(count) encadena .eq(...).eq(...) y resuelve { count }
      select: (_c: string, _o: unknown) => {
        const filters: Array<[string, unknown]> = []
        const chain = {
          eq(col: string, val: unknown) { filters.push([col, val]); return chain },
          then(res: (v: { count: number; error: null }) => void) {
            const n = rows.filter((r) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v)).length
            res({ count: n, error: null })
          },
        }
        return chain
      },
      insert: (row: { session_id: string | null; kind: string; gen_day: string }) => {
        // Sentinel: lanza para simular fallo DB
        if (row.kind === '__test-db-throw') throw new Error('simulated DB error')
        rows.push(row); return Promise.resolve({ error: null })
      },
    }),
  }),
}))
vi.mock('../../lib/product-hunter/quota', () => ({ limaSearchDay: () => '2026-06-26' }))
vi.mock('../../lib/product-hunter/session', () => ({ readUserId: async () => 'u1' }))

import { checkGenQuota, recordGenQuota, GEN_PER_STEP_LIMIT, isImageKind } from '../../lib/gen-quota'

beforeEach(() => { rows.length = 0 })

// Simula el ciclo real: check → (si pasa) gen → record.
async function gen(sessionId: string | null, kind: string) {
  const { blocked, regensLeft } = await checkGenQuota(sessionId, kind)
  if (blocked) return { blocked: true as const, regensLeft }
  await recordGenQuota(sessionId, kind, 'u1')
  return { blocked: false as const, regensLeft }
}

describe('isImageKind', () => {
  it('match por prefijo para landing-section:tipo', () => {
    expect(isImageKind('landing-section:hero')).toBe(true)
    expect(isImageKind('branding-logo')).toBe(true)
    expect(isImageKind('branding-names')).toBe(false)
  })

  // Hallazgo 5 (revisión final): con el render eliminado de esta rama, la llamada
  // más cara que sigue corriendo en el generador de video ads es el análisis
  // forense (hasta 14 MB de video a Gemini) — se movió el cap del paso eliminado
  // (video-render) al paso caro que quedó vivo.
  it('video-forensic entra al cap per-step; video-template (reprocesa texto ya guardado) no', () => {
    expect(isImageKind('video-forensic')).toBe(true)
    expect(isImageKind('video-template')).toBe(false)
  })
})

describe('cuota per-step de video-forensic', () => {
  it('usa el cap genérico (1 gen + 3 regens), igual que las otras tools', async () => {
    const out = []
    for (let i = 0; i < 5; i++) out.push(await gen('s1', 'video-forensic'))
    expect(out.map((o) => o.blocked)).toEqual([false, false, false, false, true])
  })
})

describe('cuota per-step (imagen)', () => {
  it('permite 1 gen + 3 regens y bloquea la 5a', async () => {
    const out = []
    for (let i = 0; i < 5; i++) out.push(await gen('s1', 'branding-logo'))
    expect(out.map((o) => o.blocked)).toEqual([false, false, false, false, true])
    expect(out.slice(0, 4).map((o) => o.regensLeft)).toEqual([3, 2, 1, 0])
  })

  it('contadores independientes por kind y por session', async () => {
    for (let i = 0; i < 4; i++) await gen('s1', 'branding-logo')
    expect((await gen('s1', 'branding-logo')).blocked).toBe(true)
    expect((await gen('s1', 'branding-mockup')).blocked).toBe(false) // otro kind
    expect((await gen('s2', 'branding-logo')).blocked).toBe(false)    // otra session
  })

  it('GEN_PER_STEP_LIMIT es 4', () => { expect(GEN_PER_STEP_LIMIT).toBe(4) })
})

describe('texto', () => {
  it('nunca bloquea per-step y regensLeft es null', async () => {
    const out = []
    for (let i = 0; i < 8; i++) out.push(await gen('s1', 'branding-names'))
    expect(out.every((o) => !o.blocked)).toBe(true)
    expect(out[0].regensLeft).toBeNull()
  })
  it('igual escribe fila (cuenta al backstop global)', async () => {
    await gen('s1', 'branding-names')
    expect(rows.length).toBe(1)
  })
})

describe('recordGenQuota resilencia', () => {
  it('nunca rechaza incluso si insert lanza (sentinel kind __test-db-throw)', async () => {
    // El mock lanzará si kind='__test-db-throw'
    // Sin try/catch en recordGenQuota, esta llamada rechazaría.
    // Con la fix, resuelve a undefined.
    await expect(recordGenQuota('s1', '__test-db-throw', 'u1')).resolves.toBeUndefined()
  })
})
