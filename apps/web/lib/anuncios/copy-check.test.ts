import { describe, it, expect } from 'vitest'
import { scaffoldFidelity, FIDELIDAD_MIN } from './copy-check'

describe('scaffoldFidelity', () => {
  it('el relleno del hueco conserva el andamiaje entero', () => {
    expect(scaffoldFidelity('[problema común] que no se va', 'Flacidez que no se va')).toBe(1)
  })

  it('una reescritura libre no pasa el piso', () => {
    const f = scaffoldFidelity('[problema] que no se va', 'Mira cómo se derrite la grasa')!
    expect(f).toBeLessThan(FIDELIDAD_MIN)
  })

  it('neutralizar el voseo NO se lee como pérdida de plantilla', () => {
    const f = scaffoldFidelity(
      'Si sos de las que [problema], esto es para vos',
      'Si eres de las que sufre flacidez, esto es para ti'
    )!
    expect(f).toBeGreaterThanOrEqual(FIDELIDAD_MIN)
  })

  it('un slot sin huecos se copia entero', () => {
    expect(scaffoldFidelity('COMPRAR AHORA MISMO', 'Comprar ahora mismo')).toBe(1)
  })

  it('sin andamiaje medible devuelve null', () => {
    expect(scaffoldFidelity('[titular]', 'Adiós a la flacidez')).toBeNull()
    expect(scaffoldFidelity('[problema] ya', 'Flacidez ya')).toBeNull()
  })

  it('ignora tildes y puntuación', () => {
    expect(scaffoldFidelity('[X], ¿por qué no se va?', 'Flacidez, por que no se va')).toBe(1)
  })
})
