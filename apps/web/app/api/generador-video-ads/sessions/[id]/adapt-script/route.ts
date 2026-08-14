import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { SlotValuesSchema, CoherenceSchema, buildAdaptInstruction, buildCoherenceInstruction } from '@/lib/video-ads/adapt'
import { extractSlots, fillTemplate, rejectBadValues, resolveSlotId } from '@/lib/video-ads/fill'
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

    const inputs = {
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
    }

    const { valores, acciones } = await callStructured('slot_values', SlotValuesSchema, [
      { text: buildAdaptInstruction(session.template, session.forensic_analysis, inputs, session.product_scan, slots) },
    ])

    // El guión lo arma código copiando la plantilla, no el modelo: es la única forma de
    // garantizar que fuera de los corchetes no cambie ni una palabra. Los huecos que el
    // modelo dejó vacíos quedan marcados en el texto — el spec manda no preguntar por
    // ellos, y el usuario los escribe editando la línea (ruta `script`).
    const mapa: Record<string, string> = {}
    for (const v of valores) mapa[v.id] = v.valor

    // Guard determinista antes de sustituir: un valor que es una frase entera (o que
    // repite el texto que ya lo rodea) produce texto ilegible al meterlo dentro de la
    // frase que lo contiene. `fillTemplate` copia sin interpretar —esa es su virtud— así
    // que filtrar es trabajo de acá. Lo rechazado queda como hueco y el usuario lo
    // escribe editando la línea.
    const { valores: limpios, rechazados } = rejectBadValues(session.template, mapa)
    if (rechazados.length)
      console.warn(`[video-ads/adapt-script] sesión ${id}: valores descartados por no ser valores:`, rechazados)

    let relleno = fillTemplate(session.template, limpios)

    // SEGUNDA PASADA — "¿esto se entiende al leerlo?".
    // La primera pasada juzga a ciegas: devuelve pares `id → valor` y el guión lo arma
    // `fillTemplate` con código, así que el modelo nunca lee el resultado y mide cada
    // valor contra la ETIQUETA del hueco en vez de contra la frase. En dos pruebas
    // reales eso dejó un input crudo del usuario donde la oración pedía un adjetivo, un
    // beneficio donde pedía un ingrediente y un momento del día donde pedía una
    // cantidad — todos correctos para su etiqueta, todos ilegibles en su frase.
    //
    // Acá el modelo SÍ ve el texto armado. Solo puede devolver correcciones de VALOR
    // (nunca locución: si pudiera, se perdería la fidelidad del 100% fuera de los
    // corchetes), y las correcciones vuelven a pasar por `rejectBadValues` — si no,
    // serían una segunda puerta a `fillTemplate` sin el guard que la primera tiene.
    //
    // Cuesta una llamada de texto extra (sin tope per-step, pero suma unos segundos).
    // Un fallo acá NO tumba la adaptación: se conserva el relleno de la primera pasada.
    try {
      const { correcciones } = await callStructured('coherence_check', CoherenceSchema, [
        {
          text: buildCoherenceInstruction(
            relleno.tomas.map((t) => ({ n: t.n, locucion: t.locucion })),
            slots
              .filter((sl) => limpios[sl.id])
              .map((sl) => ({ id: sl.id, valor: limpios[sl.id], contexto: sl.contexto })),
            inputs,
          ),
        },
      ])

      if (correcciones.length) {
        const corregidos = { ...limpios }
        const sinResolver: string[] = []
        for (const c of correcciones) {
          // El id se resuelve tolerante: el modelo reescribe el nombre del hueco al
          // devolverlo y pierde tildes o el sufijo `#n`. Con búsqueda exacta, esas
          // correcciones se aplicaban a NADA mientras el log decía que sí — un fallo
          // que se reporta como éxito.
          const slotId = resolveSlotId(slots, c.id)  // `id` a secas es la sesión
          if (!slotId) { sinResolver.push(c.id); continue }
          // Un valor vacío BORRA el hueco a propósito: el checker decidió que no hay con
          // qué rellenarlo y un pendiente es mejor que un dato inventado.
          if (c.valor.trim()) corregidos[slotId] = c.valor
          else delete corregidos[slotId]
        }
        if (sinResolver.length)
          console.warn(`[video-ads/adapt-script] sesión ${id}: correcciones con id desconocido, ignoradas:`, sinResolver)
        const revisados = rejectBadValues(session.template, corregidos)
        relleno = fillTemplate(session.template, revisados.valores)
        console.info(
          `[video-ads/adapt-script] sesión ${id}: coherencia corrigió ${correcciones.length} valores:`,
          correcciones.map((c) => `${c.id} → ${c.valor ? `"${c.valor}"` : 'VACIADO'} (${c.motivo})`),
        )
        if (revisados.rechazados.length)
          console.warn(`[video-ads/adapt-script] sesión ${id}: correcciones descartadas por el guard:`, revisados.rechazados)
      }
    } catch (err) {
      // Que el corrector falle no puede costarle al usuario la adaptación entera: el
      // guión de la primera pasada ya es utilizable y él lo edita línea por línea.
      console.error(`[video-ads/adapt-script] sesión ${id}: el chequeo de coherencia falló, se conserva la primera pasada`, err)
    }

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
