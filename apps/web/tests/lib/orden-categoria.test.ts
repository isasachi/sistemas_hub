import { describe, it, expect } from 'vitest'
import { ordenCategoria } from '@ph/shared'

describe('ordenCategoria — cupo del 30 % para verificados', () => {
  const v = Array.from({ length: 40 }, (_, i) => `v${i}`)
  const r = Array.from({ length: 800 }, (_, i) => `r${i}`)

  it('con relleno de sobra, los verificados ocupan el 30 % de la página', () => {
    for (const limit of [10, 20, 50]) {
      const page = ordenCategoria(v, r, limit).slice(0, limit)
      expect(page.filter((x) => x.startsWith('v'))).toHaveLength(Math.round(limit * 0.3))
    }
  })

  it('si el relleno no alcanza, los verificados sobrantes completan la página', () => {
    const page = ordenCategoria(v, r.slice(0, 2), 10).slice(0, 10)
    expect(page).toEqual(['v0', 'v1', 'v2', 'r0', 'r1', 'v3', 'v4', 'v5', 'v6', 'v7'])
  })
})
