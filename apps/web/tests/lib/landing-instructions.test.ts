import { describe, it, expect } from 'vitest'
import { buildSectionInstruction } from '@/lib/landing/instructions'
import type { SectionCopy } from '@/lib/landing/types'

const COPY: SectionCopy = { type: 'hero', headline: 'Titular', subheadline: 'Sub' }
const TEMPLATE = 'TEMPLATE_STYLE_MARKER'
const BRAND_HEX = '#0A2540'

describe('buildSectionInstruction', () => {
  it('inyecta paleta + tipografía como predominantes y degrada la plantilla a estructura', () => {
    const out = buildSectionInstruction(
      COPY, true, TEMPLATE,
      [{ name: 'Azul', hex: BRAND_HEX, usage: 'principal' }],
      { headline: 'BoldSans', body: 'Humanist' },
    )
    // La plantilla NO tiñe colores: pasa a estructura/layout.
    expect(out).toContain('STRUCTURE & LAYOUT')
    expect(out).toContain(TEMPLATE)
    // La paleta predomina y pisa la plantilla.
    expect(out).toContain('COLOR PALETTE (predominant')
    expect(out).toContain(BRAND_HEX)
    expect(out).toContain('TYPOGRAPHY (predominant)')
    expect(out).toContain('BoldSans')
  })

  it('sin paleta/tipografía no emite los bloques de marca (solo plantilla)', () => {
    const out = buildSectionInstruction(COPY, true, TEMPLATE)
    expect(out).toContain('STRUCTURE & LAYOUT')
    expect(out).not.toContain('COLOR PALETTE (predominant')
    expect(out).not.toContain('TYPOGRAPHY (predominant)')
  })
})
