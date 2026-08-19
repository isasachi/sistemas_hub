import { describe, it, expect } from 'vitest'
import { NICHES, NICHE_DEFAULT, toNiche, isNiche, nicheSpec, NICHE_SPEC } from './niches'

describe('niches', () => {
  // Las filas legadas no tienen `niche`, y la columna nació con default 'suplementos':
  // una sesión anterior a esto tiene que comportarse exactamente como antes.
  it('todo lo desconocido cae en suplementos', () => {
    for (const v of [undefined, null, '', 'ropa2', 42, {}]) expect(toNiche(v)).toBe(NICHE_DEFAULT)
    expect(NICHE_DEFAULT).toBe('suplementos')
    expect(nicheSpec(null).wornProduct).toBe(false)
  })

  it('reconoce los nichos válidos', () => {
    for (const n of NICHES) { expect(isNiche(n)).toBe(true); expect(toNiche(n)).toBe(n) }
    expect(isNiche('perfume')).toBe(false)
  })

  // `wornProduct` es el eje: es lo único que el CÓDIGO consulta. Si un nicho lo tiene,
  // necesita la nota de avatar (el prompt de identidad pide "sin el producto en el
  // encuadre", que para ropa es al revés) — sin ella el eje no hace nada.
  it('todo nicho de producto puesto trae su nota de avatar', () => {
    for (const [n, s] of Object.entries(NICHE_SPEC)) {
      expect(s.wornProduct).toBe(n !== 'suplementos')
      expect(s.avatarNote.length > 0).toBe(s.wornProduct)
      if (s.wornProduct) expect(s.productBlock).toMatch(/LLEVA PUEST[OA]/) // concuerda con el género de la prenda
    }
  })
})
