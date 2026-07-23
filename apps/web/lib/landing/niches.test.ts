import { describe, it, expect } from 'vitest'
import { NicheId, DemographicId } from './types'
import { NICHE_TYPOGRAPHY, NICHE_FALLBACK, NICHE_DEFAULT_DEMOGRAPHIC, NICHE_LABELS } from './niches'

describe('Anexos A/C por nicho', () => {
  it('cada NicheId está en todas las tablas (exhaustividad)', () => {
    for (const n of NicheId.options) {
      expect(NICHE_TYPOGRAPHY[n]?.font_family, n).toBeTruthy()
      expect(NICHE_FALLBACK[n]?.particles, n).toBeTruthy()
      expect(typeof NICHE_FALLBACK[n]?.hue, n).toBe('number')
      expect(DemographicId.options).toContain(NICHE_DEFAULT_DEMOGRAPHIC[n])
      expect(NICHE_LABELS[n], n).toBeTruthy()
    }
  })
  it('valores clave del Anexo A', () => {
    expect(NICHE_TYPOGRAPHY.supplement_skin_female.font_family).toBe('Poppins')
    expect(NICHE_TYPOGRAPHY.fitness_weightloss.font_accent).toBe('Anton')
    expect(NICHE_TYPOGRAPHY.joint_mobility.font_accent).toBeNull()
  })
  it('demografía por defecto (Anexo B.0)', () => {
    expect(NICHE_DEFAULT_DEMOGRAPHIC.joint_mobility).toBe('senior_55_plus')
    expect(NICHE_DEFAULT_DEMOGRAPHIC.pets).toBe('no_talent')
    expect(NICHE_DEFAULT_DEMOGRAPHIC.supplement_male_performance).toBe('male_35_55')
  })
})
