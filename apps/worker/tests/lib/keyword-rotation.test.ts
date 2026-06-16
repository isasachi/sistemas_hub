import { describe, it, expect } from 'vitest'
import { rotateKeywords } from '@/lib/product-hunter/keyword-rotation'

const KW = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] // 10

describe('rotateKeywords', () => {
  it('toma una ventana desde el cursor y avanza', () => {
    const r = rotateKeywords(KW, 0, 4)
    expect(r.selected).toEqual(['a', 'b', 'c', 'd'])
    expect(r.nextCursor).toBe(4)
  })

  it('crons sucesivos cubren keywords distintas', () => {
    const r1 = rotateKeywords(KW, 0, 4)   // a b c d
    const r2 = rotateKeywords(KW, r1.nextCursor, 4) // e f g h
    const r3 = rotateKeywords(KW, r2.nextCursor, 4) // i j a b (wrap)
    expect(r2.selected).toEqual(['e', 'f', 'g', 'h'])
    expect(r3.selected).toEqual(['i', 'j', 'a', 'b'])
    expect(r3.nextCursor).toBe(2) // (8 + 4) % 10
  })

  it('hace wrap-around al final del pool', () => {
    const r = rotateKeywords(KW, 8, 4)
    expect(r.selected).toEqual(['i', 'j', 'a', 'b'])
    expect(r.nextCursor).toBe(2)
  })

  it('pool ≤ ventana → devuelve todo sin rotar (caso seed/re-scrape)', () => {
    const small = ['x', 'y', 'z']
    expect(rotateKeywords(small, 0, 10)).toEqual({ selected: ['x', 'y', 'z'], nextCursor: 0 })
    expect(rotateKeywords(small, 5, 3)).toEqual({ selected: ['x', 'y', 'z'], nextCursor: 0 })
  })

  it('pool vacío no rompe', () => {
    expect(rotateKeywords([], 3, 5)).toEqual({ selected: [], nextCursor: 0 })
  })

  it('normaliza cursor fuera de rango', () => {
    expect(rotateKeywords(KW, 13, 2).selected).toEqual(['d', 'e']) // 13 % 10 = 3
    expect(rotateKeywords(KW, -1, 2).selected).toEqual(['j', 'a']) // -1 → 9
  })
})
