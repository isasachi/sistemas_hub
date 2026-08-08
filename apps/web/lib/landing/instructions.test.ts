import { describe, it, expect } from 'vitest'
import { buildDiffusionInstruction, MULTI_UNIT_SECTIONS, PAYMENT_SECTIONS, NO_TALENT_SECTIONS } from './instructions'
import type { SectionCopy, SectionType, LandingDna, Offer, TrustBlock } from './types'
import { COPPER } from './palette-derive'

const ALL: SectionType[] = [
  'hero', 'oferta', 'antes-despues', 'beneficios',
  'testimonios', 'faq', 'garantia', 'cta-final',
]

function copyFor(type: SectionType): SectionCopy {
  return { type, headline: 'ACNE-HEADLINE-XYZ', subheadline: 'sub', cta: 'Compra Ya' }
}

const DNA: LandingDna = {
  brand_base: { hex: '#1E6FE8', h: 215, s: 82, l: 51 },
  palette: {
    color_headline: '#0A2C6B',
    color_accent: '#1E6FE8',
    color_body: 'rgba(10,44,107,0.7)',
    bg_start: '#DCEBFB',
    bg_end: '#F7FBFF',
    color_surface: '#FFFFFF',
    color_icon: ['#9FC8F0', '#C2B2F0', '#F5B7C8', '#EFE09A'],
    polarity: 'light',
  },
  particle_type: 'burbujas translúcidas y destellos de luz sobre agua',
  particle_density: 'medium',
  particles_on: true,
  props: ['raíz de cúrcuma cortada', 'flor de diente de león', 'cápsulas beige sueltas'],
  font_family: 'Poppins',
  font_accent: null,
  halo: 'radial_soft',
  model_persona: 'Mujer peruana de 18-30 años, cabello recogido, camiseta blanca de tirantes',
  poses: {
    hero: 'Mano en la mejilla, mirada elevada en 3/4, sonrisa contenida',
    oferta: 'Ambas manos enmarcando el rostro, mirada directa a cámara',
    'antes-despues': 'Perfil 3/4, yemas rozando la mandíbula, ojos cerrados',
    beneficios: 'Cabeza inclinada al hombro, mano en el cuello, sonrisa abierta',
    testimonios: 'Mentón apoyado en el dorso de la mano, mirada a cámara',
    faq: 'Giro sobre el hombro hacia cámara, espalda parcialmente de frente',
    garantia: 'Recogiendo el cabello detrás de la oreja, mirada baja',
    'cta-final': 'Sosteniendo el envase a la altura del pecho, mirada a cámara',
  },
}

const OFFER: Offer = {
  urgency: 'Oferta por tiempo limitado',
  tiers: [
    { label: '1 Frasco', price: 'S/ 99', cta: 'Comprar', featured: false },
    { label: '3 Frascos', price: 'S/ 199', priceBefore: 'S/ 297', savingsPct: 33, cta: 'Comprar Ya', featured: true },
  ],
}

const TRUST: TrustBlock = {
  codDelivery: true,
  deliveryTime: '24/48 horas',
  coverage: ['Perú'],
  paymentMethods: ['yape', 'visa'],
  guaranteeDays: 30,
  freeShipping: true,
}

function build(section: SectionType, extra: Partial<Parameters<typeof buildDiffusionInstruction>[0]> = {}) {
  return buildDiffusionInstruction({
    section,
    copy: copyFor(section),
    dna: DNA,
    productLabels: null,
    hasTalent: true,
    ...extra,
  })
}

describe('buildDiffusionInstruction — DNA-driven (spec 2026-07-23)', () => {
  it('cada sección inyecta su REFUERZO COMPOSITIVO (checklist estructural del ADN)', () => {
    const anchor: Record<SectionType, string> = {
      hero: 'EXACTAMENTE 4 bullets',
      oferta: 'EXACTAMENTE 3 columnas de precio',
      'antes-despues': '"ANTES" (etiqueta gris)',
      beneficios: 'EXACTAMENTE 5 bullets',
      testimonios: 'EXACTAMENTE 3 cards de testimonio',
      faq: 'EXACTAMENTE 5 items',
      garantia: 'EXACTAMENTE 4 cards horizontales',
      'cta-final': 'EXACTAMENTE 4 bullets a la izquierda',
    }
    for (const type of ALL) {
      expect(build(type)).toContain('REFUERZO COMPOSITIVO')
      expect(build(type)).toContain(anchor[type])
    }
  })

  it('la paleta sale de dna.palette (headline + accent aparecen)', () => {
    const out = build('hero')
    expect(out).toContain(DNA.palette.color_headline)
    expect(out).toContain(DNA.palette.color_accent)
    expect(out).toContain(DNA.palette.color_body)
    expect(out).toContain(DNA.palette.color_surface)
  })

  it('partículas y halo de dna presentes', () => {
    const out = build('beneficios')
    expect(out).toContain(DNA.particle_type)
    expect(out).toContain(DNA.particle_density)
    expect(out).toContain(DNA.halo)
  })

  it('regla de significado del oro: SOLO oferta/sellos/RECOMENDADO/DESPUÉS, en ninguna otra parte', () => {
    for (const type of ALL) {
      const out = build(type)
      expect(out).toContain('#B8860B')
      expect(out).toContain('ÚNICAMENTE ahí')
    }
  })

  it('pose de dna.poses[section] presente cuando hasTalent (secciones con protagonista)', () => {
    for (const type of ALL) {
      if (NO_TALENT_SECTIONS.has(type)) continue // faq/testimonios no muestran al protagonista
      expect(build(type, { hasTalent: true })).toContain(DNA.poses[type])
    }
  })

  it('faq/testimonios NUNCA muestran al talento/protagonista, aunque hasTalent', () => {
    const faq = build('faq', { hasTalent: true })
    expect(faq).toContain('NO lleva persona alguna')
    expect(faq).not.toContain(DNA.model_persona)
    expect(faq).toContain('No hay imagen de talento adjunta') // nota de plantilla no promete retrato
    const testi = build('testimonios', { hasTalent: true })
    expect(testi).toContain('CLIENTES de las tarjetas')
    expect(testi).not.toContain(DNA.model_persona)
  })

  it('nota de plantilla: presente, marcada fuente de verdad de estructura, subordinada al resto de la instrucción', () => {
    const out = build('hero')
    expect(out).toContain('PLANTILLA DE COMPOSICIÓN')
    expect(out).toContain('fuente de verdad de estructura')
    expect(out).toContain('La ESTRUCTURA manda la plantilla')
  })

  it('hasTalent:false — la nota nombra el sustituto y NO reintroduce persona', () => {
    const out = build('hero', { hasTalent: false, talentSubstitute: 'El dispositivo en uso, en contexto real, a escala humana' })
    expect(out).toContain('El dispositivo en uso, en contexto real, a escala humana')
    expect(out).toContain('NO reintroduzcas ninguna persona')
    expect(out).not.toContain('CAMPAIGN TALENT')
    expect(out).not.toContain(DNA.model_persona)
  })

  it('no_talent: no nombra persona en ningún lugar del prompt, usa el sustituto en CONTENIDO DE CARRILES', () => {
    const out = build('beneficios', { hasTalent: false, talentSubstitute: 'Mano y antebrazo en acción sobre la superficie, sin rostro' })
    expect(out).toContain('Sin talento humano: el carril lo ocupa el sustituto')
    expect(out).toContain('Mano y antebrazo en acción sobre la superficie, sin rostro')
    expect(out).not.toContain(DNA.model_persona)
  })

  it('labels ground-truth cuando hay productLabels; sin ellos, se leen de las fotos reales', () => {
    const withLabels = build('hero', { productLabels: 'CLEARSTEM\nÁcido Hialurónico · Niacinamida\n60 Cápsulas' })
    expect(withLabels).toContain('ground-truth')
    expect(withLabels).toContain('Ácido Hialurónico · Niacinamida')
    const without = build('hero', { productLabels: null })
    expect(without).not.toContain('CLEARSTEM')
    expect(without).toContain('fotos reales del producto')
  })

  it('oferta inyecta offerText con los tiers exactos', () => {
    const out = build('oferta', { offer: OFFER })
    expect(out).toContain('PRICE TIERS')
    expect(out).toContain('S/ 199')
    expect(out).toContain('ahorra 33%')
  })

  it('hero/cta-final inyectan featuredPriceText + urgencia', () => {
    for (const type of ['hero', 'cta-final'] as SectionType[]) {
      const out = build(type, { offer: OFFER })
      expect(out).toContain('FEATURED PRICE')
      expect(out).toContain('S/ 199')
      expect(out).toContain('Oferta por tiempo limitado')
    }
  })

  it('la barra de confianza (TRUST BAR) va en las 6 secciones que la tienen, no en oferta/antes-despues', () => {
    for (const type of ['hero', 'beneficios', 'testimonios', 'faq', 'garantia', 'cta-final'] as SectionType[]) {
      const out = build(type, { trust: TRUST })
      expect(out).toContain('TRUST BAR')
      expect(out).toContain('Pago contraentrega')
      // composición neutral: ya no dicta "frosted pill" (eso rompía la consistencia)
      expect(out).not.toContain('frosted pill')
    }
    // oferta (payment_row) y antes-despues (closing_strip) NO llevan la barra
    expect(build('oferta', { trust: TRUST })).not.toContain('TRUST BAR')
    expect(build('antes-despues', { trust: TRUST })).not.toContain('TRUST BAR')
  })

  // Pedido del usuario 2026-08-07: la banda de confianza deja de re-tintarse por sección y pasa a
  // ser SIEMPRE el mismo metal. Antes su color de fondo era explícitamente "lo único que varía".
  describe('color de la banda de confianza', () => {
    it('es el mismo metal dorado en las 6 secciones, y ya no se re-tinta', () => {
      const salidas = (['hero', 'beneficios', 'testimonios', 'faq', 'garantia', 'cta-final'] as SectionType[])
        .map((t) => build(t, { trust: TRUST }))
      for (const out of salidas) {
        expect(out).toContain('#B8860B')
        expect(out).toContain('#F5D372')
        expect(out).toContain('NO se re-tinta')
      }
      // La franja de color de la banda tiene que ser literalmente idéntica entre secciones.
      const franja = salidas.map((o) => o.match(/COLOR DE LA BANDA[^\n]*/)![0])
      expect(new Set(franja).size).toBe(1)
      // Y la vieja regla de "lo único que varía es el color de fondo" no puede seguir viva.
      for (const out of salidas) expect(out).not.toContain('re-tintado a la marca')
    })

    it('con marca dorada la banda usa cobre, no oro (si no, marca y banda se confunden)', () => {
      const dorada = { ...DNA, palette: { ...DNA.palette, color_accent: '#D4A017' } }
      const out = build('hero', { trust: TRUST, dna: dorada })
      expect(out).toContain(COPPER.dark)
      expect(out).toContain(COPPER.light)
      expect(out).not.toContain('#F5D372')
    })

    it('el DESIGN_SYSTEM y la banda nombran el MISMO metal', () => {
      for (const accent of ['#E85D2E', '#D4A017']) {
        const out = build('hero', { trust: TRUST, dna: { ...DNA, palette: { ...DNA.palette, color_accent: accent } } })
        // Un solo nombre de metal en toda la instrucción.
        const metales = new Set([...out.matchAll(/metálico (\w+)|degradado metálico (\w+)/g)].map((m) => m[1] ?? m[2]))
        expect(metales.size).toBeLessThanOrEqual(1)
      }
    })

    // `garantia` lleva banda de confianza Y banda de pagos: las dos hablan del pie. La de pagos ya
    // no describe el aspecto (decía "franja limpia y calma") o contradiría al metal.
    it('en garantia la nota de pagos no le discute el aspecto a la banda', () => {
      const out = build('garantia', { trust: TRUST })
      expect(out).toContain('do NOT draw')
      expect(out).not.toContain('CLEAN, calm horizontal band')
      expect(out).toContain('governed by the TRUST BAR instruction')
    })
  })

  it('testimonios restringe las caras a la demografía objetivo cuando se pasa demographicLabel', () => {
    const out = build('testimonios', { demographicLabel: 'Mujer 18-30' })
    expect(out).toContain('coherentes con la demografía objetivo (Mujer 18-30)')
  })

  it('oferta dibuja los logos de pago de trust.paymentMethods (decisión del usuario)', () => {
    const out = build('oferta', { trust: TRUST })
    expect(out).toContain('DRAW')
    expect(out).toContain('Yape')
    expect(out).toContain('Visa')
  })

  it('garantia mantiene la banda limpia sin logos', () => {
    const out = build('garantia', { trust: TRUST })
    expect(out).toContain('do NOT draw')
  })

  it('MULTI_UNIT / PAYMENT / NO_TALENT sections conservan su membresía', () => {
    expect(MULTI_UNIT_SECTIONS.has('oferta')).toBe(true)
    expect(MULTI_UNIT_SECTIONS.has('cta-final')).toBe(true)
    expect(MULTI_UNIT_SECTIONS.has('hero')).toBe(false)
    expect(PAYMENT_SECTIONS.has('oferta')).toBe(true)
    expect(PAYMENT_SECTIONS.has('garantia')).toBe(true)
    expect(NO_TALENT_SECTIONS.has('faq')).toBe(true)
    expect(NO_TALENT_SECTIONS.has('testimonios')).toBe(true)
    expect(NO_TALENT_SECTIONS.has('hero')).toBe(false)
  })

  it('packNote se inyecta cuando packUnits > 1', () => {
    const out = build('oferta', { packUnits: 3 })
    expect(out).toContain('MULTI-UNIT PACK')
    expect(out).toContain('3 copies of the SAME single product')
    expect(build('oferta', { packUnits: null })).not.toContain('MULTI-UNIT PACK')
  })

  it('reserveLockup reserva la franja superior solo cuando se pide', () => {
    expect(build('hero', { reserveLockup: true })).toContain('BRAND LOCKUP (do NOT draw)')
    expect(build('hero', { reserveLockup: false })).not.toContain('BRAND LOCKUP (do NOT draw)')
  })

  it('secciones con protagonista mencionan persona Y producto; faq/testimonios suprimen al protagonista pero mantienen producto', () => {
    for (const type of ALL) {
      const withTalent = build(type, { hasTalent: true })
      expect(withTalent).toContain('Producto (invariante)')
      if (NO_TALENT_SECTIONS.has(type)) {
        expect(withTalent).not.toContain(DNA.model_persona)
      } else {
        expect(withTalent).toContain(DNA.model_persona)
        // no_talent del nicho: sustituto en el carril (solo secciones con protagonista)
        const noTalent = build(type, { hasTalent: false, talentSubstitute: 'El animal como protagonista, con banco de poses propio' })
        expect(noTalent).toContain('El animal como protagonista, con banco de poses propio')
        expect(noTalent).toContain('Producto (invariante)')
      }
    }
  })

  it('la copia del cliente (headline/cta) se inyecta siempre', () => {
    for (const type of ALL) {
      const out = build(type)
      expect(out).toContain('ACNE-HEADLINE-XYZ')
      expect(out).toContain('Compra Ya')
    }
  })

  it('NO_TALENT_SECTIONS incluye garantia y cta-final (corrección contra plantillas)', () => {
    expect(NO_TALENT_SECTIONS.has('garantia')).toBe(true)
    expect(NO_TALENT_SECTIONS.has('cta-final')).toBe(true)
    expect(NO_TALENT_SECTIONS.has('oferta')).toBe(false)
  })

  it('el prompt ordena seguir la composición de la plantilla adjunta (no describe zonas Z1–Z6)', () => {
    const out = build('hero')
    expect(out).toContain('PLANTILLA DE COMPOSICIÓN')
    expect(out).toContain('reproduce EXACTAMENTE su composición')
    expect(out).not.toContain('Z1 (0-22%)') // el texto de zonas se eliminó
  })

  it('renderiza los campos de copy nuevos cuando están presentes', () => {
    const out = buildDiffusionInstruction({
      section: 'cta-final', copy: { type: 'cta-final', headline: 'H', ctaHeadline: 'PIDE EL TUYO', ctaSub: 'ya' },
      dna: DNA, productLabels: null, hasTalent: false,
    })
    expect(out).toContain('PIDE EL TUYO')
  })

  it('partículas OFF cuando dna.particles_on es false', () => {
    const out = buildDiffusionInstruction({
      section: 'hero', copy: copyFor('hero'), dna: { ...DNA, particles_on: false },
      productLabels: null, hasTalent: true,
    })
    expect(out).toContain('SIN partículas')
    // no debe quedar un remanente contradictorio de otra capa diciendo lo contrario
    expect(out).not.toContain('Siempre presentes')
  })

  it('DNA legada sin particles_on (undefined) → partículas ON (default de intención)', () => {
    const legacy = { ...DNA, particles_on: undefined as unknown as boolean }
    const out = buildDiffusionInstruction({ section: 'hero', copy: copyFor('hero'), dna: legacy, productLabels: null, hasTalent: true })
    expect(out).toContain(DNA.particle_type)
    expect(out).not.toContain('SIN partículas')
  })

  it('antes-despues instruye estados adaptativos, no acné hardcodeado', () => {
    const out = buildDiffusionInstruction({
      section: 'antes-despues', copy: copyFor('antes-despues'), dna: DNA,
      productLabels: null, hasTalent: true, nicheId: 'home_cleaning',
    })
    expect(out).toContain('estado ANTES')
    expect(out).toContain('estado DESPUÉS')
    expect(out).not.toContain('acné') // no asume piel
  })

  it('antes-despues ancla la nota a la categoría del nicho cuando nicheId está presente', () => {
    const out = build('antes-despues', { nicheId: 'home_cleaning' })
    expect(out).toContain('Hogar / limpieza')
    const withoutNiche = build('antes-despues')
    expect(withoutNiche).toContain('estado ANTES') // sigue funcionando sin nicheId
  })
})
