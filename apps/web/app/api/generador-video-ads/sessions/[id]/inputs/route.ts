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

  await updateVideoSession(id, {
    product_name: i.productName,
    what_it_does: i.productDescription,
    angle: i.angle,
    target_audience: i.targetAudience,
    problem: i.problem,
    character_desc: i.characterDesc,
    character_ethnicity: i.characterEthnicity,
    accent: i.accent,
    voice: i.voice,
    constraints: i.constraints,
    character_url: characterUrl,
    validation,
    step: Math.max(session.step, STEP.VALIDATION),
  })

  return NextResponse.json({ validation, canProceed: canProceed(validation) })
}
