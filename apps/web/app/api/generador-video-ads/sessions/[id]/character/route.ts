import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callStructured } from '@/lib/gemini'
import { openaiGenerateImage } from '@/lib/llm-openai'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { CharacterIdentitySchema, buildIdentityInstruction, buildCharacterParts } from '@/lib/video-ads/character'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// FASE 4 + 4.5. La imagen la genera gpt-image-2 SIN fallback (decisión explícita del
// usuario). Solo hace portrait 1024x1536 (2:3), y no pasa nada: en el render el
// personaje siempre va acompañado del producto — modo multi-imagen — donde
// `aspect_ratio: 9:16` sí manda.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-character')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.forensic_analysis)
    return NextResponse.json({ error: 'Analiza el video de referencia primero' }, { status: 409 })

  try {
    // Si el usuario ya subió foto de personaje, ES la fuente de verdad — se manda
    // como part de imagen ANTES del texto (mismo orden que analyze-reference y
    // analyze-product) para que el modelo la observe en vez de fabricar el bloque
    // de consistencia a ciegas. `fetchAsBase64` valida que el host sea el del
    // bucket, que es lo que queremos acá porque la URL viene de la fila.
    const image = session.character_url
      ? await fetchAsBase64(session.character_url)
      : undefined

    const instruction = buildIdentityInstruction(
      {
        productName: session.product_name ?? '', productDescription: session.what_it_does ?? '',
        angle: session.angle ?? '', targetAudience: session.target_audience ?? '',
        problem: session.problem ?? '', characterDesc: session.character_desc ?? '',
        characterEthnicity: session.character_ethnicity ?? '', accent: session.accent ?? '',
        voice: session.voice ?? '', constraints: session.constraints ?? '',
      },
      session.forensic_analysis,
      !!session.character_url,
    )

    const identity = await callStructured(
      'character_identity',
      CharacterIdentitySchema,
      buildCharacterParts(instruction, image),
    )

    // Con imagen de referencia del usuario no se regenera nada: ES la fuente de verdad.
    let characterUrl = session.character_url
    if (!characterUrl) {
      const b64 = await openaiGenerateImage([{ text: identity.promptCreacion }], 2, { aspectRatio: '2:3' })
      characterUrl = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'character')
    }

    await updateVideoSession(id, {
      character_url: characterUrl,
      character_prompt: identity.promptCreacion,
      consistency_block: identity.bloqueConsistencia,
      voice_profile: identity.voz,
    })
    await recordGenQuota(id, 'video-character', userId)
    return NextResponse.json({
      characterUrl,
      consistencyBlock: identity.bloqueConsistencia,
      voiceProfile: identity.voz,
    })
  } catch (err) {
    console.error('[video-ads/character]', err)
    return NextResponse.json({ error: 'No se pudo construir el personaje.' }, { status: 500 })
  }
}
