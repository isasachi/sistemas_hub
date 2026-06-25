import { NextRequest, NextResponse } from 'next/server'
import {
  getUnseenProducts,
  countUnseenProducts,
  getNicheStatus,
  getAllNicheKeywords,
  upsertNiche,
  isBlocked,
} from '@ph/shared'
import { matchNiche } from '@/lib/product-hunter/niche-match'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'
import { checkAndRecordSearch } from '@/lib/product-hunter/quota'
import { composeWinnersView } from '@/lib/product-hunter/compose-view'
import { toCard } from '@/lib/product-hunter/to-card'
import type { ProductCard, SearchResponse } from '@ph/shared'

// ⚠️ Esta ruta SOLO lee de Supabase. No llama a Anthropic ni corre Playwright,
// así que responde en ~200ms y cabe sobrado en el timeout de Vercel Hobby (10s).
// El análisis y el scraping ocurren en batch en el daemon del VPS, no aquí.

export async function POST(req: NextRequest) {
  let body: { niche?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const query = body.niche?.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!query) return NextResponse.json({ error: 'Falta el nicho' }, { status: 400 })

  // Término bloqueado (typo/genérico o anatomía sexual/explícita — blocklist en
  // @ph/shared): respuesta vacía, NO se crea ni se sirve. Cierra la ventana de
  // 12h del cron clean-niches (un sensible no llega a scrapearse). Los nichos ya
  // marcados 'blocked' cuyo id ≠ query los corta el guard de status más abajo.
  if (isBlocked(query)) {
    return NextResponse.json({ niche: query, status: 'pending', products: [], totalUnseen: 0 } as SearchResponse)
  }

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

  // Dedup semántico: si el nicho resuelto es un ALIAS de otro mercado
  // (canonical_id, seteado por el gate del worker), servimos el pool del
  // canónico. Un solo salto — canonical_id apunta siempre a una raíz.
  if (nicheRow?.canonical_id) {
    niche = nicheRow.canonical_id
    nicheRow = await getNicheStatus(nicheRow.canonical_id)
  }

  // Nicho ya marcado 'blocked' (el query resolvió a uno vía keyword/id): no se
  // sirve ni se re-encola. Mismo cuerpo vacío que el término bloqueado directo.
  if (nicheRow?.status === 'blocked') {
    return NextResponse.json({ niche, status: 'pending', products: [], totalUnseen: 0 } as SearchResponse)
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

  // Pool profundo (40) para que la composición 1/7/2 tenga de dónde elegir cada
  // tier; composeWinnersView recorta a 10 con el esquema 1 alta / 7 media / 2 baja.
  const rows = await getUnseenProducts(niche, userId, 40)
  const cards = rows.map(toCard).filter((c): c is ProductCard => c !== null)
  // Ganadores frescos para el usuario (honesto: pasa reglas de oro + no visto en 7d)
  const totalUnseen = await countUnseenProducts(niche, userId)

  // Vista de ganadores: SIEMPRE 10 con esquema 1/7/2 (flex si un tier no alcanza).
  // bestEffort = no había ningún alta y se promovió el mejor del pool a esa slot.
  const { products, bestEffort } = composeWinnersView(cards)
  // El pool nunca se vacía (ph_unseen_products re-muestra lo visto): si hay
  // productos en pantalla pero ninguno es fresco para el usuario, se lo decimos.
  const allSeen = products.length > 0 && totalUnseen === 0

  // products vacío SOLO si el nicho existe pero aún no tiene productos
  // analizados (scrapeado/en cola, análisis pendiente) — NO es un nicho nuevo,
  // así que pending va SIN queued (la UI dice "analizando", no "encolado").
  const status: SearchResponse['status'] = products.length ? 'ready' : 'pending'

  const payload: SearchResponse = { niche, status, products, totalUnseen, bestEffort, allSeen }
  const res = NextResponse.json(payload)
  if (setCookie) res.cookies.set(PH_USER_COOKIE, userId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
