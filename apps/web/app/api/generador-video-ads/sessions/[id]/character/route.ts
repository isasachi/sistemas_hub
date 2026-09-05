import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callStructured } from '@/lib/gemini'
import { openaiGenerateImage } from '@/lib/llm-openai'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { CharacterIdentitySchema, buildIdentityInstruction, buildCharacterParts, vozDe } from '@/lib/video-ads/character'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * FASE 4 + 4.5 — identidad, avatar y perfil vocal.
 *
 * SE DISPARA AL SUBIR LA FOTO DEL PERSONAJE (paso 2), en segundo plano, y no en el
 * paso del guión: la generación de imagen tarda ~40-55 s y el usuario los pasa
 * avanzando por validación, plantilla y guión en vez de mirando un spinner.
 *
 * Por eso acepta `characterUrl` en el body: en ese momento la foto ya está en el
 * bucket pero la fila todavía no la tiene (`uploadDirect` solo sube; `/inputs` la
 * persiste recién al enviar el paso). Sin esto, el disparo en segundo plano vería
 * `character_url: null` y generaría un avatar sin ninguna referencia, en silencio.
 *
 * EL AVATAR SIEMPRE SE GENERA, y es una persona NUEVA: la foto del usuario la pudo
 * sacar de cualquier lado, así que reproducir esa cara sería publicar la imagen de
 * alguien que no dio permiso. La foto queda en `character_url` (referencia) y el
 * avatar en `avatar_url` (lo que se renderiza).
 *
 * La imagen la genera gpt-image-2 SIN fallback, en 9:16: el avatar es el ancla visual
 * del personaje en cada lote, así que su encuadre es el del anuncio.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const userId = await readUserId()
  const session = await getVideoSession(id, userId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.forensic_analysis)
    return NextResponse.json({ error: 'Analiza el video de referencia primero' }, { status: 409 })

  const body = (await req.json().catch(() => ({}))) as { characterUrl?: string }
  const characterUrl = body.characterUrl ?? session.character_url
  if (!characterUrl)
    return NextResponse.json({ error: 'Sube la foto del personaje primero' }, { status: 409 })

  // Ya está construido PARA ESTA FOTO: se devuelve tal cual. Va ANTES del gate de cuota
  // a propósito — el disparo en segundo plano y el del paso del guión pueden coincidir
  // sobre la misma sesión, y cobrarle una regeneración por un acierto de caché sería
  // quemarle el tope.
  //
  // ⚠️ La comparación con `character_url` NO es de más: sin ella, cambiar la foto
  // devolvía el avatar de la ANTERIOR. La fila termina con la foto nueva y el avatar
  // viejo —o sea afirmando que ese avatar salió de esa foto— y el render usa el viejo,
  // sin error, sin cuota gastada y sin nada en pantalla que lo diga.
  //
  // ponytail: dos llamadas simultáneas sobre una sesión virgen (el disparo de fondo
  // todavía en vuelo cuando el paso del guión reintenta) generan dos avatares y gana
  // la última escritura. Cuesta una imagen y una regeneración del tope de 1+3; si se
  // mide que pasa seguido, el upgrade es un claim atómico como el de `generate-lotes`.
  if (
    session.avatar_url && session.consistency_block && session.voice_profile &&
    session.character_url === characterUrl
  ) {
    return NextResponse.json({
      avatarUrl: session.avatar_url,
      consistencyBlock: session.consistency_block,
      voiceProfile: session.voice_profile,
    })
  }

  const { blocked } = await checkGenQuota(id, 'video-character')
  if (blocked) return blocked

  try {
    // La foto va como part de imagen ANTES del texto (mismo orden que analyze-reference
    // y analyze-product): es la única fuente de la apariencia del personaje.
    // `fetchAsBase64` valida que el host sea el del bucket.
    const image = await fetchAsBase64(characterUrl)

    const instruction = buildIdentityInstruction(
      {
        productName: session.product_name ?? '', productDescription: session.what_it_does ?? '',
        angle: session.angle ?? '', targetAudience: session.target_audience ?? '',
        problem: session.problem ?? '', characterDesc: '',
        characterEthnicity: '', accent: '', voice: '',
        constraints: session.constraints ?? '',
      },
      session.forensic_analysis,
    )

    const identity = await callStructured(
      'character_identity',
      CharacterIdentitySchema,
      buildCharacterParts(instruction, image),
    )

    const b64 = await openaiGenerateImage([{ text: identity.promptCreacion }], 2, { aspectRatio: '9:16' })
    const avatarUrl = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'avatar')

    const voiceProfile = vozDe(identity)
    await updateVideoSession(id, {
      character_url: characterUrl,
      avatar_url: avatarUrl,
      character_prompt: identity.promptCreacion,
      consistency_block: identity.bloqueConsistencia,
      voice_profile: voiceProfile,
    })
    await recordGenQuota(id, 'video-character', userId)
    return NextResponse.json({
      avatarUrl,
      consistencyBlock: identity.bloqueConsistencia,
      voiceProfile,
    })
  } catch (err) {
    console.error('[video-ads/character]', err)
    return NextResponse.json({ error: 'No se pudo construir el personaje.' }, { status: 500 })
  }
}
