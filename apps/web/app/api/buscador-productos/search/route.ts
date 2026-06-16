import { NextRequest, NextResponse } from 'next/server'
import {
  getUnseenProducts,
  countUnseenProducts,
  getNicheStatus,
  getAllNicheKeywords,
  upsertNiche,
} from '@ph/shared'
import { matchNiche } from '@/lib/product-hunter/niche-match'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'
import { checkAndRecordSearch } from '@/lib/product-hunter/quota'
import type { ProductRow, ProductCard, SearchResponse } from '@ph/shared'

// ⚠️ Esta ruta SOLO lee de Supabase. No llama a Anthropic ni corre Playwright,
// así que responde en ~200ms y cabe sobrado en el timeout de Vercel Hobby (10s).
// El análisis y el scraping ocurren en batch en GitHub Actions, no aquí.

function toCard(row: ProductRow): ProductCard | null {
  if (!row.analysis || row.score == null) return null // aún sin analizar → no se muestra
  const a = row.analysis
  const r = row.raw_data
  // ⚠️ REGLAS DE ORO — defensa en profundidad: aunque el scraper ya no guarda
  // productos que las violen, las filas viejas tampoco deben mostrarse JAMÁS:
  // ≥40 ads · ≥10 días activos (desconocido = fuera) · no pautado en Perú.
  if (r.found_country === 'PE') return null
  if (r.ad_count < 40) return null
  if (r.days_running === null || r.days_running < 10) return null
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

  // Identidad del usuario
  let userId = await readUserId()
  let setCookie = false
  if (!userId) { userId = newUserId(); setCookie = true }

  // Cuota diaria + bloqueo de keyword repetida
  const quota = await checkAndRecordSearch(userId, query)
  if (!quota.ok) {
    return NextResponse.json(
      { error: quota.message, code: quota.code },
      { status: 429 },
    )
  }

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
  // pending (NO scrapeamos aquí, Vercel no puede correr Playwright). El daemon del
  // VPS (systemd, 24/7) poll-ea getNichesToRefresh() — que devuelve los pending —
  // y lo levanta en una vuelta del loop (minutos), sin necesitar dispatch externo.
  if (!nicheRow) {
    // Kill-switch temporal (PH_COLD_START_DISABLED=1): durante el seed/depuración
    // NO aceptamos nichos nuevos para no ensuciar la cola — ni se crea el registro.
    // La UX no cambia (sigue diciendo "en cola"); el nicho se capturará en el
    // próximo seed manual. Quitar la flag al terminar.
    if (process.env.PH_COLD_START_DISABLED !== '1') {
      await upsertNiche(niche, 'pending')
    }
    // queued: true → nicho genuinamente NUEVO (la UI dice "lo encolamos").
    const payload: SearchResponse = { niche, status: 'pending', products: [], totalUnseen: 0, queued: true }
    const res = NextResponse.json(payload)
    if (setCookie) res.cookies.set(PH_USER_COOKIE, userId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
    return res
  }

  const rows = await getUnseenProducts(niche, userId, 20)
  const cards = rows.map(toCard).filter((c): c is ProductCard => c !== null)
  // Ganadores frescos para el usuario (honesto: pasa reglas de oro + no visto en 7d)
  const totalUnseen = await countUnseenProducts(niche, userId)

  // Garantía de output: priorizar ganadores (alta/media/baja). Si no hay ninguno,
  // mostrar los mejores candidatos por score con la etiqueta bestEffort en vez
  // de una respuesta vacía (el pipeline amplía la red en paralelo vía CI).
  // Alta y media son "ganadores"; baja se muestra como tercer nivel pero no
  // cambia la lógica de bestEffort (bestEffort = ningún alta/media disponible).
  const winners = cards.filter((c) => c.priority === 'alta' || c.priority === 'media')
  const products = cards  // baja siempre visible
  const bestEffort = !winners.length && cards.length > 0
  // El pool nunca se vacía (ph_unseen_products re-muestra lo visto): si hay
  // ganadores en pantalla pero ninguno es fresco para el usuario, se lo decimos.
  const allSeen = winners.length > 0 && totalUnseen === 0

  // products vacío SOLO si el nicho existe pero aún no tiene productos
  // analizados (scrapeado/en cola, análisis pendiente) — NO es un nicho nuevo,
  // así que pending va SIN queued (la UI dice "analizando", no "encolado").
  const status: SearchResponse['status'] = products.length ? 'ready' : 'pending'

  const payload: SearchResponse = { niche, status, products, totalUnseen, bestEffort, allSeen }
  const res = NextResponse.json(payload)
  if (setCookie) res.cookies.set(PH_USER_COOKIE, userId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
