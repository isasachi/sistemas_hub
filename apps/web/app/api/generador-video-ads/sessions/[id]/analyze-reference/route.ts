import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { fetchAsBase64 } from '@/lib/storage'
import { geminiCallStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ForensicReportSchema } from '@/lib/video-ads/types'
import { buildForensicInstruction } from '@/lib/video-ads/forensic'
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
    const { data, mimeType } = await fetchAsBase64(parsed.data.videoUrl)

    const parts: Part[] = [
      { inlineData: { mimeType, data } },
      { text: buildForensicInstruction() },
    ]
    const analysis = await geminiCallStructured('forensic_report', ForensicReportSchema, parts)

    await updateVideoSession(id, {
      step: 1,
      reference_video_url: parsed.data.videoUrl,
      forensic_analysis: analysis,
    })
    await recordGenQuota(id, 'video-forensic', userId)
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('[video-ads/analyze-reference]', err)
    return NextResponse.json(
      { error: 'No se pudo analizar el video. Inténtalo de nuevo.' },
      { status: 500 },
    )
  }
}
