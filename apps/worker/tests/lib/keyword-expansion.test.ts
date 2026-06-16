import { describe, it, expect } from 'vitest'
import { sanitizeKeywords, MIN_KEYWORDS } from '@/lib/product-hunter/keyword-expansion'
import { NICHE_KEYWORDS } from '@ph/shared'

describe('sanitizeKeywords', () => {
  it('incluye el nicho original como primera keyword', () => {
    const out = sanitizeKeywords(['dolor espalda', 'faja lumbar'], 'espalda')
    expect(out[0]).toBe('espalda')
  })

  it('normaliza a minúsculas y colapsa espacios', () => {
    const out = sanitizeKeywords(['  Dolor   Espalda ', 'FAJA LUMBAR'], 'espalda')
    expect(out).toContain('dolor espalda')
    expect(out).toContain('faja lumbar')
  })

  it('elimina duplicados (incluido el nicho repetido por el LLM)', () => {
    const out = sanitizeKeywords(['espalda', 'lumbar', 'Lumbar', 'lumbar '], 'espalda')
    expect(out).toEqual(['espalda', 'lumbar'])
  })

  it('descarta keywords de más de 4 palabras (devuelven 0 resultados en Ads Library)', () => {
    const out = sanitizeKeywords(
      ['faja lumbar', 'corrector de postura para espalda encorvada'],
      'espalda'
    )
    expect(out).toEqual(['espalda', 'faja lumbar'])
  })

  it('descarta strings vacíos', () => {
    const out = sanitizeKeywords(['', '   ', 'lumbar'], 'espalda')
    expect(out).toEqual(['espalda', 'lumbar'])
  })
})

describe('NICHE_KEYWORDS (seeds)', () => {
  it(`cada nicho seed tiene al menos ${MIN_KEYWORDS} keywords (regla del modelo original)`, () => {
    for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
      expect(keywords.length, `nicho "${niche}"`).toBeGreaterThanOrEqual(MIN_KEYWORDS)
    }
  })

  it('ninguna keyword seed supera las 4 palabras', () => {
    for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
      for (const k of keywords) {
        expect(k.split(/\s+/).length, `"${k}" en "${niche}"`).toBeLessThanOrEqual(4)
      }
    }
  })

  it('no hay keywords duplicadas dentro de un nicho', () => {
    for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
      expect(new Set(keywords).size, `nicho "${niche}"`).toBe(keywords.length)
    }
  })
})
