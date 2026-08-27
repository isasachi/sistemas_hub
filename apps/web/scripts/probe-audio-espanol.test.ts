import { describe, it, expect } from 'vitest'
import { cobertura } from './probe-audio-espanol'

/**
 * El probe es lo único que mide si grok pronuncia la locución, así que su métrica tiene que
 * ser confiable — y la primera versión NO lo era. Estos son los pares REALES observados en
 * los renders del 2026-08-27, no casos inventados.
 */
describe('cobertura del audio contra la locución pedida', () => {
  // 31 palabras devueltas literales por grok. El caso feliz existe y hay que fijarlo.
  it('una locución dicha literal da 100 %', () => {
    const t = 'Este suero está cambiando las manchas del acné. Si tú también estás luchando contra las marcas como yo, es momento de empezar a implementar este tipo de productos a tu rutina diaria.'
    expect(cobertura(t, t)).toBe(1)
  })

  // ⚠️ EL CASO QUE ROMPIÓ LAS DOS VERSIONES ANTERIORES DE LA MÉTRICA.
  // Grok dijo "es ESTE suero" donde se pidió "es EL suero" —una palabra de diecisiete— y
  // el transcriptor escribió "La Roche Posay" por "La Roche-Posay" y "antienvejecimiento"
  // por "anti-envejecimiento". El puntero greedy daba 11 % y la LCS por palabra 88 %,
  // sobre una locución que un humano lee como correcta.
  it('una palabra cambiada y dos artefactos de guion no hunden el resultado', () => {
    const pedido = 'Este es el suero anti-envejecimiento de la marca La Roche-Posay y se llama Pure Niacinamide Serum.'
    const dicho = 'Este es este suero antienvejecimiento de la marca La Roche Posay y se llama Pure Niacinamide Serum.'
    expect(cobertura(pedido, dicho)).toBeGreaterThan(0.95)
  })

  // Y la contraparte: tiene que seguir castigando lo que el probe existe para detectar.
  it('una traducción al inglés cae', () => {
    const pedido = 'Este es el suero anti-envejecimiento de la marca La Roche-Posay.'
    expect(cobertura(pedido, 'This is the anti-aging serum from La Roche-Posay.')).toBeLessThan(0.6)
  })

  it('una locución cortada a la mitad cae', () => {
    const pedido = 'Este suero está cambiando las manchas del acné y ya se nota la diferencia en mi piel.'
    expect(cobertura(pedido, 'Este suero está cambiando las manchas del acné')).toBeLessThan(0.6)
  })
})
