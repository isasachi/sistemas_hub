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

const palette = ['naranja intenso', 'lima eléctrico']
const direction = { inspiration: 'Editorial product photography' }

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

  it('los shapes viejos con hex se leen quedándose con el nombre', () => {
    // Hubo dos flujos que guardaron objetos acá: el style-picker de 2026-07
    // ({hex,name,role}) y el editor de hex ({name,hex}). El prompt solo quiere
    // el nombre, así que se aprovechan en vez de tirarlos al default.
    const b = briefFromRow({ ...row, selected_palette: [
      { hex: '#101010', name: 'Tinta', role: 'text' }, { name: 'Lima', hex: '#C6FF00' },
    ] })
    expect(b!.style.palette).toEqual(['Tinta', 'Lima'])
  })

  it('paletteFromRow distingue ausencia de fallback', () => {
    // La usa el handoff a landing: sin paleta guardada la landing va sin identidad
    // derivada, en vez de heredar un default que la marca nunca eligió.
    expect(paletteFromRow({ selected_palette: null })).toBeNull()
    expect(paletteFromRow({ selected_palette: [] })).toBeNull()
    expect(paletteFromRow({ selected_palette: [{ hex: '#FF4D00' }] })).toBeNull()
    expect(paletteFromRow({ selected_palette: palette })).toEqual(palette)
  })

  it('sin los datos básicos no hay brief', () => {
    expect(briefFromRow({ brand_name: 'Miru' })).toBeNull()
  })
})
