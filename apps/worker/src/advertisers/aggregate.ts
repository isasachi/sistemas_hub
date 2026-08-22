// Deep crawl del anunciante (spec §31-33).
//
// ⚠️ ES CONCEPTUALMENTE DISTINTO DEL DESCUBRIMIENTO, y el §31 insiste en eso.
// La pregunta que responde NO es "¿este anunciante tiene un anuncio de pasta
// dental?" sino "¿este anunciante vende PRINCIPALMENTE pasta dental?". Para eso
// no alcanza el anuncio que matcheó la búsqueda: hay que mirar TODO su catálogo
// activo.
//
// El costo se acota con dos topes (§33): el objetivo es clasificar al
// anunciante, no reconstruir internet.
import type { Page } from 'playwright'
import { advertiserUrl, readConnection, type SsrAd } from '../../lib/product-hunter/ssr-fetch'
import { productKey } from '../../lib/product-hunter/product-key'
import { normalizeUrl } from '../normalization/url'
import { canonicalizeName } from '../products/canonicalize'
import { getBucket, type Bucket } from './bucket'
import { distribution, type Distribution, type ProductTally } from './monoproduct'

export const MAX_ADS_PER_ADVERTISER = Math.max(1, Number(process.env.DISC_MAX_ADS_ADVERTISER ?? 500))

export interface AdvertiserProfile {
  pageId: string
  pageName: string | null
  /** Anuncios activos en SU PAÍS: es el número que promete la UI. */
  activeAds: number | null
  bucket: Bucket | null
  distribution: Distribution
  ads: SsrAd[]
}

/**
 * Clave con la que dos anuncios del anunciante cuentan como el mismo producto.
 * Reusa `productKey` del motor viejo — ya tiene medido que el link de chat NO
 * identifica un producto (Pistache pasaba de 0,80 a 0,07 real al corregirlo) —
 * y le normaliza la URL antes, para que el mismo destino con distinto `utm_` no
 * cuente como dos productos.
 */
export function tallyProducts(ads: SsrAd[]): ProductTally[] {
  const byKey = new Map<string, ProductTally>()
  for (const ad of ads) {
    const k = productKey({ ...ad, link_url: normalizeUrl(ad.link_url) })
    if (!k) continue
    const prev = byKey.get(k)
    if (prev) { prev.count++; continue }
    byKey.set(k, { key: k, count: 1, name: canonicalizeName(ad.title ?? ad.caption ?? null) })
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count)
}

/**
 * Lee el catálogo activo del anunciante y arma su perfil.
 *
 * ⚠️ El RANGO se mide en el país donde se encontró el producto y el SHARE con
 * todos los mercados. Son dos preguntas distintas y ya está medido en este repo
 * que compartir una sola lectura las confunde: InvigorFate tiene 685 anuncios en
 * el mundo y 47 en México, así que con `ALL` figuraba en "100+" siendo un
 * "0-49" en el mercado donde se lo encontró.
 *
 * Devuelve null si la lectura fue inconclusa. null NUNCA es "no tiene anuncios":
 * un fetch bloqueado se ve igual que un anunciante chico, y confundirlos
 * fabricaría a la vez un rango bajo y un monoproducto perfecto.
 */
export async function profileAdvertiser(
  page: Page,
  pageId: string,
  country: string,
): Promise<AdvertiserProfile | null> {
  // Share: muestra grande, todos los mercados.
  const all = await readConnection(page, advertiserUrl(pageId, 'ALL'))
  // ⚠️ UNA CONEXIÓN SIN ANUNCIOS TAMBIÉN ES INCONCLUSA, no un anunciante de cero
  // productos. Un soft-block de Meta devuelve un payload que parsea pero llega
  // sin nodos, y sin este acote el perfil salía con `sample 0 · distinct 0 ·
  // share 0` y se PERSISTÍA encima de una medición buena. Medido: 19 filas de
  // `disc_advertisers` quedaron en ceros, pisando shares reales del día
  // anterior. Es exactamente el modo de fallo que el comentario de arriba
  // promete evitar; faltaba la mitad del guard.
  if (!all || !all.ads.length) return null

  const ads = all.ads.slice(0, MAX_ADS_PER_ADVERTISER)
  const dist = distribution(tallyProducts(ads))

  // Rango: solo el país del hallazgo. `count` es el total que declara Meta, no
  // el largo de la muestra.
  const local = await readConnection(page, advertiserUrl(pageId, country))
  const activeAds = local?.count ?? null

  return {
    pageId,
    pageName: ads[0]?.page_name ?? null,
    activeAds,
    bucket: activeAds === null ? null : getBucket(activeAds),
    distribution: dist,
    ads,
  }
}
