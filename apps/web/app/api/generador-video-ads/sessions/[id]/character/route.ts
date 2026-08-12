import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { uploadToStorage } from '@/lib/storage'
import { openaiGenerateImage } from '@/lib/llm-openai'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { CharacterBriefSchema } from '@/lib/video-ads/types'
import { buildCharacterPrompt } from '@/lib/video-ads/prompts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // gpt-image-2 tarda ~60-90s en un retrato

// Las líneas 2 y 3 comparten paso: o llega la URL de un personaje ya subido por el
// browser (signed upload), o llega el brief y lo generamos. Misma columna de salida.
const BodySchema = z.union([
  z.object({ characterUrl: z.string().url() }),
  z.object({ brief: CharacterBriefSchema, prompt: z.string().max(500).optional() }),
])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })

  // Línea 2: el personaje ya está en el bucket, solo se persiste. No cuesta nada.
  if ('characterUrl' in parsed.data) {
    await updateVideoSession(id, { step: 2, character_url: parsed.data.characterUrl })
    return NextResponse.json({ characterUrl: parsed.data.characterUrl })
  }

  // Línea 3: personaje generado. gpt-image-2 directo (sin fallback a Gemini) —
  // decisión explícita del usuario. Solo hace portrait 1024x1536 (2:3); el 9:16
  // exacto lo impone Grok al renderizar el video.
  const { blocked, regensLeft } = await checkGenQuota(id, 'video-character')
  if (blocked) return blocked
  const userId = await readUserId()

  try {
    const prompt = buildCharacterPrompt(parsed.data.brief, parsed.data.prompt ?? '')
    const b64 = await openaiGenerateImage([{ text: prompt }], 3, { aspectRatio: '9:16' })
    if (!b64) return NextResponse.json({ error: 'No se pudo generar el personaje.' }, { status: 502 })

    const characterUrl = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'character')
    await updateVideoSession(id, {
      step: 2,
      character_brief: parsed.data.brief,
      character_url: characterUrl,
    })
    await recordGenQuota(id, 'video-character', userId)
    return NextResponse.json({ characterUrl, regensLeft })
  } catch (err) {
    console.error('[video-ads/character]', err)
    return NextResponse.json({ error: 'No se pudo generar el personaje. Inténtalo de nuevo.' }, { status: 500 })
  }
}
