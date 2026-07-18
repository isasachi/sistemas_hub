import { describe, it, expect } from 'vitest'
import { mergePalette } from './derive-brand'
import type { LandingPalette } from './types'

describe('mergePalette', () => {
  const packaging: LandingPalette = [
    { name: 'Verde marca', hex: '#0EA5A4' },
    { name: 'Blanco', hex: '#FFFFFF' },
  ]
  const niche: LandingPalette = [
    { name: 'Azul', hex: '#2E6FB7', usage: 'atmósfera' },
    { name: 'Celeste', hex: '#8FC2E8', usage: 'brillo' },
    { name: 'Blanco puro', hex: '#ffffff', usage: 'fondo' }, // colisiona con packaging (case-insensitive)
  ]

  it('pone el color del packaging primero como accent de marca', () => {
    const out = mergePalette(packaging, niche)
    expect(out[0].hex).toBe('#0EA5A4')
    expect(out[0].usage).toBe('accent de marca')
  })

  it('dedup por hex case-insensitive', () => {
    const out = mergePalette(packaging, niche)
    const hexes = out.map((c) => c.hex.toLowerCase())
    expect(new Set(hexes).size).toBe(hexes.length)
    expect(hexes.filter((h) => h === '#ffffff').length).toBe(1)
  })

  it('topea en 6 colores', () => {
    const many: LandingPalette = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}`, hex: `#${i}${i}${i}${i}${i}${i}` }))
    expect(mergePalette(many, niche).length).toBe(6)
  })
})
