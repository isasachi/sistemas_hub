import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { OfferSchema, OfferGenSchema, OfferCopySchema, resolveOffer } from './types'

const tier = (over = {}) => ({ label: '2 uds', price: 'S/ 169', cta: 'Lo quiero', featured: false, ...over })

describe('OfferSchema — decoy estructural (nivel de sesión, Fase 5)', () => {
  it('acepta una oferta con exactamente un tier featured', () => {
    const ok = OfferSchema.safeParse({
      tiers: [tier(), tier({ label: '3 uds', price: 'S/ 229', featured: true })],
    })
    expect(ok.success).toBe(true)
  })

  it('rechaza 0 o 2 tiers featured (el .refine)', () => {
    expect(OfferSchema.safeParse({ tiers: [tier(), tier()] }).success).toBe(false)
    expect(OfferSchema.safeParse({ tiers: [tier({ featured: true }), tier({ featured: true })] }).success).toBe(false)
  })

  it('rechaza menos de 2 tiers', () => {
    expect(OfferSchema.safeParse({ tiers: [tier({ featured: true })] }).success).toBe(false)
  })

  it('OfferCopySchema ya NO lleva tiers (solo el texto de la sección)', () => {
    const parsed = OfferCopySchema.parse({ kind: 'oferta', headline: 'Oferta', tiers: [tier()] } as unknown as object)
    expect('tiers' in parsed).toBe(false)
  })

  it('z.toJSONSchema no tira con los schemas refinados (los usa callStructured)', () => {
    expect(() => z.toJSONSchema(OfferGenSchema)).not.toThrow()
    expect(() => z.toJSONSchema(OfferSchema)).not.toThrow()
  })
})

describe('resolveOffer — compat de sesiones pre-F5', () => {
  const tiers = [tier(), tier({ label: '3 uds', price: 'S/ 229', featured: true })]

  it('devuelve el offer de la sesión cuando existe', () => {
    const offer = { tiers, urgency: 'Solo hoy' }
    expect(resolveOffer({ offer, offer_copy: null })).toEqual(offer)
  })

  it('cae a los tiers legados guardados en offer_copy (offer null)', () => {
    // ⚠️ `type` a propósito: así se guardó el offer_copy legado, antes del renombre a `kind`.
    // `resolveOffer` lo normaliza al leer, que es lo que este test fija.
    const legacy = { type: 'oferta', headline: 'x', urgency: 'Ya', tiers }
    const got = resolveOffer({ offer: null, offer_copy: legacy as never })
    expect(got?.tiers).toHaveLength(2)
    expect(got?.urgency).toBe('Ya')
  })

  it('null cuando no hay ni offer ni tiers legados', () => {
    expect(resolveOffer({ offer: null, offer_copy: { type: 'oferta', headline: 'x' } as never })).toBeNull()
  })
})
