// Expansión determinista de la semilla (spec §7 y §8).
//
// Sin LLM y sin combinatoria ciega: se unen los cinco grupos del diccionario,
// se agregan las variantes morfológicas de cada uno y se corta en
// MAX_QUERIES_PER_SEED. El tope es CÓDIGO, no un comentario: el spec lo pide
// (§8) y sin él editar un diccionario a mano convierte en silencio una matriz
// de 60 jobs en una de 500 — que es plata y es riesgo de bloqueo.
import { normalizeQuery } from './normalize-query'
import { resolveDictionary, type KeywordExpansion } from './dictionaries'

/**
 * ⚠️ SUBIDO DE 100 A 200 AL CONSOLIDAR LOS DICCIONARIOS, con la medición al lado.
 *
 * El 100 se dimensionó para diccionarios de ~23 términos, donde no llegaba a
 * cortar nunca. Con los nichos fusionados la unidad es otra —un superviviente
 * hereda el vocabulario de varios— y a 100 truncaban **24 de 157 semillas,
 * perdiendo 747 queries en silencio**. Medido a 200: cero truncado, la semilla
 * más grande queda en 178 y el barrido pasa de 30 h a 33 h.
 *
 * El techo real no es el presupuesto sino el TIEMPO DE UN JOB: el scheduler
 * emite un job por (término, país), así que el peor caso son 178 búsquedas ≈ 7
 * min a las 25/min medidas — por debajo del tope de 12 min del runner y del
 * plazo de 15 del reaper. Subirlo más volvería a acercarse a esa pared.
 */
export const MAX_QUERIES_PER_SEED = Math.max(
  1,
  Number(process.env.DISC_MAX_QUERIES ?? 200),
)

// Reglas singular ↔ plural del español (spec §8).
//
// ⚠️ SOLO SE APLICAN AL FINAL DE LA FRASE, y esa restricción es el 20% de la
// matriz. Pluralizar un sustantivo en medio de la frase rompe la concordancia y
// fabrica términos que nadie busca: medido sobre el diccionario de
// "dolor de muela", la versión sin la restricción generaba `dolores dental`,
// `muelas picada`, `dientes sensible` y `dolores al comer` — 10 de 48 queries,
// o sea 10 búsquedas pagadas contra Meta que no podían devolver nada.
//
// Al final de la frase no hay con qué concordar, así que el plural es seguro:
// "dolor de muela" → "dolor de muelas" ✓, "muela picada" → se deja quieta.
const MORPH: [RegExp, string][] = [
  [/muela$/, 'muelas'],
  [/diente$/, 'dientes'],
  [/encia$/, 'encias'],
  [/plantilla$/, 'plantillas'],
  [/crema$/, 'cremas'],
  [/rodillera$/, 'rodilleras'],
]

/** Variantes morfológicas de una query ya normalizada (incluye la original). */
export function morphVariants(query: string): string[] {
  const out = [query]
  for (const [re, to] of MORPH) {
    if (re.test(query)) out.push(query.replace(re, to))
  }
  return out
}

/**
 * Semilla + diccionario → lista de queries únicas, normalizadas y topeada.
 *
 * El orden importa y no es alfabético: la semilla primero, después problema,
 * síntoma, intención, comercial y producto. Cuando el tope corta, corta por la
 * cola — así lo que se pierde es lo más lateral, nunca el término que el
 * usuario escribió.
 */
export function expandKeyword(seed: string, dictionary?: KeywordExpansion): string[] {
  return expandKeywordInfo(seed, dictionary).queries
}

/**
 * Igual que `expandKeyword` pero dice CUÁNTAS queries se perdieron por el tope.
 *
 * ⚠️ EL TRUNCADO NO PUEDE SER SILENCIOSO. Al consolidar los diccionarios, 23 de
 * 147 semillas pasaron a superar las 100 queries —una fusión suma el
 * vocabulario de varios nichos— y la cola se cortaba sin que nada lo dijera: se
 * lee igual que "este nicho se buscó entero". Es la misma regla que ya vale para
 * las búsquedas truncadas por `DISC_MAX_PAGES`.
 */
export function expandKeywordInfo(
  seed: string,
  dictionary?: KeywordExpansion,
): { queries: string[]; descartadas: number } {
  const dict = dictionary ?? resolveDictionary(seed)
  const ordered = [
    seed,
    ...dict.problem,
    ...dict.symptom,
    ...dict.intent,
    ...dict.commercial,
    ...dict.product,
  ]

  const seen = new Set<string>()
  const out: string[] = []
  let descartadas = 0
  for (const raw of ordered) {
    for (const variant of morphVariants(normalizeQuery(raw))) {
      if (!variant || seen.has(variant)) continue
      seen.add(variant)
      if (out.length >= MAX_QUERIES_PER_SEED) { descartadas++; continue }
      out.push(variant)
    }
  }
  return { queries: out, descartadas }
}
