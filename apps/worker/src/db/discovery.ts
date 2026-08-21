// Persistencia del descubrimiento. Tablas `disc_*`, ninguna `ph_*`: los dos
// motores conviven y se comparan sobre datos reales antes de jubilar ninguno.
import { randomUUID, createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedAd } from '../normalization/ad'
import type { SearchJob } from '../discovery/matrix'

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

export async function createRun(seedQuery: string, countries: string[]): Promise<string> {
  const id = randomUUID()
  const { error } = await db().from('disc_search_runs').insert({ id, seed_query: seedQuery, countries })
  if (error) throw new Error(`disc_search_runs: ${error.message}`)
  return id
}

export async function finishRun(runId: string): Promise<void> {
  await db().from('disc_search_runs').update({ finished_at: new Date().toISOString() }).eq('id', runId)
}

/**
 * Los ids de las queries se derivan del (run, query, país) en vez de sortearse:
 * así insertar la matriz es idempotente y re-correr una corrida interrumpida no
 * duplica filas ni obliga a leer de vuelta lo que ya se escribió.
 */
export function queryId(runId: string, job: SearchJob): string {
  const h = createHash('sha256').update(`${runId}|${job.query}|${job.country}`).digest('hex')
  // UUID v4-ish determinista: alcanza para una PK y evita una lectura extra.
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join('-')
}

export async function insertQueries(runId: string, jobs: SearchJob[]): Promise<Map<string, string>> {
  const rows = jobs.map((j) => ({
    id: queryId(runId, j), run_id: runId, query: j.query, country: j.country,
    category: j.category ?? null, status: 'pending',
  }))
  // Lotes: PostgREST se atraganta con inserts de miles de filas en un request.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db().from('disc_search_queries')
      .upsert(rows.slice(i, i + 200), { onConflict: 'id' })
    if (error) throw new Error(`disc_search_queries: ${error.message}`)
  }
  return new Map(jobs.map((j) => [`${j.query}|${j.country}`, queryId(runId, j)]))
}

export async function markQuery(
  id: string,
  patch: { status: string; ads_found?: number; pages_read?: number; error?: string | null },
): Promise<void> {
  await db().from('disc_search_queries').update(patch).eq('id', id)
}

/**
 * Guarda los anuncios y sus caminos de descubrimiento.
 *
 * ⚠️ Dos escrituras separadas y en este orden. El anuncio se upsertea por
 * `dedupe_key` (una fila por anuncio, aparezca en una búsqueda o en veinte) y
 * después se registra UNA fila de `disc_ad_discoveries` por (anuncio, query,
 * país). Es el §2 del spec: tres queries que devuelven el mismo anuncio son 1
 * anuncio y 3 caminos, no 3 anuncios ni un contador `vistas` — el contador
 * pierde CUÁL keyword lo encontró, que es justo lo que se necesita para saber
 * qué parte del diccionario rinde.
 */
export async function saveDiscoveries(
  input: NormalizedAd[],
  queryUuid: string,
  country: string,
): Promise<{ ads: number; discoveries: number }> {
  // ⚠️ Deduplicar por `dedupeKey` ANTES de escribir, y no es redundante con el
  // dedupe que ya hace `collectSearch`: los dos miran campos distintos. El de la
  // búsqueda usa el `link_url` CRUDO y este la landing NORMALIZADA, así que dos
  // anuncios sin `ad_archive_id` que solo difieren en un `utm_` pasan como
  // distintos allá y colapsan a la misma clave acá.
  //
  // Con `ignoreDuplicates` (= ON CONFLICT DO NOTHING) Postgres tolera la
  // colisión dentro del mismo comando — verificado contra la base — así que
  // esto NO evita un error. Evita algo más callado: que `ads_found` reporte
  // anuncios que en la base son uno solo, y que el pipeline dependa de esa
  // sutileza de DO NOTHING para no romperse.
  const byKey = new Map<string, NormalizedAd>()
  for (const a of input) if (!byKey.has(a.dedupeKey)) byKey.set(a.dedupeKey, a)
  const ads = [...byKey.values()]
  if (!ads.length) return { ads: 0, discoveries: 0 }

  const now = new Date().toISOString()
  const rows = ads.map((a) => ({
    id: randomUUID(),
    dedupe_key: a.dedupeKey,
    ad_archive_id: a.adArchiveId,
    page_id: a.pageId,
    page_name: a.pageName,
    page_url: a.pageUrl,
    page_categories: a.pageCategories,
    landing_url: a.landingUrl,
    landing_domain: a.landingDomain,
    primary_text: a.primaryText,
    headline: a.headline,
    caption: a.caption,
    cta: a.cta,
    start_date: a.startDate?.toISOString() ?? null,
    collation_count: a.collationCount,
    scraped_at: now,
    raw_data: a.raw as unknown as Record<string, unknown>,
  }))

  // `ignoreDuplicates` = ON CONFLICT DO NOTHING: un anuncio ya visto NO se
  // reescribe, así que conserva su `id` y su `first_seen_at` — que es la señal
  // de longevidad. Por eso los ids se LEEN de vuelta abajo en vez de asumir los
  // `randomUUID()` de este payload: para una fila que ya existía, el uuid que
  // acabamos de generar nunca llegó a la base.
  const { error } = await db().from('disc_ads')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
  if (error) throw new Error(`disc_ads: ${error.message}`)

  const keys = ads.map((a) => a.dedupeKey)
  const ids = new Map<string, string>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error: readErr } = await db().from('disc_ads')
      .select('id,dedupe_key').in('dedupe_key', keys.slice(i, i + 200))
    if (readErr) throw new Error(`disc_ads read: ${readErr.message}`)
    for (const r of (data ?? []) as { id: string; dedupe_key: string }[]) ids.set(r.dedupe_key, r.id)
  }

  const disc = ads.flatMap((a, position) => {
    const adId = ids.get(a.dedupeKey)
    return adId ? [{ ad_id: adId, query_id: queryUuid, country, position }] : []
  })
  for (let i = 0; i < disc.length; i += 200) {
    const { error: dErr } = await db().from('disc_ad_discoveries')
      .upsert(disc.slice(i, i + 200), { onConflict: 'ad_id,query_id,country', ignoreDuplicates: true })
    if (dErr) throw new Error(`disc_ad_discoveries: ${dErr.message}`)
  }

  return { ads: ids.size, discoveries: disc.length }
}

/** Resumen de la corrida para el reporte final del CLI. */
export async function runSummary(runId: string) {
  const { count: queries } = await db().from('disc_search_queries')
    .select('*', { count: 'exact', head: true }).eq('run_id', runId)
  const { data: qs } = await db().from('disc_search_queries')
    .select('id').eq('run_id', runId)
  const qIds = (qs ?? []).map((q) => (q as { id: string }).id)
  let discoveries = 0
  const adIds = new Set<string>()
  for (let i = 0; i < qIds.length; i += 100) {
    const { data } = await db().from('disc_ad_discoveries')
      .select('ad_id').in('query_id', qIds.slice(i, i + 100))
    for (const r of (data ?? []) as { ad_id: string }[]) { discoveries++; adIds.add(r.ad_id) }
  }
  return { queries: queries ?? 0, uniqueAds: adIds.size, discoveries }
}
