import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { fetchAsBase64, PayloadTooLargeError } from '@/lib/storage'
import { geminiCallStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ForensicReportSchema } from '@/lib/video-ads/types'
import { buildForensicInstruction } from '@/lib/video-ads/forensic'
import { MAX_VIDEO_MB } from '@/lib/video-ads/limits'
import { STEP } from '@/lib/video-ads/steps'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BodySchema = z.object({ videoUrl: z.string().url() })

// El análisis forense NO pasa por `callStructured`: ese es OpenAI-primario y
// gpt-4o-mini no procesa video. Va directo a Gemini.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-forensic')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Falta el video de referencia' }, { status: 400 })

  try {
    // El tope de MAX_VIDEO_MB hoy solo se valida en el browser (Section0Reference) —
    // UX, no seguridad: un request armado a mano se lo salta. `fetchAsBase64` revisa
    // `content-length` ANTES de bufferear el video entero (que además se infla 4/3 en
    // base64), así que un video sobredimensionado falla acá con un 413 claro en vez
    // de reventar el runtime de Node por memoria o timeout minutos después.
    const { data, mimeType } = await fetchAsBase64(parsed.data.videoUrl, MAX_VIDEO_MB * 1024 * 1024)

    const parts: Part[] = [
      { inlineData: { mimeType, data } },
      { text: buildForensicInstruction() },
    ]
    const analysis = await geminiCallStructured('forensic_report', ForensicReportSchema, parts)

    await updateVideoSession(id, {
      step: STEP.PRODUCT,
      reference_video_url: parsed.data.videoUrl,
      forensic_analysis: analysis,
    })
    await recordGenQuota(id, 'video-forensic', userId)
    return NextResponse.json({ analysis })
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      // Mismo texto que el guard de UX del cliente (Section0Reference): un usuario que
      // se topa con esto no debería ver una redacción distinta según qué capa lo paró.
      return NextResponse.json(
        { error: `El video pesa más de ${MAX_VIDEO_MB} MB. Recórtalo o bájale la calidad.` },
        { status: 413 },
      )
    }
    console.error('[video-ads/analyze-reference]', err)
    return NextResponse.json(
      { error: 'No se pudo analizar el video. Inténtalo de nuevo.' },
      { status: 500 },
    )
  }
}
