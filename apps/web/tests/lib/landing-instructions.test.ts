import { describe, it, expect } from 'vitest'
import { buildSectionInstruction } from '@/lib/landing/instructions'
import type { SectionCopy } from '@/lib/landing/types'

const COPY: SectionCopy = { type: 'hero', headline: 'Titular', subheadline: 'Sub' }
const BRAND_HEX = '#0A2540'
const TYPO = { headline: 'bold condensed sans', body: 'clean humanist sans' }

describe('buildSectionInstruction', () => {
  it('inyecta layout + design system y reparte la paleta/tipografía de marca sobre los roles', () => {
    const out = buildSectionInstruction(COPY, 'canonical', [{ name: 'Azul', hex: BRAND_HEX, usage: 'principal' }], TYPO)
    // Esqueleto (qué/dónde).
    expect(out).toContain('MASTER LAYOUT')
    // Capa de craft que de-generaliza (cómo se renderiza).
    expect(out).toContain('DESIGN SYSTEM')
    // Paleta de marca repartida sobre los roles (un acento).
    expect(out).toContain(BRAND_HEX)
    expect(out).toContain('dominant brand accent')
    // Tipografía de marca inyectada.
    expect(out).toContain('bold condensed sans')
    // Disciplina de texto reforzada (evita la fuga de vocabulario del design system).
    expect(out).toContain('TEXT DISCIPLINE')
  })

  it('estilo gráfico de marca (handoff) se inyecta cuando se provee', () => {
    const out = buildSectionInstruction(COPY, 'canonical', null, null, 'minimal premium skincare, soft botanical motifs')
    expect(out).toContain('Brand identity')
    expect(out).toContain('soft botanical motifs')
  })

  it('sin marca igual inyecta layout + design system', () => {
    const out = buildSectionInstruction(COPY, 'canonical')
    expect(out).toContain('MASTER LAYOUT')
    expect(out).toContain('DESIGN SYSTEM')
    expect(out).not.toContain('build everything from these brand colors')
  })

  it('placa canónica: doble rol — producto idéntico + acompañantes reusables pero NO el producto', () => {
    const out = buildSectionInstruction(COPY, 'canonical')
    expect(out).toContain('CANONICAL PRODUCT')
    expect(out).toContain('IDENTICALLY in every section')
    expect(out).toContain('accompanying graphic resources')
    expect(out).toContain('they are NOT the product')
  })

  it('fallback raw (sin placa): fidelidad inline; none: placeholder', () => {
    expect(buildSectionInstruction(COPY, 'raw')).toContain('Image 1 is the REAL product')
    expect(buildSectionInstruction(COPY, 'none')).toContain('generic attractive product placeholder')
  })
})
