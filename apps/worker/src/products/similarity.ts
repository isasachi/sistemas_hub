// Similitud léxica (spec §27). Jaccard sobre tokens + Levenshtein normalizado,
// sin embeddings: el spec lo dice explícito y además hace que dos corridas den
// el mismo resultado.
import { tokens } from './canonicalize'

/** |A ∩ B| / |A ∪ B| sobre los tokens del nombre. */
export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a))
  const B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

/**
 * Levenshtein normalizado a [0,1]. Dos filas en vez de la matriz completa: los
 * nombres son cortos, pero esto se llama N² veces al agrupar los productos de un
 * anunciante y ahí la matriz sí se nota.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let cur = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

export function levenshteinRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  if (!max) return 1
  return 1 - levenshtein(a, b) / max
}

/**
 * Similitud combinada. Se toma el MÁXIMO de las dos y no el promedio: cada una
 * captura un parecido distinto y promediarlas castiga al que acierta.
 * "irrigador bucal pro" vs "irrigador dental pro" comparte 2 de 4 tokens
 * (jaccard 0,5) pero se escribe casi igual (levenshtein 0,84).
 */
export function similarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  const ta = tokens(a).join(' ')
  const tb = tokens(b).join(' ')
  if (!ta || !tb) return 0
  if (ta === tb) return 1
  return Math.max(jaccard(a, b), levenshteinRatio(ta, tb))
}
