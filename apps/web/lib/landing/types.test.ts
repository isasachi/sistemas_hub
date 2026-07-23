import { describe, it, expect } from 'vitest'
import { NicheId, DemographicId, LandingDnaSchema, NicheClassification, SECTION_REF, SECTION_SPEC_KEY, SectionType } from './types'

describe('contrato landing (spec 2026-07-23)', () => {
  it('NicheId tiene los 16 valores del spec (Anexo A)', () => {
    expect(NicheId.options).toHaveLength(16)
    expect(NicheId.options).toContain('supplement_skin_female')
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
