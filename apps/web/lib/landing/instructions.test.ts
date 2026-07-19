import { describe, it, expect } from 'vitest'
import { buildSectionInstruction, buildSceneInstruction, buildDiffusionInstruction, MULTI_UNIT_SECTIONS } from './instructions'
import { brandLockupText } from './layouts/brand-lockup'
import type { SectionCopy, SectionType, DerivedBrand, Offer } from './types'

const OFFER: Offer = {
  urgency: 'Oferta por tiempo limitado',
  tiers: [
    { label: '1 Frasco', price: 'S/ 99', cta: 'Comprar', featured: false },
    { label: '3 Frascos', price: 'S/ 199', priceBefore: 'S/ 297', savingsPct: 33, cta: 'Comprar Ya', featured: true },
  ],
}

const ALL: SectionType[] = [
  'hero', 'oferta', 'antes-despues', 'beneficios',
  'testimonios', 'faq', 'garantia', 'cta-final',
]

function copyFor(type: SectionType): SectionCopy {
  return { type, headline: 'ACNE-HEADLINE-XYZ', subheadline: 'sub', cta: 'Compra Ya' }
}

describe('buildSectionInstruction — ADN de referencia', () => {
  it('inyecta la receta fija de craft en toda sección × modo', () => {
    for (const type of ALL) {
      for (const mode of ['source', 'anchored', 'none'] as const) {
        const out = buildSectionInstruction(copyFor(type), mode)
        expect(out).toContain('LUMINOUS gradient')          // fondo clínico celeste
        expect(out).toContain('Two-color rule')             // regla 2 colores (deep+dorado)
        expect(out).toContain('metallic GOLD')              // dorado = solo valor
        expect(out).toContain('BICOLOR headline')           // headline bicolor obligatorio
        expect(out).toContain('Section closer (MANDATORY)') // cierre inferior obligatorio
        expect(out).toContain('TEXT DISCIPLINE')            // guardrail de texto
        expect(out).toContain('ACNE-HEADLINE-XYZ')          // el copy se inyecta
      }
    }
  })

  it('incluye el spec de cada tipo de sección', () => {
    const anchor: Record<SectionType, string> = {
      hero: 'HERO section',
      oferta: 'OFFER section',
      'antes-despues': 'BEFORE/AFTER section',
      beneficios: 'BENEFITS section',
      testimonios: 'TESTIMONIALS section',
      faq: 'FAQ section',
      garantia: 'GUARANTEE',
      'cta-final': 'FINAL CTA section',
    }
    for (const type of ALL) {
      expect(buildSectionInstruction(copyFor(type), 'source')).toContain(anchor[type])
    }
  })

  it('varía la instrucción de producto según el modo', () => {
    const c = copyFor('hero')
    expect(buildSectionInstruction(c, 'source')).toContain('REAL product')
    expect(buildSectionInstruction(c, 'anchored')).toContain('ISOLATED CROP')
    expect(buildSectionInstruction(c, 'none')).toContain('placeholder')
  })

  it("modo 'canonical' (Fase 2): recorte aislado + fidelidad física + labels exactos", () => {
    const out = buildSectionInstruction(copyFor('hero'), 'canonical')
    expect(out).toContain('ISOLATED CROP')              // de anchored: no copiar encuadre/fondo
    expect(out).toContain('do NOT recolour')            // de source: fidelidad de color
    expect(out).toContain('ground-truth')               // Images 2+ = fotos reales
    // también en la escena híbrida
    expect(buildSceneInstruction('oferta', 'canonical')).toContain('ISOLATED CROP')
  })

  it('inyecta el ground-truth de labels solo con foto y labels', () => {
    const c = copyFor('hero')
    expect(
      buildSectionInstruction(c, 'source', null, null, null, 'MINDBODYSKIN\n90 Capsules'),
    ).toContain('PRODUCT LABEL TEXT')
    expect(
      buildSectionInstruction(c, 'none', null, null, null, 'x'),
    ).not.toContain('PRODUCT LABEL TEXT')
  })

  it('reparte la paleta y tipografía de marca cuando se proveen', () => {
    const out = buildSectionInstruction(
      copyFor('hero'), 'source',
      [{ name: 'azul', hex: '#1e3a8a', usage: 'acento' }],
      { headline: 'Poppins', body: 'Lato' },
      null, null,
    )
    expect(out).toContain('#1e3a8a')
    expect(out).toContain('Poppins')
  })
})

describe('buildDiffusionInstruction — pack, urgencia, lockup (goal 2026-07-18)', () => {
  it('inyecta la nota de PACK multi-unidad cuando packUnits > 1', () => {
    const out = buildDiffusionInstruction(copyFor('oferta'), 'canonical', null, null, null, null, null, false, false, OFFER, null, 3)
    expect(out).toContain('MULTI-UNIT PACK')
    expect(out).toContain('3 copies of the SAME single product')
    // sin packUnits, no aparece
    expect(buildDiffusionInstruction(copyFor('oferta'), 'canonical', null, null, null, null, null, false, false, OFFER, null))
      .not.toContain('MULTI-UNIT PACK')
  })

  it('oferta/cta-final son las secciones multi-unidad', () => {
    expect(MULTI_UNIT_SECTIONS.has('oferta')).toBe(true)
    expect(MULTI_UNIT_SECTIONS.has('cta-final')).toBe(true)
    expect(MULTI_UNIT_SECTIONS.has('hero')).toBe(false)
  })

  it('urgencia data-driven: badge único con la línea del copy en hero/cta-final', () => {
    const hero = buildDiffusionInstruction(copyFor('hero'), 'canonical', null, null, null, null, null, false, false, OFFER, null)
    expect(hero).toContain('Oferta por tiempo limitado')
    expect(hero).toContain('single metallic-gold urgency badge')
    expect(hero).toContain('FEATURED PRICE') // el precio del tier destacado se inyecta (no se inventa)
    expect(hero).toContain('S/ 199')
    // sin urgency en el offer, no se inyecta el badge (pero sí el precio)
    const noUrg = buildDiffusionInstruction(copyFor('hero'), 'canonical', null, null, null, null, null, false, false, { tiers: OFFER.tiers }, null)
    expect(noUrg).not.toContain('single metallic-gold urgency badge')
  })

  it('ya NO hardcodea "SOLO HOY" en el spec de oferta/cta-final', () => {
    expect(buildSectionInstruction(copyFor('oferta'), 'canonical')).not.toContain('SOLO HOY')
    expect(buildSectionInstruction(copyFor('cta-final'), 'canonical')).not.toContain('SOLO HOY')
  })

  it('reserva la franja del lockup solo cuando reserveLockup=true', () => {
    const withL = buildDiffusionInstruction(copyFor('hero'), 'canonical', null, null, null, null, null, false, false, null, null, null, true)
    expect(withL).toContain('BRAND LOCKUP (do NOT draw)')
    const without = buildDiffusionInstruction(copyFor('hero'), 'canonical', null, null, null, null, null, false, false, null, null, null, false)
    expect(without).not.toContain('BRAND LOCKUP (do NOT draw)')
  })
})

describe('brandLockupText — deriva un wordmark corto y limpio', () => {
  it('prefiere la 1ª línea del label impreso si es corta', () => {
    expect(brandLockupText('CLEARSTEM\n90 Capsules', 'Suplemento X')).toBe('CLEARSTEM')
  })
  it('cae al product_name cuando no hay label', () => {
    expect(brandLockupText(null, 'JR Studio')).toBe('JR Studio')
  })
  it('salta nombres largos que no leen como lockup', () => {
    expect(brandLockupText(null, 'Colágeno Hidrolizado Marino Premium')).toBeNull()
    expect(brandLockupText('', '')).toBeNull()
  })
})

describe('buildSceneInstruction — plato de fondo híbrido', () => {
  it('mantiene la mitad-de-escena y saca la mitad-de-UI', () => {
    const out = buildSceneInstruction('oferta', 'source', [{ name: 'azul', hex: '#1e3a8a' }], null, null)
    // escena: atmósfera + fidelidad de producto
    expect(out).toContain('luminous, dimensional background')
    expect(out).toContain('REAL product')
    expect(out).toContain('#1e3a8a')
    // negativa dura de texto (end-weighted)
    expect(out).toContain('NO TEXT (absolute)')
    expect(out.trimEnd().endsWith('calm and uncluttered.')).toBe(true)
    // UI que NO debe filtrarse al prompt de escena (la compone Satori)
    expect(out).not.toContain('glassmorphism')
    expect(out).not.toContain('METALLIC GOLD')
    expect(out).not.toContain('TEXT DISCIPLINE')
  })

  it('el producto lleva su texto impreso como única excepción de texto', () => {
    const out = buildSceneInstruction('oferta', 'source', null, null, 'MINDBODYSKIN\n90 Capsules')
    expect(out).toContain('PRODUCT LABEL TEXT')
  })

  it('con DerivedBrand (Fase 3): usa mood + casting y su paleta fusionada', () => {
    const brand: DerivedBrand = {
      niche: 'fitness-energia',
      palette: [{ name: 'Naranja', hex: '#FF6A2C', usage: 'accent' }],
      typePair: 'urgencia-condensada',
      casting: { present: true, ageRange: '25-35', gender: 'femenino', expression: 'enérgica' },
      sceneMood: 'energía y sudor, luz de gimnasio',
    }
    const out = buildSceneInstruction('oferta', 'canonical', null, 'IGNORAR-BRANDSTYLE', null, brand)
    expect(out).toContain('#FF6A2C')                       // paleta fusionada del brand
    expect(out).toContain('energía y sudor, luz de gimnasio') // sceneMood
    expect(out).toContain('age 25-35')                     // casting como dato
    expect(out).not.toContain('IGNORAR-BRANDSTYLE')        // brand gana sobre brand_style suelto
  })

  it('casting.present=false suprime al beneficiario (acceptance #2)', () => {
    const brand: DerivedBrand = {
      niche: 'tech-limpio',
      palette: [{ name: 'Azul', hex: '#3B82F6' }],
      typePair: 'tech-neutral',
      casting: { present: false },
      sceneMood: 'estudio limpio',
    }
    const out = buildSceneInstruction('oferta', 'canonical', null, null, null, brand)
    expect(out).toContain('NO PERSON')
    // el override PRODUCT-ONLY va al FINAL para ganarle al beneficiario del SCENE_SPECS
    expect(out).toContain('PRODUCT-ONLY (absolute, OVERRIDES everything above)')
    expect(out.trimEnd().endsWith('The product ALONE is the subject.')).toBe(true)
  })

  it('casting.present=true NO agrega el override product-only', () => {
    const brand: DerivedBrand = {
      niche: 'salud-clinico', palette: [{ name: 'Azul', hex: '#2E6FB7' }],
      typePair: 'clinico-geometrico', casting: { present: true, ageRange: '35-50', gender: 'femenino' },
      sceneMood: 'luz clínica',
    }
    const out = buildSceneInstruction('oferta', 'canonical', null, null, null, brand)
    expect(out).not.toContain('PRODUCT-ONLY')
  })

  it('C5.5: garantía y cta-final tienen su propio plato de escena, sin texto', () => {
    const g = buildSceneInstruction('garantia', 'canonical')
    expect(g).toContain('GUARANTEE / TRUST background plate')
    expect(g).toContain('NO TEXT (absolute)')
    const c = buildSceneInstruction('cta-final', 'canonical')
    expect(c).toContain('FINAL CTA background plate')
    expect(c).toContain('NO TEXT (absolute)')
  })

  it('las 8 secciones tienen plato de escena propio y sin texto', () => {
    const anchor: Record<SectionType, string> = {
      hero: 'HERO background plate',
      oferta: 'OFFER background plate',
      'antes-despues': 'BEFORE/AFTER background plate',
      beneficios: 'BENEFITS background plate',
      testimonios: 'TESTIMONIALS background plate',
      garantia: 'GUARANTEE / TRUST background plate',
      faq: 'FAQ background plate',
      'cta-final': 'FINAL CTA background plate',
    }
    for (const type of ALL) {
      const out = buildSceneInstruction(type, 'canonical')
      expect(out).toContain(anchor[type])
      expect(out).toContain('NO TEXT (absolute)')
    }
  })
})

describe('talento canónico (Fase 4)', () => {
  const brandPerson: DerivedBrand = {
    niche: 'salud-clinico', palette: [{ name: 'Azul', hex: '#2E6FB7' }],
    typePair: 'clinico-geometrico', casting: { present: true, ageRange: '35-50', gender: 'femenino' },
    sceneMood: 'luz clínica',
  }

  it('hasTalent inyecta el bloque de talento en la escena híbrida', () => {
    const withT = buildSceneInstruction('oferta', 'canonical', null, null, null, brandPerson, true)
    const without = buildSceneInstruction('oferta', 'canonical', null, null, null, brandPerson, false)
    expect(withT).toContain('CAMPAIGN TALENT')
    expect(withT).toContain('FINAL reference image')
    expect(withT).toContain('ONE AND ONLY human') // exclusividad: no agregar otra persona
    expect(without).not.toContain('CAMPAIGN TALENT')
  })

  it('hasTalent inyecta el bloque de talento en el motor viejo', () => {
    const out = buildSectionInstruction(copyFor('hero'), 'canonical', null, null, null, null, brandPerson, true)
    expect(out).toContain('CAMPAIGN TALENT')
  })

  it('el motor viejo también suprime la persona con present=false', () => {
    const brandNo: DerivedBrand = { ...brandPerson, casting: { present: false } }
    const out = buildSectionInstruction(copyFor('beneficios'), 'canonical', null, null, null, null, brandNo, false)
    expect(out).toContain('PRODUCT-ONLY (absolute, OVERRIDES everything above)')
    expect(out.trimEnd().endsWith('The product ALONE is the subject.')).toBe(true)
  })
})
