import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProductRow, NicheRow, ProductAnalysis } from './types'

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
    name: p.name,
    raw_data: p.raw_data,
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
export async function getProductsToAnalyze(niche: string, limit = 50): Promise<ProductRow[]> {
  const freshAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getDb()
    .from('ph_products')
    .select('*')
    .eq('niche', niche)
    .is('score', null)
    .gt('scraped_at', freshAfter)
    .order('scraped_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as ProductRow[]) ?? []
}

// Devuelve TODOS los anunciantes de Perú del nicho (la competencia local),
// para que el análisis clasifique el escenario A/B/C/D sin scrapear en vivo.
export async function getPeCompetitors(niche: string): Promise<ProductRow[]> {
  const freshAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getDb()
    .from('ph_products')
    .select('*')
    .eq('niche', niche)
    .eq('raw_data->>found_country', 'PE')
    .gt('scraped_at', freshAfter)
  if (error) throw new Error(error.message)
  return (data as ProductRow[]) ?? []
}

export async function saveProductAnalysis(
  productId: string,
  score: number,
  analysis: ProductAnalysis
): Promise<void> {
  const { error } = await getDb()
    .from('ph_products')
    .update({ score, analysis, analyzed_at: new Date().toISOString() })
    .eq('id', productId)
  if (error) throw new Error(error.message)
}

// ─── SERVE: lectura para el usuario (vía RPC, rápido, sin LLM) ─────────────────

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
  const rows = productIds.map((id) => ({ user_id: userId, product_id: id }))
  const { error } = await getDb()
    .from('ph_user_seen')
    .upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}
