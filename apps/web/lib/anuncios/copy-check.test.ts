import { describe, it, expect } from 'vitest'
import { scaffoldFidelity, FIDELIDAD_MIN, transcribeLaReferencia } from './copy-check'

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

// ⚠️ Medido en una sesión real: la referencia era un antes/después de peso y salud, el producto del
// usuario unas gomitas de creatina para glúteos, y B devolvió "PANZA HINCHADA, INSOMNIO, CANSANCIO,
// ANTOJOS" — el copy de la otra marca, listo para imprimirse en el anuncio del usuario.
describe('transcribeLaReferencia', () => {
  const caso = (text: string, template: string | null, source: string | null) => ({ text, template, source })

  it('caza el slot que devolvió el texto de la referencia tal cual', () => {
    expect(transcribeLaReferencia(caso(
      'PANZA HINCHADA, INSOMNIO, CANSANCIO, ANTOJOS',
      '[PROBLEMAS DE FORMA FÍSICA]',
      'PANZA HINCHADA, INSOMNIO, CANSANCIO, ANTOJOS',
    ))).toBe(true)
  })

  it('deja pasar el relleno de verdad', () => {
    expect(transcribeLaReferencia(caso(
      'GLÚTEOS SIN FORMA, FLACIDEZ, POCO VOLUMEN',
      '[PROBLEMAS DE FORMA FÍSICA]',
      'PANZA HINCHADA, INSOMNIO, CANSANCIO, ANTOJOS',
    ))).toBe(false)
  })

  // ⚠️ La excepción es el slot que el modelo DECLARÓ que se copia tal cual (su template es su
  // propio texto): un CTA pelado. Marcarlo sería un falso positivo que quema un reintento.
  it('no se queja del slot que se copia a propósito', () => {
    expect(transcribeLaReferencia(caso('COMPRAR AHORA', 'COMPRAR AHORA', 'COMPRAR AHORA'))).toBe(false)
  })

  // ⚠️ El hueco que tenía la primera versión de este guard: preguntaba por los corchetes, y el
  // modelo a veces devuelve como template una DESCRIPCIÓN en vez de una plantilla. Sin corchetes
  // el guard se callaba aunque el texto fuera el de la otra marca.
  it('caza la transcripción aunque el template sea una descripción sin corchetes', () => {
    expect(transcribeLaReferencia(caso(
      'PANZA HINCHADA, INSOMNIO',
      'Listado de síntomas negativos contra beneficios positivos',
      'PANZA HINCHADA INSOMNIO',
    ))).toBe(true)
  })

  it('ignora mayúsculas, tildes y puntuación al comparar', () => {
    expect(transcribeLaReferencia(caso('Panza hinchada, insomnio.', '[problema]', 'PANZA HINCHADA INSOMNIO'))).toBe(true)
  })

  // Sesiones guardadas antes de este cambio no tienen `source`: no se puede juzgar, y no se juzga.
  it('sin source no se pronuncia', () => {
    expect(transcribeLaReferencia(caso('lo que sea', '[hueco]', null))).toBe(false)
  })
})
