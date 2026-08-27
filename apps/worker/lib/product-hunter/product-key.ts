// Share de monoproducto SIN LLM: agrupa los anuncios de un anunciante por
// "clave de producto" y mide qué parte de su pauta es el producto dominante.
//
// Es la alternativa determinista a preguntarle al modelo qué anuncios son del
// mismo producto (lo que hace verify-product.ts con `matchedIndices`). Misma
// pregunta, respuesta reproducible y gratis. Los dos conviven a propósito: este
// camino todavía no está medido contra `classifyShare` sobre las mismas filas.
//
// ⚠️ EL LINK DE CHAT NO IDENTIFICA UN PRODUCTO, y esto no es un detalle.
// Medido sobre anunciantes reales de acné: usar el link crudo como clave da
// monoproducto 1.00 a cualquiera que mande todo a WhatsApp, porque sus 30
// anuncios comparten la misma URL. Pistache pasó de 0.80 a 0.07 real y SkinVital
// de 1.00 a 0.38 al corregirlo — los dos habrían entrado a la vitrina como
// monoproducto perfecto. Cuando el destino es un chat o una red, la clave sale
// del TÍTULO del anuncio.
export const CHAT = /(whatsapp|messenger|instagram|facebook|linktr|link\.me|m\.me|wa\.me|bit\.ly|linkr|t\.me|telegram)/

export interface KeyableAd {
  title?: string | null
  body?: string | null
  caption?: string | null
  link_url?: string | null
}

export const normalize = (s?: string | null): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const textKey = (ad: KeyableAd): string | null => {
  const base = ad.title || ad.caption || (ad.body ?? '').slice(0, 60) || ''
  const k = normalize(base).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 45)
  return k.length >= 3 ? k : null
}

/**
 * Clave con la que dos anuncios cuentan como "el mismo producto".
 * Preferencia: el path del link (identifica el artículo). Si el destino es un
 * chat o una red social, el título.
 */
export function productKey(ad: KeyableAd): string | null {
  if (ad.link_url) {
    try {
      const u = new URL(ad.link_url)
      const host = u.hostname.replace(/^www\./, '')
      if (!CHAT.test(host)) {
        const path = u.pathname.replace(/\/+$/, '')
        if (path && !/^\/(index|home)?$/.test(path)) return host + path
      }
    } catch {
      // link ilegible: cae al título, igual que un link de chat
    }
  }
  return textKey(ad)
}

// ⚠️ LIMITACIÓN CONOCIDA, VERIFICADA CONTRA UN ANUNCIANTE REAL: el share se
// SUBESTIMA cuando un mismo producto se promociona desde varias landings.
// VivaCuerpo México (1.078 anuncios) reparte sus leggings entre
// /collections/edicion-vivacuerpo-colores-deseo (17 anuncios),
// /pages/5-razones (12) y /pages/leggings (1) — un solo producto en tres URLs,
// que acá cuentan como tres. Su share sale 0.57 cuando el real ronda 0.97.
//
// No se corrigió a propósito: agrupar landings por heurística (mismo dominio,
// prefijos comunes) uniría productos DISTINTOS de una tienda de catálogo, que es
// justo lo que este cálculo existe para separar. El sesgo actual descarta
// monoproductos legítimos, no publica basura — que es el lado seguro para
// equivocarse. Si algún día molesta, la salida es medir cuántos aprobados se
// pierden, no aflojar la clave.
export interface ShareResult {
  dominante: string | null
  dominanteN: number
  muestra: number
  share: number
  distintos: number
  top3: [string, number][]
}

/** Qué parte de la pauta del anunciante es su producto más repetido. */
export function shareOf(ads: KeyableAd[]): ShareResult {
  const tally = new Map<string, number>()
  for (const ad of ads) {
    const k = productKey(ad)
    if (k) tally.set(k, (tally.get(k) ?? 0) + 1)
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1])
  const muestra = ads.length
  const [dominante, dominanteN] = ranked[0] ?? [null, 0]
  return {
    dominante,
    dominanteN,
    muestra,
    // Sobre la MUESTRA, no sobre el total del anunciante: solo se leyó la
    // primera página de sus anuncios. Para un anunciante grande es muestra, no censo.
    share: muestra ? Number((dominanteN / muestra).toFixed(2)) : 0,
    distintos: ranked.length,
    top3: ranked.slice(0, 3),
  }
}

/**
 * Dónde aparece el término del nicho: es la señal de CONFIANZA que acompaña al
 * veredicto. Un término en el path del producto es casi seguro; uno que solo
 * está en el cuerpo del anuncio necesita revisión — medido sobre acné, buscar en
 * el body sube el recall pero mete un curso de idiomas y unas plantillas de
 * pádel (matchearon "espinillas" en sentido anatómico).
 */
export type SenalNicho = 'path' | 'titulo' | 'cuerpo' | 'ninguna'

/**
 * ⚠️ EL PISO NO ES COSMÉTICO. Sin cursor de paginación solo se leen ~30 anuncios
 * del anunciante, así que el conteo de un cluster es una regla de tres. Con 3
 * anuncios de 30 sobre una página de 5.000 el estimado dice 500 y el intervalo
 * es enorme: medido, el 71% de los "productos" que aparecían dentro de los
 * catálogos descartados vivían por debajo de este piso, contra 11 de 184 del
 * cluster dominante. Publicarlos sería inventar inventario.
 *
 * Es además el control de COSTO: en las filas `descartado` el piso baja las
 * llamadas al modelo de 5,67 a 1,86 por fila (medido sobre 801 filas).
 *
 * ponytail: piso fijo sobre la muestra; el upgrade real es paginar el listado
 * del anunciante, que hoy Meta no expone.
 */
export const MUESTRA_MIN = 4

export interface ClusterInfo {
  key: string
  n: number
  titulo: string | null
  cuerpo: string | null
  url: string | null
  /** Anuncios del cluster ESTIMADOS sobre el total real del anunciante. */
  estimado: number
  publicable: boolean
}

/**
 * Todos los productos de un anunciante con cuántos anuncios tiene cada uno.
 *
 * Es el mismo tally que `shareOf` ya construye y descarta: ahí sobrevive solo
 * el dominante, acá sobreviven todos. Se mantienen las dos porque `shareOf`
 * sigue respondiendo "¿esta página vende una sola cosa?", que es otra pregunta.
 */
export function clustersOf(ads: KeyableAd[], adCount: number): ClusterInfo[] {
  const t = new Map<string, { n: number; a: KeyableAd }>()
  for (const ad of ads) {
    const k = productKey(ad)
    if (!k) continue
    const prev = t.get(k)
    if (prev) prev.n++
    else t.set(k, { n: 1, a: ad })
  }
  const muestra = ads.length
  return [...t.entries()]
    .map(([key, v]) => ({
      key,
      n: v.n,
      titulo: v.a.title ?? null,
      cuerpo: v.a.body?.slice(0, 400) ?? null,
      url: v.a.link_url ?? null,
      estimado: muestra ? Math.round((v.n / muestra) * adCount) : 0,
      publicable: v.n >= MUESTRA_MIN,
    }))
    .sort((a, b) => b.n - a.n)
}

export function senalNicho(terminos: string[], key: string | null, ads: KeyableAd[]): SenalNicho {
  const hay = terminos.map((t) => normalize(t)).filter(Boolean)
  if (!hay.length) return 'ninguna'
  const matchea = (txt: string) => hay.some((t) => txt.includes(t))
  if (key && matchea(normalize(key))) return 'path'
  if (matchea(normalize(ads.map((a) => a.title ?? '').join(' ')))) return 'titulo'
  if (matchea(normalize(ads.map((a) => a.body ?? '').join(' ')))) return 'cuerpo'
  return 'ninguna'
}
