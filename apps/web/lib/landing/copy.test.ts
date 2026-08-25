import { describe, it, expect } from 'vitest'
import { shareBullets, pinUserPrice } from './copy'

describe('shareBullets (decisión #3)', () => {
  it('hero y cta-final comparten los mismos 4 bullets; beneficios los incluye', () => {
    const secs = [
      { kind: 'hero', headline: 'h', bullets: ['a', 'b', 'c', 'd'] },
      { kind: 'beneficios', headline: 'b', bullets: ['a', 'b', 'c', 'd', 'e'] },
      { kind: 'cta-final', headline: 'c' },
    ] as any
    const out = shareBullets(secs)
    const hero = out.find((s: any) => s.kind === 'hero')!.bullets
    const cta = out.find((s: any) => s.kind === 'cta-final')!.bullets
    expect(cta).toEqual(hero)
    expect(out.find((s: any) => s.kind === 'beneficios')!.bullets!.slice(0, 4)).toEqual(hero)
  })

  it('sin hero, usa beneficios como canónico', () => {
    const secs = [
      { kind: 'beneficios', headline: 'b', bullets: ['a', 'b', 'c', 'd', 'e'] },
      { kind: 'cta-final', headline: 'c' },
    ] as any
    const out = shareBullets(secs)
    expect(out.find((s: any) => s.kind === 'cta-final')!.bullets).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sin bullets en ninguna sección, devuelve las secciones sin tocar', () => {
    const secs = [
      { kind: 'hero', headline: 'h' },
      { kind: 'cta-final', headline: 'c' },
    ] as any
    const out = shareBullets(secs)
    expect(out).toEqual(secs)
  })

  it('no muta las secciones que no son hero/beneficios/cta-final', () => {
    const secs = [
      { kind: 'hero', headline: 'h', bullets: ['a', 'b', 'c', 'd'] },
      { kind: 'faq', headline: 'f' },
    ] as any
    const out = shareBullets(secs)
    expect(out.find((s: any) => s.kind === 'faq')).toEqual({ kind: 'faq', headline: 'f' })
  })
})

import { missingStructure } from './copy'
import type { SectionCopy, SectionType } from './types'

describe('missingStructure (validación de estructura vs ADN)', () => {
  it('detecta arrays cortos y secciones faltantes', () => {
    const copy = [{ kind: 'testimonios', headline: 'h' }] as SectionCopy[]
    const gaps = missingStructure(['testimonios', 'faq'] as SectionType[], copy)
    expect(gaps.some((g) => g.includes('testimonios') && g.includes('3 cards'))).toBe(true)
    expect(gaps.some((g) => g.includes('faq') && g.toLowerCase().includes('completa'))).toBe(true)
  })
  it('vacío cuando se cumplen los conteos (post-shareBullets)', () => {
    const copy = [{ kind: 'hero', headline: 'h', bullets: ['a', 'b', 'c', 'd'] }] as SectionCopy[]
    expect(missingStructure(['hero'] as SectionType[], copy)).toEqual([])
  })
  it('oferta no exige arrays (tiers vía OfferGenSchema)', () => {
    expect(missingStructure(['oferta'] as SectionType[], [{ kind: 'oferta', headline: 'h' }] as SectionCopy[])).toEqual([])
  })
})

import { sectionCopySchema } from './copy'

describe('sectionCopySchema (conteo exacto de arrays por ADN)', () => {
  const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `t${i}`, body: 'b' }))
  it('testimonios exige EXACTAMENTE 3 cards (2 y 4 fallan)', () => {
    const sc = sectionCopySchema('testimonios')
    expect(sc.safeParse({ kind: 'testimonios', headline: 'h', cards: cards(3) }).success).toBe(true)
    expect(sc.safeParse({ kind: 'testimonios', headline: 'h', cards: cards(2) }).success).toBe(false)
    expect(sc.safeParse({ kind: 'testimonios', headline: 'h', cards: cards(4) }).success).toBe(false)
  })
  it('antes-despues exige 4 bullets + 4 bulletsAfter', () => {
    const sc = sectionCopySchema('antes-despues')
    const b4 = ['a', 'b', 'c', 'd']
    expect(sc.safeParse({ kind: 'antes-despues', headline: 'h', bullets: b4, bulletsAfter: b4 }).success).toBe(true)
    expect(sc.safeParse({ kind: 'antes-despues', headline: 'h', bullets: b4, bulletsAfter: ['a'] }).success).toBe(false)
  })
  it('oferta (sin requires) usa el schema base sin exigir arrays', () => {
    const sc = sectionCopySchema('oferta')
    expect(sc.safeParse({ kind: 'oferta', headline: 'h' }).success).toBe(true)
  })
})

// El precio del usuario es un dato, no una sugerencia: el fallo que esto cubre es una landing que
// anuncia una cifra que el vendedor no cobra.
describe('pinUserPrice', () => {
  const tiers = (...p: string[]) =>
    p.map((price, i) => ({ label: `${i + 1}x`, price, priceBefore: 'S/ 300', perUnit: 'S/ 60 c/u', cta: 'Compra', featured: i === 1 }))

  it('reescala la ESCALERA ENTERA al precio del usuario (pisar un tier suelto invierte el descuento)', () => {
    const out = pinUserPrice({ tiers: tiers('S/ 199', 'S/ 350', 'S/ 450') } as any, 'S/ 89')
    // ratio = 89/199 ≈ 0.447
    expect(out.tiers.map((t) => t.price)).toEqual(['S/ 89', 'S/ 157', 'S/ 201'])
    // el volumen sigue siendo un descuento, no un castigo
    const unit = out.tiers.map((t, i) => (parseFloat(t.price.slice(2)) / (i + 1)))
    expect(unit[1]).toBeLessThan(unit[0])
    expect(unit[2]).toBeLessThan(unit[1])
    // ⚠️ EL perUnit SE DERIVA DEL PRECIO, y esta aserción fijaba el bug: escalando el string del
    // modelo (S/ 60 c/u × 0.447) daba "S/ 27 c/u" para un tier de UNA unidad que cuesta S/ 89 —
    // el precio por unidad de una sola unidad ES el precio. Ahora sale de price/cantidad.
    expect(out.tiers[0].perUnit).toBe('S/ 89 c/u')
    expect(out.tiers[1].perUnit).toBe('S/ 78.50 c/u')  // 157 / 2
    expect(out.tiers[2].perUnit).toBe('S/ 67 c/u')     // 201 / 3
  })

  // ⚠️ UN CENTAVO SE PERDÍA EN LA FUNCIÓN QUE EXISTE PARA NO PERDERLO. `scalePrice` redondea a
  // entero todo lo que pase de 10, así que "S/ 89.90" sobre una oferta de S/ 89 salía como S/ 90:
  // una landing anunciando una cifra que el vendedor no cobra, que es exactamente el fallo que
  // `pinUserPrice` vino a evitar.
  it('el precio del usuario se escribe EXACTO, con sus decimales', () => {
    const out = pinUserPrice({ tiers: tiers('S/ 89', 'S/ 159', 'S/ 219') } as any, 'S/ 89.90')
    expect(out.tiers[0].price).toBe('S/ 89.90')
    expect(out.tiers[0].perUnit).toBe('S/ 89.90 c/u')
    // el resto de la escalera sí se redondea: los precios en soles son enteros
    expect(out.tiers[1].price).toBe('S/ 161')
  })

  // La card tiene que CERRAR: es la cuenta que un comprador hace a mano.
  it('precio y precio-por-unidad no pueden contar historias distintas', () => {
    const out = pinUserPrice({ tiers: tiers('S/ 89', 'S/ 159', 'S/ 219') } as any, 'S/ 129')
    for (const [i, t] of out.tiers.entries()) {
      const precio = parseFloat(t.price.replace(/[^\d.]/g, ''))
      const unidad = parseFloat(t.perUnit!.replace(/[^\d.]/g, ''))
      expect(unidad).toBeCloseTo(precio / (i + 1), 2)
    }
  })

  // Un perUnit que NO es por-pack (la cantidad del label no cuenta cápsulas) se escala como antes.
  it('no reescribe un perUnit que mide otra cosa ("por cápsula")', () => {
    const out = pinUserPrice(
      { tiers: [{ label: '1 Frasco', price: 'S/ 100', perUnit: 'S/ 1.20 por cápsula', cta: 'c', featured: true }] } as any,
      'S/ 50',
    )
    expect(out.tiers[0].price).toBe('S/ 50')
    expect(out.tiers[0].perUnit).toBe('S/ 0.6 por cápsula')  // escalado, no derivado
  })

  it('no toca nada si el modelo ya usó el precio del usuario', () => {
    const base = { tiers: tiers('S/ 119', 'S/ 220', 'S/ 300') } as any
    expect(pinUserPrice(base, '119')).toBe(base)
  })

  it('un ancla que no quedó por encima del precio se cae (card rota si no)', () => {
    const out = pinUserPrice({ tiers: [{ label: '1x', price: 'S/ 50', priceBefore: 'S/ 40', cta: 'c', featured: true }] } as any, 'S/ 149')
    expect(out.tiers[0].price).toBe('S/ 149')
    expect(out.tiers[0].priceBefore).toBeUndefined()
  })

  it('con cero o varios números no adivina: deja el precio del modelo', () => {
    const base = { tiers: tiers('S/ 199', 'S/ 350', 'S/ 450') } as any
    expect(pinUserPrice(base, '')).toBe(base)
    expect(pinUserPrice(base, '1xS/89  2xS/169  3xS/199')).toBe(base)
    expect(pinUserPrice(base, 'S/89 · Envío gratis · 2x1')).toBe(base)
  })
})
