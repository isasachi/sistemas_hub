import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { SlotValuesSchema, buildAdaptInstruction } from '@/lib/video-ads/adapt'
import { extractSlots, fillTemplate } from '@/lib/video-ads/fill'
import { extractPending } from '@/lib/video-ads/pending'
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
    const slots = extractSlots(session.template)

    const { valores, acciones } = await callStructured('slot_values', SlotValuesSchema, [
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
          slots,
        ),
      },
    ])

    // El guión lo arma código copiando la plantilla, no el modelo: es la única forma de
    // garantizar que fuera de los corchetes no cambie ni una palabra. Los huecos que el
    // modelo dejó vacíos quedan marcados en el texto — el spec manda no preguntar por
    // ellos, y el usuario los escribe editando la línea (ruta `script`).
    const mapa: Record<string, string> = {}
    for (const v of valores) mapa[v.id] = v.valor

    const relleno = fillTemplate(session.template, mapa)
    const porToma = new Map(acciones.map((a) => [a.n, a.accionVisual]))
    const cortes = session.forensic_analysis.cortes

    const adapted = {
      guionFinal: relleno.guionFinal,
      caracteresAdaptado: relleno.guionFinal.length,
      diferenciaCaracteres: relleno.guionFinal.length - session.forensic_analysis.guionOriginal.length,
      tomas: relleno.tomas.map((t, i) => ({
        n: t.n,
        tiempoOriginal: cortes[i]?.tiempo ?? '',
        duracionSeg: t.duracionSeg,
        // La coreografía la adapta el modelo (traducir "gotero" al producto nuevo pide
        // criterio); si no devolvió esa toma, cae a la versión rellenada de la plantilla.
        accionVisual: porToma.get(t.n)?.trim() || t.accionVisual,
        personaje: session.character_desc ?? '',
        producto: session.product_scan?.productDescription ?? session.product_name ?? '',
        locucion: t.locucion,
      })),
      // Se derivan del texto, no se le preguntan al modelo: `fillTemplate` deja un
      // marcador por cada hueco que quedó sin valor.
      variablesPendientes: extractPending(relleno.guionFinal),
    }

    await updateVideoSession(id, { step: STEP.SCRIPT, adapted })
    await recordGenQuota(id, 'video-adapt', userId)
    return NextResponse.json({ adapted })
  } catch (err) {
    console.error('[video-ads/adapt-script]', err)
    return NextResponse.json({ error: 'No se pudo adaptar el guión.' }, { status: 500 })
  }
}
