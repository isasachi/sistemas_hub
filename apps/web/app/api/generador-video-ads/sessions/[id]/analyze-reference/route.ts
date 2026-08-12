import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { fetchAsBuffer } from '@/lib/storage'
import { geminiCallStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ForensicAnalysisSchema } from '@/lib/video-ads/types'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // análisis de video con visión: minuto y pico en el peor caso

// Tope real del video: base64 infla 4/3, así que 14 MB crudos ≈ 19 MB de request, que
// es lo que aguanta Gemini inline. Por encima habría que ir a la Files API — no vale la
// pena para un anuncio UGC de menos de un minuto.
const MAX_VIDEO_BYTES = 14 * 1024 * 1024

const BodySchema = z.object({ videoUrl: z.string().url() })

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
  if (!parsed.success) return NextResponse.json({ error: 'Falta videoUrl' }, { status: 400 })

  try {
    // fetchAsBuffer valida que la URL sea del bucket (anti-SSRF).
    const { buffer, mimeType } = await fetchAsBuffer(parsed.data.videoUrl)
    if (buffer.byteLength > MAX_VIDEO_BYTES)
      return NextResponse.json(
        { error: 'El video pesa más de 14 MB. Recórtalo o bájale la calidad.' },
        { status: 400 },
      )

    const parts: Part[] = [
      { inlineData: { mimeType, data: buffer.toString('base64') } },
      {
        text: [
          'This is a reference UGC video ad. Perform a FORENSIC analysis of it.',
          '',
          'Split the video into beats — one beat per visual cut OR per sentence of speech,',
          'whichever comes first. Never emit a beat longer than 3 seconds. For every beat',
          'transcribe the spoken dialogue VERBATIM (in its original language).',
          '',
          'CRITICAL — what is NOT content, and must never be transcribed or described:',
          '  - The SUBTITLE/CAPTION track. Burned-in text that merely repeats what the',
          '    person is saying is a caption, not a design element. `onScreenText` is ONLY',
          '    for genuine graphics that say something the voice does NOT: a price, a',
          '    product name card, a "before/after" label, an arrow. If the text is a',
          '    transcription of the audio, leave `onScreenText` EMPTY.',
          '  - Platform furniture: the TikTok/Reels/Shorts watermark, the @handle, the UI',
          '    overlay, the follow button.',
          '  - The end card / outro: the closing plate a downloaded video carries (logo,',
          '    handle, "follow me"). Do NOT emit beats for it — the analysis ends with the',
          '    last beat of actual content, and `durationSec` covers only that.',
          '',
          'Also capture, in `subject`, a CASTING description of the person precise enough',
          'to cast a lookalike: apparent age, skin tone, hair colour and how it is worn,',
          'eye colour, build, and only then the clothing. Plus: the setting, how the product',
          'is handled, the audio bed, what kind of hook the first seconds use, and in one',
          'sentence why the ad persuades.',
          '',
          'In each beat, `camera` records the actual framing and movement (shot size, angle,',
          'handheld vs fixed, any push/pan) — it drives how the new video is shot.',
          '',
          '`summaryForUser` goes in neutral Latin-American Spanish — it is shown in the UI.',
          'Everything else stays as observed.',
        ].join('\n'),
      },
    ]

    const analysis = await geminiCallStructured('forensic_analysis', ForensicAnalysisSchema, parts)

    await updateVideoSession(id, {
      step: 2,
      reference_video_url: parsed.data.videoUrl,
      forensic_analysis: analysis,
    })
    await recordGenQuota(id, 'video-forensic', userId)
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('[video-ads/analyze-reference]', err)
    return NextResponse.json({ error: 'No se pudo analizar el video. Inténtalo de nuevo.' }, { status: 500 })
  }
}
