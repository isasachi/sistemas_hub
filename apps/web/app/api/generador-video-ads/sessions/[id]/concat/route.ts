import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession } from '@/lib/video-ads/db'
import { concatenarClips, SinClips } from '@/lib/video-ads/concat'
import type { Lote } from '@/lib/video-ads/lotes'
import { readUserId } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Baja N clips y los pega. Lo que domina es la descarga, no ffmpeg (`-c copy` casi no
// gasta CPU); con 5 lotes de ~7 MB y una red lenta, 120 s se quedan cortos.
export const maxDuration = 300

/**
 * Devuelve los clips de la sesión pegados en UN mp4.
 *
 * ⚠️ **NO GASTA CUOTA NI LLAMA A NINGÚN MODELO**: opera sobre videos que la sesión YA pagó.
 * Por eso no pasa por `checkGenQuota` — es una descarga, no una generación.
 *
 * ⚠️ **NO PERSISTE NADA, a propósito.** El mp4 se arma en el momento y se devuelve en el
 * cuerpo. Guardarlo pediría una columna, una migración y una política de limpieza para un
 * archivo que se genera en segundos y que el usuario baja una vez.
 * ponytail: si el video final se empieza a pedir seguido, o si el cuerpo de la respuesta se
 * vuelve un problema de memoria, el upgrade es subirlo al bucket y responder un 302.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  const lotes = (session.lotes ?? []) as Lote[]
  const listos = lotes.filter((l) => l.videoUrl)
  const faltan = lotes.length - listos.length

  try {
    const bytes = await concatenarClips(listos.map((l) => ({ videoUrl: l.videoUrl! })))
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="video-completo.mp4"`,
        'Content-Length': String(bytes.length),
        // Le dice a la UI que el video va incompleto, sin tener que adivinarlo: un clip
        // caído no se puede pegar, y saltarlo cambia el guión en silencio.
        'X-Clips-Faltantes': String(faltan),
      },
    })
  } catch (err) {
    if (err instanceof SinClips)
      return NextResponse.json({ error: 'Todavía no hay ningún clip renderizado' }, { status: 409 })
    console.error('[video-ads/concat] falló', err)
    return NextResponse.json({ error: 'No se pudo armar el video completo' }, { status: 500 })
  }
}
