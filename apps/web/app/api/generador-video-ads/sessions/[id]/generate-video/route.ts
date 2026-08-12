import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ConfirmedScriptSchema, ForensicAnalysisSchema, VideoDirectionSchema } from '@/lib/video-ads/types'
import { scriptDuration } from '@/lib/video-ads/duration'
import { buildVideoPrompt, createVideoTask, KIE_PROMPT_MAX, type VideoImage } from '@/lib/video-ads/kie'
import { toVerticalCanvas } from '@/lib/video-ads/vertical'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Crea la tarea de render en KIE y responde de inmediato con el taskId guardado en la
// sesión. El video tarda minutos: el progreso lo sigue el cliente contra /video-status.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // El render es la llamada más cara del hub: 1 generación + 1 regen por sesión.
  const { blocked, regensLeft } = await checkGenQuota(id, 'video-render')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.confirmed_script || !session.product_url)
    return NextResponse.json({ error: 'Completa los pasos anteriores' }, { status: 409 })

  const confirmed = ConfirmedScriptSchema.parse(session.confirmed_script)
  const direction = VideoDirectionSchema.parse(
    session.direction ?? { accent: 'español neutro', vibe: 'natural', cameraMotion: 'stationary', eyeDirection: 'center' },
  )

  // Orden = numeración @image(n) del prompt. El personaje va primero cuando existe
  // (líneas 2 y 3); en la línea 1 el único input visual es el producto.
  const images: VideoImage[] = [
    ...(session.character_url ? [{ url: session.character_url, role: 'the person on camera' }] : []),
    { url: session.product_url, role: 'the product being advertised' },
  ]

  try {
    // Con UNA sola imagen Grok ignora `aspect_ratio` y hereda el ratio del origen, así
    // que el 9:16 del body es inerte: hay que mandarle un lienzo ya vertical. La
    // condición es "el render manda una imagen", no "el modo es video-ref" — `mode` se
    // puede cambiar por PATCH después de subir el producto.
    if (images.length === 1) {
      // El lienzo sale JPEG siempre, sin importar el mime de entrada: el mimeType que
      // se le pasa a uploadToStorage decide la extensión del path Y el contentType.
      const { data } = await fetchAsBase64(images[0].url)
      const vertical = await toVerticalCanvas(Buffer.from(data, 'base64'))
      images[0] = {
        ...images[0],
        url: await uploadToStorage(id, vertical, 'image/jpeg', 'product-9x16'),
      }
    }

    // El forense solo existe en la línea `video-ref`; en las otras dos va null y el
    // prompt omite el bloque de casting/encuadre.
    const forensic = session.forensic_analysis
      ? ForensicAnalysisSchema.safeParse(session.forensic_analysis).data ?? null
      : null

    const prompt = buildVideoPrompt({
      images,
      direction,
      beats: confirmed.beats,
      productName: session.product_name ?? 'the product',
      forensic,
    })

    // La duración sale del guión CONFIRMADO, no de la referencia: es lo último que el
    // usuario pudo editar, y un video más largo que su copy hace que Grok invente
    // frases para rellenar. Si las marcas de tiempo no se pueden leer, cae a lo
    // guardado en la sesión.
    const durationSec = scriptDuration(confirmed.beats) ?? session.duration ?? 10
    // KIE topa el prompt en 4096 chars. Con el guión editable el usuario puede pasarse,
    // y pasarse cuesta un 422 DESPUÉS de haber consumido la cuota: se corta antes.
    if (prompt.length > KIE_PROMPT_MAX)
      return NextResponse.json(
        { error: `El guión quedó muy largo (${prompt.length} de ${KIE_PROMPT_MAX} caracteres). Acorta las líneas y vuelve a intentar.` },
        { status: 400 },
      )

    const taskId = await createVideoTask({ images, prompt, durationSec })

    await updateVideoSession(id, {
      step: 4,
      video_prompt: prompt,
      kie_task_id: taskId,
      video_status: 'waiting',
      video_url: null,
    })
    await recordGenQuota(id, 'video-render', userId)
    return NextResponse.json({ taskId, regensLeft })
  } catch (err) {
    console.error('[video-ads/generate-video]', err)
    return NextResponse.json({ error: 'No se pudo iniciar el render. Inténtalo de nuevo.' }, { status: 500 })
  }
}
