import { describe, it, expect } from 'vitest'
import {
  scanCollations, weighByText, wilson, classifyShare, passesPhysicalGate, DEFAULT_MARGIN,
} from '../../lib/product-hunter/product-share'

// Nodo como lo manda Meta: collation_count vive en el MISMO objeto que
// ad_archive_id (por eso scanAdNodes, que solo mira ancestros, nunca lo ve).
const node = (id: string, collationId: string, count: number, title: string, body: string) => ({
  ad_archive_id: id, collation_id: collationId, collation_count: count, page_id: 'PG',
  snapshot: { title, body: { text: body } },
})

describe('scanCollations', () => {
  it('lee collation_count del nodo hoja y deduplica por collation_id', () => {
    const payload = { data: { results: [
      node('1', 'c1', 4, 'Rodillera', 'alivio de rodilla'),
      node('2', 'c1', 4, 'Rodillera', 'alivio de rodilla'), // mismo grupo, no suma dos veces
      node('3', 'c2', 2, 'Faja', 'faja lumbar'),
    ] } }
    const groups = [...scanCollations(payload, 'PG').values()]
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.count).sort()).toEqual([2, 4])
  })

  it('ignora los anuncios de otras páginas', () => {
    const ajeno = { ...node('9', 'c9', 5, 'Otro', 'otro'), page_id: 'OTRA' }
    expect(scanCollations({ x: [ajeno] }, 'PG').size).toBe(0)
  })

  it('sin collation_count, un anuncio pesa 1 (nunca 0)', () => {
    const sinCount = { ad_archive_id: '7', page_id: 'PG', snapshot: { title: 'T', body: { text: 'B' } } }
    expect([...scanCollations({ a: sinCount }, "PG").values()][0].count).toBe(1)
  })
})

describe('weighByText', () => {
  it('suma el peso de los grupos que comparten copy — 8 creativos pueden ser 88 anuncios', () => {
    const groups = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, count: 11, text: 'mismo copy' }))
    const { texts, weights, total } = weighByText(groups)
    expect(texts).toEqual(['mismo copy'])
    expect(weights).toEqual([88])
    expect(total).toBe(88)
  })

  it('descarta textos vacíos y respeta el tope', () => {
    const groups = [
      { id: 'a', count: 3, text: '' },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, count: i + 1, text: `copy ${i}` })),
    ]
    const r = weighByText(groups, 2)
    expect(r.texts).toHaveLength(2)
    expect(r.weights).toEqual([5, 4]) // los de mayor peso primero
  })
})

describe('classifyShare — el sesgo es conservar, no descartar', () => {
  const base = { weightMatched: 0, weightTotal: 0, adCount: 100 }

  it('monoproducto solo si TODO el intervalo supera el margen', () => {
    const v = classifyShare({ ...base, weightMatched: 90, weightTotal: 100, adCount: 100 })
    expect(v.status).toBe('monoproducto')
    expect(v.ciLow).toBeGreaterThanOrEqual(DEFAULT_MARGIN)
  })

  it('descarta solo si TODO el intervalo queda bajo el margen', () => {
    expect(classifyShare({ ...base, weightMatched: 5, weightTotal: 100 }).status).toBe('descartado')
  })

  it('un intervalo que cruza el margen CONSERVA el producto', () => {
    // 4 de 8 = 50%: bajo el margen por punto, pero el intervalo llega a 0.78.
    const v = classifyShare({ ...base, weightMatched: 4, weightTotal: 8, adCount: 93 })
    expect(v.status).toBe('sin_verificar')
    expect(v.ciHigh).toBeGreaterThan(DEFAULT_MARGIN)
  })

  it('con evidencia insuficiente nunca descarta', () => {
    const v = classifyShare({ ...base, weightMatched: 0, weightTotal: 3, adCount: 80 })
    expect(v.status).toBe('sin_verificar')
  })

  it('una página multiproducto se descarta, no se re-rangea', () => {
    // 99 anuncios de los cuales el producto es el 8%: la página no es suya.
    const v = classifyShare({ ...base, weightMatched: 6, weightTotal: 71, adCount: 99 })
    expect(v.status).toBe('descartado')
    expect(v.productAds).toBe(8)
  })

  it('en el censo el intervalo se angosta pero NO finge certeza total', () => {
    const v = classifyShare({ ...base, weightMatched: 87, weightTotal: 88, adCount: 81 })
    expect(v.coverage).toBe(1)
    expect(v.ciHigh - v.ciLow).toBeGreaterThan(0)      // los pesos son aproximados
    expect(v.ciHigh - v.ciLow).toBeLessThan(0.15)
    expect(v.status).toBe('monoproducto')
  })

  it('un 60% justo NO se descarta: el intervalo abraza el margen', () => {
    // Caso real (SomosCatus): 28/47 con 37 anuncios reportados. Con la FPC mal
    // aplicada daba IC 59-59 y lo tiraba por medio punto.
    const v = classifyShare({ ...base, weightMatched: 28, weightTotal: 47, adCount: 37 })
    expect(v.ciLow).toBeLessThan(DEFAULT_MARGIN)
    expect(v.ciHigh).toBeGreaterThan(DEFAULT_MARGIN)
    expect(v.status).toBe('sin_verificar')
  })

  it('sin datos no descarta', () => {
    expect(classifyShare({ ...base, weightTotal: 0 }).status).toBe('sin_verificar')
  })
})

describe('wilson', () => {
  it('se angosta con más muestra y con la población acotada', () => {
    const ancho = ([lo, hi]: [number, number]) => hi - lo
    expect(ancho(wilson(30, 60))).toBeLessThan(ancho(wilson(12, 25)))
    expect(ancho(wilson(12, 25, 1.96, 40))).toBeLessThan(ancho(wilson(12, 25, 1.96, 6000)))
  })

  it('el intervalo SIEMPRE contiene la proporción medida, incluso en los bordes', () => {
    for (const [k, n, N] of [[30, 30, 41], [0, 25, 100], [47, 47, 47], [1, 8, 93]]) {
      const [lo, hi] = wilson(k, n, 1.96, N)
      expect(lo).toBeLessThanOrEqual(k / n)
      expect(hi).toBeGreaterThanOrEqual(k / n)
    }
  })

  it('0 de n no prueba cero: el techo sigue arriba de 0', () => {
    expect(wilson(0, 25)[1]).toBeGreaterThan(0.1)
  })
})

describe('regla 1 — producto físico', () => {
  it('deja pasar lo físico y frena apps, cursos y servicios', () => {
    expect(passesPhysicalGate('fisico')).toBe(true)
    expect(passesPhysicalGate('digital')).toBe(false)     // apps de novelas, sudoku
    expect(passesPhysicalGate('contenido')).toBe(false)   // cursos, planes de entrenamiento
    expect(passesPhysicalGate('servicio')).toBe(false)    // parques, clínicas
  })

  it('lo indeterminado NO se descarta: sin evidencia no se pierde un producto', () => {
    expect(passesPhysicalGate('indeterminado')).toBe(true)
  })
})

describe('texto seguro para la API', () => {
  // Un emoji partido por el truncado deja un lone surrogate y la API de
  // Anthropic rechaza el request ENTERO con 400 (14 productos congelaron la
  // cola el 2026-08-06). El corte pasa dentro de weighByText, así que limpiar
  // antes no alcanza: hay que limpiar después.
  const solitario = (t: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(t)

  it('weighByText no deja surrogates sueltos al truncar', () => {
    const texto = 'a'.repeat(219) + '🔥' + ' resto del anuncio'
    expect(solitario(texto.slice(0, 220))).toBe(true)          // el corte crudo sí rompe
    const { texts } = weighByText([{ id: 'c1', count: 3, text: texto }])
    expect(texts[0].length).toBeLessThanOrEqual(220)
    expect(solitario(texts[0])).toBe(false)
    expect(() => JSON.stringify({ t: texts[0] })).not.toThrow()
  })

  it('scanCollations tampoco los deja pasar', () => {
    const node = {
      ad_archive_id: '1', page_id: 'PG', collation_count: 2,
      snapshot: { title: 'Oferta \uD83D', body: { text: 'texto \uDE00 partido' } },
    }
    const [g] = [...scanCollations({ n: node }, 'PG').values()]
    expect(solitario(g.text)).toBe(false)
  })
})
