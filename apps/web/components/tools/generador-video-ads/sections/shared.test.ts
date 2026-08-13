import { describe, it, expect } from 'vitest'
import { seg } from './shared'

// `repairCutTiming` reparte las décimas en proporción a la holgura de cada corte, y ese
// reparto es una división: produce 8.399999999999999, no 8.4. Sin formatear, eso llegaba
// tal cual a la pantalla ("Toma 6 · 8.399999999999999s").
describe('seg', () => {
  it('corta la basura de coma flotante del reparto proporcional', () => {
    expect(seg(8.399999999999999)).toBe('8.4s')
    expect(seg(2.8999999999999995)).toBe('2.9s')
    expect(seg(11.900000000000002)).toBe('11.9s')
  })

  it('no muestra decimal cuando la duración es redonda', () => {
    expect(seg(5)).toBe('5s')
    expect(seg(15)).toBe('15s')
    expect(seg(4.999999999999999)).toBe('5s')
  })

  it('redondea a la décima, no más allá', () => {
    expect(seg(6.04)).toBe('6s')
    expect(seg(6.06)).toBe('6.1s')
    expect(seg(0.15)).toBe('0.2s')
  })

  it('sobrevive el cero y los valores diminutos sin notación científica', () => {
    expect(seg(0)).toBe('0s')
    expect(seg(0.01)).toBe('0s')
  })
})
