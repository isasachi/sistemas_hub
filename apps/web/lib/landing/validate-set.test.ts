import { describe, it, expect } from 'vitest'
import { validateSet } from './validate-set'
import { derivePalette } from './palette-derive'
import type { LandingSessionResponse, Offer, TrustBlock, SectionCopy, LandingDna } from './types'

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
  return { offer: OFFER, offer_copy: null, trust_block: TRUST, copy, landing_dna: null, ...over } as LandingSessionResponse
}
const sec = (type: SectionCopy['type'], headline: string, extra: Partial<SectionCopy> = {}): SectionCopy => ({ type, headline, ...extra })

// Fixture de ADN: paleta derivada por fórmula (garantiza contraste ≥7:1 — QA#8) salvo que un
// test la pise a mano para probar el caso "hand-edited" que R8 debe atrapar.
const VALID_PALETTE = derivePalette({ h: 210, s: 40, l: 45 })
function dna(poses: Record<string, string>, palette = VALID_PALETTE): LandingDna {
  return {
    brand_base: { hex: '#2255AA', h: 210, s: 40, l: 45 },
    palette,
    particle_type: 'polvo suspendido',
    particle_density: 'low',
    props: ['frasco'],
    font_family: 'Poppins',
    font_accent: null,
    halo: 'none',
    model_persona: 'mujer 30-45',
    poses,
  }
}

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

  it('R6: menciona contraentrega con codDelivery=false → warning (acceptance #3)', () => {
    const s = session([sec('hero', 'Pago contraentrega en todo el país')], { trust_block: { ...TRUST, codDelivery: false } })
    expect(validateSet(s).some((i) => i.rule === 'cod-not-offered')).toBe(true)
  })

  it('R6: con contraentrega activa, mencionarla no dispara', () => {
    const s = session([sec('garantia', 'Pagas al recibir, contraentrega')])
    expect(validateSet(s).some((i) => i.rule === 'cod-not-offered')).toBe(false)
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

  describe('R7: unicidad de pose (QA#6)', () => {
    it('pose repetida entre dos secciones → error pose-duplicate', () => {
      const s = session([sec('hero', 'Título'), sec('beneficios', 'Beneficios')], {
        landing_dna: dna({ hero: 'de pie, mirando a cámara', beneficios: 'de pie, mirando a cámara' }),
      })
      const issues = validateSet(s)
      expect(issues.some((i) => i.rule === 'pose-duplicate' && i.severity === 'error')).toBe(true)
      expect(issues.find((i) => i.rule === 'pose-duplicate')?.message).toMatch(/hero/)
      expect(issues.find((i) => i.rule === 'pose-duplicate')?.message).toMatch(/beneficios/)
    })

    it('todas las poses vacías (no_talent) no dispara falso positivo', () => {
      const s = session([sec('hero', 'Título'), sec('beneficios', 'Beneficios')], {
        landing_dna: dna({ hero: '', beneficios: '' }),
      })
      expect(validateSet(s).some((i) => i.rule === 'pose-duplicate')).toBe(false)
    })

    it('poses únicas no dispara', () => {
      const s = session([sec('hero', 'Título'), sec('beneficios', 'Beneficios')], {
        landing_dna: dna({ hero: 'de pie, mirando a cámara', beneficios: 'sentada, sonriendo' }),
      })
      expect(validateSet(s).some((i) => i.rule === 'pose-duplicate')).toBe(false)
    })

    it('sin landing_dna (sesión legada) no explota', () => {
      const s = session([sec('hero', 'Título')], { landing_dna: null })
      expect(validateSet(s).some((i) => i.rule === 'pose-duplicate')).toBe(false)
    })
  })

  describe('R8: contraste headline/fondo (QA#8)', () => {
    it('paleta derivada por fórmula (≥7:1) no dispara', () => {
      const s = session([sec('hero', 'Título')], { landing_dna: dna({ hero: 'de pie' }) })
      expect(validateSet(s).some((i) => i.rule === 'contrast-low')).toBe(false)
    })

    it('paleta editada a mano con bajo contraste → error contrast-low', () => {
      // Titular claro sobre fondo claro: contraste bajo a propósito.
      const badPalette = { ...VALID_PALETTE, color_headline: '#EEEEEE', bg_start: '#F5F5F5' }
      const s = session([sec('hero', 'Título')], { landing_dna: dna({ hero: 'de pie' }, badPalette) })
      const issues = validateSet(s)
      expect(issues.some((i) => i.rule === 'contrast-low' && i.severity === 'error')).toBe(true)
      expect(issues.find((i) => i.rule === 'contrast-low')?.message).toMatch(/7:1/)
    })
  })
})
