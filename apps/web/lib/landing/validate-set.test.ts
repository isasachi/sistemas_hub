import { describe, it, expect } from 'vitest'
import { validateSet } from './validate-set'
import type { LandingSessionResponse, Offer, TrustBlock, SectionCopy } from './types'

const OFFER: Offer = {
  urgency: 'Solo hoy',
  tiers: [
    { label: '1 Frasco', price: 'S/ 99', priceBefore: 'S/ 169', savingsPct: 41, perUnit: 'S/ 1.1 por cápsula', cta: 'Compra ya', featured: false },
    { label: '3 Frascos', price: 'S/ 199', priceBefore: 'S/ 507', savingsPct: 60, perUnit: 'S/ 0.7 por cápsula', badge: 'Recomendado', cta: 'Compra ya', featured: true },
  ],
}
const TRUST: TrustBlock = {
  codDelivery: true, deliveryTime: '24/48 horas', coverage: ['Perú'],
  paymentMethods: ['yape', 'visa'], guaranteeDays: 30, freeShipping: true,
}

function session(copy: SectionCopy[], over: Partial<LandingSessionResponse> = {}): LandingSessionResponse {
  return { offer: OFFER, offer_copy: null, trust_block: TRUST, copy, ...over } as LandingSessionResponse
}
const sec = (type: SectionCopy['type'], headline: string, extra: Partial<SectionCopy> = {}): SectionCopy => ({ type, headline, ...extra })

describe('validateSet — coherencia cruzada del set', () => {
  it('set coherente → sin issues', () => {
    const s = session([
      sec('hero', 'Llévalo hoy por S/ 199'),
      sec('garantia', 'Paga con Yape · entrega en 48 horas'),
    ])
    expect(validateSet(s)).toEqual([])
  })

  it('R1: un precio fuera de los tiers dispara error (acceptance #1)', () => {
    const s = session([sec('hero', 'Oferta especial: S/ 89 hoy')])
    const issues = validateSet(s)
    expect(issues.some((i) => i.rule === 'price-not-in-tiers' && i.severity === 'error')).toBe(true)
  })

  it('R1: el precio ancla (priceBefore) es un precio válido, no dispara error', () => {
    const s = session([sec('hero', 'Antes S/ 169, hoy S/ 99')])
    expect(validateSet(s).some((i) => i.rule === 'price-not-in-tiers')).toBe(false)
  })

  it('R5: un precio ANCLA suelto (sin "antes") → warning anchor-missing', () => {
    const s = session([sec('oferta', 'El valor real de este pack es S/ 507')]) // 507 = anchor, sin "antes"
    expect(validateSet(s).some((i) => i.rule === 'anchor-missing')).toBe(true)
  })

  it('R5: el precio real destacado (S/ 199) suelto NO se marca (C5.1 lo habilita)', () => {
    const s = session([sec('hero', 'Llévalo hoy por solo S/ 199')])
    expect(validateSet(s).some((i) => i.rule === 'anchor-missing')).toBe(false)
  })

  it('R3: un medio de pago no configurado → warning', () => {
    const s = session([sec('garantia', 'Paga con Plin o Mercado Pago')])
    const rules = validateSet(s).filter((i) => i.rule === 'payment-not-configured').map((i) => i.message)
    expect(rules.join(' ')).toMatch(/plin/)
    expect(rules.join(' ')).toMatch(/mercadopago/)
  })

  it('R3: un medio configurado (yape) no dispara', () => {
    const s = session([sec('garantia', 'Paga con Yape al recibir')])
    expect(validateSet(s).some((i) => i.rule === 'payment-not-configured')).toBe(false)
  })

  it('R4: menciona garantía con guaranteeDays=0 → warning', () => {
    const s = session([sec('garantia', 'Con garantía de devolución')], { trust_block: { ...TRUST, guaranteeDays: 0 } })
    expect(validateSet(s).some((i) => i.rule === 'guarantee-without-days')).toBe(true)
  })

  it('R4: garantía mencionada CON días configurados no dispara', () => {
    const s = session([sec('garantia', 'Garantía de reembolso')])
    expect(validateSet(s).some((i) => i.rule === 'guarantee-without-days')).toBe(false)
  })

  it('R2: un plazo distinto al configurado → warning; uno consistente no', () => {
    expect(validateSet(session([sec('cta-final', 'Te llega en 72 horas')])).some((i) => i.rule === 'delivery-inconsistent')).toBe(true)
    expect(validateSet(session([sec('cta-final', 'Te llega en 48 horas')])).some((i) => i.rule === 'delivery-inconsistent')).toBe(false)
  })

  it('R2: una promesa de resultados en días NO se confunde con el plazo de envío', () => {
    const s = session([sec('beneficios', 'Resultados visibles en 30 días')])
    expect(validateSet(s).some((i) => i.rule === 'delivery-inconsistent')).toBe(false)
  })

  it('sin offer ni trust_block no explota (best-effort)', () => {
    const s = session([sec('hero', 'S/ 999 con Bitcoin')], { offer: null, offer_copy: null, trust_block: null })
    expect(validateSet(s)).toEqual([])
  })
})
