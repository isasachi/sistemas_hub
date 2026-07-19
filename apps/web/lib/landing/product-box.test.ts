import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { buildProductPack } from './product-box'

// Un solo check runnable: el pack de N unidades es más ancho que 1 (compone las N) y no revienta.
describe('buildProductPack', () => {
  it('compone N copias en un canvas más ancho', async () => {
    const one = await sharp({ create: { width: 100, height: 300, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } }).png().toBuffer()
    const pack = await buildProductPack(one, 3)
    const w1 = (await sharp(one).metadata()).width!
    const w3 = (await sharp(pack).metadata()).width!
    expect(w3).toBeGreaterThan(w1) // 3 unidades solapadas > 1
    expect((await sharp(pack).metadata()).height).toBe(900) // resize a H=900
  })
})
