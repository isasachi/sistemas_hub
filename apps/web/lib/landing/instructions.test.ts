import { describe, it, expect } from 'vitest'
import { buildSectionInstruction, buildSceneInstruction } from './instructions'
import type { SectionCopy, SectionType } from './types'

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
        expect(out).toContain('luminous, dimensional background') // atmósfera
        expect(out.toLowerCase()).toContain('glassmorphism')      // superficies (firma)
        expect(out).toContain('METALLIC GOLD')                    // dorado = solo valor
        expect(out).toContain('SCENE/MOOD that fits')             // mood por nicho
        expect(out).toContain('TEXT DISCIPLINE')                  // guardrail de texto
        expect(out).toContain('ACNE-HEADLINE-XYZ')                // el copy se inyecta
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
})
