import { NextRequest, NextResponse } from 'next/server'
import {
  getApprovedByBucket, countApproved, countRawPending,
  getRawNicheStatus, upsertRawNiche, markSeen, isBlocked,
  RAW_BUCKETS, RAW_BUCKET_LABEL, isRawBucket,
  type RawBucket, type RawProductEntry, type RawBucketGroup, type RawSearchResponse,
} from '@ph/shared'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'
import { toEntry } from '@/lib/product-hunter/entry'

// ⚠️ Esta ruta SOLO lee de Supabase: ni Anthropic ni Playwright. El scraping
// corre en el worker local.
//
// Devuelve UN rango a la vez (10 productos), el que pida `bucket`. Antes salían
// los tres de golpe: mucha pared de cards, y marcaba como vistos 30 productos
// que el usuario nunca miró. Ahora el filtro de la UI manda y `markSeen` solo
// toca lo que se muestra. Sin `bucket` se autoelige el primer rango con stock
// (del más pautado al menos), para que la primera búsqueda nunca caiga vacía.
//
// Por lo demás se sirve TODO el inventario clasificado solo por rango de
// anuncios (regla 2): las reglas de producto físico y de anunciante
// monoproducto no filtran el serving. El orden lo da getApprovedByBucket: lo
// que este usuario no ha visto va primero, y lo visto reaparece a los 7 días —
// así dos usuarios ven productos distintos sin que el pool se vacíe nunca.

const POR_RANGO = 10

// Autoelección: del rango más pautado al menos. RAW_BUCKETS va al revés (es el
// orden de lectura del filtro), así que acá se invierte.
const ORDEN_AUTO = [...RAW_BUCKETS].reverse() as RawBucket[]

export async function POST(req: NextRequest) {
  let body: { niche?: string; bucket?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const niche = body.niche?.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!niche) return NextResponse.json({ error: 'Falta el nicho' }, { status: 400 })
  // Rango pedido por el filtro. Sin él (o inválido) se autoelige.
  const pedido = isRawBucket(body.bucket) ? body.bucket : null

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

  // Un solo rango. Con `pedido` es ese y nada más; sin él se prueban los tres
  // en orden hasta que uno traiga algo (secuencial a propósito: en el caso
  // común el primero ya tiene stock y es UNA consulta, no tres).
  let servido: RawBucket = pedido ?? ORDEN_AUTO[0]
  let products: RawProductEntry[] = []
  for (const bucket of pedido ? [pedido] : ORDEN_AUTO) {
    servido = bucket
    products = (await getApprovedByBucket(niche, bucket, userId!, POR_RANGO)).map(toEntry)
    if (products.length) break
  }
  const grupo: RawBucketGroup = { bucket: servido, label: RAW_BUCKET_LABEL[servido], products }

  const total = grupo.products.length

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
    // Rango explícito vacío pero el nicho SÍ tiene inventario: no es "no hay
    // resultados", es "prueba otro rango". Se responde `ready` con el grupo
    // vacío para que la UI deje el filtro a la vista.
    if (pedido && aprobados > 0) {
      return responder({ niche, status: 'ready', groups: [grupo], total: 0 })
    }
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
  markSeen(userId, grupo.products.map((p) => p.id)).catch(() => {})

  return responder({ niche, status: 'ready', groups: [grupo], total })
}
