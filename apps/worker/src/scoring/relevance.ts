// Relevancia sin IA (spec §39-41): BM25 sobre el texto del candidato contra las
// keywords expandidas.
//
// ⚠️ DECISIÓN EXPLÍCITA SOBRE EL IDF, porque cambia qué significa el número.
// BM25 necesita frecuencias de documento, y esas dependen del corpus. Acá el
// corpus es LA CORRIDA: el IDF se calcula sobre los documentos que se están
// puntuando. Consecuencia real y no cosmética: **el score de un anuncio es
// reproducible dentro de una corrida, pero puede moverse entre corridas** si el
// conjunto cambia. Se eligió así porque el IDF es lo que evita que una palabra
// presente en todos los anuncios ("dental" en un corpus dental) domine el
// puntaje. La alternativa —TF puro contra la lista de keywords— es estable
// entre corridas pero no distingue lo genérico de lo distintivo.
import { normalizeText } from '../normalization/text'

const K1 = 1.2
const B = 0.75

const tokenize = (s: string): string[] =>
  normalizeText(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2)

export interface ScoredDoc {
  id: string
  text: string
}

/**
 * BM25 de cada documento contra la query, normalizado contra el MEJOR documento
 * de la corrida.
 *
 * ⚠️ ESTO SIRVE PARA ORDENAR, NO PARA UN UMBRAL, y confundirlo costó una corrida
 * entera. Al dividir por el máximo, el mejor documento saca 1,00 SIEMPRE y el
 * resto queda repartido por debajo por construcción — así que compararlo contra
 * el 0,55 absoluto del §43 no mide "¿es relevante?" sino "¿está en el top de
 * ESTA tanda?". Medido: de 32 anuncios, 22 se cayeron por LOW_RELEVANCE aunque
 * eran pastas dentales y protectores bucales sobre una semilla de "dolor de
 * muela". Para el gate está `idfCoverage`.
 */
export function bm25(docs: ScoredDoc[], queryTerms: string[]): Map<string, number> {
  const out = new Map<string, number>()
  if (!docs.length) return out

  const terms = [...new Set(queryTerms.flatMap(tokenize))]
  const tokenized = docs.map((d) => ({ id: d.id, toks: tokenize(d.text) }))
  const avgLen = tokenized.reduce((n, d) => n + d.toks.length, 0) / tokenized.length || 1

  // Frecuencia de documento por término, sobre el corpus de ESTA corrida.
  const df = new Map<string, number>()
  for (const t of terms) {
    let n = 0
    for (const d of tokenized) if (d.toks.includes(t)) n++
    df.set(t, n)
  }

  const N = tokenized.length
  const raw = new Map<string, number>()
  for (const d of tokenized) {
    const len = d.toks.length || 1
    const tf = new Map<string, number>()
    for (const tok of d.toks) tf.set(tok, (tf.get(tok) ?? 0) + 1)

    let score = 0
    for (const t of terms) {
      const f = tf.get(t) ?? 0
      if (!f) continue
      const n = df.get(t) ?? 0
      // IDF de Robertson con el +0.5 que evita el negativo cuando un término
      // está en más de la mitad del corpus.
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / avgLen))))
    }
    raw.set(d.id, score)
  }

  const max = Math.max(...raw.values(), 0)
  for (const [id, s] of raw) out.set(id, max > 0 ? Number((s / max).toFixed(4)) : 0)
  return out
}

/**
 * Relevancia ABSOLUTA: qué tan bien cubre el documento la MEJOR de las frases
 * buscadas, ponderando cada palabra por su IDF.
 *
 * ⚠️ Se mide por FRASE y se toma el máximo, no la cobertura del conjunto
 * expandido. La expansión son ~33 frases y ningún anuncio contiene todas: medir
 * contra la unión daría ~0,1 a cualquier anuncio, incluido el perfecto, y el
 * umbral del §43 volvería a rechazar todo. La pregunta correcta no es "¿cubre
 * todo lo que buscamos?" sino "¿coincide con algo de lo que buscamos?".
 *
 * Absoluto = no depende de qué otros documentos haya en la tanda, así que sí se
 * puede comparar contra un umbral fijo. El IDF sale igual del corpus de la
 * corrida (por eso en un corpus dental "dental" pesa poco y "bruxismo" mucho),
 * pero los extremos no se mueven: sin ningún término de la frase da 0, con
 * todos da 1.
 */
export function phraseCoverage(
  docs: ScoredDoc[],
  phrases: string[],
): Map<string, number> {
  const out = new Map<string, number>()
  if (!docs.length) return out

  const tokenized = docs.map((d) => ({ id: d.id, toks: new Set(tokenize(d.text)) }))
  const N = tokenized.length
  const allTerms = [...new Set(phrases.flatMap(tokenize))]

  const idf = new Map<string, number>()
  for (const t of allTerms) {
    let n = 0
    for (const d of tokenized) if (d.toks.has(t)) n++
    idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)))
  }

  const phraseToks = phrases
    .map((p) => tokenize(p))
    .filter((ts) => ts.length > 0)

  for (const d of tokenized) {
    let best = 0
    for (const ts of phraseToks) {
      let total = 0
      let hit = 0
      for (const t of ts) {
        const w = idf.get(t) ?? 0
        total += w
        if (d.toks.has(t)) hit += w
      }
      if (total > 0) best = Math.max(best, hit / total)
    }
    out.set(d.id, Number(best.toFixed(4)))
  }
  return out
}

/**
 * Bonus del §41: dos términos de la query cerca uno del otro pesan más que
 * dispersos. "dolor" y "dental" a 3 palabras es una frase; a 200, coincidencia.
 */
export function proximityBonus(text: string, queryTerms: string[], window = 5): number {
  // ⚠️ Acá se tokeniza SIN descartar las palabras cortas. `tokenize` las filtra
  // (sirve para BM25, donde no aportan), pero la proximidad se mide en
  // POSICIONES: quitando palabras del medio, dos términos separados por media
  // frase quedan pegados y el bonus premia una cercanía que no existe. Medido:
  // "dolor" y "dental" con 30 palabras cortas entre medio daban la misma
  // distancia que "dolor dental".
  const toks = normalizeText(text).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const wanted = new Set(queryTerms.flatMap(tokenize))
  const hits: number[] = []
  toks.forEach((t, i) => { if (wanted.has(t)) hits.push(i) })
  if (hits.length < 2) return 0
  let best = Infinity
  for (let i = 1; i < hits.length; i++) best = Math.min(best, hits[i] - hits[i - 1])
  return best <= window ? 1 - best / (window + 1) : 0
}
