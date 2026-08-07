import { describe, it, expect } from 'vitest'
import { cleanNameSuggestions, brandNameError } from '@/lib/branding/brief'

describe('cleanNameSuggestions', () => {
  it('descarta lo que el input rechazaría', () => {
    const out = cleanNameSuggestions(['A', 'Kelvin', 'x'.repeat(40), '   ', 'Vera'])
    expect(out).toEqual(['Kelvin', 'Vera'])
    out.forEach((n) => expect(brandNameError(n)).toBeNull())
  })

  it('quita comillas, deduplica sin distinguir mayúsculas y respeta el tope', () => {
    expect(cleanNameSuggestions(['"Kelvin"', 'kelvin', 'Vera'])).toEqual(['Kelvin', 'Vera'])
    expect(cleanNameSuggestions(['a1', 'b2', 'c3', 'd4'], 2)).toEqual(['a1', 'b2'])
  })
})
