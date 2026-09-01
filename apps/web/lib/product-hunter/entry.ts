import { diasCorriendo, type RawProductRow, type RawClusterRow, type RawProductEntry } from '@ph/shared'

// Los anuncios dinámicos de catálogo de Meta llegan con los placeholders sin
// resolver ("{{product.name}}", "{{product.brand}}"): sin esto la card muestra
// la plantilla como si fuera el nombre del producto. Si al sacarlos no queda
// texto real, devuelve null y la card cae al siguiente campo.
export function stripAdVars(t?: string | null): string | null {
  const s = (t ?? '')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—·:,|]+/, '')
    .trim()
  return s.length >= 3 ? s : null
}

const esCluster = (r: RawProductRow | RawClusterRow): r is RawClusterRow =>
  'cluster_key' in r

/**
 * Un título que NO nombra el producto: es el reclamo del anunciante o copy del
 * anuncio. Medido sobre 189 productos servibles con 40+ anuncios: "OFERTA 2x1",
 * "PIDE Y PAGA AL RECIBIR", "+12.590 Clientes Satisfechas", "HOY 50% Y ENVÍO
 * GRATIS!", "Ultimas unidades" — y del otro lado, frases enteras de copy
 * ("Me casé con el genio mágico, pero lo perdí."), que son un anuncio, no un
 * nombre.
 *
 * ⚠️ El sesgo es SEGURO en una dirección: un falso positivo solo hace que la
 * card muestre el slug de la landing, que casi siempre nombra mejor el producto.
 */
export function esReclamo(t: string): boolean {
  const n = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(oferta|descuento|envio gratis|free shipping|paga al recibir|pide y paga|ultimas unidades|ultimos dias|compra ahora|aprovecha|limited time|free gifts?|\d+\s*x\s*\d+|\d+\s*%|\d+% off)\b/.test(n)) return true
  // "+12.590 Clientes Satisfechas", "+60.000 hogares felices", "5.500 VENDIDOS":
  // una cifra de prueba social, no un producto.
  if (/[+\d][\d.,]*\s*(clientes?|hogares|vendidos|personas|unidades)/.test(n)) return true
  // Una ORACIÓN es copy del anuncio. El corte va en 6 palabras porque los
  // nombres reales medidos ("Depilación Láser en casa", "Complejo de Magnesio",
  // "Cuadernos Paperblanks") no llegan ahí y encima no cierran con puntuación.
  return /[.!?…]\s*$/.test(t.trim()) && t.trim().split(/\s+/).length >= 6
}

// Segmentos de path que son andamiaje de la tienda, no el nombre del artículo.
const SLUG_GENERICO = new Set([
  'quiz', 'send', 'home', 'index', 'cart', 'checkout', 'shop', 'store',
  'products', 'product', 'collections', 'collection', 'pages', 'page', 'all',
  'es', 'en', 'mx', 'co', 'ar', 'cl', 'pe',
])

/**
 * Nombre del producto cuando el título no sirve.
 *
 * ⚠️ El 42% de los clusters NO trae texto de producto en el título — plantillas
 * sin renderizar, el canvas de Facebook, "+5.500 VENDIDOS" — y encima el título
 * suele ser el reclamo del anunciante: medido, "paga al recibir" es el título
 * de 10 productos distintos de la misma página. El slug de la landing SÍ
 * identifica el artículo: es la misma señal con la que `productKey` agrupa.
 *
 * Devuelve null cuando el slug tampoco nombra nada — un id opaco
 * ("69d8604d4eb6d161cf064114", "id1354260888"), un segmento camelCase del CMS
 * ("booksAdvPageV2", "CuentaDigital") o un genérico de tienda. Ahí la card
 * prefiere el título aunque sea un reclamo: es lo único legible que queda.
 */
export function nombreDeCluster(r: { url?: string | null }): string | null {
  let s: string
  try {
    const p = decodeURIComponent(new URL(r.url ?? '').pathname)
    const crudo = p.split('/').filter(Boolean).pop()
    if (!crudo) return null
    if (SLUG_GENERICO.has(crudo.toLowerCase())) return null
    // Id opaco de CMS: hex largo, o el "id1354260888" de la App Store.
    if (/^[0-9a-f]{12,}$/i.test(crudo) || /^id\d{5,}$/i.test(crudo)) return null
    // camelCase sin separadores = ruta del CMS, no un nombre escrito para leer.
    if (!/[-_\s]/.test(crudo) && /[a-z][A-Z]/.test(crudo)) return null
    s = crudo.replace(/\.\w{2,4}$/, '').replace(/[-_]+/g, ' ').trim()
  } catch {
    return null
  }
  // Sufijo aleatorio del generador de landings: "slim rack organizador plegable
  // 1jazf". Solo cae si MEZCLA letras y dígitos — un "2602" o un "2 0" suelto es
  // número de modelo y se conserva.
  const t = s.split(' ')
  if (t.length > 1 && /^(?=.*[a-z])(?=.*\d)[a-z0-9]{4,10}$/i.test(t[t.length - 1])) t.pop()
  s = t.join(' ').trim()
  return s.length >= 3 ? s : null
}

/**
 * Qué nombre lleva la card. El orden es el arreglo: hasta acá el título del
 * anuncio le ganaba SIEMPRE al slug, así que un "OFERTA 2x1" tapaba al
 * "drenaje linfatico nature sunshine" que la landing sí nombra.
 *
 * ✅ Medido sobre los 189 productos servibles con 40+ anuncios: 60 títulos son
 * reclamos y **52 cards (28%) cambian de nombre**. Los 3 que quedan sin nombre
 * (antes 5, ahora 8) son slugs opacos rechazados a propósito — `id1567954123`,
 * `CuentaDigital`, `send` — y ahí `ProductCard` ya cae al anunciante, que
 * nombra más que eso.
 *
 * ⚠️ RESIDUO CONOCIDO, 1 de 189: "Cuando los pruebes, entenderás por qué." cae
 * al slug `5 razones`, que es peor. Es un título compartido por dos productos
 * del mismo anunciante (el caso que este arreglo persigue), pero su landing
 * tampoco nombra nada. NO agregues una lista de "palabras de landing" para
 * cazarlo: no hay evidencia detrás y el que lo resuelve de verdad es el pase de
 * nombrado por LLM, que escribe `product_name` y le gana a todo esto.
 */
export function nombreDeCard(r: {
  product_name?: string | null; titulo?: string | null; url?: string | null
}): string | null {
  const nombre = stripAdVars(r.product_name)
  if (nombre) return nombre
  const titulo = stripAdVars(r.titulo)
  if (titulo && !esReclamo(titulo)) return titulo
  return nombreDeCluster(r) ?? titulo
}

function adsUrl(pageId: string): string {
  return `https://www.facebook.com/ads/library/?${new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
    view_all_page_id: pageId,
  })}`
}

/**
 * Fila → lo que ve el front. Acepta las DOS formas mientras dure la migración:
 * la del ANUNCIANTE (`ph_raw_products`) y la del PRODUCTO (`ph_raw_clusters`).
 * Cuál llega lo decide `TABLA_SERVING` en @ph/shared, no esta función.
 */
export function toEntry(r: RawProductRow | RawClusterRow): RawProductEntry {
  if (esCluster(r)) {
    return {
      // El cluster_key va en el id: sin él dos productos de la misma página
      // colisionarían y el front mostraría uno solo.
      id: `${r.niche}:${r.page_id}:${r.cluster_key}`,
      advertiser: r.name ?? 'Anunciante',
      productName: nombreDeCard(r),
      title: stripAdVars(r.titulo),
      // La descripción REDACTADA le gana al copy crudo del anuncio: `cuerpo` es
      // la promoción tal cual ("PIDE Y PAGA AL RECIBIR 💛") y está vacío en el
      // 10% de las filas. Se cae a `cuerpo` mientras el veredicto no haya
      // pasado por esa fila, que hoy es el caso fuera del tramo de 50+.
      body: stripAdVars(r.descripcion) ?? stripAdVars(r.cuerpo),
      country: r.country ?? null,
      // ⚠️ Los anuncios del PRODUCTO, no los de la página. Es el cambio entero.
      adCount: r.ad_count,
      adsUrl: adsUrl(r.page_id),
      verificado: r.status === 'monoproducto',
      // Qué parte de la pauta del anunciante es este producto — NO "qué tan
      // monoproducto es la página". Ver el comentario de `share` en types.ts.
      share: r.muestra_tot ? Number((r.muestra_n / r.muestra_tot).toFixed(2)) : null,
      porProducto: true,
      senal: r.senal_nicho ?? null,
      diasCorriendo: diasCorriendo(r.ad_start_date),
    }
  }
  return {
    id: `${r.niche}:${r.page_id}`,
    advertiser: r.name ?? 'Anunciante',
    productName: stripAdVars(r.product_name),
    title: stripAdVars(r.raw_data?.title),
    body: stripAdVars(r.raw_data?.body),
    country: r.country,
    adCount: r.ad_count,
    adsUrl: adsUrl(r.page_id),
    // Solo scan-nicho.ts aprueba con evidencia (share medido + cita textual
    // respaldada). Las filas 'pendiente' del inventario viejo se siguen
    // sirviendo, pero sin sello.
    verificado: r.status === 'monoproducto',
    share: typeof r.share === 'number' ? r.share : null,
    senal: r.senal_nicho ?? null,
    diasCorriendo: diasCorriendo(r.ad_start_date),
  }
}
