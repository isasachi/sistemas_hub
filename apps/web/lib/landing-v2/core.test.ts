import { describe, expect, it, vi } from 'vitest'

// `section.ts` arrastra los SDK y la lectura de los recursos; acá solo se prueban sus funciones puras.
vi.mock('@/lib/gemini', () => ({ generateImage: vi.fn(), editWithPrompt: vi.fn(), NANO_BANANA_PRO: 'x' }))
vi.mock('@/lib/storage', () => ({ fetchAsBase64: vi.fn(), uploadToStorage: vi.fn() }))
vi.mock('./models', () => ({ structured: vi.fn() }))
vi.mock('./quota', () => ({ gate: vi.fn(), record: vi.fn(), sectionKind: (id: string) => id }))

import { SECTION_IDS, SECTIONS, inSkeletonOrder } from './catalog'
import { approveSection, changesAnalysis, getNextSection, sectionSupport } from './flow'
import { emptySession, missingInputs, type LandingInputs, type LandingSession, type SectionCopy } from './schemas'
import { buildImagePrompt, modelFromSize, renderTexts, sinComillas } from './section'
import { sourceText, stripUnsupported, unsupported, verifyCopy } from './verify-copy'

const inputs: LandingInputs = {
  productName: 'Colágeno Vital',
  marketResearch: 'Mujeres de 30 a 50 años con dolor de rodillas. "Me ayudó a subir escaleras sin molestia" — Rosa, Arequipa.',
  pricing: { packs: [{ name: 'Pack x2', quantity: 2, price: 99.9, compareAt: 139.9, label: 'Más vendido' }], notes: 'Pago contra entrega en Lima.' },
  niche: 'health', nicheOther: null, productImageUrl: 'https://x.supabase.co/a.png', proofImageUrls: [], ctaText: null,
}

const session = (over: Partial<LandingSession> = {}): LandingSession => ({ ...emptySession('s1', 'chat'), inputs, ...over })

describe('catálogo', () => {
  it('14 secciones en el orden del esqueleto, una página de wireframe cada una', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([...SECTION_IDS])
    expect(SECTIONS.map((s) => s.wf)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
    expect(SECTIONS.filter((s) => s.cta).map((s) => s.id)).toEqual(['hero', 'offer_pricing', 'final_reoffer'])
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
    expect(changesAnalysis(inputs, { ...inputs, ctaText: 'Comprar' })).toBe(false)
    expect(changesAnalysis(inputs, { ...inputs, productName: 'Otro' })).toBe(true)
  })
  it('no se aprueba una sección sin imagen', () => {
    expect(() => approveSection(session(), 'hero')).toThrow()
  })
})

describe('verificador de copy', () => {
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
  it('si el reintento no alcanza, quita lo inventado y nunca deja el titular vacío', () => {
    const copy: SectionCopy = {
      headline: 'Garantía total.', subheadline: 'Envío gratis a todo el Perú',
      items: [{ group: null, title: null, text: 'Alivio para tus rodillas' }, { group: null, title: null, text: '+10,000 clientes' }],
      closingLine: null, cta: 'Quiero mi descuento',
    }
    expect(verifyCopy(copy, src).length).toBeGreaterThan(0)
    const limpio = stripUnsupported(copy, src, inputs.productName)
    expect(limpio.headline).toBe('Colágeno Vital')
    expect(limpio.subheadline).toBeNull()
    expect(limpio.items).toHaveLength(1)
    expect(verifyCopy(limpio, src)).toEqual([])
  })
})

describe('prompt de imagen', () => {
  const copy: SectionCopy = { headline: 'Elige tu pack', subheadline: null, items: [], closingLine: null, cta: 'Elegir mi pack' }
  it('los precios los pone el código desde los datos del usuario', () => {
    const t = renderTexts('offer_pricing', copy, inputs).join('\n')
    expect(t).toContain('"S/ 99.90"')
    expect(t).toContain('"Antes S/ 139.90"')
    expect(t).toContain('"Ahorras S/ 40.00"')
    expect(renderTexts('hero', copy, inputs).join('\n')).not.toContain('S/')
  })
  it('el brief no puede colar texto entre comillas a la imagen', () => {
    expect(sinComillas('Big headline "Envío gratis hoy" at the top, product\'s label visible')).toBe("Big headline at the top, product's label visible")
  })
  it('sin persona de referencia, la imagen no lleva personas; el wireframe nunca va', () => {
    const p = buildImagePrompt({
      id: 'hero', copy, inputs,
      brief: { composition: 'c', focalPoint: 'f', productPlacement: 'p', usesPerson: false, background: 'b', typographyTreatment: 't', ctaTreatment: 'big' },
      vs: { niche: 'health', productForm: 'frasco', palette: [], polarity: 'light', typography: 't', photography: 'p', graphicResources: [], artDirection: 'a', usesPeople: false, persona: null, talentUrl: null },
      refs: { talent: null, proof: [], style: null },
    })
    expect(p).toContain('Do not show any person.')
    expect(p).toContain('CTA BUTTON: "Elegir mi pack"')
    expect(p).not.toMatch(/wireframe/i)
  })
  it('la huella del modelo sale del tamaño antes de reescalar', () => {
    expect(modelFromSize(864, 1536)).toBe('gpt-image-2.5-sunburst')
    expect(modelFromSize(1152, 2048)).toMatch(/^google/)
  })
})
