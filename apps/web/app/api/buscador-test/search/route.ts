import { NextRequest, NextResponse } from 'next/server'
import {
  getRawNicheStatus,
  getRawProducts,
  upsertRawNiche,
  isBlocked,
  isRawBucket,
  type RawProductEntry,
  type RawSearchResponse,
} from '@ph/shared'

// Buscador SIMPLE (tool de TESTEO, temporal). Igual que la ruta del buscador
// original: SOLO lee de Supabase — ni LLM ni Playwright. El scrapeo lo hace
// apps/worker/scripts/scrape-raw.ts.
//
// Sin reglas de oro y sin score: se devuelve lo que haya del nicho, agrupado por
// rango de anuncios. El ad_count NO se expone (la UI no muestra stats).

const PAGE_SIZE = 30

export async function POST(req: NextRequest) {
  let body: { niche?: string; bucket?: string; offset?: number }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const niche = body.niche?.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!niche) return NextResponse.json({ error: 'Falta el nicho' }, { status: 400 })
  const bucket = isRawBucket(body.bucket) ? body.bucket : '0-50'
  const offset = Math.max(0, Math.trunc(Number(body.offset) || 0))

  const empty = (extra: Partial<RawSearchResponse> = {}): RawSearchResponse => ({
    niche, bucket, status: 'pending', products: [], hasMore: false, ...extra,
  })

  // Mismo guard de términos bloqueados (typos/sensibles) que el buscador original.
  if (isBlocked(niche)) return NextResponse.json(empty({ status: 'empty' }))

  const row = await getRawNicheStatus(niche)
  if (!row) {
    // Cold start: se encola y lo levanta scrape-raw.ts. Vercel no corre Playwright.
    await upsertRawNiche(niche, 'pending')
    return NextResponse.json(empty({ queued: true }))
  }

  const rows = await getRawProducts(niche, bucket, PAGE_SIZE, offset)
  const hasMore = rows.length > PAGE_SIZE
  const products: RawProductEntry[] = rows.slice(0, PAGE_SIZE).map((r) => ({
    id: `${r.niche}:${r.page_id}`,
    advertiser: r.name ?? 'Anunciante',
    title: r.raw_data?.title ?? null,
    body: r.raw_data?.body ?? null,
    country: r.country,
    adsUrl: `https://www.facebook.com/ads/library/?${new URLSearchParams({
      active_status: 'active', ad_type: 'all', country: 'ALL',
      is_targeted_country: 'false', media_type: 'all', search_type: 'page',
      'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
      view_all_page_id: r.page_id,
    })}`,
  }))

  // 'pending' solo si el nicho nunca se scrapeó; si ya corrió y este grupo está
  // vacío, es 'empty' (puede haber resultados en otro rango).
  const status: RawSearchResponse['status'] = products.length
    ? 'ready'
    : row.last_scraped ? 'empty' : 'pending'

  return NextResponse.json({ niche, bucket, status, products, hasMore } as RawSearchResponse)
}
