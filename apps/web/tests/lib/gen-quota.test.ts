import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase: una tabla en memoria de filas { session_id, kind, gen_day }.
const rows: Array<{ session_id: string | null; kind: string; gen_day: string }> = []
// Sentinel para simular un error de DB específicamente en la query del backstop
// GLOBAL (single `.eq('gen_day', day)`, sin `session_id`/`kind`) — distingue esa
// query de la per-step (`.eq('session_id',...).eq('kind',...)`), que sigue
// resolviendo normal aunque este flag esté en true.
let forceGlobalError = false
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      // .select(count) encadena .eq(...).eq(...) y resuelve { count }
      select: (_c: string, _o: unknown) => {
        const filters: Array<[string, unknown]> = []
        const chain = {
          eq(col: string, val: unknown) { filters.push([col, val]); return chain },
          then(res: (v: { count: number; error: { message: string } | null }) => void) {
            if (forceGlobalError && filters.length === 1 && filters[0][0] === 'gen_day') {
              res({ count: 0, error: { message: 'simulated global backstop error' } })
              return
            }
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
// El gate de créditos vive en credits.ts y tiene sus propios tests
// (`lib/credits-gate.test.ts`). Acá se neutraliza para medir SOLO el tope per-step:
// desde que rechaza sin sesión, dejarlo vivo haría fallar estos casos por 401.
vi.mock('../../lib/credits', () => ({ checkCredits: async () => ({ blocked: null, credits: null }) }))

import {
  checkGenQuota, checkGlobalBackstop, recordGenQuota, GEN_PER_STEP_LIMIT, GEN_GLOBAL_DAILY_LIMIT, isImageKind,
  VIDEO_GENERATION_LIMIT,
} from '../../lib/gen-quota'

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

// Fix round 2 (Task 6): la cuota del render de video se mueve de "por lote"
// (`video-render`) a "por video" (`video-generation`) — un guión de 2 lotes no debe
// quedarse sin regeneraciones, ni uno de 4 quedar imposible de completar, cuando el
// tope real es cuántas veces se intentó generar EL video, no cuántas llamadas a KIE
// hizo ese intento.
describe('video-generation: cuota por VIDEO, no por lote', () => {
  it('video-generation entra al cap per-step; video-render queda AFUERA (ya no topa)', () => {
    expect(isImageKind('video-generation')).toBe(true)
    expect(isImageKind('video-render')).toBe(false)
  })

  it('permite VIDEO_GENERATION_LIMIT generaciones y bloquea la siguiente', async () => {
    const out = []
    for (let i = 0; i < VIDEO_GENERATION_LIMIT + 1; i++) out.push(await gen('s1', 'video-generation'))
    expect(out.map((o) => o.blocked)).toEqual([...Array(VIDEO_GENERATION_LIMIT).fill(false), true])
  })

  it('video-render sigue escribiendo fila (backstop global) pero nunca bloquea per-step', async () => {
    const out = []
    for (let i = 0; i < 10; i++) out.push(await gen('s1', 'video-render'))
    expect(out.every((o) => !o.blocked)).toBe(true)
    expect(rows.filter((r) => r.kind === 'video-render').length).toBe(10)
  })
})

describe('checkGlobalBackstop', () => {
  it('no bloquea con pocas filas — misma capa que el paso 1 de checkGenQuota, sin el gate per-step', async () => {
    await gen('s1', 'branding-logo') // 1 fila, lejos del backstop diario
    expect((await checkGlobalBackstop()).blocked).toBeNull()
  })

  // Reanudar un render de video sigue gastando en KIE (crea tarea para los lotes
  // pendientes), así que el backstop anti-abuso tiene que seguir aplicando aunque el
  // gate per-step de `video-generation` no se vuelva a cobrar.
  it('no toca el contador per-step de ningún kind (no inserta, solo lee)', async () => {
    await checkGlobalBackstop()
    expect(rows.length).toBe(0)
  })

  it('bloquea al llegar al límite diario global, igual que el paso 1 de checkGenQuota', async () => {
    for (let i = 0; i < GEN_GLOBAL_DAILY_LIMIT; i++) rows.push({ session_id: null, kind: 'anuncios-copy', gen_day: '2026-06-26' })
    expect((await checkGlobalBackstop()).blocked).not.toBeNull()
  })

  it('fail-open: un error en la query global no bloquea', async () => {
    forceGlobalError = true
    try {
      expect((await checkGlobalBackstop()).blocked).toBeNull()
    } finally {
      forceGlobalError = false
    }
  })
})

// Regresión del fix round 2: extraer el backstop global a `globalBackstop()`
// (compartido por `checkGenQuota` y `checkGlobalBackstop`) no puede colapsar "la
// query falló" y "dio bajo el límite" en el mismo `blocked: null` — si lo hiciera,
// `checkGenQuota` seguiría de largo hacia el gate per-step en vez de fail-abrir de
// una, cambiando el comportamiento de TODOS los kinds de imagen del hub (no solo
// video) ante un error de DB.
describe('checkGenQuota — un error en el backstop global fail-abre ANTES del gate per-step', () => {
  it('con el per-step ya en su límite, un error de backstop igual devuelve blocked: null (no llega al paso 3)', async () => {
    for (let i = 0; i < GEN_PER_STEP_LIMIT; i++) await gen('s-err', 'branding-logo')
    expect((await checkGenQuota('s-err', 'branding-logo')).blocked).not.toBeNull() // control: sin el error, SÍ bloquea

    forceGlobalError = true
    try {
      const { blocked, regensLeft } = await checkGenQuota('s-err', 'branding-logo')
      expect(blocked).toBeNull()
      expect(regensLeft).toBeNull()
    } finally {
      forceGlobalError = false
    }
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
