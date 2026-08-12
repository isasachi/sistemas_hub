import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { getTaskDetail } from '@/lib/video-ads/kie'
import { uploadToStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // el poll que encuentra el video listo también lo copia al bucket

// Polling del render. El taskId sale SIEMPRE de la fila de la sesión, nunca del
// cliente: aceptarlo por query convertiría esta ruta en un proxy abierto a la cuenta
// de KIE (cualquiera podría leer tareas ajenas y quemar rate limit).
/**
 * Copia el mp4 de KIE a nuestro bucket. `fetchAsBuffer` no sirve acá: rechaza por
 * diseño cualquier host que no sea Supabase (guard anti-SSRF), y esta URL es de KIE.
 * Si la copia falla devolvemos la URL de KIE — sirve hoy y caduca en 14 días, mejor
 * que dejar al usuario sin video.
 */
async function mirrorToStorage(sessionId: string, kieUrl: string): Promise<string> {
  try {
    const res = await fetch(kieUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    return await uploadToStorage(sessionId, buffer, 'video/mp4', 'result')
  } catch (err) {
    console.error('[video-ads/video-status] no se pudo copiar el video al bucket', err)
    return kieUrl
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.kie_task_id) return NextResponse.json({ state: 'idle', videoUrl: null, progress: 0 })

  // Ya terminó: servimos lo guardado sin volver a pegarle a KIE.
  if (session.video_url)
    return NextResponse.json({ state: 'success', videoUrl: session.video_url, progress: 100 })

  try {
    const detail = await getTaskDetail(session.kie_task_id)

    // KIE borra sus archivos a los 14 días. Si guardáramos su URL, el historial y la
    // vista de sesión mostrarían un video muerto dos semanas después de cada render:
    // lo copiamos al bucket, igual que `generate-image` hace con la imagen.
    let videoUrl = detail.videoUrl
    if (videoUrl) {
      videoUrl = await mirrorToStorage(id, videoUrl)
    }

    if (detail.state !== session.video_status || videoUrl) {
      await updateVideoSession(id, {
        video_status: detail.state,
        ...(videoUrl ? { video_url: videoUrl } : {}),
      })
    }
    return NextResponse.json({
      state: detail.state,
      progress: detail.progress,
      videoUrl,
      error: detail.failMsg,
    })
  } catch (err) {
    console.error('[video-ads/video-status]', err)
    return NextResponse.json({ error: 'No se pudo consultar el render' }, { status: 502 })
  }
}
