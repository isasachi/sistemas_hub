import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { correccionDeLargo, sliceToWord, stringsEnElTope } from './llm-clamp'

// ⚠️ EL CASO MEDIDO EN UNA LANDING REAL. El titular de cierre traía tres frases y el recorte lo
// dejó en exactamente 90 caracteres —el tope del schema— terminando en "Hazlo 5": entero como
// palabra, sin sentido como frase, e impreso dentro de la imagen.
describe('sliceToWord', () => {
  const TITULAR = 'Snacks blandos que encantan a tu perro. Un placer saludable para su día a día. Hazlo 5 veces al día.'

  it('tira la frase incompleta entera en vez de dejar un muñón', () => {
    const out = sliceToWord(TITULAR, 90)
    expect(out).toBe('Snacks blandos que encantan a tu perro. Un placer saludable para su día a día.')
    expect(out).not.toMatch(/Hazlo/)
  })

  it('sin ningún fin de frase cae al límite de palabra, como antes', () => {
    expect(sliceToWord('palabra '.repeat(20).trim(), 30)).toBe('palabra palabra palabra')
  })

  it('no toca lo que ya entra', () => {
    expect(sliceToWord('corto y completo', 90)).toBe('corto y completo')
  })

  // El fin de frase solo manda si queda pasada la mitad del cupo: si no, se perdería casi todo.
  it('ignora un punto demasiado temprano', () => {
    const out = sliceToWord('Ya. Una frase larga que sigue y sigue sin puntuación alguna', 40)
    expect(out).not.toBe('Ya.')
    expect(out.length).toBeLessThanOrEqual(40)
  })
})

describe('stringsEnElTope', () => {
  const esquema = {
    type: 'object',
    properties: {
      headline: { type: 'string', maxLength: 90 },
      bullets: { type: 'array', items: { type: 'string', maxLength: 20 } },
      cards: { type: 'array', items: { type: 'object', properties: { body: { type: 'string', maxLength: 10 } } } },
    },
  }

  // OpenAI aplica los maxLength al decodificar: el texto llega CORTADO y exactamente en el tope,
  // así que zod lo acepta y nada lo ve. Ése es el caso real de producción.
  it('marca el string que aterriza EXACTO en su tope', () => {
    expect(stringsEnElTope({ headline: 'x'.repeat(90) }, esquema)).toEqual(['headline'])
  })

  it('no marca el que queda por debajo', () => {
    expect(stringsEnElTope({ headline: 'x'.repeat(89) }, esquema)).toEqual([])
  })

  it('entra en arrays y en objetos anidados', () => {
    const obj = { bullets: ['ok', 'y'.repeat(20)], cards: [{ body: 'z'.repeat(10) }] }
    expect(stringsEnElTope(obj, esquema)).toEqual(['bullets.1', 'cards.0.body'])
  })

  it('ignora las claves que el schema no declara', () => {
    expect(stringsEnElTope({ otro: 'x'.repeat(90) }, esquema)).toEqual([])
  })
})

describe('correccionDeLargo', () => {
  it('nombra el campo y su tope', () => {
    const r = z.object({ h: z.string().max(5) }).safeParse({ h: 'demasiado largo' })
    expect(correccionDeLargo(r.error!)).toContain('"h": máximo 5 caracteres')
  })

  // Reintentar con la misma orden es lo correcto cuando el fallo no es de largo.
  it('devuelve null si no hay ningún too_big', () => {
    const r = z.object({ h: z.string() }).safeParse({ h: 7 })
    expect(correccionDeLargo(r.error!)).toBeNull()
  })
})

describe('sliceToWord con titulares multilínea', () => {
  // El ADN pide "headline: 3 líneas" y llegan como líneas SIN punto: sin tratar el salto como
  // límite, el recorte dejaba el muñón "¡No te quedes a".
  it('corta en el salto de línea aunque no haya puntuación', () => {
    const t = 'Mima a tu mejor amigo con snacks deliciosos\nPara perros pequeños y felices\n¡No te quedes atrás!'
    expect(sliceToWord(t, 90)).toBe('Mima a tu mejor amigo con snacks deliciosos\nPara perros pequeños y felices')
  })
})
