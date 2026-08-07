import { NextRequest, NextResponse } from 'next/server'
import {
  getApprovedByBucket, countApproved, countRawPending,
  getRawNicheStatus, upsertRawNiche, markSeen, isBlocked,
  RAW_BUCKETS, RAW_BUCKET_LABEL,
  type RawProductEntry, type RawBucketGroup, type RawSearchResponse,
} from '@ph/shared'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'
import { toEntry } from '@/lib/product-hunter/entry'

// ⚠️ Esta ruta SOLO lee de Supabase: ni Anthropic ni Playwright. El scraping
// corre en el worker local.
//
// Devuelve los TRES rangos, 10 productos cada uno. Por ahora se sirve TODO el
// inventario clasificado solo por rango de anuncios (regla 2): las reglas de
// producto físico y de anunciante monoproducto no filtran el serving.
// El orden lo da getApprovedByBucket: lo que este usuario no ha visto va
// primero, y lo visto reaparece a los 7 días — así dos usuarios ven productos
// distintos sin que el pool se vacíe nunca.

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

  const listas = await Promise.all(
    RAW_BUCKETS.map(async (bucket) => {
      const rows = await getApprovedByBucket(niche, bucket, userId!, POR_RANGO)
      const products: RawProductEntry[] = rows.map(toEntry)
      return { bucket, label: RAW_BUCKET_LABEL[bucket], products } satisfies RawBucketGroup
    }),
  )

  const total = listas.reduce((a, g) => a + g.products.length, 0)

  // Sin nada que mostrar. Se pregunta por el nicho DESPUÉS de buscar productos,
  // no antes: hay nichos con inventario que nunca pasaron por la cola del
  // scraper (los 24k importados del pipeline anterior traen 528 nichos), y
  // preguntar primero los mandaba a "lo encolamos" teniendo productos listos.
  if (total === 0) {
    const [aprobados, pendientes, row] = await Promise.all([
      countApproved(niche),
      countRawPending().catch(() => 0),
      getRawNicheStatus(niche),
    ])
    if (!row) {
      // Nicho desconocido: se encola para que el scraper lo levante. Vercel no
      // corre Playwright, así que acá solo se registra.
      await upsertRawNiche(niche, 'pending')
      return responder(vacío({ queued: true }))
    }
    return responder(vacío({ status: aprobados === 0 && pendientes > 0 ? 'pending' : 'empty' }))
  }

  // Marcar como vistos los que se muestran: la próxima búsqueda de ESTE usuario
  // trae otros, y lo visto vuelve recién a los 7 días.
  markSeen(userId, listas.flatMap((g) => g.products.map((p) => p.id))).catch(() => {})

  return responder({ niche, status: 'ready', groups: listas, total })
}
