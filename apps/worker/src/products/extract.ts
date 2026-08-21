// Del anuncio + su landing al producto (spec §25).
//
// La jerarquía de fuentes NO es arbitraria: primero lo que declara la tienda
// (JSON-LD), después lo estructural (canonical, og:title, h1), y el título del
// anuncio al final — es copy publicitario, la fuente menos fiable para saber qué
// se vende.
import { createHash } from 'node:crypto'
import type { LandingSignals } from '../landing/parse'
import { canonicalizeName, normalizeName } from './canonicalize'
import { normalizeUrl, domainOf } from '../normalization/url'

export interface ProductCandidate {
  canonicalName: string | null
  normalizedName: string | null
  brand: string | null
  sku: string | null
  price: number | null
  currency: string | null
  canonicalUrl: string | null
  domain: string | null
  productType: string | null
  /** De dónde salió el nombre — explica el veredicto y calibra la confianza. */
  source: 'json-ld' | 'canonical-title' | 'og-title' | 'h1' | 'ad-headline' | 'none'
  confidence: number
}

// Tipos de producto reconocibles por palabra. No es un clasificador: solo rotula
// cuando la palabra aparece, y `null` es una respuesta perfectamente válida.
const TIPOS: [RegExp, string][] = [
  [/\b(crema|gel|serum|s[ée]rum|loci[óo]n|ung[üu]ento|b[áa]lsamo|pomada)\b/i, 'topico'],
  [/\b(c[áa]psulas?|tabletas?|pastillas?|gomitas?|suplemento|vitaminas?|colageno|col[áa]geno)\b/i, 'suplemento'],
  [/\b(cepillo|irrigador|hilo dental|enjuague|pasta dental)\b/i, 'higiene-bucal'],
  [/\b(faja|rodillera|tobillera|mu[ñn]equera|corrector|soporte|plantillas?)\b/i, 'ortopedico'],
  [/\b(masajeador|masajeadora|pistola de masaje|almohada|coj[íi]n)\b/i, 'dispositivo'],
  [/\b(blusa|camisa|pantal[óo]n|vestido|zapatos?|botas?|zapatillas?|leggings?)\b/i, 'ropa'],
]

function productType(name: string | null): string | null {
  if (!name) return null
  for (const [re, tipo] of TIPOS) if (re.test(name)) return tipo
  return null
}

/**
 * Huella con la que dos anuncios cuentan como el MISMO producto (spec §27).
 * Prioridad: SKU+dominio → URL canónica → dominio+nombre normalizado.
 *
 * ⚠️ El dominio entra SIEMPRE. Sin él, dos tiendas distintas que venden un
 * genérico con el mismo nombre ("colágeno hidrolizado") colapsan en un producto
 * y el share del anunciante se mezcla con el de su competencia.
 */
export function fingerprint(p: ProductCandidate): string | null {
  const dom = p.domain ?? ''
  if (p.sku && dom) return `sku:${dom}|${p.sku.toLowerCase()}`
  if (p.canonicalUrl) return `url:${p.canonicalUrl.toLowerCase()}`
  if (p.normalizedName && dom) return `name:${dom}|${p.normalizedName}`
  if (p.normalizedName) {
    return `name:${createHash('sha256').update(p.normalizedName).digest('hex').slice(0, 16)}`
  }
  return null
}

export interface AdLike {
  headline: string | null
  landingUrl: string | null
}

export function extractProduct(ad: AdLike, s: LandingSignals | null): ProductCandidate {
  const domain = domainOf(s?.canonicalUrl ? normalizeUrl(s.canonicalUrl) : ad.landingUrl)
  const canonicalUrl = normalizeUrl(s?.canonicalUrl ?? ad.landingUrl)

  // Orden de preferencia = orden de fiabilidad.
  let name: string | null = null
  let source: ProductCandidate['source'] = 'none'
  let confidence = 0

  if (s?.jsonLd?.name) {
    name = canonicalizeName(s.jsonLd.name)
    source = 'json-ld'
    confidence = 0.95
  }
  if (!name && s?.title) {
    name = canonicalizeName(s.title, { stripStore: true })
    if (name) { source = 'canonical-title'; confidence = 0.75 }
  }
  if (!name && s?.ogTitle) {
    name = canonicalizeName(s.ogTitle, { stripStore: true })
    if (name) { source = 'og-title'; confidence = 0.72 }
  }
  if (!name && s?.h1) {
    name = canonicalizeName(s.h1)
    if (name) { source = 'h1'; confidence = 0.70 }
  }
  if (!name && ad.headline) {
    // Copy publicitario: sirve para no perder el candidato, pero por debajo del
    // umbral de elegibilidad (0,70) — o sea no alcanza solo.
    name = canonicalizeName(ad.headline)
    if (name) { source = 'ad-headline'; confidence = 0.45 }
  }

  // Un SKU declarado sube la confianza: identifica el artículo sin ambigüedad.
  if (s?.jsonLd?.sku && confidence > 0) confidence = Math.min(1, confidence + 0.03)

  return {
    canonicalName: name,
    normalizedName: normalizeName(name),
    brand: s?.jsonLd?.brand ?? null,
    sku: s?.jsonLd?.sku ?? null,
    price: s?.jsonLd?.price ?? null,
    currency: s?.jsonLd?.currency ?? null,
    canonicalUrl,
    domain,
    productType: productType(name),
    source,
    confidence,
  }
}
