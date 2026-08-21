// Canonicalización del nombre (spec §26): "Irrigador Bucal Pro™ 2x1 ¡ENVÍO
// GRATIS!" → "irrigador bucal pro".
//
// ⚠️ El límite del §26 es el que importa: se sacan los adornos comerciales, NO
// las palabras que distinguen un producto de otro. "Pro" se queda (distingue del
// modelo básico); "2x1" se va (es una promo, no el producto). Pasarse de celoso
// colapsa dos productos distintos en uno y arruina el share de la Fase 8.
import { normalizeText } from '../normalization/text'

// Adornos: promos, urgencia, envío, descuentos. Cada uno aparece en el título de
// media tienda de LATAM y ninguno identifica al producto.
const RUIDO: RegExp[] = [
  /[™®©]/g,
  /\b\d+\s?x\s?\d+\b/gi,                         // 2x1, 3 x 2
  /\b(env[íi]o|envio)s?\s+(gratis|gratuito|r[áa]pido)\b/gi,
  /\bfree shipping\b/gi,
  /\b(oferta|promo(ci[óo]n)?|descuento|rebaja|liquidaci[óo]n|black friday|cyber ?(monday|day)|hot ?sale)\b/gi,
  /\b\d{1,3}\s?%\s?(de\s?)?(dto|desc(uento)?|off)\b/gi,
  /\b(pague|paga|lleve|lleva)\s+\d+\s+(y\s+)?(lleve|lleva|reciba)\s+\d+\b/gi,
  /\b(nuevo|new|original|garantizado|premium|oficial)\b/gi,
  /\b(compra|comprar|comprar? ahora|buy now|cómpralo|c[óo]mpralo ya)\b/gi,
  /\b(últimas? unidades|stock limitado|agotado|disponible)\b/gi,
  /\b(pack|combo|kit)\s+(de\s+)?\d+\b/gi,        // "pack de 3" (promo), no "kit dental"
  /\b(gratis|gratuito)\b/gi,
  /[|·•–—]+/g,
  /\s*[-–—]\s*$/,
]

// Sufijos de tienda que Shopify y Woo pegan al <title>: "Producto – Mi Tienda".
const SEPARADOR_TIENDA = /\s+[|–—-]\s+[^|–—-]{2,40}$/

/**
 * Nombre legible del producto. Devuelve null si después de limpiar no queda
 * nada que identifique nada.
 */
export function canonicalizeName(raw: string | null | undefined, opts: { stripStore?: boolean } = {}): string | null {
  if (!raw) return null
  let s = raw
    // ⚠️ El JSON-LD trae HTML adentro. Medido: bnaturalstore.com declara
    // `Crema dental ... <b>Patanjali</b> - bnatural`, y sin esto la etiqueta
    // viaja hasta el nombre del producto y hasta la huella, donde parte en dos
    // lo que es un solo producto.
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/gi, ' ')
    // Emojis: decoran el título de la tienda, no nombran el producto
    // ("Spray-Magic™😍"). Fuera de la huella también, por el mismo motivo.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Solo para <title>: en el nombre del JSON-LD el separador puede ser parte
  // del nombre real y cortarlo perdería información.
  if (opts.stripStore) s = s.replace(SEPARADOR_TIENDA, '')
  for (const re of RUIDO) s = s.replace(re, ' ')
  s = s.replace(/[¡!¿?"“”'’]/g, ' ').replace(/\s{2,}/g, ' ').trim()
  s = s.replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
  if (s.length < 3) return null
  // Un título gigante es una frase de marketing, no un nombre de producto.
  return s.split(' ').slice(0, 12).join(' ')
}

/** Forma comparable: sin acentos, minúsculas, sin puntuación. */
export function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null
  const n = normalizeText(name).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  return n.length >= 3 ? n : null
}

// Palabras vacías: no distinguen productos y ensucian la similitud.
const STOP = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'y', 'o', 'a', 'en',
  'un', 'una', 'unos', 'unas', 'por', 'the', 'of', 'for', 'and', 'with',
])

export function tokens(name: string | null | undefined): string[] {
  const n = normalizeName(name)
  if (!n) return []
  return n.split(' ').filter((t) => t.length > 1 && !STOP.has(t))
}
