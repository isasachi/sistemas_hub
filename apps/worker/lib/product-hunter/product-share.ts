import { cleanJsonText } from '@ph/shared'

// Regla 3 del buscador de productos: la página del anunciante debe tener la MAYORÍA
// de sus anuncios dedicados al mismo producto. De los anuncios activos de un
// anunciante, ¿qué parte es de este producto?
//
// El rango (regla 2) NO se calcula acá: sale del total de anuncios de la página,
// que ya viene en ph_raw_products. Si la página pasa la regla 3, el rango del
// producto es el de la página — por eso no hay dos números.
//
// Núcleo puro + un scanner. No decide nada más: sin reglas de oro, sin score,
// sin competencia PE. Ese es el trabajo de pipeline.ts, que no se toca.
//
// ⚠️ Sesgo deliberado hacia NO perder productos buenos: un producto solo se
// descarta cuando la evidencia alcanza para afirmar que la página NO es
// monoproducto (el intervalo entero por debajo del margen). Duda = se conserva.

// Margen de mayoría. 0.6 = el mismo MIN_PRODUCT_RATIO que goldenDiscard
// define en producción y que nunca llegó a ejecutarse (su insumo,
// main_product_ad_count, es siempre null por cómo scanAdNodes lee los nodos).
export const DEFAULT_MARGIN = 0.6

// Evidencia mínima (en ANUNCIOS, no en creativos) para poder descartar. Por
// debajo de esto no se afirma nada: el producto se conserva sin verificar.
export const MIN_EVIDENCE = 5

// ─── Collations ───────────────────────────────────────────────────────────────
// Meta agrupa los anuncios que comparten creativo y reporta cuántos son en
// `collation_count`, en el MISMO objeto que `ad_archive_id`. `scanAdNodes` no lo
// lee (su rama hoja solo mira ancestros) y por eso el dato se perdía: un
// anunciante con 88 anuncios y 8 creativos parecía tener una muestra de 8.
//
// ⚠️ NO "arreglar" scanAdNodes para que lo lea: quickDiscard descarta con
// collationCount < 40 y estos valores son 1-4, así que empezaría a tirar casi
// todos los candidatos en Etapa 1, en silencio. El dato entra por acá.

export interface Collation {
  id: string
  count: number   // anuncios que comparten este creativo
  text: string    // título — cuerpo, para el matching
}

export function scanCollations(
  obj: unknown,
  pageId: string,
  out: Map<string, Collation> = new Map(),
  depth = 0,
): Map<string, Collation> {
  if (!obj || typeof obj !== 'object' || depth > 25) return out
  const o = obj as Record<string, unknown>
  const adId = o.ad_archive_id ?? o.adArchiveID
  const pid = String(o.page_id ?? o.pageID ?? '')
  if (adId && pid === pageId) {
    const id = String(o.collation_id ?? o.collationID ?? `ad:${adId}`)
    if (!out.has(id)) {
      const snap = (o.snapshot ?? {}) as Record<string, unknown>
      const body = (snap.body ?? {}) as Record<string, unknown>
      // cleanJsonText acá y no en el caller: cualquier consumidor de este texto
      // termina mandándolo a la API, y un emoji partido por el slice la hace
      // rechazar el request entero con 400 (pasó en producción, 2026-08-06).
      const text = cleanJsonText([snap.title, body.text].filter((x) => typeof x === 'string').join(' — '))
      const count = typeof o.collation_count === 'number' && o.collation_count > 0 ? o.collation_count : 1
      out.set(id, { id, count, text: text.trim() })
    }
    return out
  }
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) v.forEach((x) => scanCollations(x, pageId, out, depth + 1))
    else if (v && typeof v === 'object') scanCollations(v, pageId, out, depth + 1)
  }
  return out
}

// Un mismo copy puede venir en varios grupos (distinta imagen). Al clasificador
// se le manda el texto UNA vez; su peso es la suma de anuncios de sus grupos.
export function weighByText(
  groups: Collation[],
  limit = 60,
): { texts: string[]; weights: number[]; total: number } {
  const byText = new Map<string, number>()
  for (const g of groups) {
    // Limpiar DESPUÉS de cortar, no antes: el slice es justo lo que parte el
    // par sustituto de un emoji, así que sanear río arriba no sirve de nada.
    const t = cleanJsonText(g.text.slice(0, 220))
    if (!t) continue
    byText.set(t, (byText.get(t) ?? 0) + g.count)
  }
  const sorted = [...byText.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  return {
    texts: sorted.map(([t]) => t),
    weights: sorted.map(([, w]) => w),
    total: sorted.reduce((a, [, w]) => a + w, 0),
  }
}

// ─── Intervalo ────────────────────────────────────────────────────────────────
// Wilson con corrección por población finita: leer 25 de 40 anuncios no deja la
// misma incertidumbre que leer 25 de 6.000, y el censo no deja ninguna.
export function wilson(k: number, n: number, z = 1.96, population?: number): [number, number] {
  if (n === 0) return [0, 1]
  const p = k / n
  const den = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / den
  // La corrección va SOLO sobre el término de varianza p(1-p)/n. Aplicarla al
  // ancho completo rompe el comportamiento en los bordes: con 30 de 30 el techo
  // caía a 0.97 y el intervalo dejaba de contener al 100% medido. Y colapsar a
  // un punto en el censo fingía certeza total sobre pesos que son aproximados
  // (los collation_count llegan a superar el total que reporta Meta).
  const fpc = population && population > 1 ? Math.max(0, (population - n) / (population - 1)) : 1
  const half = (z * Math.sqrt(((p * (1 - p)) / n) * fpc + (z * z) / (4 * n * n))) / den
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

// ─── Veredicto ────────────────────────────────────────────────────────────────

export type ShareStatus =
  | 'monoproducto'    // la página es de este producto con el margen exigido
  | 'sin_verificar'   // puede serlo: la evidencia no alcanza para negarlo → se conserva
  | 'descartado'      // la evidencia alcanza para afirmar que NO lo es

export interface ShareVerdict {
  status: ShareStatus
  share: number | null       // proporción de anuncios que son del producto
  productAds: number | null  // anuncios atribuibles al producto (informativo)
  coverage: number           // porción del total del anunciante que se observó
  ciLow: number
  ciHigh: number
}

export function classifyShare(input: {
  weightMatched: number
  weightTotal: number
  adCount: number
  margin?: number
  minEvidence?: number
}): ShareVerdict {
  const margin = input.margin ?? DEFAULT_MARGIN
  const minEvidence = input.minEvidence ?? MIN_EVIDENCE
  const { weightMatched, weightTotal, adCount } = input

  if (weightTotal <= 0 || adCount <= 0) {
    return { status: 'sin_verificar', share: null, productAds: null, coverage: 0, ciLow: 0, ciHigh: 1 }
  }

  const share = weightMatched / weightTotal
  // La muestra efectiva son anuncios observados, topada al total que reporta
  // Meta (los pesos pueden superarlo: su conteo va por lo bajo).
  const n = Math.min(weightTotal, adCount)
  const k = Math.round(share * n)
  const [ciLow, ciHigh] = wilson(k, n, 1.96, adCount)
  const productAds = Math.round(share * adCount)
  const coverage = n / adCount

  // Poca evidencia: no se afirma nada, pero el producto NO se pierde.
  if (weightTotal < minEvidence) {
    return { status: 'sin_verificar', share, productAds, coverage, ciLow, ciHigh }
  }
  // Solo se descarta con el intervalo ENTERO bajo el margen. Si lo contiene, la
  // página todavía puede ser mayoría de este producto → se conserva marcada.
  if (ciHigh < margin) {
    return { status: 'descartado', share, productAds, coverage, ciLow, ciHigh }
  }
  const status: ShareStatus = ciLow >= margin ? 'monoproducto' : 'sin_verificar'
  return { status, share, productAds, coverage, ciLow, ciHigh }
}

// ─── Regla 1: producto físico vendible ────────────────────────────────────────
// Va PRIMERO y solo mira el anuncio de referencia, así que se resuelve sin
// navegar la página del anunciante — el caso descartado ahorra la navegación
// entera, no solo la clasificación.
//
// Por qué la decide un modelo y no una lista de palabras: lo que ensucia los
// resultados son apps de novelas, cursos, planes de entrenamiento y parques de
// diversiones. `isLikelyService` (léxico, sobre nombre y categorías) no los ve,
// y sus falsos positivos ya costaron caro — llegó a descartar "Purina Dog Chow"
// en el nicho de comida para perros por no repetir la palabra del nicho.

export type ProductKind = 'fisico' | 'digital' | 'servicio' | 'contenido' | 'indeterminado'

// Solo lo físico sigue. 'indeterminado' NO se descarta: sin evidencia no se
// pierde un producto (mismo sesgo que el resto del módulo).
export function passesPhysicalGate(kind: ProductKind): boolean {
  return kind === 'fisico' || kind === 'indeterminado'
}

// ─── Matching determinista (alternativa al modelo) ───────────────────────────
// Mismo trabajo que la regla 3 pide al LLM — "cuáles de estos anuncios son el
// mismo producto que la referencia" — resuelto con texto, sin API.
//
// La idea: dentro de UNA página, los tokens que aparecen en casi todos los
// anuncios son la marca y el vocabulario de la casa ("envío", "oferta", el
// nombre del anunciante). No distinguen nada. Los que aparecen en pocos son los
// que nombran al producto. Es TF-IDF acotado a la propia página: se pesa cada
// token por lo raro que es AHÍ, no en el idioma.
//
// No reemplaza al modelo en criterio (no sabe que "faja" y "cinturilla" son lo
// mismo si no comparten palabras), pero no cuesta nada y es reproducible al
// 100%: la misma entrada da siempre la misma salida.

const STOP_ES = new Set([
  'para','con','los','las','del','que','por','una','uno','unos','unas','este','esta','estos','estas',
  'desde','hasta','sobre','como','todo','toda','todos','todas','more','your','the','and','you',
  'envio','envío','gratis','oferta','ahora','solo','sólo','descuento','compra','comprar','precio',
  'pedido','entrega','pago','contra','cuotas','stock','hoy','aqui','aquí','link','click','clic',
  'whatsapp','tienda','oficial','original','calidad','mejor','nuevo','nueva','promocion','promoción',
])

export function tokenize(text: string): Set<string> {
  const limpio = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  const out = new Set<string>()
  for (const t of limpio.split(/[^a-z0-9ñ]+/)) {
    if (t.length < 4 || STOP_ES.has(t) || /^\d+$/.test(t)) continue
    // Colapso de plural (misma tolerancia que niche-match): sin esto "rodilla" y
    // "rodillas" son tokens distintos y dos anuncios del mismo producto pueden
    // no compartir ninguno.
    out.add(t.length >= 6 && t.endsWith('es') ? t.slice(0, -2) : t.endsWith('s') && t.length >= 5 ? t.slice(0, -1) : t)
  }
  return out
}

// Tokens que NO aparecen en más de `maxDf` de los anuncios de la página: los que
// separan un producto de otro dentro del mismo anunciante.
export function distinctiveTokens(docs: Set<string>[], maxDf = 0.6): Set<string> {
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1)
  const techo = Math.max(1, Math.floor(docs.length * maxDf))
  const out = new Set<string>()
  for (const [t, n] of df) if (n <= techo) out.add(t)
  return out
}

export interface DeterministicMatch {
  matched: boolean[]
  weightMatched: number
  scores: number[]
}

// Devuelve qué anuncios son del mismo producto que `reference`, por solapamiento
// de tokens distintivos. `minScore` es la fracción de los tokens distintivos de
// la referencia que el anuncio debe compartir.
export function matchByText(
  reference: string,
  texts: string[],
  weights: number[],
  minScore = 0.3,
): DeterministicMatch {
  const docs = texts.map(tokenize)
  const refDoc = tokenize(reference)
  const distintivos = distinctiveTokens([refDoc, ...docs])
  const refSignal = [...refDoc].filter((t) => distintivos.has(t))

  const scores = docs.map((d, i) => {
    // Texto idéntico al de la referencia: coincide sin más análisis.
    if (texts[i].trim() && reference.trim() && texts[i].trim() === reference.trim()) return 1
    if (refSignal.length === 0) return 0
    const comunes = refSignal.filter((t) => d.has(t)).length
    return comunes / refSignal.length
  })
  const matched = scores.map((s) => s >= minScore)
  const weightMatched = matched.reduce((a, m, i) => a + (m ? weights[i] : 0), 0)
  return { matched, weightMatched, scores }
}

// ─── Concentración: monoproducto sin identificar el producto ─────────────────
// La regla es "la página se dedica a un producto", no "cuáles anuncios son el
// producto X". Eso se mide sin resolver sinónimos: si un mismo término de
// contenido aparece en casi todos los anuncios de la página, la página está
// concentrada; si cada anuncio habla de algo distinto, es un catálogo.
//
// Es más robusto que el matching contra una referencia: dos anuncios del mismo
// producto con ángulos de copy distintos igual comparten el sustantivo que lo
// nombra, aunque no compartan el resto.

export interface Concentration {
  share: number         // peso de anuncios cubiertos por el término dominante
  term: string | null   // el término que los une
  covered: number       // cuántos anuncios lo contienen
  docs: number
}

// `share` es la fracción de ANUNCIOS (ponderada por collation_count) que contiene
// el término de contenido más extendido de la página. `minLen` evita que ganen
// abreviaturas ruidosas.
export function concentration(texts: string[], weights: number[]): Concentration {
  const docs = texts.map(tokenize)
  const total = weights.reduce((a, b) => a + b, 0)
  if (!docs.length || total <= 0) return { share: 0, term: null, covered: 0, docs: docs.length }

  // Peso acumulado por token. No se filtra por frecuencia alta: acá el token
  // ubicuo es justamente la señal (al revés que en el matching por referencia).
  const peso = new Map<string, number>()
  const cuenta = new Map<string, number>()
  for (let i = 0; i < docs.length; i++) {
    for (const t of docs[i]) {
      peso.set(t, (peso.get(t) ?? 0) + weights[i])
      cuenta.set(t, (cuenta.get(t) ?? 0) + 1)
    }
  }
  let term: string | null = null
  let mejor = 0
  for (const [t, w] of peso) {
    if (w > mejor) { mejor = w; term = t }
  }
  return {
    share: mejor / total,
    term,
    covered: term ? (cuenta.get(term) ?? 0) : 0,
    docs: docs.length,
  }
}
