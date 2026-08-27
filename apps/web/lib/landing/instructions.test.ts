import { describe, it, expect } from 'vitest'
import { buildDiffusionInstruction, MULTI_UNIT_SECTIONS, PAYMENT_SECTIONS, NO_TALENT_SECTIONS, enDosLineas } from './instructions'
import type { SectionCopy, SectionType, LandingDna, Offer, TrustBlock } from './types'
import { assignPoses } from './demographics'
import { COPPER } from './palette-derive'
import { BrandStyle, STYLE_DNA } from './style-dna'

const ALL: SectionType[] = [
  'hero', 'oferta', 'antes-despues', 'beneficios',
  'testimonios', 'faq', 'garantia', 'cta-final',
]

function copyFor(type: SectionType): SectionCopy {
  return { kind: type, headline: 'ACNE-HEADLINE-XYZ', subheadline: 'sub', cta: 'Compra Ya' }
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
  // ⚠️ EL ANTES/DESPUÉS SE COLABA EN EL HERO. La línea de "Componentes de oferta" describía la
  // pill ANTES/DESPUÉS y el doble »» "entre las dos cards de comparación" en las 8 secciones, y la
  // difusión los dibujó en un hero cuyo copy no tiene un solo campo de comparación (medido en la
  // sesión e3117b54). Se reparte por componente: la geometría de comparación es de `antes-despues`
  // y de nadie más.
  // El formato lo declara el vendedor y manda sobre lo que el modelo lea en la etiqueta: unas
  // gomitas cuya etiqueta nombra vitamina C salieron renderizadas como POLVO servido en un vaso,
  // con un frasco extra inventado de "VITAMINA C EN POLVO" al lado (sesión e3117b54).
  it('el formato declarado viaja al prompt y el envase extra queda prohibido siempre', () => {
    const conFormato = build('beneficios', { productForm: 'gomitas masticables' })
    expect(conFormato).toContain('FORMATO DEL PRODUCTO')
    expect(conFormato).toContain('gomitas masticables')
    expect(conFormato).toContain('vasos mezcladores')
    expect(build('beneficios', { productForm: null })).not.toContain('FORMATO DEL PRODUCTO')
    // La prohibición del segundo envase NO depende del campo: el frasco inventado aparecía igual.
    for (const pf of ['gomitas masticables', null])
      expect(build('hero', { productForm: pf })).toContain('UN SOLO ENVASE CON ETIQUETA')
  })

  // ⚠️ AUDITORÍA DE FUGAS ENTRE SECCIONES. El hero se llevó DOS piezas que no le tocaban, una tras
  // otra: primero la geometría de comparación del antes/después, y una vez tapada esa, un bloque de
  // precio entero con su sello de urgencia ("2 Unidades · S/ 159 · Antes: S/ 240" + "Oferta por
  // tiempo limitado"). Las dos venían del ensamblador, no de la difusión. Este test cierra la clase
  // entera: con TODOS los insumos disponibles, cada bloque opcional aparece SOLO en las secciones
  // que lo declaran en su `composition`.
  // ⚠️ LA PROHIBICIÓN NO PUEDE CONTRADECIR A LA ESTRUCTURA DE LA SECCIÓN. `garantia` está fuera de
  // OFFER_SECTIONS y recibe `noSalesBlock`, pero su `composition` declara un "Sello de garantía
  // dorado (porcentaje grande...)" y `offerComponents` se lo pide en el MISMO prompt. Una
  // prohibición que dijera "ni sello… ni porcentaje de ahorro" a secas dejaría dos líneas pidiendo
  // lo contrario — el modo de fallo que este repo ya registró tres veces. Se comprueba leyendo los
  // DOS bloques en la misma cadena: que cada uno exista por separado no dice nada del conflicto.
  // ⚠️ NINGÚN EJEMPLO CON FORMA DE VALOR EN EL CHECKLIST. La composición de `oferta` ofrecía la
  // cinta como «"Recomendado"/"3x2"» y el modelo imprimió un "3x2" enorme sobre un pack de DOS
  // unidades — una promo que no existe en la sesión (badge guardado: "Mejor valor") y que además
  // es falsa. Tercera vez que este repo pisa la misma trampa.
  it('la sección de oferta no ofrece promos de ejemplo como si fueran copy', () => {
    const of = build('oferta', { offer: OFFER, trust: TRUST })
    expect(of).not.toContain('3x2')
    expect(of).toContain('Recomendado')   // rótulo fijo de la plantilla, ese sí se conserva
  })

  it('la prohibición de venta no contradice al sello que la sección declara', () => {
    const g = build('garantia', { offer: OFFER, trust: TRUST })
    expect(g).toContain('Sello: medalla circular dorada')
    expect(g).toContain('SIN BLOQUE DE VENTA')
    expect(g).toContain('ÚNICA EXCEPCIÓN')          // el sello de garantía queda exento
    expect(g).not.toContain('Componentes de oferta') // el rótulo tampoco puede decir "oferta" acá

    // Donde no hay sello declarado, no hay excepción que otorgar.
    const hero = build('hero', { offer: OFFER, trust: TRUST })
    expect(hero).toContain('SIN BLOQUE DE VENTA')
    expect(hero).not.toContain('ÚNICA EXCEPCIÓN')
    expect(hero).not.toContain('Sello: medalla circular dorada')

    // Y donde SÍ hay oferta, el rótulo la nombra y no aparece prohibición alguna.
    const of = build('oferta', { offer: OFFER, trust: TRUST })
    expect(of).toContain('Componentes de oferta')
    expect(of).not.toContain('SIN BLOQUE DE VENTA')
  })

  it('ningún bloque opcional se filtra a una sección que no lo declara', () => {
    const TODAS: SectionType[] = ['hero', 'beneficios', 'antes-despues', 'testimonios', 'faq', 'garantia', 'oferta', 'cta-final']
    // marcador → las únicas secciones donde puede aparecer
    const PERMITIDO: Record<string, SectionType[]> = {
      'FEATURED PRICE': ['cta-final'],
      'PRICE TIERS': ['oferta'],
      'URGENCY:': ['cta-final'],
      'Badge de urgencia': ['oferta'],
      'cards de comparación': ['antes-despues'],
      'ANTES/DESPUÉS ADAPTATIVO': ['antes-despues'],
      'PAYMENT LOGOS (DRAW them)': ['oferta'],
      'PAYMENT LOGOS (do NOT draw)': ['garantia'],
      'TRUST BAR': ['hero', 'beneficios', 'testimonios', 'faq', 'garantia', 'cta-final'],
      'MULTI-UNIT PACK': ['oferta', 'cta-final'],
      'SIN BLOQUE DE VENTA': ['hero', 'beneficios', 'antes-despues', 'testimonios', 'faq', 'garantia'],
    }
    // Todo disponible a la vez: es el peor caso, el que produce las fugas.
    const salida = Object.fromEntries(
      TODAS.map((s) => [s, build(s, { offer: OFFER, trust: TRUST, packUnits: 3 })]),
    ) as Record<SectionType, string>

    for (const [marcador, permitidas] of Object.entries(PERMITIDO)) {
      for (const s of TODAS) {
        const deberia = permitidas.includes(s)
        expect(salida[s].includes(marcador), `«${marcador}» en ${s}: ${deberia ? 'falta' : 'SE FILTRÓ'}`).toBe(deberia)
      }
    }
  })

  it('la geometría de comparación llega SOLO a antes-despues', () => {
    expect(build('antes-despues')).toContain('cards de comparación')
    for (const s of ['hero', 'oferta', 'beneficios', 'testimonios', 'faq', 'garantia', 'cta-final'] as SectionType[])
      expect(build(s)).not.toContain('cards de comparación')
    // El hero no lleva botón CTA (su propio `composition` lo dice), así que tampoco su descripción.
    expect(build('hero')).not.toContain('CTA: botón redondeado')
    // Y lo que sí es de cada una se conserva.
    expect(build('oferta')).toContain('Cinta de oferta')
    expect(build('garantia')).toContain('Sello: medalla circular dorada')
    expect(build('cta-final')).toContain('CTA: botón redondeado')
  })

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
    expect(out).toContain('fuente de verdad de ESTRUCTURA')
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

  // ⚠️ EL HERO YA NO LLEVA PRECIO. Lo llevaba —`featuredPriceText` + `urgencyText`— y salió
  // impreso: un bloque "2 Unidades · S/ 159 · Antes: S/ 240" con el sello "Oferta por tiempo
  // limitado", en una sección cuya `composition` no declara precio, ni badge, ni botón. El
  // argumento viejo ("sin la cifra exacta el hero inventa el precio") resolvía el problema
  // equivocado: si no lleva precio, no hay cifra que acertar.
  it('el cierre inyecta featuredPriceText + urgencia; el hero NO lleva precio', () => {
    const cierre = build('cta-final', { offer: OFFER })
    expect(cierre).toContain('FEATURED PRICE')
    expect(cierre).toContain('S/ 199')
    expect(cierre).toContain('Oferta por tiempo limitado')

    const hero = build('hero', { offer: OFFER })
    expect(hero).not.toContain('FEATURED PRICE')
    expect(hero).not.toContain('S/ 199')
    expect(hero).not.toContain('Oferta por tiempo limitado')
    expect(hero).toContain('SIN BLOQUE DE VENTA')
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

  // ⚠️ ESTE BLOQUE FIJABA LO CONTRARIO HASTA EL 2026-08-27: exigía que el prompt pintara la banda
  // de un metal dorado. Esa línea convivía con "reproduce EXACTAMENTE la banda de la plantilla" y
  // era la causa de que la banda saliera distinta en cada sección — medido sobre las 7 plantillas
  // curadas, todas traen la MISMA banda azul esmerilada, así que el texto la estaba repintando.
  // Ahora los tests guardan la AUSENCIA de esa segunda autoridad, que es lo que hay que proteger.
  describe('color de la banda de confianza', () => {
    it('el prompt NO le da color propio a la banda: lo manda la plantilla', () => {
      const salidas = (['hero', 'beneficios', 'testimonios', 'faq', 'garantia', 'cta-final'] as SectionType[])
        .map((t) => build(t, { trust: TRUST }))
      for (const out of salidas) {
        const barra = out.match(/TRUST BAR[\s\S]*?(?=\n[A-ZÁÉÍÓÚ_]{4,}|$)/)![0]
        // Ni tono, ni acabado, ni "degradado": la banda no se describe, se reproduce.
        expect(barra).not.toMatch(/degradado|metálic|lámina|dorado|#[0-9A-Fa-f]{6}/)
        expect(barra).toContain('plantilla')
      }
      // La instrucción de la banda es literalmente la misma en las 6 secciones.
      const barras = salidas.map((o) => o.match(/TRUST BAR[^\n]*/)![0])
      expect(new Set(barras).size).toBe(1)
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
      section: 'cta-final', copy: { kind: 'cta-final', headline: 'H', ctaHeadline: 'PIDE EL TUYO', ctaSub: 'ya' },
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

// ─── Eje de ESTILO / dirección de arte (2026-08-15) ──────────────────────────
// Lo que se prueba acá es la línea que separa MATERIAL de GEOMETRÍA: el estilo de la marca cambia
// el acabado y NO puede tocar lo que la plantilla adjunta manda. Y que el prompt no se contradiga
// solo — el modo de falla recurrente de este builder (partículas on/off duplicadas, banda de pago
// vs banda de confianza, el metal declarado en dos lugares).
describe('estilo de marca (style-dna)', () => {
  const conEstilo = (style: BrandStyle) => build('beneficios', { dna: { ...DNA, style } })

  // ⚠️ `surface` SALIÓ DEL PROMPT el 2026-08-27: describía el acabado de la card sobre una plantilla
  // que ya la muestra resuelta, y esa doble autoridad hacía que el borde saliera distinto en cada
  // sección (hero casi invisible, beneficios con contorno oscuro y rellenos tintados, cta-final sin
  // borde). Los otros cuatro ejes del estilo siguen vivos.
  it('cada estilo emite SUS ejes (icono, fondo, luz, tipografía), no los del default', () => {
    for (const style of BrandStyle.options) {
      const out = conEstilo(style)
      expect(out).toContain(STYLE_DNA[style].icon)
      expect(out).toContain(STYLE_DNA[style].background)
      expect(out).toContain(STYLE_DNA[style].light)
      expect(out).toContain(STYLE_DNA[style].type)
      if (style !== 'glass_premium') {
        // el acabado histórico tiene que DESAPARECER, no convivir: dos materiales en el mismo
        // prompt es exactamente la contradicción que hace que la difusión elija el de la plantilla.
        expect(out).not.toContain(STYLE_DNA.glass_premium.icon)
      }
    }
  })

  it('ADN legado (style undefined) sale IDÉNTICO a glass_premium — comportamiento histórico intacto', () => {
    const legacy = build('beneficios', { dna: { ...DNA, style: undefined } })
    expect(legacy).toBe(conEstilo('glass_premium'))
  })

  // Ni la geometría NI el acabado: la card entera la manda la plantilla, y ningún estilo la toca.
  it('NINGÚN estilo describe el acabado de la card — eso lo manda la plantilla', () => {
    for (const style of BrandStyle.options) {
      const out = conEstilo(style)
      expect(out).not.toContain(STYLE_DNA[style].surface)
      const comp = out.match(/^Componentes[^\n]*/m)![0]
      expect(comp).toContain('plantilla')
      // Sin vocabulario de material: es justo lo que el modelo reinterpretaba por sección.
      expect(comp).not.toMatch(/opacidad de|translúcid|esmerilad|glow|sombra dura|hairline/i)
    }
  })

  it('un estilo no-default lleva el carve-out ⚠️ ACABADO ≠ ESTRUCTURA; glass_premium no', () => {
    expect(conEstilo('natural_organic')).toContain('ACABADO ≠ ESTRUCTURA')
    expect(conEstilo('natural_organic')).toContain(STYLE_DNA.natural_organic.name)
    expect(conEstilo('glass_premium')).not.toContain('ACABADO ≠ ESTRUCTURA')
  })

  // ⚠️ Esto verifica que el carve-out de luz se EMITE, no que funcione — medido en píxeles NO
  // funciona (4 renders de `bold_impact`, la escena sale suave igual; ver el comentario largo en
  // `templateNote`). No lo leas como cobertura de que la luz cambia.
  it('un estilo no-default lleva su propio carve-out de LUZ, con la luz y el fondo del estilo', () => {
    for (const style of BrandStyle.options) {
      const out = conEstilo(style)
      if (style === 'glass_premium') {
        expect(out).not.toContain('LUZ Y CONTRASTE ≠ ESTRUCTURA')
        continue
      }
      expect(out).toContain('LUZ Y CONTRASTE ≠ ESTRUCTURA')
      expect(out).toContain('luz difusa y suave de estudio')  // qué muestra la plantilla
      expect(out).toContain(STYLE_DNA[style].light)           // qué pide esta pieza
      expect(out).toContain(STYLE_DNA[style].background)
    }
  })

  it('la plantilla ya NO manda el "tratamiento" (si lo mandara, el estilo sería letra muerta)', () => {
    for (const style of BrandStyle.options) {
      const out = conEstilo(style)
      expect(out).toContain('fuente de verdad de ESTRUCTURA')
      expect(out).not.toContain('encuadre y tratamiento')
    }
  })

  // Contradicción REAL encontrada al imprimir el prompt armado (probe 2026-08-15): la línea de
  // paleta afirmaba "superficie de card al 75-85% de opacidad" — glassmorphism hardcodeado — aunque
  // el acabado de la marca pidiera un bloque sólido. Dos frases del mismo prompt diciendo cosas
  // opuestas es lo que hace que la difusión se quede con el acabado de la plantilla.
  it('la línea de paleta aporta el COLOR de la card y nada más', () => {
    for (const style of BrandStyle.options) {
      const out = conEstilo(style)
      expect(out).not.toContain('al 75-85% de opacidad')
      expect(out).not.toContain('100% opaco')
      expect(out).toContain(DNA.palette.color_surface)
    }
  })

  // Misma clase de fallo por el otro lado: la línea de MODO OSCURO reimponía "el glassmorphism
  // sigue siendo el mismo", que contradice a los cuatro acabados que lo prohíben.
  it('el modo oscuro no reimpone glassmorphism sobre un acabado que lo prohíbe', () => {
    const oscuro = build('beneficios', {
      dna: { ...DNA, style: 'bold_impact', palette: { ...DNA.palette, polarity: 'dark' } },
    })
    expect(oscuro).toContain('MODO OSCURO')
    expect(oscuro).not.toContain('glassmorphism')
  })

  // ⚠️ EL METAL YA NO NOMBRA LA BANDA DE CONFIANZA. Estaba declarado en DOS lugares
  // (`designSystemBlock` y `trustText`) y los dos la repintaban; arreglar uno solo la habría
  // dejado igual entrando por la otra puerta. El metal sigue vivo para oferta, sellos y cintas.
  it('el metal ya no alcanza a la banda de confianza, en ningún estilo', () => {
    for (const style of BrandStyle.options) {
      const out = build('beneficios', { dna: { ...DNA, style }, trust: TRUST })
      const metal = out.match(/^Oferta\/premium\/sellos:[^\n]*/m)![0]
      expect(metal).toContain('degradado metálico dorado')   // sigue existiendo…
      expect(metal).not.toMatch(/BANDA DE CONFIANZA|banda de confianza/) // …pero no sobre la banda
    }
  })
})

// ─── Zona del cuerpo en el prompt (2026-08-15) ──────────────────────────────
// La placa adjunta es lo que decide el encuadre; estas líneas de texto existen para que el modelo
// no "complete" la cara que la placa deliberadamente no muestra, y para que la plantilla —que SÍ
// muestra un retrato— no se lo sugiera.
describe('body_focus en la instrucción', () => {
  const zona = (section: SectionType, extra = {}) =>
    build(section, { bodyFocus: 'gluteos_piernas', zonePlate: true, ...extra })

  it('con placa de zona, nombra el encuadre y prohíbe agregar el rostro', () => {
    const out = zona('beneficios')
    expect(out).toContain('el tren inferior')
    expect(out).toContain('NO agregues la cara')
  })

  it('el carve-out de plantilla dice que el encuadre de la PLACA gana al de la plantilla', () => {
    const out = zona('beneficios')
    expect(out).toContain('ESE ENCUADRE MANDA')
    // sin placa de zona (hero, o producto de rostro) el texto vuelve a ser el de siempre
    expect(build('beneficios')).toContain('Penúltima = retrato del talento')
    expect(build('beneficios')).not.toContain('ESE ENCUADRE MANDA')
  })

  it('antes-despues encuadra la MISMA zona en los dos paneles, no dos rostros', () => {
    const out = zona('antes-despues')
    expect(out).toContain('los DOS paneles encuadran el tren inferior')
    expect(out).not.toContain('el mismo rostro ya resuelto')
  })

  it('sin zona, antes-despues conserva la nota histórica', () => {
    const out = build('antes-despues')
    expect(out).toContain('el mismo rostro ya resuelto')
    expect(out).not.toContain('los DOS paneles encuadran')
  })

  it('una sesión sin zona sale IDÉNTICA a antes en todas las secciones', () => {
    for (const s of ALL) {
      expect(build(s, { bodyFocus: undefined, zonePlate: undefined })).toBe(build(s))
    }
  })
})


// ─── accentWord: el código verifica que sea sub-cadena del headline ──────────
// El fallo que esto cubre salió impreso en un render real: headline "Descansa mejor cada noche" +
// accentWord "dormir mejor" → la difusión INSERTÓ las palabras y el titular quedó "Descansa mejor
// cada dormir mejor noche.". La línea de Emphasis es la que se lo ordena, así que el fail-safe es
// no emitirla.
describe('accentWord — sub-cadena del headline', () => {
  const build = (copy: SectionCopy) =>
    buildDiffusionInstruction({ section: 'beneficios', copy, dna: DNA, productLabels: null, hasTalent: true })

  it('NO emite la línea de Emphasis si el acento no está en el headline', () => {
    const out = build({ kind: 'beneficios', headline: 'Descansa mejor cada noche', accentWord: 'dormir mejor' })
    expect(out).not.toContain('Emphasis:')
    expect(out).not.toContain('dormir mejor')
    expect(out).toContain('Descansa mejor cada noche')
  })

  it('SÍ la emite cuando el acento está en el headline (el caso bueno no se rompe)', () => {
    const out = build({ kind: 'beneficios', headline: 'Duerme mejor, despierta renovada', accentWord: 'Duerme mejor' })
    expect(out).toContain('Emphasis:')
    expect(out).toContain('"Duerme mejor"')
  })

  it('tolera diferencia de mayúsculas y acentos al comparar', () => {
    const out = build({ kind: 'beneficios', headline: 'Tu descanso está asegurado', accentWord: 'DESCANSO ESTA' })
    expect(out).toContain('Emphasis:')
  })
})

describe('antes/despues — cuerpo_completo NO toma la rama de zona', () => {
  const build = (bodyFocus: 'cuerpo_completo' | 'gluteos_piernas') =>
    buildDiffusionInstruction({
      section: 'antes-despues', copy: { kind: 'antes-despues', headline: 'H' },
      dna: DNA, productLabels: null, hasTalent: true, bodyFocus,
    })

  it('sin zona real, el par vuelve al rostro', () => {
    const out = build('cuerpo_completo')
    expect(out).toContain('el mismo rostro ya resuelto')
    expect(out).not.toContain('los DOS paneles encuadran')
  })

  it('con zona real, los dos paneles la encuadran', () => {
    const out = build('gluteos_piernas')
    expect(out).toContain('los DOS paneles encuadran')
    expect(out).not.toContain('el mismo rostro ya resuelto')
  })
})

describe('accentWord — se emite el recorte LITERAL del titular', () => {
  it('no le pide a la difusión un string que el titular no tiene así', () => {
    const out = buildDiffusionInstruction({
      section: 'beneficios', dna: DNA, productLabels: null, hasTalent: true,
      copy: { kind: 'beneficios', headline: 'Tu descanso está asegurado', accentWord: 'DESCANSO ESTA' },
    })
    expect(out).toContain('"descanso está"')
    expect(out).not.toContain('DESCANSO ESTA')
  })
})

// ⚠️ La contradicción que esto fija es entre DOS bloques del MISMO prompt, así que se comprueba
// sobre la instrucción armada y no sobre `assignPoses` a secas.
describe('antes-despues — la nota de encuadre y la pose no se contradicen', () => {
  it('sin zona real, la sección no recibe una pose contextual de actividad', () => {
    const poses = assignPoses(['hero', 'antes-despues'], 'female_30_45', 'cuerpo_completo', [
      'De pie en la habitación, brazos estirados hacia arriba en un estiramiento matutino',
    ])
    const out = buildDiffusionInstruction({
      section: 'antes-despues', copy: { kind: 'antes-despues', headline: 'H' },
      dna: { ...DNA, poses }, productLabels: null, hasTalent: true, bodyFocus: 'cuerpo_completo',
    })
    expect(out).toContain('el mismo rostro ya resuelto')   // la nota manda
    expect(out).not.toContain('estiramiento matutino')     // y nada la contradice
  })

  it('con zona real sí la recibe: nota y pose piden la misma zona', () => {
    const poses = assignPoses(['hero', 'antes-despues'], 'female_18_30', 'gluteos_piernas', [
      'Sentadilla profunda, glúteos contraídos',
    ])
    const out = buildDiffusionInstruction({
      section: 'antes-despues', copy: { kind: 'antes-despues', headline: 'H' },
      dna: { ...DNA, poses }, productLabels: null, hasTalent: true, bodyFocus: 'gluteos_piernas',
    })
    expect(out).toContain('Sentadilla profunda')
    expect(out).toContain('los DOS paneles encuadran')
  })
})

describe('enDosLineas', () => {
  // ⚠️ Verificado en un render real: pasándole el string crudo, el modelo hacía las dos líneas bien
  // Y ADEMÁS imprimía el guion al final de la primera ("Energiza con sabor —").
  it('parte el bullet en dos líneas rotuladas y NO manda el separador', () => {
    const out = enDosLineas('Energiza con sabor — y motiva sus juegos')
    expect(out).toContain('LINE 1 (bold): "Energiza con sabor"')
    expect(out).toContain('LINE 2 (light): "y motiva sus juegos"')
    expect(out).not.toContain(' — ')
  })

  // La lista de ✗/✓ de antes-despues es de UNA línea: sin segunda parte no hay LINE 2 que dibujar.
  it('un bullet sin separador no declara segunda línea', () => {
    expect(enDosLineas('Snacks duros y secos')).toBe('  • LINE 1 (bold): "Snacks duros y secos"')
  })
})

// ─── Regla de canal: qué es copy y qué es dirección (2026-08-27) ─────────────
// Medido en una sesión real: las tarjetas de testimonios salieron con la instrucción de casting
// IMPRESA como cuerpo de texto ("piel trigueña, cabello oscuro liso, cara ovalada…", "piel clara
// (más que Card 1)", "No se repiten rasgos, peinados ni colores de ropa") y beneficios con un
// bullet que decía "No hay bloques de venta ni precios" — o sea `NO_SALES_BLOCK` vuelto copy.
//
// La regla vieja era una lista NEGRA de jerga ("nombres de capas", "ADN", "invariante") y por eso
// no atajaba nada: lo que se filtró no parece jerga, parece copy. La nueva es una lista BLANCA.
describe('disciplina de texto — solo se dibuja lo entrecomillado en COPY', () => {
  const out = build('testimonios', { trust: TRUST })

  it('la regla es una lista BLANCA, no una enumeración de jerga', () => {
    expect(out).toMatch(/ÚNICO texto que se dibuja/i)
    expect(out).toContain('ENTRECOMILLADO en el bloque COPY')
    // Lo que hacía inútil a la versión anterior: enumerar ejemplos en vez de acotar el canal.
    expect(out).not.toMatch(/nombres de capas/)
  })

  it('nombra explícitamente al casting como dirección, que es lo que se estaba imprimiendo', () => {
    expect(out).toMatch(/casting/i)
    expect(out).toMatch(/jamás letra sobre la pieza/i)
  })

  // El fallo real no fue que el modelo desobedeciera una prohibición, sino que no podía distinguir
  // dos cosas escritas en el mismo español natural. La regla tiene que decir eso.
  it('avisa de que una dirección puede sonar a copy', () => {
    expect(out).toMatch(/suene a copy|parezca copy/i)
  })
})
