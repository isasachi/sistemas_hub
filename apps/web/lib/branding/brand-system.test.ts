import { describe, it, expect, vi } from 'vitest'

// `brand-system.ts` importa gemini/storage al tope; gemini lee su system prompt del disco al
// cargar. Acá solo se prueban el catálogo y el schema (puros), así que se mockean las dos.
vi.mock('@/lib/gemini', () => ({ callStructured: vi.fn() }))
vi.mock('@/lib/storage', () => ({ fetchAsBase64: vi.fn() }))

import { z } from 'zod'
import { BRAND_FONTS, BrandSystemSchema, BrandSystemExtractSchema } from './brand-system'
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

// El eje de ESTILO (2026-08-15) es opcional a propósito: las filas ya guardadas en producción no lo
// traen y la landing lo defaultea en el sitio de uso (`styleOf`). Si dejara de ser opcional, cada
// marca extraída antes de esta fecha fallaría el parse — y el tipo mentiría sobre lo que hay en la
// base.
describe('BrandSystemSchema — eje de estilo', () => {
  it('acepta un estilo del catálogo', () => {
    const parsed = BrandSystemSchema.safeParse({ ...ok, style: 'natural_organic' })
    expect(parsed.success && parsed.data.style).toBe('natural_organic')
  })

  it('acepta su AUSENCIA (filas anteriores a 2026-08-15)', () => {
    const parsed = BrandSystemSchema.safeParse(ok)
    expect(parsed.success && parsed.data.style).toBeUndefined()
  })

  it('rechaza un estilo fuera del catálogo', () => {
    expect(BrandSystemSchema.safeParse({ ...ok, style: 'brutalista' }).success).toBe(false)
  })
})

// El guard que decide si el eje de estilo llega a existir. `callStructured` arma el responseSchema
// con `z.toJSONSchema`, y lo que no está en `required` Gemini lo omite en silencio → todo el eje
// cae al default y el síntoma es el bug original, sin ningún error. Esto se verificó imprimiendo el
// JSON Schema real antes de partir los dos schemas.
describe('BrandSystemExtractSchema — el eje de estilo es OBLIGATORIO al extraer', () => {
  it('emite `style` en el `required` del JSON Schema que ve el modelo', () => {
    const js = z.toJSONSchema(BrandSystemExtractSchema) as { required?: string[] }
    expect(js.required).toContain('style')
  })

  it('rechaza una extracción sin estilo (dispara el retry de callStructured)', () => {
    expect(BrandSystemExtractSchema.safeParse(ok).success).toBe(false)
    expect(BrandSystemExtractSchema.safeParse({ ...ok, style: 'tech_precision' }).success).toBe(true)
  })

  it('el schema de LECTURA sigue tolerándolo ausente (filas anteriores a 2026-08-15)', () => {
    const js = z.toJSONSchema(BrandSystemSchema) as { required?: string[] }
    expect(js.required).not.toContain('style')
  })
})
