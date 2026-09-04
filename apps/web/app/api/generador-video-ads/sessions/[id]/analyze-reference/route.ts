import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { fetchAsBase64, headStorageFile, PayloadTooLargeError } from '@/lib/storage'
import { geminiCallStructured, geminiEsDirecto } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ForensicReportSchema } from '@/lib/video-ads/types'
import { buildForensicInstruction, repairCutTiming, reconciliarConVentana, coreografiaEscasa, MIN_TOMA_SEG, limpiarDialogos, verificarHablantes, verificarDialogos, type ProblemaDialogo, buildMotionRefinementInstruction, MotionRefinementSchema } from '@/lib/video-ads/forensic'
import { normalizeMotionTimeline, validateMotionTimeline, objetoEnManoFromMotion, compileAccion, tieneMotion } from '@/lib/video-ads/motion'
import { MAX_VIDEO_MB } from '@/lib/video-ads/limits'
import { STEP } from '@/lib/video-ads/steps'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BodySchema = z.object({ videoUrl: z.string().url() })

// El análisis forense NO pasa por `callStructured`: ese es OpenAI-primario y
// gpt-4o-mini no procesa video. Va directo a Gemini.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-forensic')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Falta el video de referencia' }, { status: 400 })

  try {
    // El tope de MAX_VIDEO_MB también se valida en el browser (Section0Reference), pero eso es
    // UX: un request armado a mano se lo salta. Acá se comprueba con un HEAD —junto con el
    // allowlist de host, que importa MÁS que antes porque la URL se la damos a KIE para que la
    // busque él— sin bajar el archivo.
    const { mimeType } = await headStorageFile(parsed.data.videoUrl, MAX_VIDEO_MB * 1024 * 1024)

    // ⚠️ EL VIDEO VA POR URL, NO EN BASE64, Y NO ES UNA OPTIMIZACIÓN. Medido sobre el mismo video
    // de 13,6 MB: 18,2 MB de base64 MÁS el schema del forense revientan a los ~69 s con un
    // `400 "The server is currently being maintained"` de KIE que miente —3 de 3 intentos, 3,7 min
    // y un 500 al usuario— y con la URL responde. El video ya vive en el bucket, así que además
    // nos ahorramos bajarlo y volver a subirlo dentro del request.
    //
    // Bajo `GEMINI_VIA=direct` se manda inline: el SDK de Google solo acepta un `fileUri` de su
    // propia Files API, no una URL de Supabase.
    const parts: Part[] = [
      geminiEsDirecto()
        ? { inlineData: await fetchAsBase64(parsed.data.videoUrl, MAX_VIDEO_MB * 1024 * 1024) }
        : { fileData: { fileUri: parsed.data.videoUrl, mimeType } },
      { text: buildForensicInstruction() },
    ]
    const analysis = await geminiCallStructured('forensic_report', ForensicReportSchema, parts)

    /**
     * FASE 1b — EL PASE DE REFINAMIENTO DE MOVIMIENTO.
     *
     * ⚠️ Es una llamada de Gemini PAGADA POR EL HUB y va declarada, no escondida como un
     * fallback: se registra su propio kind (`video-motion`) para que aparezca en el panel
     * de consumo. **No lleva tope per-step propio** porque la ruta ya está topada por
     * `video-forensic`: un segundo gate sobre la misma llamada solo podría dejar a la
     * sesión con el análisis hecho y el movimiento a medias.
     *
     * ⚠️ VA EN try/catch Y ANTES DE PERSISTIR NADA. Si el refinamiento falla, la sesión se
     * guarda igual con el movimiento del pase general — que es peor pero utilizable. Es la
     * misma forma que el corrector de coherencia cayendo al relleno de la primera pasada:
     * un paso de mejora nunca puede costar el paso que ya se pagó.
     *
     * ⚠️ UNA LLAMADA POR VIDEO, NO POR CORTE — medido sobre el mismo video:
     *   pase general           [1,1,1,1,1] =  5 beats
     *   dedicado, 1/video      [2,3,2,3,2] = 12 beats, cadena intacta,  +1 llamada
     *   dedicado, 1/CORTE      [2,3,3,4,3] = 15 beats, 3 eslabones ROTOS, +5 llamadas
     * Por corte compra un 25 % más de beats a 5× el costo y encima DEGRADA la calidad: con
     * menos contexto el modelo deja de mantener la cadena de estados y se salta algún
     * `referenceFrameMs`. Más llamadas no es más fidelidad.
     */
    if ((analysis.cortes ?? []).length) try {
      const refinado = await geminiCallStructured('motion_refinement', MotionRefinementSchema, [
        parts[0],
        { text: buildMotionRefinementInstruction(analysis.cortes) },
      ])
      const porN = new Map((refinado.cortes ?? []).map((c) => [c.n, c.motion]))
      let mejorados = 0
      for (const c of analysis.cortes ?? []) {
        const m = porN.get(c.n)
        // Solo pisa si el pase dedicado trajo MÁS resolución: nunca se cambia un timeline
        // por uno más pobre, y el pase no puede tocar cortes que no supo refinar.
        if (m && m.beats.length > (c.motion?.beats?.length ?? 0)) { c.motion = m; mejorados++ }
      }
      console.info(`[video-ads/analyze-reference] sesión ${id}: refinamiento de movimiento — ${mejorados} de ${analysis.cortes.length} cortes con más resolución`)
      await recordGenQuota(id, 'video-motion', userId)
    } catch (err) {
      // Se sigue con lo que trajo el pase general. Se loguea porque un refinamiento que
      // falla siempre es un cambio de contrato de Gemini, no un caso normal.
      console.warn(`[video-ads/analyze-reference] sesión ${id}: el refinamiento de movimiento falló, se conserva el del análisis general —`, err)
    }

    /**
     * NORMALIZACIÓN DETERMINISTA DEL MOVIMIENTO. El modelo observa; el código decide.
     * La ventana del corte es la autoridad de tiempo: los beats se acotan a ella, nunca al
     * revés. Los contadores se derivan acá porque un LLM es mal aritmético y ese número
     * decide después cuánta carga de movimiento entra en un clip.
     */
    const rotos: string[] = []
    for (const c of analysis.cortes ?? []) {
      if (!tieneMotion(c)) continue
      c.motion = normalizeMotionTimeline(c.motion, c.duracionSeg)
      const issues = validateMotionTimeline(c.motion)
      if (issues.length) rotos.push(`corte ${c.n}: ${issues.map((i) => i.motivo).join(' · ')}`)
      // `accion` pasa a ser una PROYECCIÓN del timeline, no su fuente: si los dos existen
      // no pueden contradecirse porque uno se deriva del otro.
      const compilada = compileAccion(c.motion)
      if (compilada) c.accion = compilada
      // `objetoEnMano` se DERIVA en vez de pedirse — sus dos consumidores no cambian.
      const derivado = objetoEnManoFromMotion(c.motion)
      if (derivado) c.objetoEnMano = derivado
    }
    if (rotos.length)
      console.warn(`[video-ads/analyze-reference] sesión ${id}: ${rotos.length} cortes con la cadena de estados del producto rota —`, rotos)

    // Mismo motivo que en adapt-script: el modelo estima mal el conteo (reportó 562
    // sobre un guión de 776) y ese número es la referencia contra la que se mide si el
    // guión adaptado se fue de largo. Se cuenta acá.
    analysis.caracteresGuion = analysis.guionOriginal.length

    // Se repara ACÁ y se persiste ya reparado, en vez de arreglarlo donde se consume: la
    // duración de cada corte es la columna vertebral de todo lo que sigue (la plantilla
    // la copia, el guión adaptado la hereda, y termina siendo los segundos que se le
    // piden a KIE). Un solo lugar que la corrija es la única forma de que las tres
    // etapas vean el mismo número. Nota: las sesiones YA analizadas conservan sus
    // duraciones viejas — hay que re-correr el análisis para repararlas.
    // Antes de recronometrar: un marcador de campo vacío en `dialogo` cuenta caracteres
    // que nadie va a decir, así que limpiarlo después daría duraciones calculadas sobre
    // texto fantasma.
    // Orden: limpiar → verificar atribución → recronometrar. La limpieza puede sacar un
    // marcador de dentro de `hablantes`, así que verificar antes daría un falso negativo.
    // ⚠️ EL REPARTO DEL DIÁLOGO SE COMPRUEBA Y SE REPORTA, no se repara: un corte mal
    // partido no se puede arreglar en código sin inventar dónde va cada frase. Y es el
    // defecto que contamina todo cuesta abajo — ver `verificarDialogos`.
    const malReparto = verificarDialogos(limpiarDialogos(analysis))
    if (malReparto.length) {
      console.warn(`[video-ads/analyze-reference] sesión ${id}: el reparto del diálogo entre cortes tiene ${malReparto.length} problema(s) —`,
        malReparto.map((x: ProblemaDialogo) => `corte ${x.corte}: ${x.motivo}`))
    }
    const { report: atribuido, descartados } = verificarHablantes(limpiarDialogos(analysis))
    if (descartados.length) {
      console.warn(`[video-ads/analyze-reference] sesión ${id}: el reparto por hablante no reproducía el diálogo en los cortes ${descartados.join(', ')} — se descartó su atribución`)
    }
    // ⚠️ RECONCILIAR ANTES DE REPARAR, y SOLO acá. El modelo declara la duración dos
    // veces (la ventana `tiempo` y `duracionSeg`) y se contradice en el 15 % de los
    // cortes, siempre contra el b-roll: 9 de los 12 cortes mudos de la base están por
    // debajo de 3 s. Las ventanas sí forman una línea coherente, así que mandan. En
    // `extract-template` NO se repite: allá las duraciones ya pasaron por la reparación.
    const { report: conVentana, ajustes: reconciliados } = reconciliarConVentana(atribuido)
    if (reconciliados.length)
      console.warn(
        `[video-ads/analyze-reference] sesión ${id}: ${reconciliados.length} cortes cuya duración no coincidía con su ventana, reconciliados:`,
        reconciliados.map((a) => `corte ${a.n}: ${a.de.toFixed(1)}s → ${a.a.toFixed(1)}s`),
      )
    // ⚠️ Y CON PISO VISIBLE, o la reconciliación no sirve de nada. Un corte MUDO tiene
    // mínimo de habla 0, así que para el reparto es holgura pura y lo puede vaciar entero
    // para financiar a los hablados. Sin este piso, el b-roll que la línea de arriba acaba
    // de levantar a su duración real se drena en la línea siguiente. El piso se acota a la
    // duración que el corte YA tiene (ver `repairCutTiming`), así que no infla nada: solo
    // impide el vaciado.
    const { report: reparado, ajustes } = repairCutTiming(conVentana, MIN_TOMA_SEG)
    if (ajustes.length)
      console.warn(
        `[video-ads/analyze-reference] sesión ${id}: ${ajustes.length} cortes con diálogo indecible en su duración, recronometrados:`,
        ajustes.map((a) => `corte ${a.n}: ${a.de.toFixed(1)}s → ${a.a.toFixed(1)}s`),
      )

    // ⚠️ VISIBILIDAD, no corrección: el forense es el paso caro y no se re-llama por esto.
    // El síntoma que llega al usuario es "el video no copia los movimientos", y su causa
    // más común es que la coreografía de un corte largo se describió con dos frases.
    const escasos = coreografiaEscasa(reparado)
    if (escasos.length)
      console.warn(
        `[video-ads/analyze-reference] sesión ${id}: ${escasos.length} cortes con coreografía escasa para su duración —`,
        escasos.map((e) => `corte ${e.n}: ${e.movimientos} movimientos en ${e.seg.toFixed(1)}s`),
      )

    await updateVideoSession(id, {
      step: STEP.PRODUCT,
      reference_video_url: parsed.data.videoUrl,
      forensic_analysis: reparado,
    })
    await recordGenQuota(id, 'video-forensic', userId)
    // El reparado, no `analysis`: es lo que quedó en la base, y el store del cliente no
    // puede contar una versión distinta de la que va a leer el paso siguiente.
    return NextResponse.json({ analysis: reparado })
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      // Mismo texto que el guard de UX del cliente (Section0Reference): un usuario que
      // se topa con esto no debería ver una redacción distinta según qué capa lo paró.
      return NextResponse.json(
        { error: `El video pesa más de ${MAX_VIDEO_MB} MB. Recórtalo o bájale la calidad.` },
        { status: 413 },
      )
    }
    console.error('[video-ads/analyze-reference]', err)
    return NextResponse.json(
      { error: 'No se pudo analizar el video. Inténtalo de nuevo.' },
      { status: 500 },
    )
  }
}
