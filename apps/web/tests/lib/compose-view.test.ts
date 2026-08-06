import { describe, it, expect } from 'vitest'
import { composeWinnersView, VIEW_SIZE } from '@/lib/product-hunter/compose-view'
import type { ProductCard } from '@ph/shared'

let seq = 0
function card(priority: ProductCard['priority'], score: number): ProductCard {
  return { id: `p${seq++}`, priority, score } as ProductCard
}
function many(priority: ProductCard['priority'], n: number, base = 50): ProductCard[] {
  return Array.from({ length: n }, (_, i) => card(priority, base - i))
}
const count = (ps: ProductCard[], pr: ProductCard['priority']) => ps.filter((p) => p.priority === pr).length

describe('composeWinnersView', () => {
  it('esquema exacto 1/7/2 cuando hay de sobra de cada tier', () => {
    const cards = [...many('alta', 5), ...many('media', 20), ...many('baja', 5)]
    const { products, bestEffort } = composeWinnersView(cards)
    expect(products).toHaveLength(10)
    expect(count(products, 'alta')).toBe(1)
    expect(count(products, 'media')).toBe(7)
    expect(count(products, 'baja')).toBe(2)
    expect(bestEffort).toBe(false)
  })

  it('nunca devuelve más de 10', () => {
    const cards = [...many('alta', 30), ...many('media', 30), ...many('baja', 30)]
    expect(composeWinnersView(cards).products).toHaveLength(VIEW_SIZE)
  })

  it('best-effort: sin alta, promueve el mejor del pool a la slot de alta (y nada más)', () => {
    const cards = [...many('media', 8, 90), ...many('baja', 4, 40)]
    const topScore = Math.max(...cards.map((c) => c.score))
    const { products, bestEffort } = composeWinnersView(cards)
    expect(bestEffort).toBe(true)
    expect(products).toHaveLength(10)
    const alta = products.filter((p) => p.priority === 'alta')
    expect(alta).toHaveLength(1)
    expect(alta[0].score).toBe(topScore)  // el promovido es el de mayor score
    // resto: 7 media + 2 baja (el promovido era una media, no se duplica)
    expect(count(products, 'media')).toBe(7)
    expect(count(products, 'baja')).toBe(2)
  })

  it('no promueve si ya hay alta (bestEffort=false)', () => {
    const cards = [...many('alta', 2), ...many('media', 8), ...many('baja', 3)]
    expect(composeWinnersView(cards).bestEffort).toBe(false)
  })

  it('flex: sin baja, completa hasta 10 con media', () => {
    const cards = [...many('alta', 1), ...many('media', 20)]
    const { products } = composeWinnersView(cards)
    expect(products).toHaveLength(10)
    expect(count(products, 'alta')).toBe(1)
    expect(count(products, 'media')).toBe(9)  // 7 del cupo + 2 del flex (sin baja)
    expect(count(products, 'baja')).toBe(0)
  })

  it('pool chico (<10): muestra todos sin inventar', () => {
    const cards = [...many('alta', 1), ...many('media', 3)]
    expect(composeWinnersView(cards).products).toHaveLength(4)
  })

  it('no duplica el card promovido entre alta y media', () => {
    const cards = many('media', 10, 100)
    const { products } = composeWinnersView(cards)
    const ids = products.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)  // todos únicos
  })

  it('respeta el cupo de 1 alta aunque haya varias (las extra van por flex si falta)', () => {
    const cards = [...many('alta', 3, 90), ...many('media', 2, 50)]
    const { products } = composeWinnersView(cards)
    expect(products).toHaveLength(5)  // 1 alta (cupo) + 2 media + flex 2 alta = 5
    // con media escasa, el flex sube las altas extra
    expect(count(products, 'alta')).toBe(3)
    expect(count(products, 'media')).toBe(2)
  })

  it('pool vacío → vista vacía, sin bestEffort', () => {
    const { products, bestEffort } = composeWinnersView([])
    expect(products).toHaveLength(0)
    expect(bestEffort).toBe(false)
  })
})
