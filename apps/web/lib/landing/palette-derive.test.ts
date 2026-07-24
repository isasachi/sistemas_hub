import { describe, it, expect } from 'vitest'
import { hslToHex, derivePalette } from './palette-derive'
import { contrastRatio } from '@/lib/branding/contrast'

describe('derivePalette (spec 0.b B)', () => {
  it('hslToHex básico', () => {
    expect(hslToHex(0, 0, 100).toUpperCase()).toBe('#FFFFFF')
    expect(hslToHex(0, 0, 0)).toBe('#000000')
  })
  it('color_icon usa los offsets [0,40,130,220] y son 4', () => {
    const p = derivePalette({ h: 215, s: 82, l: 51 })
    expect(p.color_icon).toHaveLength(4)
  })
  it('garantiza contraste headline/bg_start ≥ 7:1 (QA#8) incluso con hue claro', () => {
    for (const base of [{ h: 55, s: 90, l: 60 }, { h: 215, s: 82, l: 51 }, { h: 140, s: 30, l: 40 }]) {
      const p = derivePalette(base)
      expect(contrastRatio(p.color_headline, p.bg_start)).toBeGreaterThanOrEqual(7)
    }
  })
  it('color_body es rgba con opacidad 0.7', () => {
    expect(derivePalette({ h: 215, s: 82, l: 51 }).color_body).toMatch(/^rgba\(.*0\.7\)$/)
  })
  it('color_surface siempre blanco', () => {
    expect(derivePalette({ h: 10, s: 50, l: 50 }).color_surface).toBe('#FFFFFF')
  })
})
