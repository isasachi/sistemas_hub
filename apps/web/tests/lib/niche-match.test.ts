import { describe, it, expect } from 'vitest'
import { matchNiche, type NicheForMatch } from '@/lib/product-hunter/niche-match'
import { NICHE_KEYWORDS } from '@ph/shared'

// Nichos como existirían en ph_niches (seeds reales + uno pending sin keywords)
const NICHES: NicheForMatch[] = [
  { id: 'rodilla', keywords: NICHE_KEYWORDS.rodilla },
  { id: 'espalda', keywords: NICHE_KEYWORDS.espalda },
  { id: 'acne', keywords: NICHE_KEYWORDS.acne },
  { id: 'pies', keywords: NICHE_KEYWORDS.pies },
  { id: 'peso', keywords: NICHE_KEYWORDS.peso },
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

  it('derivación por raíz: matchea contra el ID aunque el nicho no tenga keywords', () => {
    // "caderas" ya cubierto por plural; derivados con sufijo distinto van por raíz
    expect(matchNiche('rodillera', [{ id: 'rodilla', keywords: null }])).toBe('rodilla')
    expect(matchNiche('acnegenico', NICHES)).toBe('acne')
  })

  it('raíz por prefijo, NO substring libre (sin falsos positivos internos)', () => {
    // substring naive: "peso" ⊂ "espeso", "pies" ⊂ "espies" — deben dar null
    expect(matchNiche('espeso', NICHES)).toBeNull()
    expect(matchNiche('espies', NICHES)).toBeNull()
    // raíz común corta no alcanza: pies/piel (3), peso/pesadilla (3)
    expect(matchNiche('piel grasa', [{ id: 'pies', keywords: null }])).toBeNull()
    expect(matchNiche('pesadilla', NICHES)).toBeNull()
  })
})
