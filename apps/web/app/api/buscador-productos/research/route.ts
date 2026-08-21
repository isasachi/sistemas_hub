import { NextRequest, NextResponse } from 'next/server'
import { parseAdsLibraryUrl, insertUrlResearch } from '@ph/shared'
import { getUser } from '@/lib/supabase/server'

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

  /**
   * SESIÓN OBLIGATORIA (2026-08-21).
   *
   * Antes esta ruta ACUÑABA una identidad anónima si no había ninguna, así que era un
   * endpoint público que insertaba filas sin límite: la cuota diaria se quitó en
   * agosto (ver la nota de abajo) y el servicio del VPS que drena la cola
   * (`url-research.service`) nunca se desplegó. O sea un loop de `curl` llenaba
   * `ph_url_research` gratis y nadie lo vaciaba. Como además ninguna pantalla llama a
   * esta ruta todavía, exigir sesión no le quita nada a nadie y cierra el agujero
   * hasta que la feature se despliegue de verdad.
   *
   * Se usa `getUser()` y no `readUserId()` a propósito: este último cae a la cookie
   * anónima, que es justo lo que hacía que "tener identidad" fuera gratis.
   */
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Inicia sesión para investigar una URL.' }, { status: 401 })
  const userId = user.id

  // Cuota diaria compartida con la búsqueda por nicho (3/día). Keyed por el target
  // (page_id o ad_id): re-pegar la MISMA URL el mismo día es recheck gratis, así el
  // polling no gasta cuota.
  // ⚠️ TEMPORAL (2026-08-05, pedido del usuario): sin límite diario. El contador
  // por usuario/día vivía en checkAndRecordSearch (lib/product-hunter/quota.ts,
  // DAILY_LIMIT=3) y también gateaba esta ruta. Para reponerlo, volver a llamarlo
  // acá y en la ruta de búsqueda.

  const requestId = await insertUrlResearch(userId, raw, parsed.pageId ?? null, parsed.adId ?? null)

  return NextResponse.json({ requestId, status: 'pending' })
}
