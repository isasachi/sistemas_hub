import { describe, it, expect } from 'vitest'
import { intercalar, techoAleatorio } from '@ph/shared'

const esV = (x: string) => x.startsWith('v')
const lista = (nv: number, nu: number) => [
  ...Array.from({ length: nv }, (_, i) => `v${i}`), ...Array.from({ length: nu }, (_, i) => `u${i}`),
]
const posiciones = (xs: string[]) => xs.map((x, i) => (esV(x) ? i : -1)).filter((i) => i >= 0)

describe('intercalar — verificados esparcidos e irregulares', () => {
  it('cada verificado cae dentro de su tramo: el sorteo decide dónde', () => {
    // 3 verificados en 10 → tramos [0,3) [3,6) [6,10)
    expect(posiciones(intercalar(lista(3, 7), esV, () => 0))).toEqual([0, 3, 6])
    expect(posiciones(intercalar(lista(3, 7), esV, () => 0.999))).toEqual([2, 5, 9])
  })

  it('con 50 productos cada página de 10 lleva verificados, y los saltos no son constantes', () => {
    let irregulares = 0
    for (let tiro = 0; tiro < 20; tiro++) {
      const out = intercalar(lista(15, 35), esV)
      for (let p = 0; p < 5; p++) expect(out.slice(p * 10, p * 10 + 10).filter(esV).length).toBeGreaterThanOrEqual(2)
      const pos = posiciones(out)
      const saltos = new Set(pos.slice(1).map((x, i) => x - pos[i]))
      if (saltos.size > 1) irregulares++
    }
    expect(irregulares).toBeGreaterThan(15)
  })

  it('no pierde ni duplica, falte el grupo que falte', () => {
    for (const [nv, nu] of [[3, 1], [0, 4], [4, 0], [15, 35]]) {
      const xs = lista(nv, nu)
      expect([...intercalar(xs, esV)].sort()).toEqual([...xs].sort())
    }
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
