import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProductRow, NicheRow, PePoolRow, WatchlistRow, StoredAnalysis, UrlResearchRow, UrlResearchResult, RawProductRow } from './types'
import { bucketRange, type RawBucket } from './raw-buckets'
import { prescore } from './prescore'
import { sanitizeJsonDeep, cleanJsonText } from './json-clean'
import { isPhysicalEnough } from './physical-filter'

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

// Top ganadores frescos de TODOS los nichos (showcase "top picks de la semana").
// Primera lectura cross-niche: espeja getProductsToValidatePe sin filtrar por
// nicho. Sobre-trae (limit×5) para sobrevivir el filtro de toCard + dedupe por
// nicho que hace el caller. Reglas de oro pre-filtradas en SQL (el dedupe final
// y las nulls de toCard las resuelve la ruta).
export async function getTopPicks(limit = 6): Promise<ProductRow[]> {
  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  const { data, error } = await getDb()
    .from('ph_products')
    .select('*')
    .not('score', 'is', null)
    .eq('analysis->>priority', 'alta')
    .neq('raw_data->>found_country', 'PE')
    .gte('scraped_at', since)
    .gte('raw_data->ad_count', 40)   // -> numérico, como getStrongDiscardsToValidate
    .gte('raw_data->days_running', 10)
    .order('score', { ascending: false })
    .limit(limit * 5)
  if (error) throw new Error(error.message)
  return (data as ProductRow[]) ?? []
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

// ─── SERVE: lectura para el usuario (vía RPC, rápido, sin LLM) ─────────────────

// Productos del nicho rankeados con penalización de "visto" (ver migración
// 20260611_seen_economy): frescos-para-el-usuario primero, lo visto-hace-poco al
// fondo y re-aparece tras 7 días. NO excluye → nunca vacío si hay inventario.
export async function getUnseenProducts(
  niche: string,
  userId: string,
  limit = 20
): Promise<ProductRow[]> {
  const { data, error } = await getDb().rpc('ph_unseen_products', {
    p_niche: niche,
    p_user: userId,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return (data as ProductRow[]) ?? []
}

// Cuántos GANADORES (alta/media + reglas de oro) son frescos para el usuario:
// el "nuevos para ti" honesto de la UI. 0 = ya vio todos los recientes.
export async function countUnseenProducts(niche: string, userId: string): Promise<number> {
  const { data, error } = await getDb().rpc('ph_count_unseen', {
    p_niche: niche,
    p_user: userId,
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

export async function markSeen(userId: string, productIds: string[]): Promise<void> {
  if (!productIds.length) return
  // seen_at SE ACTUALIZA al re-ver: resetea el reloj de re-aparición (7 días en
  // ph_unseen_products). Por eso upsert sin ignoreDuplicates — actualiza la fila.
  const now = new Date().toISOString()
  const rows = productIds.map((id) => ({ user_id: userId, product_id: id, seen_at: now }))
  const { error } = await getDb()
    .from('ph_user_seen')
    .upsert(rows, { onConflict: 'user_id,product_id' })
  if (error) throw new Error(error.message)
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
// La economía del visto vive en el código y no en el RPC ph_raw_unseen (que
// filtra status='monoproducto' y quedó sin uso): mismo criterio — lo visto hace
// menos de 7 días va al final, nunca se excluye, así el pool no se vacía.
const VISTO_DIAS = 7
const MAX_VISTOS = 500   // tope del filtro NOT IN: la URL de PostgREST tiene límite
const SOBRE_PEDIDO = 4   // se piden 4× filas porque la lista negra recorta después

function bucketQuery(niche: string, bucket: RawBucket) {
  const { min, max } = bucketRange(bucket)
  let q = getDb().from('ph_raw_products').select('*')
    .eq('niche', niche)
    .neq('status', 'inactivo')     // refresh-active marca así lo que dejó de pautar
    .gte('ad_count', min)
  if (max !== null) q = q.lt('ad_count', max)
  return q.order('ad_count', { ascending: false }).order('page_id')
}

export async function getApprovedByBucket(
  niche: string,
  bucket: RawBucket,
  userId: string,
  limit = 10,
): Promise<RawProductRow[]> {
  const desde = new Date(Date.now() - VISTO_DIAS * 86_400_000).toISOString()
  const { data: seen } = await getDb()
    .from('ph_user_seen').select('product_id')
    .eq('user_id', userId).gte('seen_at', desde).like('product_id', `${niche}:%`)
    .limit(MAX_VISTOS)
  const vistos = (seen ?? []).map((r) => (r.product_id as string).slice(niche.length + 1))

  let q = bucketQuery(niche, bucket).limit(limit * SOBRE_PEDIDO)
  if (vistos.length) q = q.not('page_id', 'in', `(${vistos.join(',')})`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const frescos = fisicos(data as RawProductRow[]).slice(0, limit)
  if (frescos.length >= limit || !vistos.length) return frescos

  // Ya vio todo lo del rango: se le repiten los vistos en vez de devolver menos.
  const { data: repetidos } = await bucketQuery(niche, bucket)
    .in('page_id', vistos).limit(limit * SOBRE_PEDIDO)
  return [...frescos, ...fisicos(repetidos as RawProductRow[]).slice(0, limit - frescos.length)]
}

// Regla 1 sin LLM: la lista negra corre acá y no en la query porque es texto,
// no columna. Por eso se piden SOBRE_PEDIDO× filas y se recortan después.
const fisicos = (rows: RawProductRow[] | null) =>
  (rows ?? []).filter((r) =>
    isPhysicalEnough([r.raw_data?.title, r.raw_data?.body].filter(Boolean).join(' — '), r.name))

// Cuánto inventario servible tiene el nicho — para distinguir "todavía
// scrapeando" de "sin resultados".
export async function countApproved(niche: string): Promise<number> {
  const { count, error } = await getDb()
    .from('ph_raw_products')
    .select('page_id', { count: 'exact', head: true })
    .eq('niche', niche)
    .neq('status', 'inactivo')
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
