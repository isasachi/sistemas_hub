// Fase 10: persistir el ranking. Es lo que lee el front — un SELECT, sin joins.
//
// ⚠️ La unidad es (anunciante, producto). `rank.ts` ya la colapsó; acá solo se
// escribe. El `dedupe_key` reproduce esa misma clave para que una segunda
// corrida de la misma semilla ACTUALICE la fila en vez de duplicarla.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeText } from '../normalization/text'

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

export interface RankedRow {
  page_id: string
  advertiser: string | null
  product_id: string | null
  product_name: string | null
  headline: string | null
  body: string | null
  landing: string | null
  countries: string[]
  bucket: string | null
  advertiser_ads: number | null
  product_ads: number
  product_share: number
  monoproduct: boolean
  days_active: number
  relevance: number
  score: number
  accepted_ads: number
}

export function rankedKey(pageId: string, productName: string | null): string {
  return `${pageId}|${normalizeText(productName) || '—'}`
}

export async function saveRanked(
  seedQuery: string,
  runId: string | null,
  rows: RankedRow[],
): Promise<number> {
  if (!rows.length) return 0
  const payload = rows.map((r) => ({
    dedupe_key: rankedKey(r.page_id, r.product_name),
    seed_query: seedQuery,
    run_id: runId,
    ...r,
    ranked_at: new Date().toISOString(),
  }))
  const { error } = await db().from('disc_ranked')
    .upsert(payload, { onConflict: 'dedupe_key' })
  if (error) throw new Error(`disc_ranked: ${error.message}`)
  return payload.length
}
