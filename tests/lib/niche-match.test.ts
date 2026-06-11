import { describe, it, expect } from 'vitest'
import { matchNiche, type NicheForMatch } from '@/lib/product-hunter/niche-match'
import { NICHE_KEYWORDS } from '@/lib/product-hunter/keywords'

// Nichos como existirían en ph_niches (seeds reales + uno pending sin keywords)
const NICHES: NicheForMatch[] = [
  { id: 'rodilla', keywords: NICHE_KEYWORDS.rodilla },
  { id: 'espalda', keywords: NICHE_KEYWORDS.espalda },
  { id: 'acne', keywords: NICHE_KEYWORDS.acne },
  { id: 'cadera', keywords: null }, // pending: aún sin expansión
]

describe('matchNiche', () => {
  it('match exacto del id', () => {
    expect(matchNiche('rodilla', NICHES)).toBe('rodilla')
  })

  it('la consulta es una keyword expandida del nicho (el bug reportado)', () => {
    expect(matchNiche('rodillera', NICHES)).toBe('rodilla')
    expect(matchNiche('dolor rodilla', NICHES)).toBe('rodilla')
    expect(matchNiche('faja lumbar', NICHES)).toBe('espalda')
  })

  it('keyword contenida en una consulta más larga', () => {
    expect(matchNiche('dolor de rodilla', NICHES)).toBe('rodilla')
    expect(matchNiche('rodillera ortopedica deportiva', NICHES)).toBe('rodilla')
  })

  it('tolera plural/singular', () => {
    expect(matchNiche('rodilleras', NICHES)).toBe('rodilla')
    expect(matchNiche('parches acne', NICHES)).toBe('acne')
  })

  it('tolera acentos', () => {
    expect(matchNiche('acné', NICHES)).toBe('acne')
    expect(matchNiche('dolor de rodílla', NICHES)).toBe('rodilla')
  })

  it('id de nicho pending (sin keywords) contenido en la consulta', () => {
    expect(matchNiche('dolor de cadera', NICHES)).toBe('cadera')
  })

  it('consulta genuinamente nueva NO matchea (sigue el cold start)', () => {
    expect(matchNiche('cafetera italiana', NICHES)).toBeNull()
    expect(matchNiche('crema facial', NICHES)).toBeNull()
    expect(matchNiche('', NICHES)).toBeNull()
  })

  it('empate entre nichos: gana el match más específico', () => {
    // "dolor cervical trabajo oficina" contiene keywords de espalda
    // ('dolor cervical', 'trabajo oficina') — debe resolver a espalda
    expect(matchNiche('dolor cervical trabajo oficina', NICHES)).toBe('espalda')
  })

  it('tokens cortos no disparan plural fuzzy (sin falsos positivos)', () => {
    // "pie" vs "pies" tendría tolerancia, pero tokens <4 chars exigen igualdad exacta
    expect(matchNiche('spa', NICHES)).toBeNull()
  })
})
