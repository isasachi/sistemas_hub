import { describe, it, expect } from 'vitest'
import { bm25, phraseCoverage, proximityBonus } from './relevance'
import { eligibility, opportunityScore, longevityScore, daysActive, type Candidate } from './opportunity'
import { getBucket } from '../advertisers/bucket'
import { distribution, mergeSimilar } from '../advertisers/monoproduct'

const ok = (over: Partial<Candidate> = {}): Candidate => ({
  physicalProduct: true, ecommerce: true, relevance: 0.8, productConfidence: 0.9,
  productShare: 0.9, daysActive: 45, ecommerceScore: 14, advertiserAds: 87, countries: 3,
  ...over,
})

describe('getBucket (spec §29)', () => {
  it('los bordes NO son ambiguos: 50 y 100 caen en un solo tramo', () => {
    expect(getBucket(49)).toBe('0_49')
    expect(getBucket(50)).toBe('50_99')
    expect(getBucket(99)).toBe('50_99')
    expect(getBucket(100)).toBe('100_plus')
  })
})

describe('monoproducto (spec §30)', () => {
  it('el ejemplo del spec: 76 de 87 = 87,36%', () => {
    const d = distribution([
      { key: 'a', name: 'Producto A', count: 76 },
      { key: 'b', name: 'Producto B', count: 7 },
      { key: 'c', name: 'Producto C', count: 4 },
    ])
    expect(d.sample).toBe(87)
    expect(Math.round(d.share * 10000) / 100).toBeCloseTo(87.36, 1)
    expect(d.monoproduct).toBe(true)
    expect(d.strong).toBe(true)
  })

  it('guarda el NÚMERO, no solo el booleano', () => {
    expect(typeof distribution([{ key: 'a', name: 'A', count: 3 }]).share).toBe('number')
  })

  it('un catálogo repartido no es monoproducto', () => {
    const d = distribution([
      { key: 'a', name: 'Alfa', count: 5 }, { key: 'b', name: 'Beta', count: 5 },
      { key: 'c', name: 'Gamma', count: 5 }, { key: 'd', name: 'Delta', count: 5 },
    ])
    expect(d.monoproduct).toBe(false)
    expect(d.distinct).toBe(4)
  })

  // El sesgo documentado en product-key.ts: un producto en varias landings.
  it('funde el mismo producto escrito distinto', () => {
    const m = mergeSimilar([
      { key: 'a', name: 'Legging Deportivo Colores', count: 17 },
      { key: 'b', name: 'Legging Deportivo Colores', count: 12 },
      { key: 'c', name: 'Faja Reductora', count: 2 },
    ])
    expect(m[0].count).toBe(29)
    expect(m).toHaveLength(2)
  })

  it('NO funde productos genuinamente distintos', () => {
    const m = mergeSimilar([
      { key: 'a', name: 'Pasta Dental Blanqueadora', count: 5 },
      { key: 'b', name: 'Cepillo Electrico Recargable', count: 4 },
    ])
    expect(m).toHaveLength(2)
  })
})

describe('elegibilidad vs ranking (spec §42-43)', () => {
  it('un candidato completo pasa', () => {
    expect(eligibility(ok()).eligible).toBe(true)
  })

  it('NINGÚN score alto rescata a un inválido: share bajo = FAIL', () => {
    const c = ok({ productShare: 0.3, relevance: 1, daysActive: 365 })
    expect(eligibility(c).eligible).toBe(false)
    expect(eligibility(c).reason).toBe('MULTI_PRODUCT')
  })

  it('reporta el PRIMER motivo del embudo, no todos', () => {
    expect(eligibility(ok({ physicalProduct: false, ecommerce: false })).reason).toBe('NOT_PHYSICAL')
    expect(eligibility(ok({ ecommerce: false })).reason).toBe('NOT_ECOMMERCE')
    expect(eligibility(ok({ relevance: 0.1 })).reason).toBe('LOW_RELEVANCE')
    expect(eligibility(ok({ productConfidence: 0.4 })).reason).toBe('NO_PRODUCT')
  })
})

describe('opportunityScore', () => {
  it('está en 0-100 y crece con las señales', () => {
    const bajo = opportunityScore(ok({ relevance: 0.1, productShare: 0.7, daysActive: 1, countries: 1 }))
    const alto = opportunityScore(ok({ relevance: 1, productShare: 1, daysActive: 90, countries: 5 }))
    expect(alto.opportunity).toBeGreaterThan(bajo.opportunity)
    expect(alto.opportunity).toBeLessThanOrEqual(100)
    expect(bajo.opportunity).toBeGreaterThanOrEqual(0)
  })

  it('la longevidad satura en el tope y no lo pasa', () => {
    expect(longevityScore(90)).toBe(1)
    expect(longevityScore(900)).toBe(1)
    expect(longevityScore(0)).toBe(0)
  })
})

describe('daysActive', () => {
  it('cuenta días desde el inicio del anuncio', () => {
    const now = new Date('2026-08-21T00:00:00Z')
    expect(daysActive('2026-07-25T00:00:00Z', now)).toBe(27)
  })
  it('sin fecha devuelve 0, no NaN', () => {
    expect(daysActive(null)).toBe(0)
    expect(daysActive('no es fecha')).toBe(0)
  })
})

describe('bm25 (spec §39)', () => {
  const docs = [
    { id: 'a', text: 'pasta dental para dientes sensibles alivia el dolor dental' },
    { id: 'b', text: 'faja reductora moldeadora para abdomen plano' },
    { id: 'c', text: 'cepillo dental electrico recargable' },
  ]
  const q = ['dolor dental', 'dientes sensibles']

  it('el documento del tema puntúa más alto que el ajeno', () => {
    const s = bm25(docs, q)
    expect(s.get('a')!).toBeGreaterThan(s.get('b')!)
    expect(s.get('a')).toBe(1)   // normalizado contra el mejor de la corrida
  })

  it('el que no comparte ningún término puntúa 0', () => {
    expect(bm25(docs, q).get('b')).toBe(0)
  })

  it('es reproducible DENTRO de la misma corrida', () => {
    expect([...bm25(docs, q)]).toEqual([...bm25(docs, q)])
  })

  it('un corpus vacío no explota', () => {
    expect(bm25([], q).size).toBe(0)
  })
})

describe('phraseCoverage — el número que SÍ se compara contra un umbral', () => {
  const docs = [
    { id: 'a', text: 'pasta dental para el dolor de muela' },
    { id: 'b', text: 'faja reductora moldeadora para abdomen' },
    { id: 'c', text: 'alivia el dolor' },
  ]
  const frases = ['dolor de muela', 'dolor dental', 'faja reductora']

  it('cubrir una frase entera da 1, aunque haya 30 frases más en la expansión', () => {
    const s = phraseCoverage(docs, frases)
    expect(s.get('a')).toBe(1)
    expect(s.get('b')).toBe(1)
  })

  it('cubrir una frase a medias queda en el medio', () => {
    const s = phraseCoverage(docs, frases)
    expect(s.get('c')!).toBeGreaterThan(0)
    expect(s.get('c')!).toBeLessThan(1)
  })

  it('es ABSOLUTO: sacar el mejor documento no cambia el puntaje de los otros', () => {
    const conTodos = phraseCoverage(docs, frases)
    const sinB = phraseCoverage(docs.filter((d) => d.id !== 'b'), frases)
    // bm25 sí se movería: su normalización es contra el mejor de la tanda.
    expect(sinB.get('a')).toBe(conTodos.get('a'))
  })

  it('un documento sin ningún término da 0', () => {
    expect(phraseCoverage([{ id: 'x', text: 'zapatillas para correr' }], ['dolor de muela']).get('x')).toBe(0)
  })
})

describe('proximityBonus (spec §41)', () => {
  it('dos términos juntos valen más que dispersos', () => {
    const juntos = proximityBonus('el dolor dental es fuerte', ['dolor', 'dental'])
    const lejos = proximityBonus(`dolor ${'x '.repeat(30)} dental`, ['dolor', 'dental'])
    expect(juntos).toBeGreaterThan(lejos)
  })
  it('con un solo término no hay bonus', () => {
    expect(proximityBonus('solo dolor aca', ['dolor'])).toBe(0)
  })
})
