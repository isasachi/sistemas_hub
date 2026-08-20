import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { UserInputsSchema } from '@/lib/video-ads/types'
import { buildValidationMatrix, canProceed } from '@/lib/video-ads/validation'
import { STEP } from '@/lib/video-ads/steps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Guarda los INPUTS y devuelve la matriz de la FASE 0. No llama a ningún modelo:
// la validación pregunta "¿el usuario entregó esto?", y eso lo sabe el servidor.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const parsed = UserInputsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  const i = parsed.data

  // El personaje sube DIRECTO al bucket (uploadDirect) antes de este POST, así que
  // esta es la única ruta que persiste `character_url` en la sesión. `i.characterUrl`
  // manda si llega (foto recién subida en este mismo paso); si no, conservamos lo
  // que la fila ya tenía. Sin este merge la matriz nunca podía confirmar "Personaje"
  // por imagen: `session.character_url` se quedaba en null para siempre.
  const characterUrl = i.characterUrl ?? session.character_url ?? null
  const validation = buildValidationMatrix(i, !!characterUrl)

  /**
   * ⚠️ MEZCLA POR ID, NO PISA. Lo que llega del wizard es solo lo que el USUARIO define
   * (rol, descripción, etnia, acento, voz, foto). El avatar, el bloque de consistencia,
   * el perfil de voz y el de movimiento los genera FASE 4 y viven en la misma fila:
   * escribir el array del wizard tal cual los borraría, y volver a este paso a corregir
   * una tilde obligaría a re-generar N avatares.
   */
  const previos = Array.isArray(session.personajes) ? session.personajes : []
  const personajes = i.personajes?.length
    ? i.personajes.map((p) => {
        const antes = previos.find((x) => x.id === p.id)
        return {
          ...p,
          fotoUrl: p.fotoUrl ?? antes?.fotoUrl ?? null,
          avatarUrl: antes?.avatarUrl ?? null,
          consistencyBlock: antes?.consistencyBlock ?? null,
          voiceProfile: antes?.voiceProfile ?? null,
          motionProfile: antes?.motionProfile ?? null,
        }
      })
    : null

  await updateVideoSession(id, {
    product_name: i.productName,
    what_it_does: i.productDescription,
    angle: i.angle,
    target_audience: i.targetAudience,
    problem: i.problem,
    character_desc: personajes?.[0]?.desc ?? i.characterDesc,
    character_ethnicity: personajes?.[0]?.etnia ?? i.characterEthnicity,
    accent: personajes?.[0]?.acento ?? i.accent,
    voice: personajes?.[0]?.voz ?? i.voice,
    constraints: i.constraints,
    character_url: characterUrl,
    // Las columnas singulares se siguen escribiendo con el PROTAGONISTA: son el camino
    // legado y lo que leen las sesiones sin `personajes`.
    ...(personajes ? { personajes } : {}),
    validation,
    step: Math.max(session.step, STEP.VALIDATION),
  })

  return NextResponse.json({ validation, canProceed: canProceed(validation) })
}
