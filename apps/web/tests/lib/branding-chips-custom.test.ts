import { describe, it, expect } from 'vitest'
import { mergeCustom } from '@/components/tools/generador-branding/nuevo/ChipsCustom'

describe('mergeCustom', () => {
  // El bug: recortar al teclear devolvía el valor sin el espacio recién escrito,
  // y como el input es controlado, la barra espaciadora no hacía nada.
  it('conserva el espacio mientras se escribe', () => {
    expect(mergeCustom(['Deportistas'], 'corredores ')).toEqual(['Deportistas', 'corredores '])
    expect(mergeCustom([], 'corredores de trail')).toEqual(['corredores de trail'])
  })

  it('un texto libre vacío no ocupa lugar en el array', () => {
    expect(mergeCustom(['Deportistas'], '')).toEqual(['Deportistas'])
  })
})
