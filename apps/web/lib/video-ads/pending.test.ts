import { describe, it, expect } from 'vitest'
import { extractPending } from './pending'

// El guión es el caso real que motivó esto: gomitas quemagrasa rellenando una plantilla
// sacada de un video sobre dolor menstrual.
const GUION =
  'A mí me llega con gomitas para quemar grasa, [Mecanismo], [Objeción] y no, que esto ' +
  'me pase todos los meses no significa que deba normalizarlo. Yo me estoy comiendo ' +
  '[Cantidad] al día.'

describe('extractPending', () => {
  const REAL =
    'Este suero de la marca [PENDIENTE: marca] contiene [PENDIENTE: ingrediente 1], ' +
    '[PENDIENTE: ingrediente 2] y [PENDIENTE: ingrediente 3], nos da un ' +
    '[PENDIENTE: resultado] y me dio este [PENDIENTE: resultado] increíble.'

  it('saca los marcadores del texto, en orden de aparición', () => {
    expect(extractPending(REAL).slice(0, 2)).toEqual(['[PENDIENTE: marca]', '[PENDIENTE: ingrediente 1]'])
  })

  it('colapsa los repetidos: el mismo nombre es el mismo dato', () => {
    const r = extractPending(REAL)
    expect(r.filter((x) => x.includes('resultado'))).toHaveLength(1)
    expect(r).toHaveLength(5)
  })

  it('un guión ya completo no tiene pendientes', () => {
    expect(extractPending('Este suero de niacinamida me cambió la piel.')).toEqual([])
  })

  it('ignora corchetes que no son marcadores', () => {
    expect(extractPending('Dijo [riéndose] que sí y usó [PENDIENTE: modo de uso].'))
      .toEqual(['[PENDIENTE: modo de uso]'])
  })
})
