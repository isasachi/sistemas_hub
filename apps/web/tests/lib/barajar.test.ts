import { describe, it, expect } from 'vitest'
import { barajar } from '@ph/shared'

describe('barajar — variedad por consulta sin perder la jerarquía', () => {
  const pool = () => Array.from({ length: 40 }, (_, i) => i)

  it('conserva todos los elementos, no los pierde ni los duplica', () => {
    const out = barajar(pool())
    expect(out).toHaveLength(40)
    expect(new Set(out).size).toBe(40)
  })

  // Es el punto del cambio: dos consultas seguidas no muestran la misma vitrina.
  it('dos barajadas seguidas dan un orden distinto', () => {
    const a = barajar(pool()).join(',')
    const b = barajar(pool()).join(',')
    expect(a).not.toBe(b)
  })

  // ⚠️ Lo que hace que esto sea seguro: se baraja DENTRO de cada nivel. Si se
  // barajara el resultado final, el relleno podría entrar antes que un
  // `monoproducto` verificado y se perdería el orden de calidad que el serving
  // por categoría construye a propósito.
  it('barajar cada nivel por separado conserva el orden entre niveles', () => {
    const verificados = barajar([1, 2, 3])
    const relleno = barajar([10, 11, 12])
    const juntos = [...verificados, ...relleno]
    expect(juntos.slice(0, 3).every((n) => n < 10)).toBe(true)
    expect(juntos.slice(3).every((n) => n >= 10)).toBe(true)
  })

  it('no rompe con listas vacías ni de un solo elemento', () => {
    expect(barajar([])).toEqual([])
    expect(barajar(['solo'])).toEqual(['solo'])
  })
})
