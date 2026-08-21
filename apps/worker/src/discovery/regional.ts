// Vocabulario regional (spec §10).
//
// ⚠️ La misma query en dos países es DOS jobs distintos, y eso ya lo garantiza
// la matriz. Lo que agrega este módulo es lo otro que pide el spec: términos que
// solo existen (o solo rinden) en un mercado. Se agregan SOLO al país que los
// declara, así que "botica" no se busca en México.
//
// No se generan dialectos por regla: una regla que inventa variantes léxicas
// produce términos que nadie escribe, y cada término de más es una búsqueda
// pagada en tiempo y en riesgo de bloqueo.
import { normalizeQuery } from './normalize-query'
import { loadRegional } from './dictionaries'

/**
 * Queries del país: las globales más los términos regionales combinados con la
 * semilla. La combinación es semilla × término, no todos-con-todos (spec §9).
 */
export function regionalQueries(seed: string, country: string, base: string[]): string[] {
  const terms = loadRegional()[country.toUpperCase()]?.terms ?? []
  const seen = new Set(base)
  const out = [...base]
  for (const t of terms) {
    const q = normalizeQuery(`${seed} ${t}`)
    if (q && !seen.has(q)) { seen.add(q); out.push(q) }
  }
  return out
}
