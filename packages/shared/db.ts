import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProductRow, NicheRow, PePoolRow, WatchlistRow, StoredAnalysis, UrlResearchRow, UrlResearchResult, RawProductRow } from './types'
import { bucketRange, type RawBucket } from './raw-buckets'
import { type Pais } from './filtros'
import { prescore } from './prescore'
import { sanitizeJsonDeep, cleanJsonText } from './json-clean'
import { isServible } from './physical-filter'

// Cliente Supabase con service role (bypassa RLS), igual que lib/db.ts del hub.
// Se usa tanto desde rutas Next como desde los scripts de GitHub Actions.
let _db: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  }
  return _db
}

// ─── NICHOS ───────────────────────────────────────────────────────────────────

export async function getNicheStatus(niche: string): Promise<NicheRow | null> {
  const { data } = await getDb().from('ph_niches').select('*').eq('id', niche).single()
  return (data as NicheRow) ?? null
}

// `priority` es OPCIONAL a propósito: si se omite NO se incluye en el payload,
// así el upsert preserva la prioridad existente (Supabase no toca columnas
// ausentes). Incluirla siempre con default 0 borraría la prioridad en cada
// upsertNiche del flujo (scrapeNiche 'active' sin productos, re-encole de
// pipeline) → un nicho de parte del cuerpo perdería su priority. Solo el seed
// la pasa explícita.
export async function upsertNiche(
  niche: string,
  status: 'pending' | 'active',
  priority?: number,
): Promise<void> {
  const row: { id: string; status: string; priority?: number } = { id: niche, status }
  if (priority !== undefined) row.priority = priority
  const { error } = await getDb()
    .from('ph_niches')
    .upsert(row, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

// Actualiza SOLO la prioridad de un nicho existente, sin tocar status (no
// degrada active→pending). El seed la usa para que niches.txt sea la fuente de
// verdad de la prioridad incluso en filas ya sembradas.
export async function updateNichePriority(niche: string, priority: number): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .update({ priority })
    .eq('id', niche)
  if (error) throw new Error(error.message)
}

// Marca un nicho como ALIAS de otro (dedup semántico). Estado terminal: el
// filtro canonical_id IS NULL de getNichesToRefresh lo saca de la cola para
// siempre. status='archived' como defensa extra (también lo excluye). El gate
// del worker garantiza que canonicalId es una raíz (canonical_id null) → no hay
// cadenas; la resolución en serving es de un solo salto.
export async function setNicheCanonical(niche: string, canonicalId: string): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .update({ canonical_id: canonicalId, status: 'archived' })
    .eq('id', niche)
  if (error) throw new Error(error.message)
}

// ⚠️ UPDATE-only (NO upsert): un write de scrape NUNCA debe CREAR la fila del
// nicho. La creación es exclusiva del seed (con priority) o del cold-start
// (upsertNiche). Si esta función usara upsert y la fila estuviera ausente, la
// INSERTaría con priority=0 (default de la columna) → un nicho de parte del
// cuerpo perdería su prioridad al scrapearse (bug 2026-06-19). El nicho SIEMPRE
// existe acá: viene de getNichesToRefresh o fue sembrado/cold-started.
export async function updateNicheAfterScrape(niche: string, productCount: number): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .update({ status: 'active', last_scraped: new Date().toISOString(), product_count: productCount })
    .eq('id', niche)
  if (error) throw new Error(error.message)
}

// Guarda las keywords expandidas del nicho (cache: una expansión por nicho).
// UPDATE-only por la misma razón que updateNicheAfterScrape: no debe crear la
// fila (la nacería en priority 0). El nicho ya existe cuando se resuelven sus
// keywords (viene de la cola / fue sembrado). En --niche manual sobre un nicho
// inexistente, pipeline.ts lo upsertea como pending antes de resolver.
export async function saveNicheKeywords(niche: string, keywords: string[]): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .update({ keywords })
    .eq('id', niche)
  if (error) throw new Error(error.message)
}

// Avanza el cursor de rotación de keywords del nicho (plan 13 parte C).
export async function saveNicheCursor(niche: string, cursor: number): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .update({ keyword_cursor: cursor })
    .eq('id', niche)
  if (error) throw new Error(error.message)
}

// Marca que el nicho ya corrió la pasada ampliada US/ES (garantía de output).
export async function markNicheExpanded(niche: string): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .update({ expanded: true })
    .eq('id', niche)
  if (error) throw new Error(error.message)
}

// Ganadores (alta/media) frescos del nicho — para decidir si ampliar la red.
export async function countNicheWinners(niche: string): Promise<number> {
  const freshAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await getDb()
    .from('ph_products')
    .select('id', { count: 'exact', head: true })
    .eq('niche', niche)
    .gt('scraped_at', freshAfter)
    .in('analysis->>priority', ['alta', 'media'])
  if (error) throw new Error(error.message)
  return count ?? 0
}

// Productos del nicho aún sin analizar (score IS NULL) y frescos — los mismos que
// getProductsToAnalyze tomaría. Señal score-INDEPENDIENTE de "análisis en curso":
// como toCard descarta los score=null, 0 cards NO basta para decir 'empty' (podría
// estar a media-análisis). >0 → seguimos analizando; 0 → ya está todo analizado.
export async function countPendingAnalysis(niche: string): Promise<number> {
  const freshAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await getDb()
    .from('ph_products')
    .select('id', { count: 'exact', head: true })
    .eq('niche', niche)
    .is('score', null)
    .gt('scraped_at', freshAfter)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// Todos los nichos (id + keywords, cualquier status) — para resolver la consulta
// del usuario a un nicho existente antes del cold start (niche-match.ts).
// Incluye pending: una variación de un nicho en cola no debe crear un duplicado.
export async function getAllNicheKeywords(): Promise<Pick<NicheRow, 'id' | 'keywords'>[]> {
  const { data, error } = await getDb().from('ph_niches').select('id, keywords')
  if (error) throw new Error(error.message)
  return (data as Pick<NicheRow, 'id' | 'keywords'>[]) ?? []
}

// Todos los nichos activos — los scripts de CI iteran sobre esto (no sobre el
// mapa estático de keywords.ts, que no conoce los nichos creados por usuarios).
export async function getActiveNiches(): Promise<NicheRow[]> {
  const { data, error } = await getDb()
    .from('ph_niches')
    .select('*')
    .eq('status', 'active')
  if (error) throw new Error(error.message)
  return (data as NicheRow[]) ?? []
}

// Todos los nichos (id + status) — para herramientas de mantenimiento que
// necesitan el set completo (ej. archive-niches.ts diffea contra niches.txt).
export async function getAllNiches(): Promise<Pick<NicheRow, 'id' | 'status'>[]> {
  // Pagina: Supabase topa cada request a 1000 filas. Sin esto, una tabla >1000
  // se trunca silenciosamente (archive/clean dejarían fuera nichos).
  const out: Pick<NicheRow, 'id' | 'status'>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getDb()
      .from('ph_niches').select('id, status').range(from, from + 999)
    if (error) throw new Error(error.message)
    const page = (data as Pick<NicheRow, 'id' | 'status'>[]) ?? []
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

// Marca nichos como 'archived' (los saca de la cola de scrapeo sin borrar sus
// productos). Idempotente; en lotes para no exceder límites de la API.
export async function archiveNiches(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const { error } = await getDb()
      .from('ph_niches')
      .update({ status: 'archived' })
      .in('id', batch)
    if (error) throw new Error(error.message)
  }
}

// Marca nichos como 'blocked' (typos/sensibles, ver blocklist.ts). Como archive
// los saca de la cola, pero el guard de /search ADEMÁS deja de servir sus
// productos. Idempotente; en lotes. Reversible: volver status a 'pending'.
export async function blockNiches(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const { error } = await getDb()
      .from('ph_niches')
      .update({ status: 'blocked' })
      .in('id', batch)
    if (error) throw new Error(error.message)
  }
}

// Para el daemon: nichos pendientes o vencidos. El TTL es configurable vía
// PH_REFRESH_DAYS (default 30 = comportamiento histórico; el daemon del VPS lo
// baja a 7 para inventario fresco semanal).
export async function getNichesToRefresh(): Promise<NicheRow[]> {
  const days = Number(process.env.PH_REFRESH_DAYS ?? 30)
  const staleBefore = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getDb()
    .from('ph_niches')
    .select('*')
    .is('canonical_id', null) // los alias (dedup) nunca re-entran a la cola
    .or(`status.eq.pending,and(status.eq.active,last_scraped.lt.${staleBefore})`)
    // Drain determinista: prioridad alta primero (partes del cuerpo), luego el
    // nunca/menos-recientemente scrapeado, desempate por id. pipeline.ts hace
    // slice(0, NICHE_BATCH) sobre este orden → la prioridad entra a los primeros
    // bloques de cada ciclo.
    .order('priority', { ascending: false })
    .order('last_scraped', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as NicheRow[]) ?? []
}

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

interface UpsertProduct {
  id: string
  niche: string
  page_id: string
  name: string
  raw_data: Record<string, unknown>
}

// Inserta/actualiza candidatos. Preserva score/analysis/analyzed_at en conflicto
// (Supabase upsert sobreescribe, así que solo mandamos los campos del scraper).
export async function upsertProducts(products: UpsertProduct[]): Promise<void> {
  if (!products.length) return
  const now = new Date().toISOString()
  const rows = products.map((p) => ({
    id: p.id,
    niche: p.niche,
    page_id: p.page_id,
    // Sanitizado jsonb: los creativos truncados pueden traer lone surrogates
    // (emoji partido por slice) que Postgres rechaza. Ver json-clean.ts.
    name: cleanJsonText(p.name),
    raw_data: sanitizeJsonDeep(p.raw_data),
    scraped_at: now,
  }))
  // ignoreDuplicates:false + onConflict:id, pero sin tocar score/analysis:
  // Supabase no permite "update solo estas columnas" en upsert, así que
  // hacemos upsert de los campos del scraper y dejamos score/analysis intactos
  // usando una llamada que NO los incluye (quedan con su valor previo).
  const { error } = await getDb()
    .from('ph_products')
    .upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

// Productos aún sin analizar (score IS NULL) y frescos. Para el batch de Anthropic.
// Priorización por prescore P_w: con más pendientes que `limit`, entran primero
// los candidatos con mejor longevidad/volumen — no los más recientes. Supabase no
// ordena por expresión JSONB, así que se trae un pool amplio y se ordena en JS.
export async function getProductsToAnalyze(niche: string, limit = 50): Promise<ProductRow[]> {
  const freshAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getDb()
    .from('ph_products')
    .select('*')
    .eq('niche', niche)
    .is('score', null)
    .gt('scraped_at', freshAfter)
    .order('scraped_at', { ascending: false })
    .limit(limit * 3)
  if (error) throw new Error(error.message)
  const rows = (data as ProductRow[]) ?? []
  return rows
    .sort((a, b) => prescore(b.raw_data) - prescore(a.raw_data))
    .slice(0, limit)
}

// Pool de competidores PE del nicho (tabla ph_pe_pool — separada de ph_products
// por las reglas de oro: un anunciante PE nunca es un producto candidato).
// Lo usa el análisis para clasificar el escenario A/B/C/D sin scrapear en vivo.
export async function getPeCompetitors(niche: string): Promise<PePoolRow[]> {
  const freshAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getDb()
    .from('ph_pe_pool')
    .select('*')
    .eq('niche', niche)
    .gt('scraped_at', freshAfter)
  if (error) throw new Error(error.message)
  return (data as PePoolRow[]) ?? []
}

// Guarda anunciantes PE en el pool (sanitizado jsonb igual que upsertProducts).
export async function upsertPePool(rows: Array<{
  id: string
  niche: string
  page_id: string
  name: string
  raw_data: Record<string, unknown>
}>): Promise<void> {
  if (!rows.length) return
  const now = new Date().toISOString()
  const clean = rows.map((r) => ({
    id: r.id,
    niche: r.niche,
    page_id: r.page_id,
    name: cleanJsonText(r.name),
    raw_data: sanitizeJsonDeep(r.raw_data),
    scraped_at: now,
  }))
  const { error } = await getDb().from('ph_pe_pool').upsert(clean, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export async function saveProductAnalysis(
  productId: string,
  score: number,
  analysis: StoredAnalysis
): Promise<void> {
  // Sanitizado jsonb: peValidation lleva nombres de anunciantes scrapeados en
  // vivo, que pueden traer lone surrogates igual que los creativos.
  const { error } = await getDb()
    .from('ph_products')
    .update({ score, analysis: sanitizeJsonDeep(analysis), analyzed_at: new Date().toISOString() })
    .eq('id', productId)
  if (error) throw new Error(error.message)
}

// Variante additive-only para la reconciliación de batches huérfanos: escribe
// SOLO si el producto sigue sin score (`is('score', null)`), así no clobbea un
// re-análisis fresco ni un reset intencional. Devuelve true si escribió.
export async function saveProductAnalysisIfUnscored(
  productId: string,
  score: number,
  analysis: StoredAnalysis
): Promise<boolean> {
  const { data, error } = await getDb()
    .from('ph_products')
    .update({ score, analysis: sanitizeJsonDeep(analysis), analyzed_at: new Date().toISOString() })
    .eq('id', productId)
    .is('score', null)
    .select('id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

// Candidatos alta/media ya analizados pero aún sin validación PE en vivo (Fase 4).
export async function getProductsToValidatePe(niche: string, limit = 15): Promise<ProductRow[]> {
  const { data, error } = await getDb()
    .from('ph_products')
    .select('*')
    .eq('niche', niche)
    .not('score', 'is', null)
    .in('analysis->>priority', ['alta', 'media'])
    .is('analysis->peValidation', null)
    .order('score', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as ProductRow[]) ?? []
}

// Rescate de falsos-D: descartados por competencia (escenario D del matching de
// pool) pero con validación externa fuerte (40+ ads, 10+ días, no-PE, no servicio).
// El matching por tokens puede sobre-contar competidores cuando los creativos
// comparten vocabulario del nicho; la validación en vivo es el árbitro final.
export async function getStrongDiscardsToValidate(niche: string, limit = 10): Promise<ProductRow[]> {
  const { data, error } = await getDb()
    .from('ph_products')
    .select('*')
    .eq('niche', niche)
    .not('score', 'is', null)
    .in('analysis->>priority', ['descartado', 'baja'])
    .eq('analysis->>peScenario', 'D')
    .is('analysis->peValidation', null)
    .neq('raw_data->>found_country', 'PE')
    .gte('raw_data->ad_count', 40)
    .gte('raw_data->days_running', 10)
    .not('analysis->>reasoning', 'like', '%sin análisis LLM%') // excluir servicios
    .order('raw_data->ad_count', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as ProductRow[]) ?? []
}

// Países donde el nicho tiene más productos ganadores (alta/media), excluyendo PE.
// Usado en scrape.ts para seleccionar los 2 mejores países de descubrimiento.
// Para nichos nuevos sin historial devuelve [] → el caller usa defaults.
export async function getTopCountriesForNiche(niche: string, limit = 2): Promise<string[]> {
  // Seleccionamos solo el campo que necesitamos del JSONB para no traer raw_data completo.
  const { data, error } = await getDb()
    .from('ph_products')
    .select('id, raw_data')
    .eq('niche', niche)
    .in('analysis->>priority', ['alta', 'media'])
    .neq('raw_data->>found_country', 'PE')
  if (error) throw new Error(error.message)

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ raw_data: { found_country?: string } }>) {
    const c = row.raw_data?.found_country
    if (c) counts[c] = (counts[c] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([country]) => country)
}

// ─── WATCHLIST (casi-ganadores — plan 13 parte E) ─────────────────────────────

interface WatchlistInput {
  id: string
  niche: string
  page_id: string
  name: string
  raw_data: Record<string, unknown>
  reason: string
}

// Guarda casi-ganadores (sanitizado jsonb). No pisa first_seen en conflicto:
// solo refresca raw_data/reason del último avistamiento.
export async function upsertWatchlist(rows: WatchlistInput[]): Promise<void> {
  if (!rows.length) return
  const now = new Date().toISOString()
  const clean = rows.map((r) => ({
    id: r.id,
    niche: r.niche,
    page_id: r.page_id,
    name: cleanJsonText(r.name),
    raw_data: sanitizeJsonDeep(r.raw_data),
    reason: r.reason,
    last_checked: now,
  }))
  const { error } = await getDb().from('ph_watchlist').upsert(clean, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

// Entradas de watchlist vencidas para re-chequear (last_checked > maxAgeDays).
export async function getWatchlistToRecheck(niche: string, maxAgeDays = 5, limit = 15): Promise<WatchlistRow[]> {
  const before = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString()
  const { data, error } = await getDb()
    .from('ph_watchlist')
    .select('*')
    .eq('niche', niche)
    .lt('last_checked', before)
    .order('last_checked', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as WatchlistRow[]) ?? []
}

export async function touchWatchlist(id: string): Promise<void> {
  const { error } = await getDb()
    .from('ph_watchlist')
    .update({ last_checked: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function removeFromWatchlist(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await getDb().from('ph_watchlist').delete().in('id', ids)
  if (error) throw new Error(error.message)
}

export async function getActiveNicheIds(): Promise<string[]> {
  const { data, error } = await getDb().from('ph_niches').select('id')
  if (error) throw new Error(error.message)
  return ((data as { id: string }[]) ?? []).map((n) => n.id)
}

// Borra score/analysis de un nicho para re-analizarlo (ej. tras cambiar el prompt).
export async function resetNicheAnalysis(niche: string): Promise<number> {
  const { data, error } = await getDb()
    .from('ph_products')
    .update({ score: null, analysis: null, analyzed_at: null })
    .eq('niche', niche)
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

// ─── RESEARCH POR URL (cola independiente de la de nichos) ────────────────────

// Encola una request de research por URL (la ruta web). Devuelve su id para que
// el frontend haga polling. No scrapea — Vercel no puede.
export async function insertUrlResearch(
  userId: string | null,
  url: string,
  pageId: string | null,
  adId: string | null,
): Promise<string> {
  const { data, error } = await getDb()
    .from('ph_url_research')
    .insert({ user_id: userId, url, page_id: pageId, ad_id: adId, status: 'pending' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export async function getUrlResearch(id: string): Promise<UrlResearchRow | null> {
  const { data } = await getDb().from('ph_url_research').select('*').eq('id', id).maybeSingle()
  return (data as UrlResearchRow) ?? null
}

// Toma la request pendiente más vieja y la marca 'processing' de forma atómica
// (el UPDATE condicional .eq('status','pending') gana la carrera si dos pollers
// corrieran a la vez — hoy es un solo servicio, pero es barato blindarlo).
export async function claimNextUrlResearch(): Promise<UrlResearchRow | null> {
  const { data: pending } = await getDb()
    .from('ph_url_research')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!pending) return null
  const row = pending as UrlResearchRow
  const { data: claimed } = await getDb()
    .from('ph_url_research')
    .update({ status: 'processing' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  return (claimed as UrlResearchRow) ?? null  // null = otro poller la tomó primero
}

export async function saveUrlResearchResult(id: string, result: UrlResearchResult): Promise<void> {
  const { error } = await getDb()
    .from('ph_url_research')
    .update({ status: 'ready', result, processed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// Marca una request como fallida ('error') o bloqueada por Meta ('blocked').
export async function failUrlResearch(
  id: string,
  status: 'error' | 'blocked',
  message: string,
): Promise<void> {
  const { error } = await getDb()
    .from('ph_url_research')
    .update({ status, error: message, processed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── BUSCADOR SIMPLE (tool de TESTEO, temporal — tablas ph_raw_*) ─────────────
// Capa aparte a propósito: no comparte tabla ni reglas con ph_products. Todo
// esto se borra junto con la tool (drop de ph_raw_products / ph_raw_niches).

export async function getRawNicheStatus(
  niche: string,
): Promise<{ id: string; status: string; last_scraped: string | null } | null> {
  const { data } = await getDb().from('ph_raw_niches').select('*').eq('id', niche).maybeSingle()
  return (data as { id: string; status: string; last_scraped: string | null }) ?? null
}

export async function upsertRawNiche(niche: string, status: 'pending' | 'active'): Promise<void> {
  const { error } = await getDb().from('ph_raw_niches').upsert({ id: niche, status }, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

// Cola del scraper simple: pendientes + vencidos (PH_RAW_REFRESH_DAYS, default 7).
export async function getRawNichesToRefresh(): Promise<string[]> {
  const days = Number(process.env.PH_RAW_REFRESH_DAYS ?? 7)
  const staleBefore = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await getDb()
    .from('ph_raw_niches')
    .select('id')
    .or(`status.eq.pending,and(status.eq.active,last_scraped.lt.${staleBefore})`)
    .order('last_scraped', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data as { id: string }[]) ?? []).map((n) => n.id)
}

export async function updateRawNicheAfterScrape(niche: string): Promise<void> {
  const { error } = await getDb()
    .from('ph_raw_niches')
    .upsert({ id: niche, status: 'active', last_scraped: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

// Una fila por (nicho, anunciante). onConflict compuesto: el re-scrape actualiza
// la entrada en vez de duplicarla con otro ad_id.
export async function upsertRawProducts(
  rows: Array<{
    niche: string
    page_id: string
    ad_id: string | null
    name: string | null
    ad_count: number
    country: string | null
    /** Unix seconds del anuncio más viejo — la antigüedad que filtra el buscador. */
    ad_start_date?: number | null
    raw_data: Record<string, unknown>
  }>,
): Promise<void> {
  if (!rows.length) return
  const now = new Date().toISOString()
  const clean = rows.map((r) => ({
    ...r,
    name: r.name ? cleanJsonText(r.name) : null,
    raw_data: sanitizeJsonDeep(r.raw_data),
    scraped_at: now,
  }))
  for (let i = 0; i < clean.length; i += 200) {
    const { error } = await getDb()
      .from('ph_raw_products')
      .upsert(clean.slice(i, i + 200), { onConflict: 'niche,page_id' })
    if (error) throw new Error(error.message)
  }
}

// ─── Verificación (pipeline nuevo: físico → rango → mayoría) ─────────────────

export interface RawVerdictInput {
  niche: string
  page_id: string
  // Conteo leído en vivo durante la verificación. Refresca el ad_count viejo
  // (las filas importadas del pipeline anterior lo traen desactualizado) y con
  // eso el rango, que sale de ese número.
  ad_count?: number | null
  status: 'monoproducto' | 'sin_verificar' | 'descartado'
  kind: string
  share: number | null
  product_name: string | null
  verdict_note: string | null
  // Los escribe el pipeline scan-nicho; el verificador viejo los deja sin tocar.
  senal_nicho?: 'path' | 'titulo' | 'cuerpo' | 'ninguna' | null
  product_path?: string | null
  // Antigüedad del anuncio más viejo (unix seconds). Sale de la lectura del
  // anunciante que el verificador ya hace, así que rellenar la columna en las
  // filas viejas no cuesta ni una navegación ni una llamada al LLM.
  ad_start_date?: number | null
}

// Cola de verificación: productos scrapeados a los que todavía no se les
// aplicaron las tres reglas. Los más viejos primero.
export async function getRawProductsToVerify(limit = 50, niche?: string): Promise<RawProductRow[]> {
  let q = getDb().from('ph_raw_products').select('*').eq('status', 'pendiente')
  if (niche) q = q.eq('niche', niche)
  const { data, error } = await q
    .order('scraped_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as RawProductRow[]) ?? []
}

/**
 * Cola de verificación ordenada por VOLUMEN de anuncios, no por antigüedad.
 * Cruza nichos a propósito: un anunciante con 1.900 anuncios vale más que uno
 * con 3, esté en el nicho que esté.
 *
 * `minAds` filtra el tramo: el grueso del pendiente vive en 1-49 anuncios, donde
 * la muestra es tan chica que el share casi no informa (5 anuncios del mismo
 * producto dan 1.00). Empezar por arriba pone primero lo que se puede medir.
 */
export async function getRawProductsByVolume(
  limit = 60, minAds = 0, maxAds?: number, niche?: string, todo = false,
): Promise<RawProductRow[]> {
  let q = getDb().from('ph_raw_products').select('*')
  // `todo` = toda la base, no solo la cola de pendientes: incluye lo que
  // verificó el motor viejo (que no escribe `senal_nicho`) y lo marcado
  // 'inactivo'. `senal_nicho` es el marcador de "ya pasó por scan-*": lo escribe
  // SIEMPRE ese camino (aunque sea 'ninguna') y nunca el viejo, así que sirve de
  // cola reanudable sin una columna extra. Las filas inconclusas no lo escriben,
  // así que vuelven a salir solas.
  q = todo ? q.is('senal_nicho', null) : q.eq('status', 'pendiente')
  q = q.gte('ad_count', minAds)
  if (typeof maxAds === 'number') q = q.lt('ad_count', maxAds)
  if (niche) q = q.eq('niche', niche)
  const { data, error } = await q
    .order('ad_count', { ascending: false })
    .order('page_id')
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as RawProductRow[]) ?? []
}

/** Filas que ya verificó el pipeline scan-* (las únicas con `senal_nicho`). */
export async function getRawVerificadas(soloAprobados = false): Promise<RawProductRow[]> {
  let q = getDb().from('ph_raw_products')
    .select('niche,page_id,name,country,ad_count,status')
    .not('senal_nicho', 'is', null)
    .not('country', 'is', null)
  if (soloAprobados) q = q.eq('status', 'monoproducto')
  const { data, error } = await q.order('ad_count', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as RawProductRow[]) ?? []
}

/**
 * Corrige SOLO el conteo de anuncios (y con él, el rango). No toca el veredicto:
 * que un producto sea físico y del nicho no cambia porque se cuente en otro
 * mercado.
 */
export async function updateRawAdCount(niche: string, pageId: string, adCount: number): Promise<void> {
  const { error } = await getDb().from('ph_raw_products')
    .update({ ad_count: adCount })
    .eq('niche', niche).eq('page_id', pageId)
  if (error) throw new Error(error.message)
}

export async function countRawPending(): Promise<number> {
  const { count, error } = await getDb()
    .from('ph_raw_products')
    .select('page_id', { count: 'exact', head: true })
    .eq('status', 'pendiente')
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function saveRawVerdict(v: RawVerdictInput): Promise<void> {
  const { error } = await getDb()
    .from('ph_raw_products')
    .update({
      ...(typeof v.ad_count === 'number' && v.ad_count > 0 ? { ad_count: v.ad_count } : {}),
      status: v.status, kind: v.kind, share: v.share,
      product_name: v.product_name ? cleanJsonText(v.product_name) : null,
      verdict_note: v.verdict_note ? cleanJsonText(v.verdict_note).slice(0, 400) : null,
      // Se omiten si vienen undefined para no pisar con null lo que ya haya
      // escrito el otro verificador sobre la misma fila.
      ...(v.senal_nicho !== undefined ? { senal_nicho: v.senal_nicho } : {}),
      ...(v.product_path !== undefined ? { product_path: v.product_path } : {}),
      // Igual que arriba: solo se escribe si se midió. Un null acá borraría la
      // fecha que ya hubiera escrito el scraper de descubrimiento.
      ...(typeof v.ad_start_date === 'number' && v.ad_start_date > 0
        ? { ad_start_date: v.ad_start_date } : {}),
      verified_at: new Date().toISOString(),
    })
    .eq('niche', v.niche)
    .eq('page_id', v.page_id)
  if (error) throw new Error(error.message)
}

// Serving del buscador: TODO el inventario del nicho clasificado solo por rango
// de anuncios (regla 2). Las reglas 1 y 3 no filtran acá — `status` se sigue
// escribiendo por la cola de verificación, pero no se consulta.
//
// ⚠️ El serving NO es personalizado (decisión del dueño del repo, 2026-08-13):
// dos usuarios que abren la misma categoría en el mismo rango ven exactamente lo
// mismo, y volver a entrar devuelve lo mismo otra vez. Antes había una economía
// del visto (`ph_user_seen` + `markSeen`) que hundía lo ya mostrado y lo hacía
// reaparecer a los 7 días; se eliminó entera. La TABLA sigue en la base con sus
// datos — solo dejó de leerse y de escribirse.
const SOBRE_PEDIDO = 4   // se piden 4× filas porque la lista negra recorta después

// Lo que NO llega a la vitrina, por estado:
//   'inactivo'   — refresh-active marca así lo que dejó de pautar.
//   'descartado' — el verificador ya probó que no es un producto físico del
//                  nicho (servicios, cursos, apps, marketplaces, off-topic).
// El resto SÍ se sirve, incluido 'pendiente': el 95% del inventario está sin
// verificar, así que exigir 'monoproducto' dejaría la vitrina en 122 filas.
// Medido antes de excluir 'descartado': 2.878 filas en 15 nichos, y el nicho
// más golpeado conserva 82 productos.
const NO_SERVIBLES = '(inactivo,descartado)'

/**
 * Filtros globales del buscador. Se aplican igual en la búsqueda por nicho y en la
 * de categoría — de ahí "globales".
 */
export interface RawFilters {
  /** Mercado del anuncio. null/undefined = todos. */
  country?: Pais | null
  /** Días mínimos corriendo del anuncio más viejo del anunciante. 0 = sin filtro. */
  minDias?: number | null
}

/**
 * Aplica país y antigüedad a una query ya armada.
 *
 * ⚠️ EL FILTRO DE ANTIGÜEDAD INCLUYE LAS FILAS SIN DATO, y no es un descuido.
 * `ad_start_date` nace NULL: la columna se agregó el 2026-08-20 y se rellena a
 * medida que el worker re-scrapea, así que hoy casi todo el inventario (~70k filas)
 * la tiene vacía. Excluir los NULL dejaría la vitrina en blanco hasta terminar el
 * backfill — es decir, rompería la herramienta para "arreglar" un filtro. La UI lo
 * dice: el filtro promete "al menos X días" sobre lo que sí se pudo medir.
 */
function applyFilters<T>(q: T, f: RawFilters | undefined, now = Date.now()): T {
  if (!f) return q
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let out = q as any
  if (f.country) out = out.eq('country', f.country)
  if (f.minDias && f.minDias > 0) {
    const corte = Math.floor(now / 1000) - f.minDias * 86_400
    out = out.or(`ad_start_date.lte.${corte},ad_start_date.is.null`)
  }
  return out as T
}

function bucketQuery(niche: string, bucket: RawBucket, f?: RawFilters) {
  const { min, max } = bucketRange(bucket)
  let q = getDb().from('ph_raw_products').select('*')
    .eq('niche', niche)
    .not('status', 'in', NO_SERVIBLES)
    .gte('ad_count', min)
  if (max !== null) q = q.lt('ad_count', max)
  q = applyFilters(q, f)
  return q.order('ad_count', { ascending: false }).order('page_id')
}

// Igual que `bucketQuery` pero sobre los N nichos de una categoría. Va aparte y
// no como parámetro opcional del anterior porque el `select` acotado (400 filas
// con `*` es peso al pedo: las columnas del veredicto no se usan al servir)
// obliga a otra lista de columnas, y mezclarlas en una sola función rompe el
// tipado del cliente de Supabase.
//
// Medido 2026-08-12 contra el proyecto real: un `.in()` con los 528 nichos
// (~6.9KB de querystring) responde en ~350ms sin que PostgREST se queje; la
// categoría más grande arma ~2.4KB, así que hay margen de sobra.
function categoriaQuery(niches: string[], bucket: RawBucket, f?: RawFilters) {
  const { min, max } = bucketRange(bucket)
  let q = getDb().from('ph_raw_products')
    .select('niche,page_id,name,product_name,country,ad_count,ad_start_date,raw_data,status,share,senal_nicho')
    .in('niche', niches)
    .not('status', 'in', NO_SERVIBLES)
    .gte('ad_count', min)
  if (max !== null) q = q.lt('ad_count', max)
  q = applyFilters(q, f)
  return q.order('ad_count', { ascending: false }).order('page_id')
}

export async function getApprovedByBucket(
  niche: string,
  bucket: RawBucket,
  limit = 10,
  filters?: RawFilters,
): Promise<RawProductRow[]> {
  const { data, error } = await bucketQuery(niche, bucket, filters).limit(limit * SOBRE_PEDIDO)
  if (error) throw new Error(error.message)
  return fisicos(data as RawProductRow[]).slice(0, limit)
}

/**
 * Serving por CATEGORÍA: el mismo rango, pero sobre los nichos de la categoría.
 *
 * ⚠️ Una categoría NO es "un nicho más grande": la unión de decenas de nichos
 * saca a flote justo lo que el serving por nicho puede tolerar. Medido en dev
 * 2026-08-12 con el orden crudo por anuncios, las 13 categorías abrían con
 * "Shoptemu | Shoptemu | Shoptemu" — el mismo marketplace está registrado en
 * decenas de nichos, así que gana todas. Por eso acá el serving no es el del
 * nicho:
 *
 *   1. los `monoproducto` (verificados: el anunciante dedica su página a ese
 *      producto) van primero, y el relleno excluye lo ya `descartado`;
 *   2. una página (`page_id`) aparece UNA vez aunque esté en cinco nichos;
 *   3. tope por nicho, para que un nicho enorme no se coma la categoría.
 *
 * El resultado NO depende del usuario: la misma categoría en el mismo rango
 * devuelve siempre lo mismo (ver el comentario de `SOBRE_PEDIDO`).
 */
export async function getApprovedByCategory(
  niches: string[],
  bucket: RawBucket,
  limit = 10,
  filters?: RawFilters,
): Promise<RawProductRow[]> {
  if (!niches.length) return []
  const [verificados, resto] = await Promise.all([
    categoriaQuery(niches, bucket, filters).eq('status', 'monoproducto').limit(limit * SOBRE_PEDIDO),
    categoriaQuery(niches, bucket, filters).not('status', 'in', '(inactivo,descartado,monoproducto)')
      .limit(VENTANA_CAT),
  ])
  if (verificados.error) throw new Error(verificados.error.message)
  if (resto.error) throw new Error(resto.error.message)

  const confirmados = fisicos(verificados.data as unknown as RawProductRow[])
  const relleno = fisicos(resto.data as unknown as RawProductRow[])

  // Firma de marketplace: la MISMA página pautando en muchos nichos distintos de
  // la categoría (Shoptemu, Uber, Airbnb, Mercado Pago). No es un producto, es
  // un catálogo, y con decenas de miles de anuncios encabeza todas las
  // categorías. Solo se aplica al relleno sin verificar: un `monoproducto` que
  // aparezca en muchos nichos sí es un producto real bien distribuido.
  const nichosPorPagina = new Map<string, Set<string>>()
  for (const r of relleno) {
    const s = nichosPorPagina.get(r.page_id) ?? new Set<string>()
    s.add(r.niche)
    nichosPorPagina.set(r.page_id, s)
  }
  const esCatalogo = (r: RawProductRow) =>
    (nichosPorPagina.get(r.page_id)?.size ?? 0) >= NICHOS_CATALOGO

  const tope = maxPorNicho(limit)
  const paginas = new Set<string>()
  const porNicho = new Map<string, number>()
  const elegidos: RawProductRow[] = []
  const relegados: RawProductRow[] = []   // los que solo el tope por nicho dejó fuera
  for (const r of [...confirmados, ...relleno.filter((r) => !esCatalogo(r))]) {
    if (paginas.has(r.page_id)) continue
    paginas.add(r.page_id)
    const n = porNicho.get(r.niche) ?? 0
    if (n >= tope) { relegados.push(r); continue }
    porNicho.set(r.niche, n + 1)
    elegidos.push(r)
  }

  // El tope es para variar la categoría, no para dejarla corta.
  return [...elegidos, ...relegados].slice(0, limit)
}

// Máximo de productos del mismo nicho en una categoría. Escala con el pedido: el
// tope existe para que se vean varios nichos, y si no escalara, pedir 50 con
// tope 3 exigiría 17 nichos con stock — las categorías chicas (ortopedia tiene
// 7) llenarían la mayor parte de la página con relegados, o sea con el ranking
// crudo por anuncios que el tope quería evitar. Con limit/8 son ~6 por nicho a
// 50 productos, y sigue en 3 para la pantalla de 10.
const maxPorNicho = (limit: number) => Math.max(3, Math.ceil(limit / 8))
// Ventana del relleno. Tiene que ser MUCHO más grande que el pedido: una
// categoría une decenas de nichos y la misma página aparece repetida en todos
// ellos, así que las primeras filas por anuncios son casi todas copias. Medido
// sobre "Salud y dolor" (207 nichos, el peor caso) sirviendo 50 productos: con
// 400 filas devuelve 42, con 800 llega a 50 y cuesta ~90ms más; de 800 para
// arriba no cambia nada. Antes, sirviendo 10, con 40 filas quedaba en 1.
const VENTANA_CAT = 800
// Cuántos nichos distintos de la categoría tiene que tocar una misma página para
// tratarla como catálogo/marketplace y no como producto.
const NICHOS_CATALOGO = 5

// Todos los nichos que hoy tienen inventario servible — el buscador los agrupa
// en categorías (`categories.ts`) para armar los chips y resolver la búsqueda.
export const getNichesWithInventory = () => getTopNiches(2000)

// La lista negra corre acá y no en la query porque es texto, no columna. Por eso
// se piden SOBRE_PEDIDO× filas y se recortan después.
// Filtra por tres motivos distintos: no es físico (regla 1 sin LLM), es una
// marca grande (física, pero no una oportunidad) o es la red de spam.
const fisicos = (rows: RawProductRow[] | null) =>
  (rows ?? []).filter((r) =>
    isServible([r.raw_data?.title, r.raw_data?.body].filter(Boolean).join(' — '), r.name))

/**
 * Chips de sugerencia de la portada: los nichos con más inventario servible.
 *
 * Vía RPC (`ph_raw_top_niches`) porque PostgREST rechaza los agregados y corta
 * en 1000 filas — contar 28k nichos desde el cliente serían 29 páginas.
 *
 * El conteo NO pasa por el filtro de físico (`fisicos`, que es texto y corre en
 * JS), así que es aproximado. Por eso el número no se muestra: solo ordena.
 */
export async function getTopNiches(limit = 12): Promise<string[]> {
  const { data, error } = await getDb().rpc('ph_raw_top_niches', { p_limit: limit })
  if (error) throw new Error(error.message)
  return ((data ?? []) as { niche: string }[]).map((r) => r.niche)
}

// Cuánto inventario servible tiene el nicho — para distinguir "todavía
// scrapeando" de "sin resultados".
export async function countApproved(niche: string): Promise<number> {
  const { count, error } = await getDb()
    .from('ph_raw_products')
    .select('page_id', { count: 'exact', head: true })
    .eq('niche', niche)
    .not('status', 'in', NO_SERVIBLES)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// Página de un rango de anuncios. Trae limit+1 para que el caller sepa si hay más.
export async function getRawProducts(
  niche: string,
  bucket: RawBucket,
  limit = 30,
  offset = 0,
): Promise<RawProductRow[]> {
  const { min, max } = bucketRange(bucket)
  let q = getDb().from('ph_raw_products').select('*').eq('niche', niche).gte('ad_count', min)
  if (max !== null) q = q.lt('ad_count', max)
  const { data, error } = await q
    .order('ad_count', { ascending: false })
    .order('page_id', { ascending: true })
    .range(offset, offset + limit)
  if (error) throw new Error(error.message)
  return (data as RawProductRow[]) ?? []
}

// ─── Refresco de vigencia (script de 48h) ────────────────────────────────────

// Productos a re-chequear: los que se sirven y los dados de baja (para
// resucitarlos si el anunciante volvió). Los descartados no se re-chequean —
// su veredicto no depende de si siguen pautando.
export async function getProductsToRefresh(limit = 400): Promise<RawProductRow[]> {
  const { data, error } = await getDb()
    .from('ph_raw_products')
    .select('*')
    // Todo lo que se sirve, no solo lo aprobado por el LLM: desde que el
    // serving muestra el inventario completo, filtrar por 'monoproducto' dejaba
    // la vigilancia sobre 122 de 28,730 productos. Los más viejos primero, así
    // la cobertura rota sola entre corridas.
    .order('checked_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as RawProductRow[]) ?? []
}

// Resultado del re-chequeo. `adCount` null = no se pudo leer (no se da de baja
// por eso: un fallo de red no es una baja). 0 = el anunciante dejó de pautar.
export async function saveRefresh(
  niche: string,
  pageId: string,
  adCount: number | null,
  wasInactive: boolean,
): Promise<'baja' | 'alta' | 'sigue' | 'sin_dato'> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { checked_at: now }
  let outcome: 'baja' | 'alta' | 'sigue' | 'sin_dato' = 'sin_dato'

  if (adCount === null) {
    outcome = 'sin_dato'                       // solo se marca el chequeo
  } else if (adCount <= 0) {
    patch.status = 'inactivo'                  // deja de servirse, no se borra
    patch.ad_count = 0
    outcome = wasInactive ? 'sigue' : 'baja'
  } else {
    // El rango sale de ad_count, así que actualizarlo re-rangea solo.
    patch.ad_count = adCount
    // ⚠️ NO se escribe `status` cuando el producto sigue pautando. Antes se
    // ponía 'monoproducto' porque el refresco solo veía filas que YA lo eran;
    // desde que recorre las 28,730 eso reescribiría el veredicto de toda la
    // tabla — los 24,238 'pendiente' saldrían de la cola de verificación sin
    // haberse verificado y los 2,972 'descartado' volverían aprobados.
    // Un anunciante que vuelve a pautar sí cambia: reentra a la cola, porque
    // tras la baja no sabemos si sigue vendiendo lo mismo.
    if (wasInactive) patch.status = 'pendiente'
    outcome = wasInactive ? 'alta' : 'sigue'
  }
  const { error } = await getDb()
    .from('ph_raw_products').update(patch).eq('niche', niche).eq('page_id', pageId)
  if (error) throw new Error(error.message)
  return outcome
}
