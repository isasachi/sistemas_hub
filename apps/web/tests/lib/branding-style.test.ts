import { describe, it, expect } from 'vitest'
import {
  DISPLAY_GROUPS, BODY_GROUPS, DISPLAY_FONTS, BODY_FONTS, ALL_FONTS,
  DEFAULT_STYLE, FEEL_CHIPS, FEEL_TAGS, feelWords, fontsHref,
} from '@/lib/branding/brief'

const HEX = /^#[0-9A-F]{6}$/i

describe('catálogo de tipografías', () => {
  it('no repite una familia dentro de la misma lista', () => {
    expect(new Set(DISPLAY_FONTS).size).toBe(DISPLAY_FONTS.length)
    expect(new Set(BODY_FONTS).size).toBe(BODY_FONTS.length)
  })

  it('ALL_FONTS es la unión sin duplicados — es lo que va al <link>', () => {
    expect(new Set(ALL_FONTS).size).toBe(ALL_FONTS.length)
    expect(new Set(ALL_FONTS)).toEqual(new Set([...DISPLAY_FONTS, ...BODY_FONTS]))
  })

  it('los grupos cubren exactamente las listas planas (el selector no esconde ninguna)', () => {
    expect(DISPLAY_GROUPS.flatMap((g) => [...g.fonts])).toEqual(DISPLAY_FONTS)
    expect(BODY_GROUPS.flatMap((g) => [...g.fonts])).toEqual(BODY_FONTS)
    for (const g of [...DISPLAY_GROUPS, ...BODY_GROUPS]) expect(g.fonts.length).toBeGreaterThan(0)
  })

  it('es un catálogo grande de verdad, no los 7 pares de antes', () => {
    expect(DISPLAY_FONTS.length).toBeGreaterThanOrEqual(20)
    expect(BODY_FONTS.length).toBeGreaterThanOrEqual(10)
  })

  it('fontsHref pide todas las familias en una sola hoja', () => {
    const href = fontsHref()
    for (const f of ALL_FONTS) expect(href).toContain(`family=${encodeURIComponent(f)}`)
    expect(href.match(/family=/g)).toHaveLength(ALL_FONTS.length)
    expect(href).toContain('display=swap')
  })
})

describe('DEFAULT_STYLE', () => {
  it('usa fuentes del catálogo — si no, el selector abriría en un valor imposible', () => {
    expect(DISPLAY_FONTS).toContain(DEFAULT_STYLE.typography.display)
    expect(BODY_FONTS).toContain(DEFAULT_STYLE.typography.body)
  })

  it('tiene los 5 roles en hex de 6 dígitos', () => {
    const roles = Object.keys(DEFAULT_STYLE.palette)
    expect(roles).toEqual(['primary', 'secondary', 'accent', 'dark', 'light'])
    for (const hex of Object.values(DEFAULT_STYLE.palette)) expect(hex).toMatch(HEX)
  })
})

describe('actitud', () => {
  it('cada chip trae etiqueta en español y palabras en inglés para el prompt', () => {
    expect(FEEL_CHIPS.length).toBeGreaterThanOrEqual(10)
    for (const c of FEEL_CHIPS) {
      expect(c.label.trim()).not.toBe('')
      expect(c.prompt.trim()).not.toBe('')
      // Corto a propósito: no es un bloque de estilo, es una traducción.
      expect(c.prompt.split(/[\s,]+/).length).toBeLessThanOrEqual(4)
    }
    expect(new Set(FEEL_TAGS).size).toBe(FEEL_TAGS.length)
  })

  it('feelWords traduce los chips y deja pasar el texto libre', () => {
    expect(feelWords(['Clínico', 'Sereno'])).toBe('clinical, precise, calm, quiet')
    expect(feelWords(['Artesanal', 'como una botica de barrio']))
      .toBe('handcrafted, artisanal, como una botica de barrio')
    expect(feelWords([])).toBe('')
  })
})
