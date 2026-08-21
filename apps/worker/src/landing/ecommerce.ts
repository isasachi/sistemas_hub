// ecommerce_score (spec §23): suma de señales menos penalizaciones.
import { ECOMMERCE_WEIGHTS, ECOMMERCE_PENALTIES, ECOMMERCE_THRESHOLD } from '../config/scoring'
import type { LandingSignals } from './parse'

export interface EcommerceVerdict {
  score: number
  ecommerce: boolean
  /** Qué sumó y qué restó, para poder explicar el veredicto (spec §49). */
  reasons: string[]
}

export function scoreEcommerce(s: LandingSignals): EcommerceVerdict {
  let score = 0
  const reasons: string[] = []
  const add = (cond: boolean, pts: number, label: string) => {
    if (!cond) return
    score += pts
    reasons.push(`${pts > 0 ? '+' : ''}${pts} ${label}`)
  }

  add(s.hasProductSchema, ECOMMERCE_WEIGHTS.productSchema, 'schema Product')
  add(s.hasPrice, ECOMMERCE_WEIGHTS.price, 'precio')
  add(s.hasAddToCart, ECOMMERCE_WEIGHTS.addToCart, 'agregar al carrito')
  add(s.hasCheckout, ECOMMERCE_WEIGHTS.checkout, 'checkout')
  add(s.hasShipping, ECOMMERCE_WEIGHTS.shipping, 'envío')
  add(s.hasSku, ECOMMERCE_WEIGHTS.sku, 'sku')
  add(s.hasInventory, ECOMMERCE_WEIGHTS.inventory, 'stock')
  add(s.hasProductImages, ECOMMERCE_WEIGHTS.productImages, 'imágenes')

  add(s.hasAppointment, ECOMMERCE_PENALTIES.appointment, 'pide agendar cita')
  add(s.isServicePage, ECOMMERCE_PENALTIES.servicePage, 'página de servicios')
  add(s.isSoftware, ECOMMERCE_PENALTIES.software, 'software/app')

  // Una plataforma de ecommerce detectada es evidencia estructural, no textual:
  // un tema de Shopify con carrito ES una tienda aunque el copy esté en otro
  // idioma y ninguna de las frases matchee.
  if (s.platform && s.hasAddToCart) {
    score += 2
    reasons.push(`+2 plataforma ${s.platform}`)
  }
  // Ficha de producto en una plataforma de ecommerce conocida. Vale tanto como
  // el carrito porque sustituye a la señal que el carrito aporta cuando el tema
  // lo pinta con JS y no se puede ver en el HTML servido (ver parse.ts).
  if (s.platform && s.isProductUrl) {
    score += 4
    reasons.push(`+4 ficha de producto en ${s.platform}`)
  }

  return { score, ecommerce: score >= ECOMMERCE_THRESHOLD, reasons }
}
