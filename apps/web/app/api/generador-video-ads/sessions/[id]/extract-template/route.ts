import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

import { TemplateDraftSchema, buildTemplateInstruction } from '@/lib/video-ads/template'
import { validateTemplate, assembleTemplate } from '@/lib/video-ads/fill'
import { canProceed } from '@/lib/video-ads/validation'
import { STEP } from '@/lib/video-ads/steps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Acá sí se usa `callStructured` (OpenAI primario, Gemini fallback): la entrada ya
// es texto — el informe forense —, así que no hace falta un modelo que coma video.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-template')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.forensic_analysis)
    return NextResponse.json({ error: 'Analiza el video de referencia primero' }, { status: 409 })
  // Guard real de la FASE 0: el cliente deshabilita el botón mientras haya una
  // crítica PENDIENTE, pero eso es conveniencia — es evitable navegando el riel o
  // pegándole directo a la ruta. Esto es lo que de verdad impide extraer la
  // plantilla con datos sin confirmar.
  if (!session.validation || !canProceed(session.validation))
    return NextResponse.json(
      { error: 'Completa la validación de datos antes de extraer la plantilla' },
      { status: 409 },
    )

  try {
    const draft = await callStructured('template_draft', TemplateDraftSchema, [
      { text: buildTemplateInstruction(session.forensic_analysis) },
    ])

    // Las tomas se arman con los cortes del forense, no con lo que devuelva el modelo.
    const template = assembleTemplate(draft, session.forensic_analysis.cortes)

    // Una plantilla degenerada (locuciones que son el nombre del campo, o que no
    // cubren el guion) no se puede rellenar: produciría un guion vacío en el paso
    // siguiente. Se detecta acá, que es gratis, en vez de allá, que cuesta una llamada.
    const problema = validateTemplate(template)
    if (problema)
      return NextResponse.json(
        { error: `La plantilla salió mal: ${problema} Vuelve a extraerla.` },
        { status: 502 },
      )

    await updateVideoSession(id, { step: STEP.TEMPLATE, template })
    await recordGenQuota(id, 'video-template', userId)
    return NextResponse.json({ template })
  } catch (err) {
    console.error('[video-ads/extract-template]', err)
    return NextResponse.json({ error: 'No se pudo extraer la plantilla.' }, { status: 500 })
  }
}
