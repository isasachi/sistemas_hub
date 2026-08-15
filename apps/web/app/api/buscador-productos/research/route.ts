import { NextRequest, NextResponse } from 'next/server'
import { parseAdsLibraryUrl, insertUrlResearch } from '@ph/shared'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

// ⚠️ Esta ruta SOLO parsea la URL y escribe una fila en Supabase. No scrapea ni
// llama a Anthropic (Vercel no puede correr Playwright). El poller del VPS
// (url-research.service) drena la cola en ~1 min y la UI hace polling a
// /research/[id]. Cabe sobrado en el timeout de Vercel Hobby.

export async function POST(req: NextRequest) {
  let body: { url?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const raw = body.url?.trim()
  if (!raw) return NextResponse.json({ error: 'Falta la URL' }, { status: 400 })

  const parsed = parseAdsLibraryUrl(raw)
  if (!parsed) {
    return NextResponse.json(
      { error: 'Esa no parece una URL de la Biblioteca de Anuncios de Meta. Copia el enlace de un anuncio o anunciante.' },
      { status: 400 },
    )
  }

  // Identidad del usuario
  let userId = await readUserId()
  let setCookie = false
  if (!userId) { userId = newUserId(); setCookie = true }

  // Cuota diaria compartida con la búsqueda por nicho (3/día). Keyed por el target
  // (page_id o ad_id): re-pegar la MISMA URL el mismo día es recheck gratis, así el
  // polling no gasta cuota.
  // ⚠️ TEMPORAL (2026-08-05, pedido del usuario): sin límite diario. El contador
  // por usuario/día vivía en checkAndRecordSearch (lib/product-hunter/quota.ts,
  // DAILY_LIMIT=3) y también gateaba esta ruta. Para reponerlo, volver a llamarlo
  // acá y en la ruta de búsqueda.

  const requestId = await insertUrlResearch(userId, raw, parsed.pageId ?? null, parsed.adId ?? null)

  const res = NextResponse.json({ requestId, status: 'pending' })
  if (setCookie) res.cookies.set(PH_USER_COOKIE, userId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
