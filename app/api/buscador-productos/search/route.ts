import { NextRequest, NextResponse } from 'next/server'
import {
  getUnseenProducts,
  countUnseenProducts,
  getNicheStatus,
  getAllNicheKeywords,
  upsertNiche,
} from '@/lib/product-hunter/db'
import { matchNiche } from '@/lib/product-hunter/niche-match'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'
import { triggerNicheScrape } from '@/lib/product-hunter/github'
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
  const query = body.niche?.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!query) return NextResponse.json({ error: 'Falta el nicho' }, { status: 400 })

  // Identidad del usuario (pool compartido, solo para no repetir productos vistos)
  let userId = await readUserId()
  let setCookie = false
  if (!userId) { userId = newUserId(); setCookie = true }

  // Resolución de nicho: match exacto, o la consulta contiene una keyword/id de
  // un nicho existente ("rodillera", "dolor rodilla" → "rodilla" — esas
  // variaciones SON keywords expandidas del nicho en ph_niches.keywords).
  // Sin esto, cada variación crearía un nicho duplicado y un scrape redundante.
  let niche = query
  let nicheRow = await getNicheStatus(query)
  if (!nicheRow) {
    // Best-effort: si falla (ej. migración niche_keywords sin aplicar), se
    // degrada al comportamiento anterior (cold start directo), nunca a un 500.
    const matched = await getAllNicheKeywords()
      .then((all) => matchNiche(query, all))
      .catch(() => null)
    if (matched) {
      niche = matched
      nicheRow = await getNicheStatus(matched)
    }
  }

  // Cold start: ni el nicho ni una variación conocida existen. Lo encolamos como
  // pending (NO scrapeamos aquí, Vercel no puede correr Playwright) y disparamos
  // el workflow vía GitHub API para que el runner lo levante en minutos; si el
  // dispatch falla o no está configurado, el cron de 12h lo levanta igual.
  if (!nicheRow) {
    await upsertNiche(niche, 'pending')
    await triggerNicheScrape(niche)
    const payload: SearchResponse = { niche, status: 'pending', products: [], totalUnseen: 0 }
    const res = NextResponse.json(payload)
    if (setCookie) res.cookies.set(PH_USER_COOKIE, userId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
    return res
  }

  const rows = await getUnseenProducts(niche, userId, 20)
  const cards = rows.map(toCard).filter((c): c is ProductCard => c !== null)
  const totalUnseen = await countUnseenProducts(niche, userId)

  // Garantía de output: priorizar ganadores (alta/media). Si no hay ninguno,
  // mostrar los mejores candidatos por score con la etiqueta bestEffort en vez
  // de una respuesta vacía (el pipeline amplía la red en paralelo vía CI).
  const winners = cards.filter((c) => c.priority !== 'descartado')
  const products = winners.length ? winners : cards
  const bestEffort = !winners.length && cards.length > 0

  // El nicho existe pero todavía no hay productos analizados → análisis en proceso.
  const status: SearchResponse['status'] = products.length ? 'ready' : 'pending'

  const payload: SearchResponse = { niche, status, products, totalUnseen, bestEffort }
  const res = NextResponse.json(payload)
  if (setCookie) res.cookies.set(PH_USER_COOKIE, userId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
