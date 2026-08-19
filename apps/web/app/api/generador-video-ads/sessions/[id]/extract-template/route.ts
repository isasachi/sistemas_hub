import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callVideoAds } from '@/lib/video-ads/llm'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

import { TemplateDraftSchema, buildTemplateInstruction } from '@/lib/video-ads/template'
import { validateTemplate, assembleTemplate, normalizeSlots } from '@/lib/video-ads/fill'
import { canProceed } from '@/lib/video-ads/validation'
import { repairCutTiming, mergeMicroCortes, MIN_TOMA_SEG, limpiarDialogos } from '@/lib/video-ads/forensic'
import { resyncTomaDurations } from '@/lib/video-ads/adapt'
import { STEP } from '@/lib/video-ads/steps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Acá sí pasa por un LLM de texto (`callVideoAds`, Gemini): la entrada ya
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
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
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
  // FUSIÓN DE MICRO-CORTES, antes de recronometrar.
  //
  // Un corte de ~1 s no es una toma que el generador pueda producir con sentido, y con
  // la frontera de plano cada corte abre su propio lote —o sea su propia llamada
  // pagada—, así que un montaje muy granular multiplica el costo por la granularidad
  // del original y no por su duración. Medido sobre un UGC de ropa de 29 cortes: 24
  // lotes de 1 s → 7 lotes de 3-5 s, conservando UN encuadre por clip y el 92 % de la
  // coreografía.
  //
  // ⚠️ SOLO SI LA SESIÓN NO TIENE GUIÓN ADAPTADO TODAVÍA. A diferencia de
  // `repairCutTiming`, fusionar SÍ cambia `tiempo` (el tramo abarca los dos cortes), y
  // `tiempo` es lo que `adapt-script` copió a `tiempoOriginal` y con lo que
  // `camaraDeLote` empareja. Hacerlo sobre una sesión ya adaptada desalinearía el guión
  // con los cortes en silencio — justo lo que la nota de abajo dice que la reparación
  // evita por no tocar ese campo. Si ya hay guión, la lista de cortes está comprometida.
  let base = session.forensic_analysis
  if (!session.adapted) {
    const { report: fusionado, fusiones } = mergeMicroCortes(base)
    if (fusiones.length) {
      console.info(
        `[video-ads/extract-template] sesión ${id}: ${base.cortes.length} cortes → ${fusionado.cortes.length} tras fusionar micro-cortes:`,
        fusiones.map((f) => `${f.tiempo} (${f.deCortes} cortes, ${f.duracionSeg.toFixed(1)}s)`),
      )
      base = fusionado
    }
  }

  // Fusionar une los diálogos con un espacio: suma un carácter sin sumar duración, así
  // que un corte que estaba justo en el techo de cps queda apenas por encima. Recronometrar
  // después lo devuelve al techo (medido: 20.6 → 20.0 cps).
  // El piso de la fusión se le pasa a la reparación: un corte MUDO tiene mínimo de
  // diálogo 0, o sea es holgura pura, y el reparto lo vaciaría para financiar a los que
  // no entran — deshaciendo justo lo que la fusión acababa de garantizar. Medido en una
  // sesión real de ropa: las dos tomas de cierre, las únicas mudas, quedaban en 0.91 s
  // y 1.27 s después de fusionar a 3 s.
  const { report: forensic, ajustes } = repairCutTiming(limpiarDialogos(base), MIN_TOMA_SEG)
  if (ajustes.length || base !== session.forensic_analysis) {
    if (ajustes.length)
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
    const draft = await callVideoAds('template_draft', TemplateDraftSchema, [
      { text: buildTemplateInstruction(forensic) },
    ])

    // Las tomas se arman con los cortes del forense, no con lo que devuelva el modelo.
    const armada = assembleTemplate(draft, forensic.cortes)

    // Y se acotan los huecos ANTES de persistir: desmarca los universales y fusiona las
    // enumeraciones del mismo nombre. Va acá, dentro de la misma escritura, y no en un
    // paso aparte, porque `extractSlots`/`fillTemplate` numeran los huecos por orden de
    // recorrido (`nombre#n`) — fusionar corre esa numeración, así que ningún id guardado
    // puede haberse calculado sobre la plantilla previa a la fusión.
    const { template, reporte } = normalizeSlots(armada, forensic.cortes)
    if (reporte.antes !== reporte.despues || reporte.desalineadas.length || reporte.renombrados.length || reporte.numerados.length)
      console.warn(
        `[video-ads/extract-template] sesión ${id}: huecos ${reporte.antes} → ${reporte.despues}` +
        (reporte.renombrados.length ? ` · renombrados por rol: ${reporte.renombrados.join(', ')}` : '') +
        (reporte.numerados.length ? ` · numerados por colisión: ${reporte.numerados.join(', ')}` : '') +
        (reporte.desalineadas.length ? ` · ⚠ tomas cuyo andamiaje NO copia su corte: ${reporte.desalineadas.join(', ')}` : ''),
      )

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
    // `desalineadas` viaja al cliente: es la señal de que la FASE 2 dejó de copiar el
    // guión literal, y hasta ahora solo se veía en los logs del servidor. Quien puede
    // hacer algo al respecto (re-extraer, o corregir a mano) es el usuario.
    return NextResponse.json({ template, desalineadas: reporte.desalineadas })
  } catch (err) {
    console.error('[video-ads/extract-template]', err)
    return NextResponse.json({ error: 'No se pudo extraer la plantilla.' }, { status: 500 })
  }
}
