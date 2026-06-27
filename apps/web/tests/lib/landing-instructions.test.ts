import { describe, it, expect } from 'vitest'
import { buildSectionInstruction } from '@/lib/landing/instructions'
import type { SectionCopy } from '@/lib/landing/types'

const COPY: SectionCopy = { type: 'hero', headline: 'Titular', subheadline: 'Sub' }
const TEMPLATE = 'TEMPLATE_STYLE_MARKER'
const BRAND_HEX = '#0A2540'

describe('buildSectionInstruction', () => {
  it('solo la paleta de marca predomina; la tipografía la aporta la plantilla', () => {
    const out = buildSectionInstruction(
      COPY, true, TEMPLATE,
      [{ name: 'Azul', hex: BRAND_HEX, usage: 'principal' }],
    )
    // La plantilla aporta estructura + tipografía (no colores).
    expect(out).toContain('STRUCTURE, LAYOUT & TYPOGRAPHY')
    expect(out).toContain(TEMPLATE)
    // La paleta de marca predomina y pisa la plantilla.
    expect(out).toContain('COLOR PALETTE (predominant')
    expect(out).toContain(BRAND_HEX)
    // La tipografía de marca NO se inyecta como predominante.
    expect(out).not.toContain('TYPOGRAPHY (predominant)')
  })

  it('sin paleta no emite el bloque de marca (solo plantilla)', () => {
    const out = buildSectionInstruction(COPY, true, TEMPLATE)
    expect(out).toContain('STRUCTURE, LAYOUT & TYPOGRAPHY')
    expect(out).not.toContain('COLOR PALETTE (predominant')
  })
})
