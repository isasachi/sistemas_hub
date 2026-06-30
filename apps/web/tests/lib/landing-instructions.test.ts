import { describe, it, expect } from 'vitest'
import { buildSectionInstruction } from '@/lib/landing/instructions'
import type { SectionCopy } from '@/lib/landing/types'

const COPY: SectionCopy = { type: 'hero', headline: 'Titular', subheadline: 'Sub' }
const BRAND_HEX = '#0A2540'

describe('buildSectionInstruction', () => {
  it('siempre inyecta la plantilla maestra y reparte la paleta sobre los roles', () => {
    const out = buildSectionInstruction(
      COPY, true,
      [{ name: 'Azul', hex: BRAND_HEX, usage: 'principal' }],
    )
    // La plantilla maestra (estructura) siempre está presente.
    expect(out).toContain('MASTER LAYOUT')
    // La paleta se usa solo ella y se mapea a un único acento sobre los roles.
    expect(out).toContain('COLOR PALETTE')
    expect(out).toContain(BRAND_HEX)
    expect(out).toContain('single dominant brand accent')
  })

  it('sin paleta sigue inyectando la plantilla maestra y deja que el modelo elija paleta', () => {
    const out = buildSectionInstruction(COPY, true)
    expect(out).toContain('MASTER LAYOUT')
    expect(out).not.toContain('build the section from these colors')
  })
})
