// Señales de la landing (spec §20-22). Todo por reglas sobre el DOM: nada de
// LLM, y por eso cada veredicto se puede explicar señalando qué disparó.
import { load, type CheerioAPI } from 'cheerio'
import { productFromJsonLd, hasServiceSchema, type JsonLdProduct } from './jsonld'

export interface LandingSignals {
  // Positivas (§20)
  hasProductSchema: boolean
  hasPrice: boolean
  hasAddToCart: boolean
  hasCheckout: boolean
  hasShipping: boolean
  hasSku: boolean
  hasInventory: boolean
  hasProductImages: boolean
  // Negativas (§20)
  hasAppointment: boolean
  isServicePage: boolean
  isSoftware: boolean
  // Datos para la Fase 6
  title: string | null
  h1: string | null
  ogTitle: string | null
  canonicalUrl: string | null
  jsonLd: JsonLdProduct | null
  /** Plataforma detectada (shopify/woocommerce/…): ecommerce por construcción. */
  platform: string | null
  /** La URL es una ficha de producto (`/products/<slug>`), no una home ni un blog. */
  isProductUrl: boolean
}

// ⚠️ ESTA SEÑAL EXISTE PORQUE EL TEXTO NO ALCANZA, y está medida. La ficha
// `trendysmarket.online/products/pasta-dental-natural-8-en-1-occotap` es una
// pasta dental en Shopify con precio, y salía rechazada como "no físico": el
// HTML SÍ contiene `agregar al carrito`, `/cart/add` y `product-form`, pero el
// tema los pinta con JS, así que ni el texto visible ni los selectores del DOM
// servido los ven. Buscarlos en el HTML crudo tampoco sirve — están en el JS de
// TODAS las páginas de la tienda, blog incluido, así que daría positivo siempre.
//
// El path SÍ discrimina: en Shopify `/products/<slug>` es, por definición, la
// ficha de UN producto. Es evidencia estructural y no depende de que el
// navegador ejecute nada.
const PRODUCT_PATH = /\/(products?|producto|productos|item|dp|p)\/[^/]+/i

// ⚠️ Se busca sobre el TEXTO VISIBLE, no sobre el HTML crudo. En el HTML, la
// palabra "checkout" aparece en cualquier tema de Shopify aunque la página sea
// un blog, y "cart" está en el JS de medio internet: buscar ahí da positivo casi
// siempre y el score deja de discriminar.
const ADD_TO_CART = /\b(a[ñn]adir al carrito|agregar al carrito|añadir a la cesta|agregar a la bolsa|add to (cart|bag|basket)|comprar ahora|buy now|lo quiero|pedir ahora|ordenar ahora|comprar ya)\b/i
const CHECKOUT = /\b(finalizar compra|ir a pagar|proceder al pago|realizar pedido|checkout|pagar ahora|completar (mi )?pedido|contra ?entrega|pago contra entrega)\b/i
const SHIPPING = /\b(env[íi]o gratis|env[íi]os? a todo|free shipping|entrega a domicilio|costo de env[íi]o|tiempo de entrega|despacho|recibe en \d+|env[íi]o en \d+)\b/i
const INVENTORY = /\b(en stock|sin stock|agotado|disponible|últimas? unidades|quedan \d+|stock limitado|in stock|out of stock|sold out)\b/i
const APPOINTMENT = /\b(agenda tu (cita|hora|consulta)|agendar (cita|hora)|reserva tu (cita|hora|turno)|reservar (cita|turno)|pedir cita|solicitar cita|book (an )?appointment|schedule (a )?(consultation|appointment)|primera consulta|valoraci[óo]n gratis|cita previa)\b/i
const SERVICE = /\b(nuestros servicios|nuestras sedes|nuestra cl[íi]nica|atenci[óo]n presencial|cont[áa]ctanos para (una )?cotizaci[óo]n|solicita (una )?cotizaci[óo]n|consultor[íi]a|asesor[íi]a personalizada)\b/i
// ⚠️ `iniciar sesión` y `/mes` ESTUVIERON acá y eran un desastre medido: toda
// tienda de Shopify lleva "Iniciar sesión" en su cabecera, y "/mes" aparece en
// cualquier financiación ("3 cuotas de $29.900/mes"). Con el texto visible bien
// extraído empezaron a matchear en TODAS las tiendas y tumbaron fichas de
// producto reales — blanqueador dental, sticks dentales para mascotas — con
// score de ecommerce 14-21. Lo que queda es específico de software.
const SOFTWARE = /\b(descargar? la app|descarga la aplicaci[óo]n|download the app|app store|google play|play store|prueba gratis \d+ d[íi]as|free trial|plan (mensual|anual)|suscr[íi]bete por \$)\b/i

// Precio con símbolo de moneda. El símbolo es obligatorio: un número suelto es
// cualquier cosa (un teléfono, un año, una dosis).
const PRICE = /(?:\$|US\$|S\/\.?|COP|MXN|ARS|CLP|EUR|€)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\b/

const SKU_TEXT = /\b(sku|c[óo]digo de producto|referencia|ref\.?\s?:|art[íi]culo n)\b/i

function detectPlatform($: CheerioAPI, html: string): string | null {
  if (/cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html)) return 'shopify'
  if (/wp-content\/plugins\/woocommerce|woocommerce-page|wc-add-to-cart/i.test(html)) return 'woocommerce'
  if (/vtex-|vtex\.com\/|__VTEX/i.test(html)) return 'vtex'
  if (/tiendanube|nuvemshop/i.test(html)) return 'tiendanube'
  if (/mercadoshops|mlstatic\.com/i.test(html)) return 'mercadoshops'
  if ($('meta[name="generator"]').attr('content')?.toLowerCase().includes('wix')) return 'wix'
  return null
}

export function parseLanding(html: string, url?: string): LandingSignals {
  const $ = load(html)
  // El texto visible: fuera script/style/noscript, que es donde vive el ruido
  // que hacía dar positivo a todo.
  $('script, style, noscript, template').remove()
  const text = visibleText($)

  // El JSON-LD se lee del documento ORIGINAL: los <script> ya se borraron arriba.
  const $full = load(html)
  const jsonLd = productFromJsonLd($full)
  const platform = detectPlatform($full, html)

  const hasPrice = !!jsonLd?.price || PRICE.test(text)
  const hasAddToCart = ADD_TO_CART.test(text)
    // Shopify/Woo marcan el botón en el DOM aunque el texto esté traducido.
    || $full('[name="add"], .add-to-cart, .single_add_to_cart_button, button[type="submit"][name="add"], form[action*="/cart/add"]').length > 0

  return {
    hasProductSchema: !!jsonLd,
    hasPrice,
    hasAddToCart,
    hasCheckout: CHECKOUT.test(text) || $full('a[href*="/checkout"], form[action*="/checkout"]').length > 0,
    hasShipping: SHIPPING.test(text),
    hasSku: !!jsonLd?.sku || SKU_TEXT.test(text),
    hasInventory: !!jsonLd?.availability || INVENTORY.test(text),
    hasProductImages: $full('img').length >= 3,
    hasAppointment: APPOINTMENT.test(text),
    isServicePage: hasServiceSchema($full) || SERVICE.test(text),
    isSoftware: SOFTWARE.test(text),
    title: $full('title').first().text().trim() || null,
    h1: $full('h1').first().text().replace(/\s+/g, ' ').trim() || null,
    ogTitle: $full('meta[property="og:title"]').attr('content')?.trim() || null,
    canonicalUrl: $full('link[rel="canonical"]').attr('href')?.trim() || null,
    jsonLd,
    platform,
    isProductUrl: isProductPath(url) || isProductPath($full('link[rel="canonical"]').attr('href')),
  }
}

/**
 * ⚠️ NO se usa `$('body').text()`, y el motivo es un fallo medido. Cheerio
 * concatena el texto de elementos vecinos SIN separador, así que
 * `<p>$ 79.900</p><p>Envío gratis</p>` sale como `$ 79.900Envío gratis`: entre
 * el `0` y la `E` no hay frontera de palabra, y TODA regex anclada con `\b`
 * deja de matchear. El síntoma es una landing con carrito y envío clasificada
 * como "sin señal de producto enviable" — o sea señales que desaparecen sin que
 * nada falle.
 *
 * Reemplazar las etiquetas por un espacio conserva la separación que el
 * navegador muestra. Los <script>/<style> ya se sacaron antes de llegar acá.
 */
function visibleText($: CheerioAPI): string {
  return ($('body').html() ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(quot|#34);/gi, '"')
    .replace(/&(#39|apos);/gi, "'")
    .replace(/\s+/g, ' ')
    .slice(0, 200_000)
}

function isProductPath(u: string | undefined | null): boolean {
  if (!u) return false
  try {
    return PRODUCT_PATH.test(new URL(u).pathname)
  } catch {
    return PRODUCT_PATH.test(u)
  }
}
