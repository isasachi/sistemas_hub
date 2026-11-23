import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase: una tabla en memoria de filas { session_id, kind, gen_day }.
const rows: Array<{ session_id: string | null; kind: string; gen_day: string }> = []
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: (row: { session_id: string | null; kind: string; gen_day: string }) => {
        // Sentinel: lanza para simular fallo DB
        if (row.kind === '__test-db-throw') throw new Error('simulated DB error')
        rows.push(row); return Promise.resolve({ error: null })
      },
    }),
  }),
}))
vi.mock('../../lib/product-hunter/quota', () => ({ limaSearchDay: () => '2026-06-26' }))

// El gate de créditos vive en credits.ts y tiene sus propios tests
// (`lib/credits-gate.test.ts`). Acá se controla a mano para medir que checkGenQuota
// no agrega NINGÚN tope encima.
const checkCredits = vi.fn()
vi.mock('../../lib/credits', () => ({ checkCredits: (...a: unknown[]) => checkCredits(...a) }))

import { checkGenQuota, recordGenQuota } from '../../lib/gen-quota'

beforeEach(() => {
  rows.length = 0
  checkCredits.mockReset()
  checkCredits.mockResolvedValue({ blocked: null, credits: null })
})

// Simula el ciclo real: check → (si pasa) gen → record.
async function gen(sessionId: string | null, kind: string) {
  const { blocked } = await checkGenQuota(kind)
  if (blocked) return false
  await recordGenQuota(sessionId, kind, 'u1')
  return true
}

// 2026-11-23: el único límite son los créditos del plan. Antes había un tope de
// 1 gen + 3 regens por (sesión, paso) y un backstop global de 500/día; los dos se
// borraron (ver la cabecera de gen-quota.ts).
describe('sin topes además de los créditos', () => {
  it('el mismo paso de imagen se puede regenerar más allá de las viejas 3 regens', async () => {
    const out = []
    for (let i = 0; i < 10; i++) out.push(await gen('s1', 'branding-logo'))
    expect(out.every(Boolean)).toBe(true)
    expect(rows).toHaveLength(10)
  })

  it('no hay techo diario global: 600 generaciones en el mismo día pasan', async () => {
    for (let i = 0; i < 600; i++) expect(await gen(`s${i}`, 'anuncios-copy')).toBe(true)
  })

  it.each(['video-character', 'video-forensic', 'video-generation', 'landing-section:hero'])(
    '%s pasa sin tope cuando los créditos no bloquean', async (kind) => {
      for (let i = 0; i < 6; i++) expect(await gen('s1', kind)).toBe(true)
    },
  )
})

describe('checkGenQuota delega en los créditos', () => {
  it('devuelve tal cual el bloqueo de checkCredits', async () => {
    const blocked = Response.json({ error: 'Usaste tus 30 imágenes de este período.' }, { status: 429 })
    checkCredits.mockResolvedValue({ blocked, credits: null })
    const r = await checkGenQuota('anuncios-image')
    expect(r.blocked).toBe(blocked)
  })

  it('le pasa el kind y el owner ya resuelto (stream de branding)', async () => {
    const owner = { userId: 'u1', access: null }
    await checkGenQuota('branding-logo', owner)
    expect(checkCredits).toHaveBeenCalledWith('branding-logo', owner)
  })

  it('no escribe nada: solo recordGenQuota inserta', async () => {
    await checkGenQuota('branding-logo')
    expect(rows).toHaveLength(0)
  })
})

describe('recordGenQuota', () => {
  it('escribe una fila con sesión, kind y día', async () => {
    await recordGenQuota('s1', 'video-render', 'u1')
    expect(rows).toEqual([{ user_id: 'u1', kind: 'video-render', gen_day: '2026-06-26', session_id: 's1' }])
  })

  it('nunca rechaza incluso si insert lanza (sentinel kind __test-db-throw)', async () => {
    await expect(recordGenQuota('s1', '__test-db-throw', 'u1')).resolves.toBeUndefined()
  })
})
