import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { SessionResponse } from '@/lib/types'

// El núcleo se prueba con el modelo, la base, el storage y la cuota stubeados: lo que se fija acá es
// el CONTRATO (qué se le pide al modelo, qué se guarda, cuándo se cobra), no lo que el modelo escribe.
const m = vi.hoisted(() => ({
  structured: vi.fn(),
  reasoning: vi.fn(),
  updateSession: vi.fn(),
  checkGenQuota: vi.fn(),
  recordGenQuota: vi.fn(),
  editImage: vi.fn(),
  refineImage: vi.fn(),
}))
vi.mock('@/lib/ai-sdk', () => ({ structured: m.structured, reasoning: m.reasoning }))
vi.mock('@/lib/db', () => ({ updateSession: m.updateSession }))
vi.mock('@/lib/gen-quota', () => ({ checkGenQuota: m.checkGenQuota, recordGenQuota: m.recordGenQuota }))
vi.mock('@/lib/gemini', () => ({ editImage: m.editImage, refineImage: m.refineImage, STEP5_PROMPT: 'STEP5', SYSTEM_PROMPT: 'SYS' }))
vi.mock('@/lib/storage', () => ({
  uploadToStorage: vi.fn(async (_id: string, _b: Buffer, _m: string, name: string) => `https://s/${name}`),
  fetchAsBase64: vi.fn(async () => ({ data: Buffer.from('x').toString('base64'), mimeType: 'image/png' })),
}))
vi.mock('@/lib/aspect', () => ({ aspectRatioOf: vi.fn(async () => '9:16') }))

import { AnunciosError, analyzeProduct, copyCorrection, copyPrompt, generateAd, generateCopy, refineAd } from './core'
import { researchPrompt } from './research'
import { CopyVersionsOut, MarketResearchSchema, ProductScanOut, ReferenceAnalysisOut } from './schemas'

const ctx = { userId: 'u1', owner: null }
const img = { bytes: Buffer.from('x'), mimeType: 'image/png' }
const refAnalysis = {
  format: { ratio: '9:16', platform: 'instagram' }, style: 'ugc', composition: ['a'], replacements: [],
  physicalPosition: 'Está apoyado. No está flotando.', colorimetry: 'crema', typography: 'sans',
  persuasiveLogic: 'antes/después', layoutDescription: 'split',
  sceneElements: { people: [], props: [], brandElements: [], setting: 'estudio' },
  creativeConcept: 'before/after', bodyFocus: null, attentionMarkers: null, summaryForUser: 'ok',
}
const scan = { productDescription: 'frasco', brandingDescription: null, brandColors: null, styleCompatibilityNote: null, summaryForUser: 'ok' }
const research = { niche: 'cuidado facial', keywords: ['manchas en la cara'], pains: ['se me nota la mancha'], desires: ['piel pareja'] }
const el = (text: string, template: string | null = null, source: string | null = null) => ({ element: 'headline', text, template, source })
const copy = { versionA: [el('Piel pareja')], versionB: [el('Manchas que no se van', '[problema] que no se van', 'Grasa que no se va')] }

const session = (over: Partial<SessionResponse> = {}): SessionResponse => ({
  id: 's1', created_at: '', step: 2,
  reference_url: 'https://s/reference', reference_analysis: refAnalysis,
  product_url: 'https://s/product', logo_url: null, product_scan: scan,
  product_name: 'Sérum', what_it_is: 'sérum facial', what_it_does: 'aclara manchas', target_audience: 'mujeres 25-40',
  market_research: research, copy_versions: null, confirmed_copy: null, edit_instruction: null, image_url: null, messages: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  m.checkGenQuota.mockResolvedValue({ blocked: null, regensLeft: 3 })
})

describe('schemas de salida', () => {
  // El AI SDK convierte con io:'input': un `.catch`/`.nullish()`/`.optional()` saca el campo del
  // `required` y el modelo lo omite en silencio. Esto fija que NINGÚN campo quede fuera.
  const faltantes = (node: unknown, path = ''): string[] => {
    if (!node || typeof node !== 'object') return []
    const n = node as { properties?: Record<string, unknown>; required?: string[]; items?: unknown; anyOf?: unknown[] }
    const propias = Object.keys(n.properties ?? {}).filter((k) => !(n.required ?? []).includes(k)).map((k) => `${path}.${k}`)
    return [
      ...propias,
      ...Object.entries(n.properties ?? {}).flatMap(([k, v]) => faltantes(v, `${path}.${k}`)),
      ...faltantes(n.items, `${path}[]`),
      ...(n.anyOf ?? []).flatMap((v) => faltantes(v, path)),
    ]
  }
  it.each([
    ['reference_analysis', ReferenceAnalysisOut],
    ['product_scan', ProductScanOut],
    ['copy_versions', CopyVersionsOut],
    ['market_research', MarketResearchSchema],
  ])('%s: todo campo va en required', (_name, schema) => {
    expect(faltantes(z.toJSONSchema(schema as z.ZodType, { io: 'input' }))).toEqual([])
  })
})

describe('investigación de mercado', () => {
  it('el prompt arma el brief con los campos del formulario y no pide comentarios', () => {
    const p = researchPrompt({ productName: 'Sérum', whatItIs: null, whatItDoes: 'aclara', targetAudience: 'mujeres' })
    expect(p).not.toMatch(/comment/i)
    expect(p).toContain('What it is: not provided')
  })

  it('analyzeProduct la corre EN PARALELO con el scan y la guarda', async () => {
    let enVuelo = 0, pico = 0
    m.structured.mockImplementation(async ({ name }: { name: string }) => {
      pico = Math.max(pico, ++enVuelo)
      await new Promise((r) => setTimeout(r, 5))
      enVuelo--
      return { output: name === 'market_research' ? research : scan, model: 'gemini' }
    })
    const out = await analyzeProduct(session({ market_research: null }), { product: img, logo: null, productName: 'Sérum', whatItIs: null, whatItDoes: 'aclara', targetAudience: 'mujeres' }, ctx)
    expect(pico).toBe(2)
    expect(out.research).toEqual(research)
    expect(m.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({ step: 2, market_research: research, copy_versions: null }))
  })

  it('si la investigación falla, el producto se analiza igual', async () => {
    m.structured.mockImplementation(async ({ name }: { name: string }) => {
      if (name === 'market_research') throw new Error('timeout')
      return { output: scan, model: 'gemini' }
    })
    const out = await analyzeProduct(session(), { product: img, logo: null, productName: 'Sérum', whatItIs: null, whatItDoes: 'aclara', targetAudience: 'mujeres' }, ctx)
    expect(out.research).toBeNull()
    expect(out.scan.productDescription).toBe('frasco')
  })
})

describe('copy', () => {
  it('con investigación, el prompt la usa y no menciona comentarios', () => {
    const p = copyPrompt(session(), refAnalysis, scan, research, '')
    expect(p).toContain('Search keywords: manchas en la cara')
    expect(p).toContain('The market research feeds the writing')
    expect(p).not.toMatch(/tiktok|comment/i)
  })

  // Dos instrucciones opuestas en el mismo prompt: gana la primera o el sorteo. Sin investigación
  // no puede quedar ni una línea que apunte a ella.
  it('sin investigación, no queda ninguna referencia colgando', () => {
    const p = copyPrompt(session(), refAnalysis, scan, null, '')
    expect(p).not.toMatch(/market research|keyword|tiktok|comment/i)
    expect(p).toContain('Never invent reviews')
  })

  it('copyCorrection caza a B calcando la referencia, y el conteo distinto', () => {
    expect(copyCorrection(copy)).toBeNull()
    expect(copyCorrection({ versionA: [el('x')], versionB: [el('Grasa que no se va', '[todo]', 'Grasa que no se va')] })).toMatch(/headline/)
    expect(copyCorrection({ versionA: [el('x'), el('y')], versionB: [el('z', 'z', 'q')] })).toMatch(/SAME number/)
    expect(copyCorrection({ versionA: [], versionB: [] })).toMatch(/at least one/)
  })

  it('generateCopy reintenta por `validate` (no por un refine del schema) y guarda el copy', async () => {
    m.structured.mockResolvedValue({ output: copy, model: 'gemini' })
    const out = await generateCopy(session(), '', ctx)
    const call = m.structured.mock.calls[0][0]
    expect(call.schema).toBe(CopyVersionsOut)
    expect(call.validate).toBe(copyCorrection)
    expect(out.copyVersions.versionB[0].text).toBe('Manchas que no se van')
    expect(m.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({ step: 3, copy_versions: copy }))
    expect(m.recordGenQuota).toHaveBeenCalledWith('s1', 'anuncios-copy', 'u1')
  })

  it('una sesión ANTERIOR a la investigación la calcula al generar el copy y la persiste', async () => {
    m.structured.mockImplementation(async ({ name }: { name: string }) => ({ output: name === 'market_research' ? research : copy, model: 'gemini' }))
    await generateCopy(session({ market_research: null }), '', ctx)
    expect(m.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({ market_research: research }))
  })

  it('si B sigue calcando tras los reintentos, no se ofrece ni se cobra', async () => {
    m.structured.mockResolvedValue({ output: { versionA: [el('x')], versionB: [el('Grasa', '[todo]', 'Grasa')] }, model: 'gemini' })
    await expect(generateCopy(session(), '', ctx)).rejects.toBeInstanceOf(AnunciosError)
    expect(m.updateSession).not.toHaveBeenCalled()
    expect(m.recordGenQuota).not.toHaveBeenCalled()
  })
})

describe('cobro de imagen', () => {
  const lista = session({ step: 4, confirmed_copy: { version: 'A', breakdown: copy.versionA }, image_url: 'https://s/result' })

  it('generateAd cobra DENTRO del núcleo: gate antes, record después', async () => {
    m.reasoning.mockResolvedValue({ text: 'instructivo', model: 'gemini' })
    m.editImage.mockResolvedValue(Buffer.from('img').toString('base64'))
    const etapas: string[] = []
    const out = await generateAd(lista, { onStage: (e) => etapas.push(e) }, ctx)
    expect(out).toEqual({ imageUrl: 'https://s/result', regensLeft: 3 })
    // Imágenes ANTES del prompt: es un requisito (el ratio sale de los bytes) y la UI lo espeja.
    expect(etapas).toEqual(['loading_images', 'building_prompt', 'generating', 'uploading'])
    expect(m.checkGenQuota).toHaveBeenCalledWith('s1', 'anuncios-image', null)
    expect(m.recordGenQuota).toHaveBeenCalledWith('s1', 'anuncios-image', 'u1')
  })

  it('con `gated` no vuelve a consultar la cuota (la ruta SSE ya lo hizo)', async () => {
    m.reasoning.mockResolvedValue({ text: 'i', model: 'gemini' })
    m.editImage.mockResolvedValue('aW1n')
    await generateAd(lista, { gated: { regensLeft: 1 } }, ctx)
    expect(m.checkGenQuota).not.toHaveBeenCalled()
    expect(m.recordGenQuota).toHaveBeenCalledTimes(1)
  })

  it('sin cuota no genera, y devuelve el mismo cuerpo y status que la ruta', async () => {
    m.checkGenQuota.mockResolvedValue({ blocked: Response.json({ error: 'Sin créditos', credits: { restantes: 0 } }, { status: 429 }), regensLeft: 0 })
    const e = await refineAd(lista, 'más claro', ctx).catch((x) => x)
    expect(e).toBeInstanceOf(AnunciosError)
    expect(e.status).toBe(429)
    expect(e.body).toEqual({ error: 'Sin créditos', credits: { restantes: 0 } })
    expect(m.refineImage).not.toHaveBeenCalled()
  })

  it('una imagen vacía no se cobra', async () => {
    m.refineImage.mockResolvedValue('')
    await expect(refineAd(lista, '', ctx)).rejects.toMatchObject({ status: 422 })
    expect(m.recordGenQuota).not.toHaveBeenCalled()
  })
})
