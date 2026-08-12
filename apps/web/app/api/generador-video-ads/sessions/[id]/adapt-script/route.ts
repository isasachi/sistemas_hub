import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { AdaptedScriptSchema, buildAdaptInstruction } from '@/lib/video-ads/adapt'
import { canProceed } from '@/lib/video-ads/validation'
import { STEP } from '@/lib/video-ads/steps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-adapt')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.template || !session.forensic_analysis)
    return NextResponse.json({ error: 'Extrae la plantilla primero' }, { status: 409 })

  // El gate de la FASE 0 se revalida en el servidor: el spec prohíbe avanzar a la
  // adaptación con una variable crítica pendiente, y el botón del wizard es una
  // conveniencia, no una garantía.
  if (!session.validation || !canProceed(session.validation))
    return NextResponse.json({ error: 'Faltan datos por confirmar' }, { status: 409 })

  try {
    const adapted = await callStructured('adapted_script', AdaptedScriptSchema, [
      {
        text: buildAdaptInstruction(
          session.template,
          session.forensic_analysis,
          {
            productName: session.product_name ?? '',
            productDescription: session.what_it_does ?? '',
            angle: session.angle ?? '',
            targetAudience: session.target_audience ?? '',
            problem: session.problem ?? '',
            characterDesc: session.character_desc ?? '',
            characterEthnicity: session.character_ethnicity ?? '',
            accent: session.accent ?? '',
            voice: session.voice ?? '',
            constraints: session.constraints ?? '',
          },
          session.product_scan,
        ),
      },
    ])
    await updateVideoSession(id, { step: STEP.SCRIPT, adapted })
    await recordGenQuota(id, 'video-adapt', userId)
    return NextResponse.json({ adapted })
  } catch (err) {
    console.error('[video-ads/adapt-script]', err)
    return NextResponse.json({ error: 'No se pudo adaptar el guión.' }, { status: 500 })
  }
}
