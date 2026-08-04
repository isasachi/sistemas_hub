import { describe, it, expect } from 'vitest'
import { wilson } from '../../scripts/analyze-raw-sample'

// El gate de Wilson decide si un producto recibe rango o queda 'sin verificar'.
// Si el intervalo se calcula mal, la muestra fabrica precisión que no tiene.
describe('intervalo de Wilson', () => {
  it('contiene la proporción observada', () => {
    for (const [k, n] of [[5, 20], [1, 30], [19, 25], [0, 10], [10, 10]]) {
      const [lo, hi] = wilson(k, n)
      expect(lo).toBeLessThanOrEqual(k / n)
      expect(hi).toBeGreaterThanOrEqual(k / n)
    }
  })

  it('se angosta al crecer la muestra — el punto de subir el tope de 25 a 60', () => {
    const ancho = (k: number, n: number) => { const [lo, hi] = wilson(k, n); return hi - lo }
    expect(ancho(30, 60)).toBeLessThan(ancho(12, 25))
    expect(ancho(60, 120)).toBeLessThan(ancho(30, 60))
  })

  it('nunca sale de [0,1], ni en los extremos', () => {
    for (const [k, n] of [[0, 5], [5, 5], [0, 1], [1, 1]]) {
      const [lo, hi] = wilson(k, n)
      expect(lo).toBeGreaterThanOrEqual(0)
      expect(hi).toBeLessThanOrEqual(1)
    }
    expect(wilson(0, 0)).toEqual([0, 1]) // sin muestra, no se sabe nada
  })

  it('en 0/n el techo sigue siendo > 0: cero coincidencias no prueba cero', () => {
    const [lo, hi] = wilson(0, 25)
    expect(lo).toBe(0)
    expect(hi).toBeGreaterThan(0.1)
  })
})

// Corrección por población finita: leer 25 de 40 no deja la misma incertidumbre
// que leer 25 de 6.000. Es lo que hace que el rango 0-50 (cobertura ~44%) sea
// resoluble y el 100+ (1.7%) no.
describe('Wilson con población finita', () => {
  it('se angosta cuando la muestra cubre buena parte de la población', () => {
    const ancho = ([lo, hi]: [number, number]) => hi - lo
    expect(ancho(wilson(12, 25, 1.96, 40))).toBeLessThan(ancho(wilson(12, 25, 1.96, 6000)))
  })

  it('en el censo no queda incertidumbre: el intervalo colapsa al punto', () => {
    expect(wilson(30, 40, 1.96, 40)).toEqual([0.75, 0.75])
    expect(wilson(8, 8, 1.96, 8)).toEqual([1, 1])
  })

  it('sin población se comporta como el Wilson clásico', () => {
    expect(wilson(12, 25, 1.96, 10_000_000)[1] - wilson(12, 25)[1]).toBeCloseTo(0, 3)
  })
})
