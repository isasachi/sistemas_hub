import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { getTaskDetail } from '@/lib/video-ads/kie'
import { uploadToStorage } from '@/lib/storage'
import { renderDone } from '@/lib/video-ads/render-lotes'
import type { Lote } from '@/lib/video-ads/lotes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

// KIE borra sus archivos a los 14 días: el mp4 se copia al bucket para que el
// historial no muestre un video muerto dos semanas después.
async function mirror(sessionId: string, name: string, kieUrl: string): Promise<string> {
  try {
    const res = await fetch(kieUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await uploadToStorage(sessionId, Buffer.from(await res.arrayBuffer()), 'video/mp4', name)
  } catch (err) {
    console.error('[video-ads/lote-status] no se pudo copiar al bucket', err)
    return kieUrl
  }
}

// Host de nuestro proyecto Supabase — distingue una URL YA copiada al bucket de una
// que se quedó apuntando al host de KIE porque el mirror de la vez anterior falló
// (fix round 1: ese fallback era permanente y silencioso; el video moría a los 14
// días sin que nadie lo reintentara).
function ourStorageHost(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!base) return null
  try { return new URL(base).host } catch { return null }
}

function isMirrored(url: string): boolean {
  const host = ourStorageHost()
  if (!host) return false
  try { return new URL(url).host === host } catch { return false }
}

// Los taskId salen SIEMPRE de la fila, nunca del cliente: aceptarlos por query
// convertiría la ruta en un proxy abierto a nuestra cuenta de la API externa.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.lotes?.length) return NextResponse.json({ lotes: [], done: false })

  const lotes: Lote[] = []
  let changed = false

  for (const l of session.lotes) {
    if (l.videoUrl && isMirrored(l.videoUrl)) { lotes.push(l); continue }

    if (l.videoUrl) {
      // El mirror de la vez anterior falló y quedó apuntando al host de KIE: el video
      // ya está listo, solo falta copiarlo — se reintenta sin volver a pedir recordInfo.
      const videoUrl = await mirror(id, `lote-${l.n}`, l.videoUrl)
      if (videoUrl !== l.videoUrl) changed = true
      lotes.push({ ...l, videoUrl })
      continue
    }

    if (!l.taskId) { lotes.push(l); continue }

    try {
      const d = await getTaskDetail(l.taskId)
      const videoUrl = d.videoUrl ? await mirror(id, `lote-${l.n}`, d.videoUrl) : null
      if (d.state !== l.status || videoUrl || d.failMsg !== l.failMsg) changed = true
      lotes.push({ ...l, status: d.state, videoUrl, failMsg: d.failMsg })
    } catch (err) {
      console.error('[video-ads/lote-status]', err)
      lotes.push(l)
    }
  }

  const done = renderDone(lotes)

  if (changed) {
    const first = lotes.find((l) => l.videoUrl)?.videoUrl ?? null
    // `render_done` (fix round 5): esta ruta es la única que sabe, lote por lote, si
    // TODOS ya resolvieron — es la fuente real detrás del `done` que ya devuelve en
    // el JSON de abajo. Cachearlo acá en la fila es lo que le permite al dashboard
    // (`sessions/route.ts`, vía `listVideoSessions`) leer un booleano angosto en vez
    // de traer `lotes` completo (jsonb con los prompts de cada lote) en cada listado.
    await updateVideoSession(id, { lotes, render_done: done, ...(first ? { video_url: first } : {}) })
  }

  return NextResponse.json({ lotes, done })
}
