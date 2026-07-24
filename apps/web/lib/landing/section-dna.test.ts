import { describe, it, expect } from 'vitest'
import { SECTION_DNA } from './section-dna'
import { SectionType } from './types'

describe('SECTION_DNA (ADN por sección — fuente única compositivo + copy)', () => {
  it('cubre las 8 secciones con composition[] y copy no vacíos', () => {
    for (const s of SectionType.options) {
      expect(SECTION_DNA[s].composition.length).toBeGreaterThan(0)
      expect(SECTION_DNA[s].copy.trim().length).toBeGreaterThan(0)
    }
  })

  it('los conteos de bullets del ADN coinciden con shareBullets (hero 4, beneficios 5, cta-final 4)', () => {
    expect(SECTION_DNA.hero.copy).toContain('EXACTAMENTE 4')
    expect(SECTION_DNA.beneficios.copy).toContain('EXACTAMENTE 5')
    expect(SECTION_DNA['cta-final'].copy).toContain('EXACTAMENTE 4')
    // cta-final NO debe reescribir los bullets (los sincroniza shareBullets)
    expect(SECTION_DNA['cta-final'].copy.toLowerCase()).toContain('mismos del hero')
  })

  it('el ADN de copy de oferta NO redefine los tiers (los produce el flujo OfferGenSchema)', () => {
    expect(SECTION_DNA.oferta.copy).toContain('OfferGenSchema')
  })

  it('los conteos de cards del ADN coinciden con las plantillas (testimonios 3, faq 5, garantia 4)', () => {
    expect(SECTION_DNA.testimonios.copy).toContain('EXACTAMENTE 3')
    expect(SECTION_DNA.faq.copy).toContain('EXACTAMENTE 5')
    expect(SECTION_DNA.garantia.copy).toContain('EXACTAMENTE 4')
  })
})
