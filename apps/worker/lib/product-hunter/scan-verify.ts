// Medición + veredicto de UN anunciante. Es el corazón del pipeline y vive
// aparte porque lo usan dos entradas distintas: `scan-nicho.ts` (descubre y
// verifica un nicho) y `scan-base.ts` (verifica lo que ya está en la base,
// ordenado por volumen). Dos copias de esta regla es como una se desincroniza.
import type Anthropic from '@anthropic-ai/sdk'
import type { Page } from 'playwright'
import { readConnection, advertiserUrl, type SsrAd } from './ssr-fetch'
import { isPersistentlyBlocked, PersistentBlockError, rateGateMs, rachaVacia } from './scraper'
import { shareOf, senalNicho, productKey, clustersOf, type SenalNicho, type ClusterInfo } from './product-key'
import { juzgarNicho } from './nicho-verdict'
import { textoDeCluster, fusionarPorEmbedding, embeddings } from './cluster-merge'
import { nonPhysicalSignal, type RawClusterRow } from '@ph/shared'

export const SHARE_MIN = Number(process.env.PH_SCAN_SHARE_MIN ?? 0.5)

export interface Medicion {
  adCount: number          // en el país objetivo: es el que define el rango
  adCountGlobal: number    // todos los mercados, para poder comparar
  share: number
  dominante: string | null
  distintos: number
  muestra: number
  senal: SenalNicho
  textos: string[]
  /** Unix seconds del anuncio más viejo del anunciante, o null si ninguno lo trae. */
  masViejo: number | null
}

export interface Veredicto {
  status: 'monoproducto' | 'sin_verificar' | 'descartado'
  kind: string
  nota: string
  productName: string | null
  medicion: Medicion
}

// Lo que se lee del anunciante. `adCount` define el RANGO y se mide en el país
// donde apareció el producto; el resto sale de la lectura global, que tiene más
// muestra para calcular el share.
export interface Lectura {
  adCount: number          // en el país objetivo → es el que manda el rango
  adCountGlobal: number    // todos los mercados, informativo
  share: number
  dominante: string | null
  distintos: number
  muestra: number
  base: SsrAd[]
  /**
   * ⚠️ TODOS los anuncios leídos, SIN filtrar por cluster. `base` de arriba son
   * solo los del dominante, así que clusterizar sobre ella devolvería UN cluster
   * y el pipeline seguiría andando, contando exactamente lo mismo que hoy —
   * un fallo que no rompe nada y por eso no se ve. `clustersOf` va sobre esta.
   */
  todos: SsrAd[]
  /** Unix seconds del anuncio más viejo — la antigüedad que filtra el buscador. */
  masViejo: number | null
}

/** Espera lo que pida el rate-control compartido antes de tocar la IP. */
export async function esperarTurno(): Promise<void> {
  if (isPersistentlyBlocked()) throw new PersistentBlockError()
  const gate = rateGateMs()
  if (gate > 0) await new Promise((r) => setTimeout(r, gate))
  const jitter = Math.max(0, Number(process.env.PH_JITTER_MS ?? 500))
  if (jitter) await new Promise((r) => setTimeout(r, Math.random() * jitter))
}

/**
 * Lee la página del anunciante y calcula rango y share. Todo determinista.
 * null = NO se pudo leer: inconcluso, nunca "no tiene anuncios". Confundirlos
 * fabricaría a la vez un rango bajo y un monoproducto perfecto.
 *
 * ⚠️ SON DOS LECTURAS PORQUE SON DOS PREGUNTAS DISTINTAS. El rango es la
 * promesa que lee el usuario y la tool existe para encontrar productos que
 * funcionan en LATAM, así que se mide en `country`. El share necesita muestra y
 * se mide global — acotarlo al país la achicaría justo en los anunciantes que
 * apenas pautan ahí, que es donde el share ya es más frágil.
 *
 * Sin `country` (o con 'ALL') se comporta como antes: una sola lectura global.
 */
export async function leerAnunciante(
  page: Page, pageId: string, country?: string | null,
): Promise<Lectura | null> {
  const global = await readConnection(page, advertiserUrl(pageId))
  if (!global || typeof global.count !== 'number') return null

  // ⚠️ CONTEO SIN ANUNCIOS ES UN BLOQUEO, NO UN ANUNCIANTE VACÍO — y tratarlo
  // como lectura buena es el fallo más caro que tuvo este pipeline. Medido el
  // 2026-08-28: un barrido de 3,5 h marcó 19.027 filas (6.548 anunciantes) con
  // share 0, el 86% con ≥40 anuncios activos y media de 73 — o sea anunciantes
  // vivos leídos en cero. Como el veredicto escribe `senal_nicho`, esas filas
  // salieron de las DOS colas para siempre sin dejar un solo cluster.
  // Comprobado con un control: un anunciante que había devuelto 30 anuncios
  // minutos antes devolvía count=0 en ALL, CO y MX al mismo tiempo.
  //
  // `count === 0` SÍ es un anunciante sin pauta activa y se deja pasar: ahí el
  // cero es el dato. Lo que no puede pasar es count > 0 con la lista vacía.
  //
  // ⚠️ PERO SOLO SI ES UN BLOQUEO, Y ESO SE DECIDE MIRANDO A LOS VECINOS. Hay
  // anunciantes cuyos anuncios el extractor no parsea: devuelven un `count`
  // REAL con la lista vacía (medido: `count=19 ads=0` en 1Click Store y
  // `count=1 ads=0` en Winsome, con las lecturas de al lado funcionando). Si se
  // los trata como inconclusos nunca salen de la cola, y como la cola va
  // ordenada por volumen se acumulan en la cabeza y cada corrida los reintenta:
  // medido, 24 de 25 filas inconclusas y corte por "bloqueo" que no existía.
  //
  // La racha del control de bloqueo separa los dos casos: si la lectura
  // anterior trajo nodos, la IP responde y el vacío es de ESTE anunciante.
  if (global.count > 0 && !global.ads.length && rachaVacia() > 0) return null

  let adCount = global.count
  if (country && country !== 'ALL') {
    await esperarTurno()
    const local = await readConnection(page, advertiserUrl(pageId, country))
    // Si la lectura local no se pudo hacer, NO se inventa un rango con el
    // global: sin ese dato la fila queda inconclusa y vuelve a la cola.
    if (!local || typeof local.count !== 'number') return null
    adCount = local.count
  }

  const s = shareOf(global.ads)
  const delDominante = global.ads.filter((a: SsrAd) => productKey(a) === s.dominante)
  return {
    adCount, adCountGlobal: global.count,
    share: s.share, dominante: s.dominante,
    distintos: s.distintos, muestra: s.muestra,
    base: delDominante.length ? delDominante : global.ads,
    todos: global.ads,
    // Sobre TODOS los anuncios del anunciante, no solo los del dominante: la
    // pregunta es hace cuánto que este anunciante viene pautando, y esta lectura
    // ya está hecha — sale gratis. Es el backfill de `ad_start_date` para las
    // filas viejas, que nacieron sin la columna.
    masViejo: masViejoDe(global.ads),
  }
}

/** El unix timestamp más chico (= anuncio más viejo), ignorando los que faltan. */
export function masViejoDe(ads: SsrAd[]): number | null {
  return ads
    .map((a) => a.start_date)
    .filter((d): d is number => typeof d === 'number' && d > 0)
    .reduce<number | null>((a, b) => (a === null || b < a ? b : a), null)
}

/** La señal SÍ depende del nicho, así que se calcula por fila, no por anunciante. */
export function medicionDe(l: Lectura, terminos: string[]): Medicion {
  return {
    adCount: l.adCount, adCountGlobal: l.adCountGlobal,
    share: l.share, dominante: l.dominante,
    distintos: l.distintos, muestra: l.muestra,
    senal: senalNicho(terminos, l.dominante, l.base),
    masViejo: l.masViejo,
    textos: l.base.map((a) => [a.title, a.body].filter(Boolean).join(' — ')).filter((t) => t.trim()),
  }
}

export async function medirAnunciante(
  page: Page, pageId: string, terminos: string[], country?: string | null,
): Promise<Medicion | null> {
  const l = await leerAnunciante(page, pageId, country)
  return l ? medicionDe(l, terminos) : null
}

/**
 * Decide el estado final. El share se resuelve en código; solo si lo pasa se
 * gasta una llamada a Haiku, y solo para "¿es un producto físico DEL nicho?".
 *
 * `ai` en null = modo sin LLM: mide y marca 'sin_verificar' (esas filas SE
 * SIRVEN, pero sin sello).
 */
export async function juzgarAnunciante(
  ai: Anthropic | null, niche: string, advertiser: string | null, m: Medicion,
): Promise<Veredicto> {
  if (m.share < SHARE_MIN) {
    return {
      status: 'descartado', kind: 'indeterminado', productName: null, medicion: m,
      nota: `no es monoproducto: ${Math.round(m.share * 100)}% del dominante entre ${m.distintos} productos`,
    }
  }
  // ⚠️ LA LISTA NEGRA VA ANTES QUE EL MODELO, y no solo por ahorrar la llamada.
  // `nonPhysicalSignal` (@ph/shared) ya está medida sobre 4.492 anuncios
  // etiquetados y reconoce marketplaces, clínicas, cursos y apps por el nombre
  // del anunciante. Sin este gate el modelo aprobó **Temu Argentina** como
  // monoproducto: con 44 anuncios activos y 96% del mismo organizador, los
  // textos que le llegan describen un producto concreto y nada delata que la
  // página es un marketplace. Sus hermanas con miles de anuncios (Shoptemu,
  // Temu México, TemuColombia) sí cayeron, porque ahí la variedad se nota — o
  // sea que el fallo aparece justo cuando el marketplace parece un producto.
  const negra = nonPhysicalSignal(m.textos.join(' ').slice(0, 600), advertiser)
  if (negra) {
    return {
      status: 'descartado', kind: negra.cluster === 'marketplace' || negra.cluster === 'plataforma' ? 'servicio' : 'indeterminado',
      productName: null, medicion: m,
      nota: `no es producto físico (${negra.cluster}): "${negra.match}" en el anunciante`,
    }
  }

  if (!ai) {
    return {
      status: 'sin_verificar', kind: 'indeterminado', productName: null, medicion: m,
      nota: 'medido sin verificación de nicho (--sin-llm)',
    }
  }

  const v = await juzgarNicho(ai, { niche, advertiser, productPath: m.dominante, textos: m.textos })
  const fisico = v.kind === 'fisico'
  const status = !fisico || !v.perteneceAlNicho ? 'descartado'
    // Sin cita textual que lo respalde el veredicto no se publica: va a revisión.
    : !v.citaVerificada ? 'sin_verificar'
    : 'monoproducto'
  const nota = !fisico ? `no es producto físico (${v.kind}): ${v.motivo}`
    : !v.perteneceAlNicho ? `fuera del nicho: ${v.motivo}`
    : !v.citaVerificada ? `sin cita textual que respalde el veredicto: ${v.motivo}`
    : v.motivo
  return { status, kind: v.kind, nota, productName: v.productName || null, medicion: m }
}

/**
 * Veredicto de UN producto dentro de un anunciante.
 *
 * ⚠️ EL GATE DE SHARE DE LA PÁGINA YA NO DESCARTA. `juzgarAnunciante` arranca
 * con `share < SHARE_MIN → descartado`, y eso tiró **4.860 filas sin que ningún
 * modelo las mirara** (share medio 0,33): son exactamente las páginas
 * multiproducto que esta función existe para atender. Lo que lo reemplaza es el
 * piso de MUESTRA, que es la pregunta honesta — "¿tengo evidencia suficiente de
 * ESTE producto?" — en vez de "¿la página vende una sola cosa?".
 *
 * `juzgarAnunciante` NO se borra: `verify-products.ts` la sigue usando.
 */
export async function juzgarCluster(
  ai: Anthropic | null, niche: string, advertiser: string | null,
  m: Medicion, c: ClusterInfo,
): Promise<Veredicto> {
  if (!c.publicable) {
    return {
      status: 'descartado', kind: 'indeterminado', productName: null, medicion: m,
      nota: `evidencia insuficiente: ${c.n} anuncios de ${m.muestra} en la muestra`,
    }
  }
  // La lista negra mira al ANUNCIANTE, así que sigue aplicando a todos sus
  // clusters: un marketplace no deja de serlo porque uno de sus productos tenga
  // volumen. Ver el comentario de juzgarAnunciante sobre Temu Argentina.
  const negra = nonPhysicalSignal(
    [c.titulo, c.cuerpo].filter(Boolean).join(' ').slice(0, 600), advertiser,
  )
  if (negra) {
    return {
      status: 'descartado',
      kind: negra.cluster === 'marketplace' || negra.cluster === 'plataforma' ? 'servicio' : 'indeterminado',
      productName: null, medicion: m,
      nota: `no es producto físico (${negra.cluster}): "${negra.match}" en el anunciante`,
    }
  }
  if (!ai) {
    return {
      status: 'sin_verificar', kind: 'indeterminado', productName: null, medicion: m,
      nota: 'medido sin verificación de nicho',
    }
  }
  const v = await juzgarNicho(ai, {
    niche, advertiser, productPath: c.key,
    textos: [c.titulo, c.cuerpo].filter((t): t is string => !!t),
  })
  const fisico = v.kind === 'fisico'
  const status = !fisico || !v.perteneceAlNicho ? 'descartado'
    : !v.citaVerificada ? 'sin_verificar'
    : 'monoproducto'
  const nota = !fisico ? `no es producto físico (${v.kind}): ${v.motivo}`
    : !v.perteneceAlNicho ? `fuera del nicho: ${v.motivo}`
    : !v.citaVerificada ? `sin cita textual que respalde el veredicto: ${v.motivo}`
    : v.motivo
  return { status, kind: v.kind, nota, productName: v.productName || null, medicion: m }
}

/**
 * Los PRODUCTOS de un anunciante, ya juzgados y listos para persistir.
 *
 * Vive acá y no en cada script por el motivo de la cabecera de este archivo:
 * `scan-nicho` y `scan-base` tienen que aplicar la MISMA regla, y dos copias es
 * como una se desincroniza. Cada script solo aporta de dónde saca el anunciante.
 *
 * ⚠️ Clusteriza sobre `l.todos`, NUNCA sobre `l.base` — esa ya viene filtrada al
 * dominante y daría un solo cluster sin que nada falle.
 *
 * ⚠️ COSTO: se gasta una llamada al modelo por cluster PUBLICABLE, no por
 * anunciante. Medido sobre 801 filas es ×2 global (×5,8 en las `descartado`,
 * que son catálogos); el piso de `MUESTRA_MIN` es lo que lo acota — sin él, en
 * esas filas serían 5,67 llamadas en vez de 1,86.
 */
/**
 * Une los clusters que son el MISMO producto repartido en varias landings.
 *
 * ⚠️ VA ANTES DE JUZGAR, no después, y eso importa por dos motivos: el veredicto
 * y la llamada al modelo se gastan una sola vez por producto real en vez de una
 * por landing, y el piso de muestra se aplica sobre la muestra SUMADA — un
 * producto con 3+3+3 anuncios en tres landings pasa el piso, y por separado los
 * tres caían.
 *
 * ⚠️ FALLA ABIERTO A PROPÓSITO: sin `OPENAI_API_KEY`, con error de API o con
 * timeout, `embeddings` devuelve null y se sigue SIN fusionar. Fusionar mueve
 * el 2,5% de los tramos; abortar el barrido cuesta el barrido.
 */
async function fusionarClusters(cs: ClusterInfo[]): Promise<ClusterInfo[]> {
  if (cs.length < 2) return cs
  const vecs = await embeddings(cs.map(textoDeCluster))
  return vecs ? fusionarPorEmbedding(cs, vecs) : cs
}

export async function clustersDeAnunciante(
  ai: Anthropic | null,
  ctx: { niche: string; pageId: string; advertiser: string | null; country: string | null },
  l: Lectura,
  m: Medicion,
): Promise<RawClusterRow[]> {
  const filas: RawClusterRow[] = []
  for (const c of await fusionarClusters(clustersOf(l.todos, l.adCount))) {
    // Solo se le pregunta al modelo por lo que podría publicarse.
    const v = await juzgarCluster(c.publicable ? ai : null, ctx.niche, ctx.advertiser, m, c)
    filas.push({
      niche: ctx.niche, page_id: ctx.pageId, cluster_key: c.key,
      ad_count: c.estimado, muestra_n: c.n, muestra_tot: l.muestra,
      titulo: c.titulo, cuerpo: c.cuerpo, url: c.url,
      name: ctx.advertiser, country: ctx.country,
      status: v.status, kind: v.kind, product_name: v.productName,
      verdict_note: v.nota, senal_nicho: m.senal,
      ad_start_date: m.masViejo, verified_at: new Date().toISOString(),
    })
  }
  return filas
}

// Un fallo de la API NO es un veredicto sobre el producto: marcar la fila por
// esto sería mentir y quemar navegaciones. Mismo criterio que verify-products.ts,
// que nació de perder 309 productos por quedarse sin saldo a mitad de un lote.
export function esFalloDeApi(msg: string): boolean {
  return /credit balance|rate_limit|overloaded|429|5\d\d \{|authentication_error|permission_error/i.test(msg)
}
