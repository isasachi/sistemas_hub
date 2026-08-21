// Search Matrix (spec §11): queries × países → lista de jobs.
import { expandKeyword } from './expand'
import { regionalQueries } from './regional'

export interface SearchJob {
  query: string
  country: string
  /** Grupo del diccionario del que salió, para depurar qué camino rinde. */
  category?: string
}

// Tope duro de la matriz. `MAX_QUERIES_PER_SEED` acota las queries; esto acota
// el producto queries × países, que es lo que realmente se le pide a Meta.
export const MAX_JOBS = Math.max(1, Number(process.env.DISC_MAX_JOBS ?? 400))

/**
 * Los jobs se intercalan POR PAÍS, no agrupados: `q1×MX, q1×CO, …, q2×MX, …`.
 * Si la corrida se corta (bloqueo, Ctrl-C) o el tope recorta, lo que queda
 * cubierto son todos los países con menos keywords — nunca un país entero
 * cubierto y otro sin tocar. Es el mismo criterio que ya usa el motor viejo
 * para su `PH_SEARCH_CAP`.
 */
export function buildMatrix(seed: string, countries: string[]): SearchJob[] {
  const base = expandKeyword(seed)
  const perCountry = new Map(
    countries.map((c) => [c, regionalQueries(seed, c, base)] as const),
  )
  const deepest = Math.max(0, ...[...perCountry.values()].map((q) => q.length))

  const jobs: SearchJob[] = []
  for (let i = 0; i < deepest; i++) {
    for (const country of countries) {
      const query = perCountry.get(country)?.[i]
      if (!query) continue
      jobs.push({ query, country })
      if (jobs.length >= MAX_JOBS) return jobs
    }
  }
  return jobs
}
