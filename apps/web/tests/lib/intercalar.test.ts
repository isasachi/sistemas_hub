import { describe, it, expect } from 'vitest'
import { intercalar, techoAleatorio } from '@ph/shared'

const esV = (x: string) => x.startsWith('v')

describe('intercalar — verificados esparcidos, no amontonados arriba', () => {
  it('uno de cada tres, en las posiciones 3, 6, 9…', () => {
    const xs = ['v0', 'v1', 'v2', 'u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6']
    expect(intercalar(xs, esV, 3)).toEqual(['u0', 'u1', 'v0', 'u2', 'u3', 'v1', 'u4', 'u5', 'v2', 'u6'])
  })

  it('con 50 productos cada página de 10 lleva verificados', () => {
    const xs = [...Array.from({ length: 15 }, (_, i) => `v${i}`), ...Array.from({ length: 35 }, (_, i) => `u${i}`)]
    const out = intercalar(xs, esV, 3)
    for (let p = 0; p < 5; p++) expect(out.slice(p * 10, p * 10 + 10).filter(esV).length).toBeGreaterThanOrEqual(2)
  })

  it('no pierde ni duplica cuando falta uno de los dos grupos', () => {
    expect(intercalar(['v0', 'u0', 'v1', 'v2'], esV, 3)).toEqual(['u0', 'v0', 'v1', 'v2'])
    expect(intercalar(['u0', 'u1', 'u2', 'u3'], esV, 3)).toEqual(['u0', 'u1', 'u2', 'u3'])
  })
})

describe('techoAleatorio — la ventana arranca dentro del rango', () => {
  it('queda dentro de cada rango en los extremos del sorteo', () => {
    for (const u of [0, 0.5, 0.9999]) {
      expect(techoAleatorio('0-50', u)).toBeGreaterThanOrEqual(35)
      expect(techoAleatorio('0-50', u)).toBeLessThan(50)
      expect(techoAleatorio('50-100', u)).toBeGreaterThanOrEqual(60)
      expect(techoAleatorio('50-100', u)).toBeLessThan(100)
      expect(techoAleatorio('100+', u)).toBeGreaterThanOrEqual(120)
      expect(techoAleatorio('100+', u)).toBeLessThanOrEqual(1200)
    }
  })
})
