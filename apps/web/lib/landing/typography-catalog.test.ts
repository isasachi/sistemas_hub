import { describe, it, expect } from 'vitest'
import { TYPE_PAIRS, TypePairId } from './typography-catalog'
import { loadPairFonts } from './fonts'

// Guarda contra el modo de falla #1 de Satori: fuente registrada con nombre/peso que no
// matchea el layout → tofu silencioso, no error. Si un .ttf falta, readFileSync tira acá.
describe('typography-catalog', () => {
  it('carga display+body con pesos 400 y 700 y buffers reales para cada par', () => {
    for (const id of TypePairId.options) {
      const { display, body } = TYPE_PAIRS[id]
      const fonts = loadPairFonts(id)
      const names = new Set(fonts.map((f) => f.name))
      expect(names.has(display)).toBe(true)
      expect(names.has(body)).toBe(true)
      // cada familia registra 400 y 700 (los display heavy-only se aliasean a ambos)
      for (const fam of [display, body]) {
        const w = fonts.filter((f) => f.name === fam).map((f) => f.weight)
        expect(w).toContain(400)
        expect(w).toContain(700)
      }
      // buffers de TTF reales (no vacíos)
      expect(fonts.every((f) => f.data.length > 1000)).toBe(true)
    }
  })
})
