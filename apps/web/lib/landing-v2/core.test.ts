import { describe, expect, it, vi } from 'vitest'

// `section.ts` arrastra los SDK y la lectura de los recursos; acá solo se prueban sus funciones puras.
vi.mock('@/lib/gemini', () => ({ generateImage: vi.fn(), editWithPrompt: vi.fn(), NANO_BANANA_PRO: 'x' }))
vi.mock('@/lib/storage', () => ({ fetchAsBase64: vi.fn(), uploadToStorage: vi.fn() }))
vi.mock('./models', () => ({ structured: vi.fn(), DIRECTOR: ['director', 'respaldo'], DIRECTOR_TIMEOUT_MS: 1 }))
vi.mock('./quota', () => ({ gate: vi.fn(), record: vi.fn(), sectionKind: (id: string) => id }))

import { SECTION_IDS, SECTIONS, inSkeletonOrder } from './catalog'
import { approveSection, changesAnalysis, getNextSection, sectionSupport } from './flow'
import { emptySession, LandingSessionSchema, missingInputs, type LandingInputs, type LandingSession, type SectionDesign } from './schemas'
import { buildDirectedPrompt, designTexts, generateSection, modelFromSize, sinComillas, sinConfianzaInventada } from './section'
import { sourceText, stripUnsupportedTexts, unsupported, verifyTexts } from './verify-copy'

const inputs: LandingInputs = {
  productName: 'Colágeno Vital',
  marketResearch: 'Mujeres de 30 a 50 años con dolor de rodillas. "Me ayudó a subir escaleras sin molestia" — Rosa, Arequipa.',
  pricing: { packs: [{ name: 'Pack x2', quantity: 2, price: 99.9, compareAt: 139.9, label: 'Más vendido' }], notes: 'Pago contra entrega en Lima.' },
  niche: 'health', nicheOther: null, productImageUrl: 'https://x.supabase.co/a.png', proofImageUrls: [],
}

const session = (over: Partial<LandingSession> = {}): LandingSession => ({ ...emptySession('s1', 'chat'), inputs, ...over })

describe('catálogo', () => {
  it('14 secciones en el orden del esqueleto, una página de wireframe cada una', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([...SECTION_IDS])
    expect(SECTIONS.map((s) => s.wf)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
  })
  it('la generación respeta el esqueleto aunque la selección venga desordenada', () => {
    expect(inSkeletonOrder(['final_reoffer', 'hero', 'mechanism'])).toEqual(['hero', 'mechanism', 'final_reoffer'])
  })
})

describe('inputs bloqueantes', () => {
  it('pide solo lo que falta', () => {
    expect(missingInputs({})).toEqual(['productName', 'marketResearch', 'pricing', 'niche', 'productImageUrl'])
    expect(missingInputs(inputs)).toEqual([])
    expect(missingInputs({ ...inputs, niche: 'other', nicheOther: null })).toEqual(['niche'])
    expect(missingInputs({ ...inputs, pricing: { packs: [], notes: '' } })).toEqual(['pricing'])
  })
})

describe('flujo', () => {
  it('testimonios y antes/después no se generan sin datos reales, y sugieren la compatible', () => {
    expect(sectionSupport(session(), 'testimonials')).toMatchObject({ ok: false, suggest: 'authority' })
    expect(sectionSupport(session(), 'before_after')).toMatchObject({ ok: false, suggest: 'comparison' })
    expect(sectionSupport(session({ testimonials: [{ name: 'Rosa', city: 'Arequipa', text: 'x' }] }), 'testimonials').ok).toBe(true)
  })
  it('la siguiente es la primera seleccionada, respaldada y sin aprobar', () => {
    const s = session({ selected: ['hero', 'before_after', 'testimonials', 'authority'] })
    expect(getNextSection(s)).toBe('hero')
    const conHero = { ...s, sections: { hero: { approved: false, versions: [{ imageUrl: 'u', model: 'm', feedback: null, createdAt: '' }] } } }
    const aprobada = approveSection(conHero, 'hero')
    expect(aprobada.sections.hero?.approved).toBe(true)
    expect(aprobada.current).toBe('authority') // salta las dos sin datos
  })
  it('re-analiza solo si cambia el VALOR de lo que mira el análisis', () => {
    expect(changesAnalysis(inputs, { ...inputs })).toBe(false) // el modelo reenvía lo que ya sabe
    expect(changesAnalysis(inputs, { ...inputs, proofImageUrls: ['https://x/b.png'] })).toBe(false)
    expect(changesAnalysis(inputs, { ...inputs, productName: 'Otro' })).toBe(true)
  })
  it('no se aprueba una sección sin imagen', () => {
    expect(() => approveSection(session(), 'hero')).toThrow()
  })
})

describe('verificador de textos', () => {
  const src = sourceText(inputs)
  it('deja pasar lo que está en los datos', () => {
    expect(unsupported('Pack x2 a S/ 99.90, antes S/ 139.90', src)).toEqual([])
    expect(unsupported('Paga contra entrega', src)).toEqual([])
    expect(unsupported('Paso 1: tómalo en ayunas', src)).toEqual([])
  })
  it('caza los ejemplos del wireframe y los claims sin respaldo', () => {
    expect(unsupported('+10,000 clientes satisfechos • 4.8/5 estrellas', src)).toEqual(expect.arrayContaining(['10,000', '4.8', 'clientes satisfechos', 'estrellas']))
    expect(unsupported('Garantía de 15 días y envío gratis', src)).toEqual(expect.arrayContaining(['15', 'garantia', 'gratis', 'envio']))
    expect(unsupported('Clínicamente comprobado', src)).toEqual(expect.arrayContaining(['clinicamente', 'comprobado']))
    // Fugas medidas en el probe del 2026-10-05 (urgencia y pago inventados).
    expect(unsupported('Aprovecha nuestra oferta disponible antes de que finalice', src)).toEqual(expect.arrayContaining(['finali', 'antes de que']))
    expect(unsupported('Aprovecha las promociones disponibles hoy', src)).toEqual(expect.arrayContaining(['promocion', 'hoy']))
    expect(unsupported('Cancela en efectivo al recibir', src)).toEqual(['efectivo'])
  })
  it('si el reintento no alcanza, quita las líneas inventadas', () => {
    const texts = [{ role: 'headline', text: 'Alivio para tus rodillas' }, { role: 'badge', text: 'Garantía total' }, { role: 'proof', text: '+10,000 clientes' }]
    expect(verifyTexts(texts, src).map((v) => v.field)).toEqual(expect.arrayContaining(['texts.1', 'texts.2']))
    expect(stripUnsupportedTexts(texts, src)).toEqual([texts[0]])
  })
})

const vs = { niche: 'health' as const, productForm: 'frasco', palette: [], typography: 't', photography: 'p', artDirection: 'a', usesPeople: true, peopleDirection: 'mujeres de 30-45' }

describe('prompt de imagen del director', () => {
  const design: SectionDesign = { visualConcept: 'concept', composition: 'comp', usesPerson: false, texts: [{ role: 'headline', text: 'Elige tu pack' }] }
  const s = session({ visualSystem: vs })
  it('los precios los pone el código desde los datos del usuario, solo en las secciones de oferta', () => {
    const t = designTexts('offer_pricing', design, s, inputs).join('\n')
    expect(t).toContain('"S/ 99.90"')
    expect(t).toContain('"Antes S/ 139.90"')
    expect(t).toContain('"Ahorras S/ 40.00"')
    expect(designTexts('hero', design, s, inputs).join('\n')).not.toContain('S/')
  })
  it('los testimonios van literales desde la investigación', () => {
    const conT = session({ testimonials: [{ name: 'Rosa', city: 'Arequipa', text: 'Me ayudó a subir escaleras sin molestia' }] })
    expect(designTexts('testimonials', design, conT, inputs).join('\n')).toContain('"Me ayudó a subir escaleras sin molestia" — "Rosa, Arequipa"')
  })
  it('la composición no puede colar texto entre comillas a la imagen', () => {
    expect(sinComillas('Big headline "Envío gratis hoy" at the top, product\'s label visible')).toBe("Big headline at the top, product's label visible")
  })
  it('sin botones, sin persona si el diseño no la usa, y el wireframe nunca va', () => {
    const p = buildDirectedPrompt({ id: 'hero', design, s, inputs, vs, style: null, proof: [] })
    expect(p).toContain('Do not show any person.')
    expect(p).toContain('NO BUTTONS')
    expect(p).toContain('VISUAL CONCEPT')
    expect(p).not.toMatch(/wireframe/i)
    expect(buildDirectedPrompt({ id: 'hero', design: { ...design, usesPerson: true }, s, inputs, vs, style: null, proof: [] })).not.toContain('Do not show any person.')
  })
  it('la composición no puede planear elementos de confianza sin texto (el modelo de imagen los inventa)', () => {
    const b = 'The structure begins with a subtle trust bar. Bold headline left. The bottom closes with sleek micro-trust icons without buttons.'
    expect(sinConfianzaInventada(b)).toBe('Bold headline left.')
  })
  it('la huella del modelo sale del tamaño antes de reescalar', () => {
    expect(modelFromSize(864, 1536)).toBe('gpt-image-2.5-sunburst')
    expect(modelFromSize(1152, 2048)).toMatch(/^google/)
  })
})

describe('generateSection', () => {
  it('diseña con el par del director, pinta y GUARDA el diseño limpio (de él salen los textos a no repetir)', async () => {
    const { structured } = await import('./models')
    const { generateImage } = await import('@/lib/gemini')
    const { fetchAsBase64, uploadToStorage } = await import('@/lib/storage')
    const sharp = (await import('sharp')).default
    const design: SectionDesign = { visualConcept: 'c', composition: 'Bold "Hola" headline.', usesPerson: true, texts: [{ role: 'headline', text: 'Alivio para tus rodillas' }, { role: 'badge', text: 'Envío gratis' }] }
    vi.mocked(structured).mockResolvedValue({ output: design, model: 'gpt-5.5' })
    vi.mocked(fetchAsBase64).mockResolvedValue({ data: 'aGk=', mimeType: 'image/png' })
    const png = await sharp({ create: { width: 864, height: 1536, channels: 3, background: '#fff' } }).png().toBuffer()
    vi.mocked(generateImage).mockResolvedValue(png.toString('base64'))
    vi.mocked(uploadToStorage).mockResolvedValue('https://x/hero.jpg')

    const out = await generateSection(session({ visualSystem: vs }), 'hero', { userId: 'u', owner: null })

    expect(vi.mocked(structured).mock.calls[0][0]).toMatchObject({ models: ['director', 'respaldo'], name: 'landing_v2_section_design' })
    expect(out.designs.hero).toEqual({ visualConcept: 'c', composition: 'Bold headline.', usesPerson: true, texts: [design.texts[0]] })
    expect(out.sections.hero?.versions[0]).toMatchObject({ imageUrl: 'https://x/hero.jpg', model: 'gpt-image-2.5-sunburst' })
    expect(out.current).toBe('hero')
  })
})

describe('sesiones guardadas antes del director', () => {
  it('se leen: `copies` y `graphicResources` se descartan y `designs` arranca vacío', () => {
    const vieja = {
      ...emptySession('s1', 'wizard'), designs: undefined,
      copies: { hero: { headline: 'h', subheadline: null, items: [], closingLine: null } },
      visualSystem: { ...vs, graphicResources: ['x'] },
    }
    const s = LandingSessionSchema.parse(vieja)
    expect(s.designs).toEqual({})
    expect(s).not.toHaveProperty('copies')
    expect(s.visualSystem).not.toHaveProperty('graphicResources')
  })
})

