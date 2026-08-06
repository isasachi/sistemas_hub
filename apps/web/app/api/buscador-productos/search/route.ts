import { NextRequest, NextResponse } from 'next/server'
import {
  getApprovedByBucket, countApproved, countRawPending,
  getRawNicheStatus, upsertRawNiche, markSeen, isBlocked,
  RAW_BUCKETS, RAW_BUCKET_LABEL,
  type RawProductEntry, type RawBucketGroup, type RawSearchResponse,
} from '@ph/shared'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

// ⚠️ Esta ruta SOLO lee de Supabase: ni Anthropic ni Playwright. El scraping y
// la verificación (las tres reglas) corren en el daemon del VPS.
//
// Devuelve los TRES rangos, 10 productos cada uno. El orden lo da ph_raw_unseen:
// lo que este usuario no ha visto va primero, y lo visto reaparece a los 7 días
// — así dos usuarios ven productos distintos sin que el pool se vacíe nunca.

const POR_RANGO = 10

export async function POST(req: NextRequest) {
  let body: { niche?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const niche = body.niche?.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!niche) return NextResponse.json({ error: 'Falta el nicho' }, { status: 400 })

  let userId = await readUserId()
  let setCookie = false
  if (!userId) { userId = newUserId(); setCookie = true }

  const responder = (payload: RawSearchResponse) => {
    const res = NextResponse.json(payload)
    if (setCookie) {
      res.cookies.set(PH_USER_COOKIE, userId!, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
    }
    return res
  }
  const vacío = (extra: Partial<RawSearchResponse> = {}): RawSearchResponse => ({
    niche, status: 'pending', groups: [], total: 0, ...extra,
  })

  // Términos bloqueados (typos / anatomía explícita): ni se crean ni se sirven.
  if (isBlocked(niche)) return responder(vacío({ status: 'empty' }))

  const row = await getRawNicheStatus(niche)
  if (!row) {
    // Cold start: se encola y el daemon lo levanta. Vercel no corre Playwright.
    await upsertRawNiche(niche, 'pending')
    return responder(vacío({ queued: true }))
  }

  const listas = await Promise.all(
    RAW_BUCKETS.map(async (bucket) => {
      const rows = await getApprovedByBucket(niche, bucket, userId!, POR_RANGO)
      const products: RawProductEntry[] = rows.map((r) => ({
        id: `${r.niche}:${r.page_id}`,
        advertiser: r.name ?? 'Anunciante',
        productName: r.product_name ?? null,
        title: r.raw_data?.title ?? null,
        body: r.raw_data?.body ?? null,
        country: r.country,
        adCount: r.ad_count,
        adsUrl: `https://www.facebook.com/ads/library/?${new URLSearchParams({
          active_status: 'active', ad_type: 'all', country: 'ALL',
          is_targeted_country: 'false', media_type: 'all', search_type: 'page',
          'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
          view_all_page_id: r.page_id,
        })}`,
      }))
      return { bucket, label: RAW_BUCKET_LABEL[bucket], products } satisfies RawBucketGroup
    }),
  )

  const total = listas.reduce((a, g) => a + g.products.length, 0)

  // Sin nada que mostrar: distinguir "todavía verificando" de "sin resultados".
  // countRawPending es global (la cola del daemon), suficiente para no decirle
  // al usuario "no hay" mientras el nicho aún se está procesando.
  if (total === 0) {
    const [aprobados, pendientes] = await Promise.all([
      countApproved(niche),
      countRawPending().catch(() => 0),
    ])
    return responder(vacío({ status: aprobados === 0 && pendientes > 0 ? 'pending' : 'empty' }))
  }

  // Marcar como vistos los que se muestran: la próxima búsqueda de ESTE usuario
  // trae otros, y lo visto vuelve recién a los 7 días.
  markSeen(userId, listas.flatMap((g) => g.products.map((p) => p.id))).catch(() => {})

  return responder({ niche, status: 'ready', groups: listas, total })
}
