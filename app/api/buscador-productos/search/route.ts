import { NextRequest, NextResponse } from 'next/server'
import {
  getUnseenProducts,
  countUnseenProducts,
  getNicheStatus,
  upsertNiche,
} from '@/lib/product-hunter/db'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'
import type { ProductRow, ProductCard, SearchResponse } from '@/lib/product-hunter/types'

// ⚠️ Esta ruta SOLO lee de Supabase. No llama a Anthropic ni corre Playwright,
// así que responde en ~200ms y cabe sobrado en el timeout de Vercel Hobby (10s).
// El análisis y el scraping ocurren en batch en GitHub Actions, no aquí.

function toCard(row: ProductRow): ProductCard | null {
  if (!row.analysis || row.score == null) return null // aún sin analizar → no se muestra
  const a = row.analysis
  const r = row.raw_data
  const pageParams = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
    view_all_page_id: r.page_id,
  })
  return {
    id: row.id,
    advertiserName: row.name ?? r.advertiser_name,
    productName: a.productName,
    whatIs: a.whatItIs,
    problemSolved: a.problemSolved,
    adCount: r.ad_count,
    daysRunning: r.days_running,
    foundCountry: r.found_country,
    attributes: a.attributes,
    peScenario: a.peScenario,
    peCompetitors: a.peCompetitors,
    priority: a.priority,
    score: row.score,
    adUrl: `https://www.facebook.com/ads/library/?id=${r.ad_id}`,
    pageUrl: `https://www.facebook.com/ads/library/?${pageParams}`,
  }
}

export async function POST(req: NextRequest) {
  let body: { niche?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const niche = body.niche?.trim().toLowerCase()
  if (!niche) return NextResponse.json({ error: 'Falta el nicho' }, { status: 400 })

  // Identidad del usuario (pool compartido, solo para no repetir productos vistos)
  let userId = await readUserId()
  let setCookie = false
  if (!userId) { userId = newUserId(); setCookie = true }

  const nicheRow = await getNicheStatus(niche)

  // Cold start: el nicho no existe. Lo encolamos como pending (NO scrapeamos aquí,
  // Vercel no puede correr Playwright) y el cron lo levantará.
  if (!nicheRow) {
    await upsertNiche(niche, 'pending')
    const payload: SearchResponse = { niche, status: 'pending', products: [], totalUnseen: 0 }
    const res = NextResponse.json(payload)
    if (setCookie) res.cookies.set(PH_USER_COOKIE, userId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
    return res
  }

  const rows = await getUnseenProducts(niche, userId, 20)
  const cards = rows.map(toCard).filter((c): c is ProductCard => c !== null)
  const totalUnseen = await countUnseenProducts(niche, userId)

  // El nicho existe pero todavía no hay productos analizados → análisis en proceso.
  const status: SearchResponse['status'] = cards.length ? 'ready' : 'pending'

  const payload: SearchResponse = { niche, status, products: cards, totalUnseen }
  const res = NextResponse.json(payload)
  if (setCookie) res.cookies.set(PH_USER_COOKIE, userId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
