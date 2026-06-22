import { describe, it, expect, vi, beforeEach } from 'vitest'

const { hooks } = vi.hoisted(() => ({
  hooks: {
    endedBatches: [] as string[],
    outcomes: {} as Record<string, { customId: string; analysis?: unknown; error?: string }[]>,
    // ids cuyo producto SIGUE null (saveIfUnscored devuelve true); el resto false
    unscored: new Set<string>(),
    saveCalls: [] as string[],
  },
}))

vi.mock('../../lib/product-hunter/anthropic', () => ({
  analyzeProduct: vi.fn(),
  listRecentEndedBatches: vi.fn(async () => hooks.endedBatches),
  async *batchAnalysisResults(batchId: string) {
    for (const o of hooks.outcomes[batchId] ?? []) yield o
  },
}))

vi.mock('@ph/shared', () => ({
  getProductsToAnalyze: vi.fn(),
  getPeCompetitors: vi.fn(),
  saveProductAnalysis: vi.fn(),
  saveProductAnalysisIfUnscored: vi.fn(async (id: string) => {
    hooks.saveCalls.push(id)
    return hooks.unscored.has(id)
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  hooks.endedBatches = []
  hooks.outcomes = {}
  hooks.unscored = new Set()
  hooks.saveCalls = []
})

describe('reconcileOrphanBatches', () => {
  it('rescata solo productos aún sin score (additive-only) y no cuenta los ya scoreados', async () => {
    hooks.endedBatches = ['b1']
    hooks.outcomes = {
      b1: [
        { customId: 'p-null', analysis: { score: 80, priority: 'alta' } }, // sigue null → rescata
        { customId: 'p-done', analysis: { score: 70, priority: 'media' } }, // ya scoreado → no cuenta
      ],
    }
    hooks.unscored = new Set(['p-null'])
    const { reconcileOrphanBatches } = await import('../../lib/product-hunter/analysis-runner')
    const rescued = await reconcileOrphanBatches()
    expect(rescued).toBe(1)
    // intentó ambos (el guard score-null lo decide la DB), pero solo uno contó
    expect(hooks.saveCalls.sort()).toEqual(['p-done', 'p-null'])
  })

  it('ignora outcomes fallidos (sin analysis) — no los guarda', async () => {
    hooks.endedBatches = ['b1']
    hooks.outcomes = { b1: [{ customId: 'p-err', error: 'errored' }] }
    const { reconcileOrphanBatches } = await import('../../lib/product-hunter/analysis-runner')
    const rescued = await reconcileOrphanBatches()
    expect(rescued).toBe(0)
    expect(hooks.saveCalls).toEqual([])
  })

  it('sin batches terminados no hace nada', async () => {
    hooks.endedBatches = []
    const { reconcileOrphanBatches } = await import('../../lib/product-hunter/analysis-runner')
    expect(await reconcileOrphanBatches()).toBe(0)
  })
})
