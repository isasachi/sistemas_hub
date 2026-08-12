import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { getTaskDetail } from '@/lib/video-ads/kie'
import { uploadToStorage } from '@/lib/storage'
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

// Los taskId salen SIEMPRE de la fila, nunca del cliente: aceptarlos por query
// convertiría la ruta en un proxy abierto a la cuenta de KIE.
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
    if (l.videoUrl || !l.taskId) { lotes.push(l); continue }
    try {
      const d = await getTaskDetail(l.taskId)
      const videoUrl = d.videoUrl ? await mirror(id, `lote-${l.n}`, d.videoUrl) : null
      if (d.state !== l.status || videoUrl) changed = true
      lotes.push({ ...l, status: d.state, videoUrl })
    } catch (err) {
      console.error('[video-ads/lote-status]', err)
      lotes.push(l)
    }
  }

  if (changed) {
    const first = lotes.find((l) => l.videoUrl)?.videoUrl ?? null
    await updateVideoSession(id, { lotes, ...(first ? { video_url: first } : {}) })
  }

  return NextResponse.json({ lotes, done: lotes.every((l) => l.videoUrl || l.status === 'fail') })
}
