// Expansión determinista de la semilla (spec §7 y §8).
//
// Sin LLM y sin combinatoria ciega: se unen los cinco grupos del diccionario,
// se agregan las variantes morfológicas de cada uno y se corta en
// MAX_QUERIES_PER_SEED. El tope es CÓDIGO, no un comentario: el spec lo pide
// (§8) y sin él editar un diccionario a mano convierte en silencio una matriz
// de 60 jobs en una de 500 — que es plata y es riesgo de bloqueo.
import { normalizeQuery } from './normalize-query'
import { resolveDictionary, type KeywordExpansion } from './dictionaries'

export const MAX_QUERIES_PER_SEED = Math.max(
  1,
  Number(process.env.DISC_MAX_QUERIES ?? 100),
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
  for (const raw of ordered) {
    for (const variant of morphVariants(normalizeQuery(raw))) {
      if (!variant || seen.has(variant)) continue
      seen.add(variant)
      out.push(variant)
      if (out.length >= MAX_QUERIES_PER_SEED) return out
    }
  }
  return out
}
