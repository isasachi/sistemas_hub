import { describe, it, expect, vi } from 'vitest'

// `brand-system.ts` importa gemini/storage al tope; gemini lee su system prompt del disco al
// cargar. Acá solo se prueban el catálogo y el schema (puros), así que se mockean las dos.
vi.mock('@/lib/gemini', () => ({ callStructured: vi.fn() }))
vi.mock('@/lib/storage', () => ({ fetchAsBase64: vi.fn() }))

import { BRAND_FONTS, BrandSystemSchema } from './brand-system'
import { NICHE_TYPOGRAPHY } from '@/lib/landing/niches'

const ok = {
  palette: [
    { hex: '#0B0B0F', name: 'Negro humo', role: 'background' },
    { hex: '#2E7D5B', name: 'Verde bosque', role: 'primary' },
    { hex: '#E8A33D', name: 'Ámbar', role: 'accent' },
  ],
  polarity: 'dark',
  font_family: 'Poppins',
  font_accent: null,
  halo: 'radial_soft',
  particles: 'medium',
}

describe('BRAND_FONTS', () => {
  it('es la unión de las fuentes de NICHE_TYPOGRAPHY, sin duplicados', () => {
    const esperadas = new Set(
      Object.values(NICHE_TYPOGRAPHY).flatMap((t) => [t.font_family, t.font_accent]).filter(Boolean),
    )
    expect(new Set(BRAND_FONTS)).toEqual(esperadas)
    expect(BRAND_FONTS.length).toBe(new Set(BRAND_FONTS).size)
  })
})

describe('BrandSystemSchema', () => {
  it('acepta un ADN bien formado', () => {
    expect(BrandSystemSchema.safeParse(ok).success).toBe(true)
  })

  // La landing deriva la POLARIDAD de la luminancia de este rol: sin él, el consumidor no funciona.
  it('rechaza una paleta sin rol background', () => {
    const sinFondo = { ...ok, palette: ok.palette.filter((c) => c.role !== 'background') }
    expect(BrandSystemSchema.safeParse(sinFondo).success).toBe(false)
  })

  // Un shorthand o un rgb() romperían el cálculo de luminancia en silencio.
  it('rechaza hex que no sea #RRGGBB', () => {
    for (const hex of ['#abc', 'rgb(0,0,0)', '0B0B0F', '#0B0B0FF']) {
      const malo = { ...ok, palette: [{ ...ok.palette[0], hex }, ...ok.palette.slice(1)] }
      expect(BrandSystemSchema.safeParse(malo).success, hex).toBe(false)
    }
  })

  it('rechaza una fuente fuera del catálogo', () => {
    expect(BrandSystemSchema.safeParse({ ...ok, font_family: 'Comic Sans' }).success).toBe(false)
  })

  // La polaridad es un campo EXPLÍCITO a propósito: el lienzo del board no es la marca, así que
  // no se puede inferir de la luminancia del rol background. Si falta, no hay default silencioso.
  it('exige polarity explícita', () => {
    const { polarity: _, ...sinPolaridad } = ok
    expect(BrandSystemSchema.safeParse(sinPolaridad).success).toBe(false)
    expect(BrandSystemSchema.safeParse({ ...ok, polarity: 'claro' }).success).toBe(false)
  })
})
