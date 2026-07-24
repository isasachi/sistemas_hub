import { describe, it, expect } from 'vitest'
import { shareBullets } from './copy'

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
