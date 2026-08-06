import { describe, it, expect } from 'vitest'
import { briefFromRow, paletteFromRow } from '@/lib/branding/session-brief'
import { DEFAULT_STYLE } from '@/lib/branding/brief'

/** Fila mínima que sí completa un brief. */
const row = {
  product_category: 'mascotas',
  product_type: 'Snacks blandos de pollo para perros pequeños',
  brand_name: 'Miru',
  target_audience: 'Dueños de perros, Mamás primerizas',
}

const palette = [
  { name: 'Naranja intenso', hex: '#FF4D00' },
  { name: 'Lima eléctrico', hex: '#C6FF00' },
]
const direction = { inspiration: 'Swiss sports posters', graphicStyle: 'Modular grid', products: 'Pote, Shaker' }

describe('sesión → brief', () => {
  it('reconstruye las casillas del prompt', () => {
    const b = briefFromRow({ ...row, descriptor: 'Artesanal, Cálido', tagline: 'Sabor de casa',
                             selected_palette: palette, direction })
    expect(b).not.toBeNull()
    expect(b!.feel).toEqual(['Artesanal', 'Cálido'])
    expect(b!.tagline).toBe('Sabor de casa')
    expect(b!.style).toEqual({ palette, ...direction })
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

  it('descarta colores sin hex válido en vez de mandarlos al prompt', () => {
    // Un hex roto llega literal al prompt de una imagen PAGADA.
    const b = briefFromRow({ ...row, selected_palette: [
      { name: 'Bueno', hex: '#FF4D00' }, { name: 'Roto', hex: 'naranja' }, { name: 'Nulo' },
    ] })
    expect(b!.style.palette).toEqual([{ name: 'Bueno', hex: '#FF4D00' }])
  })

  it('el shape del style-picker de 2026-07 se lee como paleta: es compatible', () => {
    // Guardaba {hex,name,role}: los dos campos que importan están, así que se
    // aprovecha en vez de tirarla al default.
    const b = briefFromRow({ ...row, selected_palette: [{ hex: '#101010', name: 'Tinta', role: 'text' }] })
    expect(b!.style.palette).toEqual([{ name: 'Tinta', hex: '#101010' }])
  })

  it('paletteFromRow distingue ausencia de fallback', () => {
    // La usa el handoff a landing: sin paleta guardada la landing va sin identidad
    // derivada, en vez de heredar un default que la marca nunca eligió.
    expect(paletteFromRow({ selected_palette: null })).toBeNull()
    expect(paletteFromRow({ selected_palette: [] })).toBeNull()
    expect(paletteFromRow({ selected_palette: [{ hex: 'nope' }] })).toBeNull()
    expect(paletteFromRow({ selected_palette: palette })).toEqual(palette)
  })

  it('sin los datos básicos no hay brief', () => {
    expect(briefFromRow({ brand_name: 'Miru' })).toBeNull()
  })
})
