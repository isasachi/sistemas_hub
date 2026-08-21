import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callVideoAds } from '@/lib/video-ads/llm'
import { generateImage } from '@/lib/video-ads/nano-banana'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { IdentidadesSchema, buildIdentityInstruction, buildCharacterParts } from '@/lib/video-ads/character'
import { personajesDe, resolvePersonaje } from '@/lib/video-ads/personajes'
import { nicheSpec } from '@/lib/video-ads/niches'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// FASE 4 + 4.5. La imagen la genera **Nano Banana Pro** (Gemini 3 Pro Image) en 9:16,
// sin fallback. Reemplaza a gpt-image-2 por dos motivos medidos:
//
//  1. Conserva la identidad y la prenda desde una sola foto de referencia con una
//     fidelidad muy superior (probado sobre el avatar real de la sesión de ropa).
//  2. Hace 9:16 nativo, y eso pasa a ser obligatorio: con el modo de frames de Veo el
//     avatar deja de ser "una referencia más" y se convierte en el primer fotograma
//     del clip. El 2:3 de gpt-image-2 se justificaba con que el personaje nunca iba
//     solo en el render — con frames, va solo y define el encuadre.
//
// ⚠️ CAMBIO DE COMPORTAMIENTO: la foto que sube el usuario ya NO se usa como personaje.
// Es la fuente de verdad de la IDENTIDAD y el avatar se GENERA a partir de ella, que es
// lo que pide la FASE 4 del spec ("genera un prompt autónomo para crear una imagen base
// del personaje"). Antes, con foto, no se generaba nada — así que el render recibía una
// foto de encuadre y luz arbitrarios como primer plano del anuncio. La foto queda en
// `character_url` y el avatar generado en `avatar_url`.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-character')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  if (!session.forensic_analysis)
    return NextResponse.json({ error: 'Analiza el video de referencia primero' }, { status: 409 })

  try {
    // Si el usuario ya subió foto de personaje, ES la fuente de verdad — se manda
    // como part de imagen ANTES del texto (mismo orden que analyze-reference y
    // analyze-product) para que el modelo la observe en vez de fabricar el bloque
    // de consistencia a ciegas. `fetchAsBase64` valida que el host sea el del
    // bucket, que es lo que queremos acá porque la URL viene de la fila.
    // Una foto por personaje, en el MISMO orden en que el prompt los lista. Los que no
    // tienen foto simplemente no aportan imagen — el prompt ya distingue ese caso.
    const gente = personajesDe(session)
    const fotos = (await Promise.all(gente.map((p) => (p.fotoUrl ? fetchAsBase64(p.fotoUrl) : null))))
      .filter((f): f is NonNullable<typeof f> => !!f)

    // En ropa/zapatos el producto se LLEVA PUESTO, así que la prenda tiene que estar
    // delante del modelo dos veces: al describir la identidad (para que el bloque de
    // consistencia detalle la prenda del usuario y no el vestuario del video original)
    // y al generar el avatar (para que salga vistiéndola de verdad, no una parecida).
    const spec = nicheSpec(session.niche)
    const prenda = spec.wornProduct && session.product_url
      ? await fetchAsBase64(session.product_url)
      : null

    const instruction = buildIdentityInstruction(
      {
        productName: session.product_name ?? '', productDescription: session.what_it_does ?? '',
        angle: session.angle ?? '', targetAudience: session.target_audience ?? '',
        problem: session.problem ?? '', characterDesc: session.character_desc ?? '',
        characterEthnicity: session.character_ethnicity ?? '', accent: session.accent ?? '',
        voice: session.voice ?? '', constraints: session.constraints ?? '',
      },
      session.forensic_analysis,
      gente,
      session.niche,
    )

    const identidades = await callVideoAds(
      'character_identity',
      IdentidadesSchema,
      buildCharacterParts(instruction, fotos, prenda),
    )

    // Referencias que el generador de imagen recibe POR URL (Nano Banana Pro las toma
    // así, no en base64): la foto del usuario cuando existe —fuente de verdad de la
    // identidad— y la prenda cuando el producto se lleva puesto, para que el avatar
    // nazca vistiéndola de verdad en vez de una parecida descrita en palabras. Es lo
    // mismo que sostiene que la ropa sea la misma en todos los lotes.
    // Un avatar POR PERSONAJE, en paralelo. El modelo resolvió las identidades juntas
    // (para que no se parezcan), pero cada imagen es independiente.
    // Qué identidad devolvió el modelo para cada personaje. `resolvePersonaje` tolera
    // que reescriba el id al citarlo (`p1`, `P1 (hijo)`, `hijo`); si aun así no resuelve
    // se cae al orden, que es el mismo en que se le pidieron.
    const conIdentidad = gente.map((p, i) => ({
      personaje: p,
      identidad:
        identidades.personajes.find((x) => resolvePersonaje([p], x.id))
        ?? identidades.personajes[i]
        ?? identidades.personajes[0],
    }))

    const avatares = await Promise.all(conIdentidad.map(async ({ personaje, identidad }) => {
      const referencias = [personaje.fotoUrl, spec.wornProduct ? session.product_url : null]
        .filter((u): u is string => !!u)
      const bytes = await generateImage({
        prompt: identidad.promptCreacion,
        imageUrls: referencias,
        aspectRatio: '9:16',
      })
      return uploadToStorage(id, bytes, 'image/png', `avatar-${personaje.id}`)
    }))

    const personajes = conIdentidad.map(({ personaje, identidad }, i) => ({
      ...personaje,
      avatarUrl: avatares[i],
      consistencyBlock: identidad.bloqueConsistencia,
      voiceProfile: identidad.voz,
      motionProfile: identidad.movimiento,
    }))
    const [principal] = personajes
    const avatarUrl = principal.avatarUrl

    await updateVideoSession(id, {
      personajes,
      // ⚠️ Las columnas singulares se siguen escribiendo con los datos del PROTAGONISTA.
      // El render todavía las lee (eso cambia en el slice 4), así que dejar de escribirlas
      // acá dejaría el video sin personaje entre un slice y el otro.
      avatar_url: avatarUrl,
      character_prompt: conIdentidad[0].identidad.promptCreacion,
      consistency_block: principal.consistencyBlock,
      voice_profile: principal.voiceProfile,
      motion_profile: principal.motionProfile,
    })
    await recordGenQuota(id, 'video-character', userId)
    return NextResponse.json({
      characterUrl: avatarUrl,
      personajes,
      consistencyBlock: principal.consistencyBlock,
      voiceProfile: principal.voiceProfile,
      motionProfile: principal.motionProfile,
    })
  } catch (err) {
    console.error('[video-ads/character]', err)
    return NextResponse.json({ error: 'No se pudo construir el personaje.' }, { status: 500 })
  }
}
