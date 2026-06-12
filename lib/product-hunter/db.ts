import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProductRow, NicheRow, PePoolRow, StoredAnalysis } from './types'
import { prescore } from './prescore'
import { sanitizeJsonDeep, cleanJsonText } from './json-clean'

// Cliente Supabase con service role (bypassa RLS), igual que lib/db.ts del hub.
// Se usa tanto desde rutas Next como desde los scripts de GitHub Actions.
let _db: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.SUPABASE_URL!,
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

export async function upsertNiche(niche: string, status: 'pending' | 'active'): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .upsert({ id: niche, status }, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export async function updateNicheAfterScrape(niche: string, productCount: number): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .upsert(
      { id: niche, status: 'active', last_scraped: new Date().toISOString(), product_count: productCount },
      { onConflict: 'id' }
    )
  if (error) throw new Error(error.message)
}

// Guarda las keywords expandidas del nicho (cache: una expansión por nicho).
// Upsert: el nicho puede no existir aún cuando se corre --niche a mano.
export async function saveNicheKeywords(niche: string, keywords: string[]): Promise<void> {
  const { error } = await getDb()
    .from('ph_niches')
    .upsert({ id: niche, keywords }, { onConflict: 'id' })
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

// Para el cron: nichos pendientes o vencidos (TTL 30 días).
export async function getNichesToRefresh(): Promise<NicheRow[]> {
  const staleBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getDb()
    .from('ph_niches')
    .select('*')
    .or(`status.eq.pending,and(status.eq.active,last_scraped.lt.${staleBefore})`)
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
    .eq('analysis->>priority', 'descartado')
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
