import { describe, it, expect } from 'vitest'
import { DEFAULT_STYLE, PALETTE_MIN, PALETTE_MAX, PACKAGING_CHIPS, FEEL_CHIPS, FEEL_TAGS, feelWords } from '@/lib/branding/brief'

const HEX = /^#[0-9A-F]{6}$/i

describe('DEFAULT_STYLE', () => {
  it('es un punto de partida neutro, no un preset disfrazado', () => {
    // Vacías a propósito: son las casillas creativas que propone el LLM. Si acá
    // hubiera texto, toda marca cuya sugerencia falle saldría con la misma
    // dirección de arte — que es justo lo que se eliminó al matar los presets.
    expect(DEFAULT_STYLE.inspiration).toBe('')
    expect(DEFAULT_STYLE.graphicStyle).toBe('')
    expect(DEFAULT_STYLE.products).toBe('')
  })

  it('trae una paleta dentro de los límites y en hex de 6 dígitos', () => {
    expect(DEFAULT_STYLE.palette.length).toBeGreaterThanOrEqual(PALETTE_MIN)
    expect(DEFAULT_STYLE.palette.length).toBeLessThanOrEqual(PALETTE_MAX)
    for (const c of DEFAULT_STYLE.palette) {
      expect(c.hex).toMatch(HEX)
      expect(c.name.trim()).not.toBe('')
    }
  })
})

describe('piezas del board', () => {
  it('van más allá del envase: el board de referencia lleva shaker y polo', () => {
    expect(PACKAGING_CHIPS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(PACKAGING_CHIPS).size).toBe(PACKAGING_CHIPS.length)
    expect(PACKAGING_CHIPS).toContain('Doypack')
    expect(PACKAGING_CHIPS).toContain('Polo')
  })
})

describe('actitud', () => {
  it('cada chip trae etiqueta en español y palabras en inglés para el prompt', () => {
    expect(FEEL_CHIPS.length).toBeGreaterThanOrEqual(10)
    for (const c of FEEL_CHIPS) {
      expect(c.label.trim()).not.toBe('')
      expect(c.prompt.trim()).not.toBe('')
      // UN adjetivo: la casilla "Brand feel" del prompt pide personalidad de
      // marca, no una lista de keywords comprimidas.
      expect(c.prompt.split(/[\s,]+/).length).toBe(1)
    }
    expect(new Set(FEEL_TAGS).size).toBe(FEEL_TAGS.length)
  })

  it('feelWords traduce los chips y deja pasar el texto libre', () => {
    expect(feelWords(['Clínico', 'Sereno'])).toBe('clinical, calm')
    expect(feelWords(['Artesanal', 'como una botica de barrio']))
      .toBe('handcrafted, como una botica de barrio')
    expect(feelWords([])).toBe('')
  })
})
