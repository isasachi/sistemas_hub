import { describe, it, expect } from 'vitest'
import { mismosTextos } from './Section4Copy'

// La guarda avisa cuando las dos tarjetas dicen lo mismo — con las definiciones nuevas, la señal
// de que B no templó. Comparar los ELEMENTOS enteros la mata: A trae `template: null` y B lo
// llena, así que los objetos difieren siempre aunque el texto sea idéntico.
describe('mismosTextos', () => {
  it('mismo texto y distinta plantilla SÍ es la misma copia', () => {
    expect(mismosTextos(
      [{ element: 'headline', text: 'Flacidez que no se va', template: null, source: null }],
      [{ element: 'headline', text: 'Flacidez que no se va', template: '[problema] que no se va', source: null }]
    )).toBe(true)
  })

  it('textos distintos no', () => {
    expect(mismosTextos(
      [{ element: 'headline', text: 'Adiós a la flacidez', template: null, source: null }],
      [{ element: 'headline', text: 'Flacidez que no se va', template: '[problema] que no se va', source: null }]
    )).toBe(false)
  })

  it('distinto número de slots no', () => {
    expect(mismosTextos(
      [{ element: 'headline', text: 'A', template: null, source: null }],
      [
        { element: 'headline', text: 'A', template: null, source: null },
        { element: 'cta', text: 'B', template: null, source: null },
      ]
    )).toBe(false)
  })
})
