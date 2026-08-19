import { describe, it, expect } from 'vitest'
import { shareBullets, pinUserPrice } from './copy'

describe('shareBullets (decisión #3)', () => {
  it('hero y cta-final comparten los mismos 4 bullets; beneficios los incluye', () => {
    const secs = [
      { type: 'hero', headline: 'h', bullets: ['a', 'b', 'c', 'd'] },
      { type: 'beneficios', headline: 'b', bullets: ['a', 'b', 'c', 'd', 'e'] },
      { type: 'cta-final', headline: 'c' },
    ] as any
    const out = shareBullets(secs)
    const hero = out.find((s: any) => s.type === 'hero')!.bullets
    const cta = out.find((s: any) => s.type === 'cta-final')!.bullets
    expect(cta).toEqual(hero)
    expect(out.find((s: any) => s.type === 'beneficios')!.bullets!.slice(0, 4)).toEqual(hero)
  })

  it('sin hero, usa beneficios como canónico', () => {
    const secs = [
      { type: 'beneficios', headline: 'b', bullets: ['a', 'b', 'c', 'd', 'e'] },
      { type: 'cta-final', headline: 'c' },
    ] as any
    const out = shareBullets(secs)
    expect(out.find((s: any) => s.type === 'cta-final')!.bullets).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sin bullets en ninguna sección, devuelve las secciones sin tocar', () => {
    const secs = [
      { type: 'hero', headline: 'h' },
      { type: 'cta-final', headline: 'c' },
    ] as any
    const out = shareBullets(secs)
    expect(out).toEqual(secs)
  })

  it('no muta las secciones que no son hero/beneficios/cta-final', () => {
    const secs = [
      { type: 'hero', headline: 'h', bullets: ['a', 'b', 'c', 'd'] },
      { type: 'faq', headline: 'f' },
    ] as any
    const out = shareBullets(secs)
    expect(out.find((s: any) => s.type === 'faq')).toEqual({ type: 'faq', headline: 'f' })
  })
})

import { missingStructure } from './copy'
import type { SectionCopy, SectionType } from './types'

describe('missingStructure (validación de estructura vs ADN)', () => {
  it('detecta arrays cortos y secciones faltantes', () => {
    const copy = [{ type: 'testimonios', headline: 'h' }] as SectionCopy[]
    const gaps = missingStructure(['testimonios', 'faq'] as SectionType[], copy)
    expect(gaps.some((g) => g.includes('testimonios') && g.includes('3 cards'))).toBe(true)
    expect(gaps.some((g) => g.includes('faq') && g.toLowerCase().includes('completa'))).toBe(true)
  })
  it('vacío cuando se cumplen los conteos (post-shareBullets)', () => {
    const copy = [{ type: 'hero', headline: 'h', bullets: ['a', 'b', 'c', 'd'] }] as SectionCopy[]
    expect(missingStructure(['hero'] as SectionType[], copy)).toEqual([])
  })
  it('oferta no exige arrays (tiers vía OfferGenSchema)', () => {
    expect(missingStructure(['oferta'] as SectionType[], [{ type: 'oferta', headline: 'h' }] as SectionCopy[])).toEqual([])
  })
})

import { sectionCopySchema } from './copy'

describe('sectionCopySchema (conteo exacto de arrays por ADN)', () => {
  const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `t${i}`, body: 'b' }))
  it('testimonios exige EXACTAMENTE 3 cards (2 y 4 fallan)', () => {
    const sc = sectionCopySchema('testimonios')
    expect(sc.safeParse({ type: 'testimonios', headline: 'h', cards: cards(3) }).success).toBe(true)
    expect(sc.safeParse({ type: 'testimonios', headline: 'h', cards: cards(2) }).success).toBe(false)
    expect(sc.safeParse({ type: 'testimonios', headline: 'h', cards: cards(4) }).success).toBe(false)
  })
  it('antes-despues exige 4 bullets + 4 bulletsAfter', () => {
    const sc = sectionCopySchema('antes-despues')
    const b4 = ['a', 'b', 'c', 'd']
    expect(sc.safeParse({ type: 'antes-despues', headline: 'h', bullets: b4, bulletsAfter: b4 }).success).toBe(true)
    expect(sc.safeParse({ type: 'antes-despues', headline: 'h', bullets: b4, bulletsAfter: ['a'] }).success).toBe(false)
  })
  it('oferta (sin requires) usa el schema base sin exigir arrays', () => {
    const sc = sectionCopySchema('oferta')
    expect(sc.safeParse({ type: 'oferta', headline: 'h' }).success).toBe(true)
  })
})

// El precio del usuario es un dato, no una sugerencia: el fallo que esto cubre es una landing que
// anuncia una cifra que el vendedor no cobra.
describe('pinUserPrice', () => {
  const tiers = (...p: string[]) =>
    p.map((price, i) => ({ label: `${i + 1}x`, price, priceBefore: 'S/ 300', cta: 'Compra', featured: i === 1 }))

  it('pisa el tier de 1 unidad con el precio del usuario cuando el modelo lo ignoró', () => {
    const out = pinUserPrice({ tiers: tiers('S/ 199', 'S/ 350', 'S/ 450') } as any, 'S/ 89')
    expect(out.tiers[0].price).toBe('S/ 89')
    expect(out.tiers[0].perUnit).toBe('S/ 89 c/u')
    expect(out.tiers.slice(1).map((t) => t.price)).toEqual(['S/ 350', 'S/ 450'])
  })

  it('no toca nada si el modelo ya usó el precio del usuario', () => {
    const base = { tiers: tiers('S/ 119', 'S/ 220', 'S/ 300') } as any
    expect(pinUserPrice(base, '119')).toBe(base)
  })

  it('un ancla que quedó por DEBAJO del precio real se cae (card rota si no)', () => {
    const out = pinUserPrice({ tiers: [{ label: '1x', price: 'S/ 50', priceBefore: 'S/ 70', cta: 'c', featured: true }] } as any, 'S/ 149')
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
