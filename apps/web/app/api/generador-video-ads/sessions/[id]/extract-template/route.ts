import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

import { TemplateDraftSchema, buildTemplateInstruction } from '@/lib/video-ads/template'
import { validateTemplate, assembleTemplate } from '@/lib/video-ads/fill'
import { canProceed } from '@/lib/video-ads/validation'
import { repairCutTiming } from '@/lib/video-ads/forensic'
import { resyncTomaDurations } from '@/lib/video-ads/adapt'
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

  // Segunda puerta de la reparación de cronometraje, para las sesiones cuyo análisis se
  // guardó ANTES de que `analyze-reference` la aplicara. Acá es gratis: este paso no
  // vuelve a mandarle el video a Gemini (por eso `video-template` no tiene tope
  // per-step), así que un análisis viejo con cortes indecibles se arregla sin pagar el
  // paso caro. Es idempotente: sobre un informe ya sano devuelve el mismo objeto y este
  // bloque no escribe nada.
  //
  // Es seguro justamente porque la reparación NO toca `tiempo`: `adapt-script` lo copia
  // a `tiempoOriginal` y `camaraDeLote` empareja por él, así que reparar acá no puede
  // desalinear el guión ya adaptado con los cortes.
  const { report: forensic, ajustes } = repairCutTiming(session.forensic_analysis)
  if (ajustes.length) {
    console.warn(
      `[video-ads/extract-template] sesión ${id}: ${ajustes.length} cortes recronometrados sobre un análisis ya guardado:`,
      ajustes.map((a) => `corte ${a.n}: ${a.de.toFixed(1)}s → ${a.a.toFixed(1)}s`),
    )
    // Y se bajan las duraciones nuevas al guión YA adaptado, si lo hay. `generate-lotes`
    // agrupa sobre `adapted.tomas`, no sobre el forense: sin esto la reparación no
    // llegaría al render y el video seguiría saliendo con los tiempos rotos, en
    // silencio. Se re-sincroniza en vez de borrar `adapted` porque borrarlo tiraría las
    // correcciones que el usuario escribió a mano línea por línea; acá solo cambian los
    // segundos, el texto queda igual.
    const resync = session.adapted ? resyncTomaDurations(session.adapted, forensic.cortes) : null
    await updateVideoSession(id, { forensic_analysis: forensic, ...(resync ? { adapted: resync } : {}) })
  }

  try {
    const draft = await callStructured('template_draft', TemplateDraftSchema, [
      { text: buildTemplateInstruction(forensic) },
    ])

    // Las tomas se arman con los cortes del forense, no con lo que devuelva el modelo.
    const template = assembleTemplate(draft, forensic.cortes)

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
