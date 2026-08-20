import { NextRequest, NextResponse } from 'next/server'
import {
  getApprovedByBucket, getApprovedByCategory, getNichesWithInventory,
  countApproved, countRawPending,
  getRawNicheStatus, upsertRawNiche, isBlocked,
  RAW_BUCKETS, RAW_BUCKET_LABEL, isRawBucket, isCategoryId, categoryOf,
  PLANS, lockedBuckets, unlocksBucket, isPais, isAntiguedad,
  type RawBucket, type RawProductEntry, type RawBucketGroup, type RawSearchResponse,
  type RawFilters, type Tier,
} from '@ph/shared'
import { getUser } from '@/lib/supabase/server'
import { getAccess } from '@/lib/whop'
import { toEntry } from '@/lib/product-hunter/entry'

// ⚠️ Esta ruta SOLO lee de Supabase: ni Anthropic ni Playwright. El scraping
// corre en el worker local.
//
// Devuelve UN rango a la vez, el que pida `bucket`. Antes salían los tres de
// golpe y era una pared de cards. Sin `bucket` se autoelige el primer rango con
// stock que el PLAN del usuario desbloquee.
//
// Por lo demás se sirve TODO el inventario clasificado solo por rango de
// anuncios (regla 2): las reglas de producto físico y de anunciante
// monoproducto no filtran el serving.
//
// ⚠️ LA RESPUESTA DEPENDE DEL PLAN, y de nada más. No hay cookie, ni "visto", ni
// personalización: dos personas del mismo plan, en la misma categoría, rango y
// filtros, ven exactamente lo mismo.

// Autoelección: del rango más pautado al menos. RAW_BUCKETS va al revés (es el
// orden de lectura del filtro), así que acá se invierte.
const ORDEN_AUTO = [...RAW_BUCKETS].reverse() as RawBucket[]

/**
 * El plan del usuario de esta request.
 *
 * ⚠️ Esta ruta AUTENTICA por su cuenta. `/api/*` está fuera del matcher de
 * `proxy.ts`, así que acá no llega el gate del layout — y lo que el plan decide
 * (qué rangos y cuántos productos) tiene que decidirlo el servidor: un candado
 * pintado en el cliente sobre 50 productos ya enviados no es un candado.
 *
 * Sin sesión cae al plan MÁS BAJO en vez de rechazar: la tool vive detrás del
 * gate de todos modos, y devolver el tramo gratuito es mejor respuesta a un
 * request raro que un 401 que la UI no sabe mostrar.
 */
async function tierDeLaRequest(): Promise<Tier> {
  const user = await getUser().catch(() => null)
  if (!user) return 1
  return (await getAccess(user.id, user.email))?.tier ?? 1
}

export async function POST(req: NextRequest) {
  let body: {
    niche?: string; bucket?: string; category?: string
    country?: string; minDias?: number
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  // La UI busca por CATEGORÍA (los chips); el path por nicho sigue vivo para
  // quien pegue directo a la ruta y es el que conserva el cold start.
  const category = isCategoryId(body.category) ? body.category : null
  // "Todos": mismo serving de categoría pero sobre TODOS los nichos con
  // inventario. No es un CategoryId — es la ausencia de filtro.
  const todos = body.category === 'todos'
  const niche = body.niche?.trim().toLowerCase().replace(/\s+/g, ' ')
  // Rango pedido por el filtro. Sin él (o inválido) se autoelige.
  const pedido = isRawBucket(body.bucket) ? body.bucket : null

  // Filtros globales. Se validan contra las listas cerradas de @ph/shared: lo
  // que no matchea se ignora en vez de romper la búsqueda.
  const filters: RawFilters = {
    country: isPais(body.country) ? body.country : null,
    minDias: isAntiguedad(body.minDias) ? body.minDias : null,
  }

  const tier = await tierDeLaRequest()
  const plan = PLANS[tier]
  const bloqueados = lockedBuckets(tier)
  const limite = plan.porRango

  const responder = (payload: RawSearchResponse) =>
    NextResponse.json({ ...payload, tier, locked: bloqueados, porRango: limite })

  // Rango pedido que el plan NO desbloquea. Se responde `ready` con el grupo
  // vacío —no un 403— para que la UI deje el filtro a la vista y pinte el
  // candado con su invitación a subir de plan; lo que importa es que acá NO se
  // consulta la base, así que ni un producto de ese rango sale del servidor.
  if (pedido && !unlocksBucket(tier, pedido)) {
    return responder({
      niche: category ?? (todos ? 'todos' : niche ?? ''),
      status: 'ready',
      groups: [{ bucket: pedido, label: RAW_BUCKET_LABEL[pedido], products: [] }],
      total: 0,
    })
  }

  // Orden de autoelección acotado al plan: con el orden crudo, el plan 1 abriría
  // siempre en "100 a más", que es justo el rango que no compró.
  const ordenAuto = ORDEN_AUTO.filter((b) => unlocksBucket(tier, b))
  const aProbar = pedido ? [pedido] : ordenAuto

  // ─── Búsqueda por CATEGORÍA (los chips de la UI) ───────────────────────────
  // Una categoría son decenas de nichos: se resuelve la lista contra el
  // inventario vivo (`categoryOf` clasifica por reglas, así que un nicho nuevo
  // del daemon entra solo) y se sirve el mismo rango sobre todos ellos.
  // Acá no hay cold start: los chips son categorías fijas, no consultas libres.
  if (category || todos) {
    const inventario = await getNichesWithInventory()
    const niches = todos ? inventario : inventario.filter((n) => categoryOf(n) === category)
    let servidoCat: RawBucket = aProbar[0]
    let productos: RawProductEntry[] = []
    for (const bucket of aProbar) {
      servidoCat = bucket
      productos = (await getApprovedByCategory(niches, bucket, limite, filters)).map(toEntry)
      if (productos.length) break
    }
    return responder({
      niche: category ?? 'todos',
      // Con rango explícito se responde `ready` aunque venga vacío, para que la
      // UI deje el filtro a la vista y se pueda cambiar de rango.
      status: productos.length > 0 || pedido ? 'ready' : 'empty',
      groups: [{ bucket: servidoCat, label: RAW_BUCKET_LABEL[servidoCat], products: productos }],
      total: productos.length,
    })
  }

  if (!niche) return NextResponse.json({ error: 'Falta el nicho' }, { status: 400 })

  const vacío = (extra: Partial<RawSearchResponse> = {}): RawSearchResponse => ({
    niche, status: 'pending', groups: [], total: 0, ...extra,
  })

  // Términos bloqueados (typos / anatomía explícita): ni se crean ni se sirven.
  if (isBlocked(niche)) return responder(vacío({ status: 'empty' }))

  // Un solo rango. Con `pedido` es ese y nada más; sin él se prueban los del
  // plan en orden hasta que uno traiga algo (secuencial a propósito: en el caso
  // común el primero ya tiene stock y es UNA consulta, no tres).
  let servido: RawBucket = aProbar[0]
  let products: RawProductEntry[] = []
  for (const bucket of aProbar) {
    servido = bucket
    products = (await getApprovedByBucket(niche, bucket, limite, filters)).map(toEntry)
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
    // resultados", es "prueba otro rango" (o quita un filtro). Se responde
    // `ready` con el grupo vacío para que la UI deje los filtros a la vista.
    if ((pedido || filters.country || filters.minDias) && aprobados > 0) {
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

  return responder({ niche, status: 'ready', groups: [grupo], total })
}
