import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { OfferCopySchema } from './types'

const tier = (over = {}) => ({ label: '2 uds', price: 'S/ 169', cta: 'Lo quiero', featured: false, ...over })

describe('OfferCopySchema — decoy estructural', () => {
  it('acepta una oferta con exactamente un tier featured', () => {
    const ok = OfferCopySchema.safeParse({
      type: 'oferta', headline: 'Oferta',
      tiers: [tier(), tier({ label: '3 uds', price: 'S/ 229', featured: true })],
    })
    expect(ok.success).toBe(true)
  })

  it('rechaza 0 o 2 tiers featured (el .refine)', () => {
    expect(OfferCopySchema.safeParse({ type: 'oferta', headline: 'x', tiers: [tier(), tier()] }).success).toBe(false)
    expect(OfferCopySchema.safeParse({ type: 'oferta', headline: 'x', tiers: [tier({ featured: true }), tier({ featured: true })] }).success).toBe(false)
  })

  it('rechaza menos de 2 tiers', () => {
    expect(OfferCopySchema.safeParse({ type: 'oferta', headline: 'x', tiers: [tier({ featured: true })] }).success).toBe(false)
  })

  it('z.toJSONSchema no tira con el schema refinado (lo usa callStructured)', () => {
    expect(() => z.toJSONSchema(OfferCopySchema)).not.toThrow()
  })
})
