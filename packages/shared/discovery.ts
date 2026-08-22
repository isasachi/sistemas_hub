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

/**
 * ⚠️ SE SIRVE LA VISTA, NO LA TABLA. `disc_ranked_activo` excluye a los
 * anunciantes que el recrawl mandó a `archived` (dos pasadas seguidas sin un
 * solo anuncio activo). Leyendo `disc_ranked` a secas, un anunciante muerto
 * seguía apareciendo con sus números CONGELADOS y su sello "Monoproducto 100%"
 * para siempre: medido, se archivó uno y la respuesta de la API no cambió ni una
 * fila. Es la cláusula que el §11 del spec ya tenía.
 */
const TABLA = 'disc_ranked_activo'

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
  let q = db().from(TABLA).select(COLS)
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
  const { data, error } = await db().from(TABLA).select('seed_query').limit(5000)
  if (error) throw new Error(`disc_ranked seeds: ${error.message}`)
  const rows = (data ?? []) as { seed_query: string }[]
  return [...new Set(rows.map((r) => r.seed_query))].sort()
}

// ─── Productos reclamados (flujo de un producto por vez) ──────────────────────

export interface ClaimResumen {
  /** Productos que cuentan contra el cupo (los descartados con un cambio no). */
  productos: number
  /** Cambios (comodines) gastados. */
  comodines: number
}

/**
 * Cuánto lleva usado este usuario.
 *
 * ⚠️ SE CUENTA DESDE LAS FILAS, no desde un contador. Es el mismo criterio que
 * los créditos de imagen del hub: sin saldo guardado no existe el estado
 * desincronizado de "descontó pero no se guardó el reclamo".
 */
export async function claimResumen(userId: string): Promise<ClaimResumen> {
  const { data, error } = await db().from('disc_claims')
    .select('descartado').eq('user_id', userId).limit(5000)
  if (error) throw new Error(`disc_claims: ${error.message}`)
  const filas = (data ?? []) as { descartado: boolean }[]
  return {
    productos: filas.filter((f) => !f.descartado).length,
    comodines: filas.filter((f) => f.descartado).length,
  }
}

/** Lo que este usuario ya se llevó, lo más reciente primero. */
export async function claimsDe(userId: string, limit = 200): Promise<DiscoveryRow[]> {
  const { data, error } = await db().from('disc_claims')
    .select('dedupe_key,taken_at,descartado').eq('user_id', userId)
    .order('taken_at', { ascending: false }).limit(limit)
  if (error) throw new Error(`disc_claims: ${error.message}`)
  const claves = (data ?? []).filter((c) => !(c as { descartado: boolean }).descartado)
    .map((c) => (c as { dedupe_key: string }).dedupe_key)
  if (!claves.length) return []
  // ⚠️ Se lee de `disc_ranked`, NO de la vista: la vista excluye justamente lo
  // reclamado, así que su propia lista le saldría vacía.
  const { data: filas } = await db().from('disc_ranked').select(COLS).in('dedupe_key', claves)
  return (filas ?? []) as unknown as DiscoveryRow[]
}

/**
 * Reclama un producto. Devuelve false si ya estaba reclamado (por cualquiera).
 *
 * ⚠️ EL INSERT ES LA CARRERA GANADA. Dos usuarios pueden pedir el mismo producto
 * en el mismo instante —la vista los sirve a los dos hasta que uno escribe—, así
 * que quien gana es quien inserta primero: la PK compuesta rechaza al segundo y
 * ahí se le entrega otro. Comprobar antes con un SELECT dejaría la ventana
 * abierta.
 */
export async function tomarProducto(
  userId: string, dedupeKey: string, seed: string | null,
): Promise<boolean> {
  const { error } = await db().from('disc_claims')
    .insert({ user_id: userId, dedupe_key: dedupeKey, seed_query: seed })
  if (!error) return true
  // 23505 = unique_violation: ya lo tenía alguien (o él mismo).
  if ((error as { code?: string }).code === '23505') return false
  throw new Error(`tomarProducto: ${error.message}`)
}

/** Guarda la encuesta y, si gastó un cambio, marca el producto como descartado. */
export async function cerrarClaim(
  userId: string, dedupeKey: string,
  encuesta: { anuncios: boolean | null; unSoloProducto: boolean | null },
  comodin: boolean,
): Promise<void> {
  const { error } = await db().from('disc_claims').update({
    ok_anuncios: encuesta.anuncios,
    ok_monoproducto: encuesta.unSoloProducto,
    descartado: comodin,
  }).eq('user_id', userId).eq('dedupe_key', dedupeKey)
  if (error) throw new Error(`cerrarClaim: ${error.message}`)
}
