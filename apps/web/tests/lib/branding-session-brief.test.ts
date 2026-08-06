import { describe, it, expect } from 'vitest'
import { briefFromRow, paletteFromRow, typographyFromRow } from '@/lib/branding/session-brief'
import { DEFAULT_STYLE } from '@/lib/branding/brief'

/** Fila mínima que sí completa un brief. */
const row = {
  product_category: 'mascotas',
  product_type: 'Snacks blandos de pollo para perros pequeños',
  brand_name: 'Miru',
  target_audience: 'Dueños de perros, Mamás primerizas',
}

const palette = { primary: '#101010', secondary: '#202020', accent: '#FF7A2F', dark: '#0A0A0A', light: '#FAFAFA' }
const typography = { display: 'Oswald', body: 'Lato' }

describe('sesión → brief', () => {
  it('reconstruye el estilo compuesto en el editor', () => {
    const b = briefFromRow({ ...row, descriptor: 'Artesanal, Cálido', selected_palette: palette, selected_typography: typography })
    expect(b).not.toBeNull()
    expect(b!.feel).toEqual(['Artesanal', 'Cálido'])
    expect(b!.style).toEqual({ palette, typography })
    expect(b!.audience).toEqual(['Dueños de perros', 'Mamás primerizas'])
  })

  // ── Compatibilidad: las marcas generadas ANTES del editor ──────────────────
  // Sin esto, `briefFromRow` devolvía null y su kit tiraba 400.

  it('una sesión de la era de los presets sigue dando un brief válido', () => {
    const b = briefFromRow({ ...row, style_id: 'clinical_premium', selected_palette: null, descriptor: null })
    expect(b).not.toBeNull()
    expect(b!.feel).toEqual([])
    expect(b!.style).toEqual(DEFAULT_STYLE)
  })

  it('el shape muerto del style-picker de 2026-07 no se cuela como paleta', () => {
    // Ese flujo guardaba PaletteColor[] y {primary,secondary,case,detail}: leerlos
    // como los 5 roles dejaría `palette.primary` undefined y generaría una imagen
    // PAGADA con basura en el prompt.
    const b = briefFromRow({
      ...row,
      selected_palette: [{ hex: '#101010', name: 'Tinta', role: 'text' }],
      selected_typography: { primary: 'Oswald', secondary: 'Lato', case: 'title', detail: 'none' },
    })
    expect(b!.style).toEqual(DEFAULT_STYLE)
  })

  it('paletteFromRow/typographyFromRow distinguen ausencia de fallback', () => {
    // Las usa el handoff a landing: sin paleta guardada la landing va sin identidad
    // derivada, en vez de heredar un default que la marca nunca eligió.
    expect(paletteFromRow({ selected_palette: null })).toBeNull()
    expect(paletteFromRow({ selected_palette: [{ hex: '#fff' }] })).toBeNull()
    expect(paletteFromRow({ selected_palette: palette })).toEqual(palette)
    expect(typographyFromRow({ selected_typography: { primary: 'Oswald' } })).toBeNull()
    expect(typographyFromRow({ selected_typography: typography })).toEqual(typography)
  })

  it('sin los datos básicos no hay brief', () => {
    expect(briefFromRow({ brand_name: 'Miru' })).toBeNull()
  })
})
