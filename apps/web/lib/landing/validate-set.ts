import { resolveOffer, type LandingSessionResponse, type SectionType, type SectionCopy, type PaymentMethod } from './types'
import { contrastRatio } from '@/lib/branding/contrast'

// Fase 5 C5.4 — validador CRUZADO del set completo. Función PURA sobre la sesión: detecta las
// incoherencias entre secciones que el prompt no puede evitar (el bug real del ADN CLEARSTEM: un
// precio inflado en una pieza, un plazo distinto en otra). Se corre tras generar el copy y sus
// issues se muestran en el gate de aprobación (no bloquean; el usuario decide). La oferta y el
// TrustBlock son la fuente de verdad; el copy libre de las secciones se contrasta contra ellos.

export type SetIssueSeverity = 'error' | 'warning'
export type SetIssueRule =
  | 'price-not-in-tiers'
  | 'anchor-missing'
  | 'payment-not-configured'
  | 'guarantee-without-days'
  | 'delivery-inconsistent'
  | 'cod-not-offered'
  | 'pose-duplicate'
  | 'contrast-low'

export interface SetIssue {
  rule: SetIssueRule
  severity: SetIssueSeverity
  section?: SectionType
  message: string
}

// Precio en soles: "S/ 199", "S/.199", "S/199", "S/ 0.7". Normaliza a "s/199" para comparar.
const PRICE_RE = /S\/\.?\s?\d[\d.,]*/gi
function normPrice(s: string): string {
  return s.toLowerCase().replace(/\s/g, '').replace('s/.', 's/').replace(/[.,]+$/, '')
}

// Plazo de entrega en HORAS ("24/48 horas", "48 h"). Solo horas a propósito: los "30 días" de una
// promesa de resultados NO son un plazo de envío — restringir a horas mata ese falso positivo.
// ponytail: envíos expresados en días quedan sin chequear (raro; el canónico del ADN es horas).
const DELIVERY_RE = /\b\d+(?:\/\d+)?\s?(?:h|hrs?|horas)\b/gi
const timeNums = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number)

const GUARANTEE_RE = /garant[ií]a|reembolso|devoluci[oó]n|money.?back/i
const COD_RE = /contra\s?entrega|pag[ao]s? al recibir|pago contra/i
// Marca que enmarca un precio como ancla ("Antes: S/ 169", "precio regular"). Si el valor ancla
// aparece SIN esta marca, se lee como precio real → el bug del ADN (mostrar el inflado como si valiera).
const ANCHOR_FRAME_RE = /\bantes\b|\bregular\b|\bnormal\b|\bbefore\b/i
const PAYMENT_KEYWORDS: Record<PaymentMethod, RegExp> = {
  yape:          /\byape\b/i,
  plin:          /\bplin\b/i,
  mercadopago:   /\bmercado\s?pago\b/i,
  visa:          /\bvisa\b/i,
  mastercard:    /\bmastercard\b/i,
  efectivo:      /\befectivo\b/i,
  transferencia: /\btransferencia\b/i,
}

// Todo el texto libre de una sección (los campos que el LLM llena) en un solo string.
function sectionText(c: SectionCopy): string {
  return [
    c.headline,
    c.subheadline,
    ...(c.bullets ?? []),
    ...((c.cards ?? []).flatMap((cd) => [cd.title, cd.body])),
    c.cta,
  ].filter(Boolean).join('  ')
}

export function validateSet(session: Pick<LandingSessionResponse, 'offer' | 'offer_copy' | 'trust_block' | 'copy' | 'landing_dna'>): SetIssue[] {
  const issues: SetIssue[] = []
  const offer = resolveOffer(session)
  const trust = session.trust_block
  const copies = session.copy ?? []
  const dna = session.landing_dna

  // Precios válidos = todos los que aparecen en los tiers (precio, ancla y costo/unidad).
  const tierPrices = new Set<string>()
  const anchors: { price: string; before: string }[] = []
  if (offer) {
    for (const t of offer.tiers) {
      tierPrices.add(normPrice(t.price))
      if (t.priceBefore) {
        tierPrices.add(normPrice(t.priceBefore))
        anchors.push({ price: normPrice(t.price), before: normPrice(t.priceBefore) })
      }
      for (const m of t.perUnit?.match(PRICE_RE) ?? []) tierPrices.add(normPrice(m))
    }
  }

  for (const c of copies) {
    const text = sectionText(c)
    const low = text.toLowerCase()
    const prices = (text.match(PRICE_RE) ?? [])
    const normd = prices.map(normPrice)

    if (offer) {
      // R1: todo precio mencionado existe en los tiers.
      for (const m of prices) {
        if (!tierPrices.has(normPrice(m)))
          issues.push({ rule: 'price-not-in-tiers', severity: 'error', section: c.type, message: `La sección "${c.type}" menciona el precio ${m.trim()}, que no existe en los tiers de la oferta.` })
      }
      // R5: un precio ANCLA (priceBefore) mostrado sin enmarcarlo como "antes" se lee como precio
      // real → el bug del ADN (el inflado aparece suelto en otra pieza). El precio real de un tier
      // sí puede referenciarse suelto (C5.1 lo habilita para hero/cta-final); el ancla no.
      for (const a of anchors) {
        if (normd.includes(a.before) && !ANCHOR_FRAME_RE.test(low)) {
          issues.push({ rule: 'anchor-missing', severity: 'warning', section: c.type, message: `La sección "${c.type}" muestra un precio ancla ("antes") sin marcarlo como tal — se leería como precio real y contradice el descuento de la oferta.` })
          break
        }
      }
    }

    if (trust) {
      // R3: ningún medio de pago fuera del TrustBlock.
      const allowed = new Set(trust.paymentMethods)
      for (const [method, re] of Object.entries(PAYMENT_KEYWORDS) as [PaymentMethod, RegExp][]) {
        if (re.test(low) && !allowed.has(method))
          issues.push({ rule: 'payment-not-configured', severity: 'warning', section: c.type, message: `La sección "${c.type}" menciona "${method}", que no está en los medios de pago configurados.` })
      }
      // R4: no mencionar garantía si no hay días de garantía.
      if (!trust.guaranteeDays && GUARANTEE_RE.test(low))
        issues.push({ rule: 'guarantee-without-days', severity: 'warning', section: c.type, message: `La sección "${c.type}" menciona garantía/reembolso, pero no configuraste una garantía (días = 0).` })
      // R6: no prometer contraentrega si no la ofreces (acceptance #3).
      if (!trust.codDelivery && COD_RE.test(low))
        issues.push({ rule: 'cod-not-offered', severity: 'warning', section: c.type, message: `La sección "${c.type}" menciona pago contraentrega, pero no lo ofreces (contraentrega desactivada).` })
      // R2: el plazo de entrega es el mismo en toda sección que lo mencione.
      if (trust.deliveryTime) {
        const allowedNums = new Set(timeNums(trust.deliveryTime))
        for (const m of text.match(DELIVERY_RE) ?? []) {
          const nums = timeNums(m)
          if (nums.length && !nums.every((n) => allowedNums.has(n)))
            issues.push({ rule: 'delivery-inconsistent', severity: 'warning', section: c.type, message: `La sección "${c.type}" menciona un plazo ("${m.trim()}") distinto al configurado ("${trust.deliveryTime}").` })
        }
      }
    }
  }

  // R7 (QA#6): ninguna pose se repite entre secciones. `poses` es parcial (solo secciones
  // elegidas) y el valor vacío ("") marca no_talent — se excluye para no fabricar un falso
  // positivo (todas las secciones "sin persona" comparten el string vacío).
  if (dna) {
    const bySection = Object.entries(dna.poses).filter(([, pose]) => pose.trim() !== '')
    const seen = new Map<string, SectionType[]>()
    for (const [section, pose] of bySection) {
      const list = seen.get(pose) ?? []
      list.push(section as SectionType)
      seen.set(pose, list)
    }
    for (const [pose, sections] of seen) {
      if (sections.length > 1)
        issues.push({ rule: 'pose-duplicate', severity: 'error', message: `Las secciones ${sections.join(', ')} repiten la misma pose ("${pose}") — cada sección debe tener una pose única.` })
    }

    // R8 (QA#8): contraste headline/fondo. derivePalette garantiza ≥7:1 — si esto dispara, el
    // ADN fue editado a mano fuera de la fórmula.
    const ratio = contrastRatio(dna.palette.color_headline, dna.palette.bg_start)
    if (ratio < 7)
      issues.push({ rule: 'contrast-low', severity: 'error', message: `El contraste entre el color de titular (${dna.palette.color_headline}) y el fondo (${dna.palette.bg_start}) es ${ratio.toFixed(2)}:1, menor al mínimo de 7:1.` })
  }

  return issues
}
