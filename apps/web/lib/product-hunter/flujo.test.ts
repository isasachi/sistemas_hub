import { describe, it, expect } from 'vitest'
import type { RawProductEntry } from '@ph/shared'
import {
  cupoDe, ofreceComodin, siguienteProducto, encuestaCompleta, ENCUESTA_VACIA,
} from './flujo'

const p = (id: string): RawProductEntry => ({
  id, advertiser: 'x', productName: null, title: null, body: null, country: 'CO',
  adCount: 10, adsUrl: '#', verificado: true, share: 1, senal: null, diasCorriendo: 30,
})

describe('cupo por plan', () => {
  it('un tier desconocido cae al plan más bajo, nunca al más alto', () => {
    expect(cupoDe(99)).toEqual(cupoDe(1))
    expect(cupoDe(0)).toEqual({ productos: 5, comodines: 3 })
  })
})

describe('cuándo se ofrece el comodín', () => {
  // Es la regla que sostiene todo el modelo: si el cambio se ofrece siempre, es
  // un "siguiente" gratis y el cupo no limita nada.
  it('no se ofrece con la encuesta sin responder', () => {
    expect(ofreceComodin(ENCUESTA_VACIA, 3)).toBe(false)
  })

  it('no se ofrece cuando el producto estuvo bien', () => {
    expect(ofreceComodin({ anuncios: true, unSoloProducto: true }, 3)).toBe(false)
  })

  it('se ofrece si falla cualquiera de las dos preguntas', () => {
    expect(ofreceComodin({ anuncios: false, unSoloProducto: true }, 3)).toBe(true)
    expect(ofreceComodin({ anuncios: true, unSoloProducto: false }, 3)).toBe(true)
  })

  it('sin cambios restantes no se ofrece aunque haya fallado', () => {
    expect(ofreceComodin({ anuncios: false, unSoloProducto: false }, 0)).toBe(false)
  })
})

describe('encuesta completa', () => {
  it('exige las dos respuestas', () => {
    expect(encuestaCompleta({ anuncios: true, unSoloProducto: null })).toBe(false)
    expect(encuestaCompleta({ anuncios: true, unSoloProducto: false })).toBe(true)
  })
})

describe('entrega del producto', () => {
  const pool = [p('a'), p('b'), p('c')]

  it('nunca devuelve uno ya visto', () => {
    expect(siguienteProducto(pool, ['a', 'b'], () => 0)!.id).toBe('c')
  })

  it('devuelve null cuando el nicho se agotó, en vez de repetir', () => {
    expect(siguienteProducto(pool, ['a', 'b', 'c'])).toBeNull()
  })

  it('elige dentro de los libres, no del pool entero', () => {
    // rnd al tope: sin filtrar por vistos, el índice apuntaría fuera de rango.
    expect(siguienteProducto(pool, ['a'], () => 0.999)!.id).toBe('c')
  })
})
