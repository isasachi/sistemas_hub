import { describe, it, expect } from 'vitest'
import { NicheId, DemographicId, LandingDnaSchema, NicheClassification, SECTION_REF, SECTION_SPEC_KEY, SectionType } from './types'

import { z } from 'zod'
import { SectionCopySchema, OfferGenSchema, aKind } from './types'
import { schemaAceptado } from '../kie-gemini'

describe('contrato landing (spec 2026-07-23)', () => {
  it('SectionCopySchema acepta los campos nuevos del motor de plantillas', () => {
    const parsed = SectionCopySchema.parse({
      kind: 'beneficios', headline: 'H',
      kicker: 'RESULTADOS REALES', closingBold: 'Tu piel refleja tu equilibrio',
      closingSub: 'Cuídate desde dentro', closingStrip: 'CUIDA TU PIEL HOY',
      socialProof: 'Miles de personas…', ctaHeadline: 'PIDE EL TUYO', ctaSub: 'No lo dejes pasar',
    })
    expect(parsed.kicker).toBe('RESULTADOS REALES')
    expect(parsed.ctaHeadline).toBe('PIDE EL TUYO')
  })
  // Los 16 del Anexo A del spec + `supplement_female`, que es una DESVIACIÓN DELIBERADA (2026-08-21):
  // el Anexo solo tenía el suplemento de belleza y el masculino, así que todo el bienestar femenino
  // que no se ve en el espejo (sueño, hormonas, energía) caía en belleza y heredaba su tipografía,
  // sus props y su vestuario de skincare. `supplement_male` es el simétrico: unas gomitas de
  // melatonina para hombres solo tenían `supplement_male_performance`, cuyo vestuario de nicho es
  // "camiseta deportiva ajustada o musculosa" — de ahí el avatar de gimnasio en un anuncio de dormir.
  it('NicheId tiene los 16 valores del spec (Anexo A) + los dos de bienestar', () => {
    expect(NicheId.options).toHaveLength(18)
    expect(NicheId.options).toContain('supplement_skin_female')
    expect(NicheId.options).toContain('supplement_female')
    expect(NicheId.options).toContain('supplement_male')
    expect(NicheId.options).toContain('generic')
  })
  it('DemographicId tiene los 7 valores del spec (Anexo B)', () => {
    expect(DemographicId.options).toHaveLength(7)
    expect(DemographicId.options).toContain('no_talent')
  })
  it('SECTION_REF y SECTION_SPEC_KEY cubren las 8 secciones', () => {
    for (const s of SectionType.options) {
      expect(SECTION_REF[s]).toMatch(/\.png$/)
      expect(SECTION_SPEC_KEY[s]).toBeTruthy()
    }
  })
  it('SECTION_REF apunta al prefijo de plantillas', () => {
    // El prefijo `landing-templates/` lo agrega la ruta al construir la URL; SECTION_REF
    // sigue siendo solo el filename (Task 4).
    expect(SECTION_REF.hero).toBe('hero_problem.png')
  })
  it('NicheClassification rechaza niche fuera del set', () => {
    expect(NicheClassification.safeParse({ niche_id: 'inventado', demographic_id: 'no_talent', confidence: 0.9, reasoning: 'x' }).success).toBe(false)
  })
  it('LandingDnaSchema valida un DNA completo y rechaza uno sin paleta', () => {
    const dna = {
      brand_base: { hex: '#1E6FE8', h: 215, s: 82, l: 51 },
      palette: { color_headline: '#0A2C6B', color_accent: '#1E6FE8', color_body: 'rgba(10,44,107,0.7)', bg_start: '#DCEBFB', bg_end: '#F7FBFF', color_surface: '#FFFFFF', color_icon: ['#9FC8F0', '#C2B2F0', '#F5B7C8', '#EFE09A'] },
      particle_type: 'burbujas translúcidas', particle_density: 'medium',
      props: ['raíz de cúrcuma', 'cápsulas beige'],
      font_family: 'Poppins', font_accent: null, halo: 'radial_soft',
      model_persona: 'mujer peruana 20s...', poses: { hero: 'pose a' },
    }
    expect(LandingDnaSchema.safeParse(dna).success).toBe(true)
    expect(LandingDnaSchema.safeParse({ ...dna, palette: undefined }).success).toBe(false)
  })
})

// ⚠️ El campo se llama `kind` y no `type` porque el validador de schemas del chat de KIE confunde
// una PROPIEDAD llamada `type` con la palabra reservada del JSON Schema (`422 …properties.type must
// be string or array`, medido). Las sesiones guardadas traen `type`: se normalizan al leer.
describe('compat del renombre type → kind', () => {
  it('aKind mueve el campo legado y deja el resto intacto', () => {
    expect(aKind({ type: 'hero', headline: 'H' })).toEqual({ kind: 'hero', headline: 'H' })
  })

  it('es idempotente y no toca un copy que ya tiene kind', () => {
    const nuevo = { kind: 'hero', headline: 'H' }
    expect(aKind(nuevo)).toEqual(nuevo)
    expect(aKind(aKind({ type: 'hero', headline: 'H' }))).toEqual({ kind: 'hero', headline: 'H' })
  })

  it('un copy legado pasa el schema después de normalizarlo', () => {
    expect(SectionCopySchema.safeParse({ type: 'hero', headline: 'H' }).success).toBe(false)
    expect(SectionCopySchema.safeParse(aKind({ type: 'hero', headline: 'H' })).success).toBe(true)
  })

  // El guard que hace falta para que esto no se rompa solo: ningún schema que viaje a Gemini
  // puede volver a tener una propiedad llamada `type`.
  it('los schemas que van al modelo no llevan una propiedad "type"', () => {
    for (const [nombre, schema] of [['landing_copy', SectionCopySchema], ['landing_offer', OfferGenSchema]] as const) {
      expect(schemaAceptado(z.toJSONSchema(schema)), nombre).toBe(true)
    }
  })
})
