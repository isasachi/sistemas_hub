import { describe, it, expect } from 'vitest'
import { DEFAULT_STYLE, FEEL_CHIPS, FEEL_TAGS, feelWords } from '@/lib/branding/brief'

const HEX = /^#[0-9A-F]{6}$/i

describe('DEFAULT_STYLE', () => {
  it('está vacío a propósito: no es un preset disfrazado', () => {
    // Si acá hubiera colores o inspiración, toda marca cuya sugerencia falle
    // saldría con la misma dirección — que es lo que se eliminó al matar los
    // presets. Vacío = el modelo decide, que es mejor que decidir por todos.
    expect(DEFAULT_STYLE.palette).toEqual([])
    expect(DEFAULT_STYLE.inspiration).toBe('')
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
