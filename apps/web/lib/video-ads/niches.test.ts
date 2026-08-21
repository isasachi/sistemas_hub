import { describe, it, expect } from 'vitest'
import { NICHES, NICHES_ACTIVOS, NICHES_BLOQUEADOS, NICHE_DEFAULT, toNiche, isNiche, nicheSpec, NICHE_SPEC } from './niches'

describe('niches', () => {
  // Las filas legadas no tienen `niche`, y la columna nació con default 'suplementos':
  // una sesión anterior a esto tiene que comportarse exactamente como antes.
  it('todo lo desconocido cae en suplementos', () => {
    for (const v of [undefined, null, '', 'ropa2', 42, {}]) expect(toNiche(v)).toBe(NICHE_DEFAULT)
    expect(NICHE_DEFAULT).toBe('suplementos')
    expect(nicheSpec(null).wornProduct).toBe(false)
  })

  it('reconoce los nichos válidos', () => {
    for (const n of NICHES) expect(isNiche(n)).toBe(true)
    for (const n of NICHES_ACTIVOS) expect(toNiche(n)).toBe(n)
    expect(isNiche('perfume')).toBe(false)
  })

  // El bloqueo: no se ofrecen, y lo que ya esté guardado con ese nicho se RENDERIZA como
  // suplementos — es lo que desvincula el pipeline sin migrar ninguna fila.
  it('un nicho bloqueado no se ofrece y cae en suplementos', () => {
    for (const n of NICHES_BLOQUEADOS) {
      expect(NICHES_ACTIVOS).not.toContain(n)
      expect(toNiche(n)).toBe(NICHE_DEFAULT)
      expect(nicheSpec(n).wornProduct).toBe(false)
    }
    expect(NICHES_ACTIVOS).toContain(NICHE_DEFAULT)
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
