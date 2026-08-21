// Datos estructurados (spec §22): `<script type="application/ld+json">` con un
// `@type: Product`. Es la señal más fuerte de todo el motor — cuando está, el
// nombre, la marca, el SKU y el precio vienen dichos por la tienda en vez de
// adivinados del HTML.
import type { CheerioAPI } from 'cheerio'

export interface JsonLdProduct {
  name: string | null
  brand: string | null
  sku: string | null
  price: number | null
  currency: string | null
  availability: string | null
  image: string | null
}

const asText = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  // `brand` suele venir como { "@type": "Brand", "name": "X" }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.name === 'string') return o.name.trim() || null
  }
  return null
}

const asPrice = (v: unknown): number | null => {
  const s = asText(v)
  if (!s) return null
  // "1.299,00" (es) y "1,299.00" (en) conviven en el mismo mercado. Se decide
  // por el ÚLTIMO separador: el que está más cerca del final son los decimales.
  const cleaned = s.replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma) normalized = cleaned.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Aplana `@graph` y los arrays sueltos que las tiendas meten en un solo script. */
function* walk(node: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (!node || depth > 6) return
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  const o = node as Record<string, unknown>
  yield o
  if (o['@graph']) yield* walk(o['@graph'], depth + 1)
}

const isProduct = (o: Record<string, unknown>): boolean => {
  const t = o['@type']
  const types = Array.isArray(t) ? t : [t]
  return types.some((x) => typeof x === 'string' && /^(product|productgroup)$/i.test(x))
}

/** Todos los bloques JSON-LD de la página, ya parseados. Ignora los rotos. */
export function jsonLdBlocks($: CheerioAPI): unknown[] {
  const out: unknown[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim()
    if (!raw) return
    try {
      out.push(JSON.parse(raw))
    } catch {
      // Una tienda con un JSON-LD roto no puede tirar el análisis: se ignora ese
      // bloque y se sigue con los demás.
    }
  })
  return out
}

/** El primer `Product` con nombre. null si la página no declara ninguno. */
export function productFromJsonLd($: CheerioAPI): JsonLdProduct | null {
  for (const block of jsonLdBlocks($)) {
    for (const node of walk(block)) {
      if (!isProduct(node)) continue
      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
      const o = (offers ?? {}) as Record<string, unknown>
      const name = asText(node.name)
      if (!name) continue
      return {
        name,
        brand: asText(node.brand),
        sku: asText(node.sku) ?? asText(node.mpn) ?? null,
        price: asPrice(o.price ?? o.lowPrice ?? o.highPrice),
        currency: asText(o.priceCurrency),
        availability: asText(o.availability),
        image: asText(Array.isArray(node.image) ? node.image[0] : node.image),
      }
    }
  }
  return null
}

/** ¿La página declara algún `@type` de servicio? Señal negativa del §20. */
export function hasServiceSchema($: CheerioAPI): boolean {
  for (const block of jsonLdBlocks($)) {
    for (const node of walk(block)) {
      const t = node['@type']
      const types = (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string')
      if (types.some((x) => /^(service|medicalbusiness|dentist|physician|hospital|medicalclinic|healthandbeautybusiness|professionalservice|educationalorganization|course|softwareapplication)$/i.test(x))) {
        return true
      }
    }
  }
  return false
}
