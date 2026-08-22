// Lectura del motor de descubrimiento (`disc_*`). El front hace SELECT y nada
// más: el scraping, el análisis y el ranking corren en el worker.
//
// ⚠️ NO toca una sola fila `ph_*`. Los dos motores conviven para poder
// compararlos sobre datos reales antes de jubilar ninguno.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RawBucket } from './raw-buckets'
import type { RawFilters } from './db'

let _db: SupabaseClient | null = null
function db(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return _db
}

// ⚠️ DOS VOCABULARIOS DE RANGO, MISMOS CORTES. El motor nuevo usa
// `0_49/50_99/100_plus` (sin ambigüedad en el 50); la UI vieja usa
// `0-50/50-100/100+`. Los tramos son idénticos —[0,50) [50,100) [100,∞)— así
// que la traducción es exacta y no mueve a nadie de tramo. `raw-buckets.ts` no
// se toca: cambiarlo movería el serving del buscador que ya está en producción.
export const DISC_BUCKET: Record<RawBucket, string> = {
  '0-50': '0_49',
  '50-100': '50_99',
  '100+': '100_plus',
}

export interface DiscoveryRow {
  dedupe_key: string
  seed_query: string
  page_id: string
  advertiser: string | null
  product_name: string | null
  headline: string | null
  body: string | null
  landing: string | null
  countries: string[] | null
  bucket: string | null
  advertiser_ads: number | null
  product_ads: number | null
  product_share: number | null
  monoproduct: boolean | null
  days_active: number | null
  score: number | null
}

const COLS =
  'dedupe_key,seed_query,page_id,advertiser,product_name,headline,body,landing,' +
  'countries,bucket,advertiser_ads,product_ads,product_share,monoproduct,days_active,score'

/**
 * Un rango del ranking, ordenado por score.
 *
 * `seed` acota a una semilla (los chips de la UI); sin él sirve todo el
 * inventario descubierto.
 */
export async function getDiscoveryRanked(
  bucket: RawBucket,
  limit: number,
  seed?: string | null,
  filters?: RawFilters,
): Promise<DiscoveryRow[]> {
  let q = db().from('disc_ranked').select(COLS)
    .eq('bucket', DISC_BUCKET[bucket])
    .order('score', { ascending: false })
    .limit(limit)
  if (seed) q = q.eq('seed_query', seed)
  // `countries` es un array: el mismo anunciante se descubre en varios países y
  // quedarse con uno solo borraría cobertura.
  if (filters?.country) q = q.contains('countries', [filters.country])
  // A diferencia del motor viejo, acá `days_active` SIEMPRE está medido (sale de
  // `start_date` del anuncio), así que no hace falta tolerar NULL.
  if (filters?.minDias) q = q.gte('days_active', filters.minDias)
  const { data, error } = await q
  if (error) throw new Error(`disc_ranked: ${error.message}`)
  return (data ?? []) as unknown as DiscoveryRow[]
}

/**
 * Las semillas con inventario rankeado, para los chips de la UI.
 *
 * ⚠️ Sale de `disc_ranked`, NO de `disc_search_runs`. Una semilla que se
 * descubrió pero todavía no se rankeó pintaría un chip que devuelve vacío, y un
 * chip que no trae nada se lee como una herramienta rota. Consecuencia a tener
 * presente: una corrida sin rankear es INVISIBLE en la UI — se ve en
 * `disc_search_runs`, no acá.
 */
export async function getDiscoverySeeds(): Promise<string[]> {
  const { data, error } = await db().from('disc_ranked').select('seed_query').limit(5000)
  if (error) throw new Error(`disc_ranked seeds: ${error.message}`)
  const rows = (data ?? []) as { seed_query: string }[]
  return [...new Set(rows.map((r) => r.seed_query))].sort()
}
