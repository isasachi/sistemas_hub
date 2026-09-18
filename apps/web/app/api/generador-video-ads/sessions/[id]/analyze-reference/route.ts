import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { fetchAsBase64, headStorageFile, PayloadTooLargeError } from '@/lib/storage'
import { geminiCallStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ForensicReportSchema } from '@/lib/video-ads/types'
import { buildForensicInstruction, repairCutTiming, normalizarCamara, normalizarHechos, MIN_VISIBLE_SEG } from '@/lib/video-ads/forensic'
import { VIDEO_SYSTEM_PROMPT } from '@/lib/video-ads/llm'
import { MAX_VIDEO_MB } from '@/lib/video-ads/limits'
import { STEP } from '@/lib/video-ads/steps'
import { defectosDelForense, normalizarManosDeCamara } from '@/lib/video-ads/lotes'

/** Reintentos del forense ante un defecto estructural. Cada uno es una llamada de video pagada por el hub. */
const FORENSE_REINTENTOS = 1
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BodySchema = z.object({ videoUrl: z.string().url() })

// El análisis forense NO pasa por `callStructured`: su respaldo es un modelo de texto que no
// procesa video, así que no hay a qué caer. Va directo a Gemini, sin respaldo.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-forensic')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id, userId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Falta el video de referencia' }, { status: 400 })

  try {
    // El tope de MAX_VIDEO_MB también se valida en el browser (Section0Reference), pero
    // eso es UX: un request armado a mano se lo salta. Acá se comprueba con un HEAD
    // —junto con el allowlist de host— sin bajar el archivo, ANTES de gastar el ancho de
    // banda de bajarlo para mandarlo inline.
    await headStorageFile(parsed.data.videoUrl, MAX_VIDEO_MB * 1024 * 1024)

    // ⚠️ EL VIDEO VA INLINE, en base64. El SDK de Google solo acepta un `fileUri` de su propia
    // Files API —una URL de Supabase no le sirve—, así que la única forma de mandárselo es el
    // `inlineData`. Es lo que se hacía antes de KIE y a lo que se vuelve ahora que KIE salió del
    // hub (2026-09-17).
    //
    // ⚠️ Por eso `MAX_VIDEO_MB` no es un capricho: el request se come el archivo entero en
    // memoria y el base64 lo infla ~33%. Subirlo sin medir es cómo se llega al 500 por timeout.
    const parts: Part[] = [
      { inlineData: await fetchAsBase64(parsed.data.videoUrl, MAX_VIDEO_MB * 1024 * 1024) },
      { text: buildForensicInstruction() },
    ]
    // El system prompt es el del VIDEO, no el default de `lib/gemini` (el motor de
    // anuncios ESTÁTICOS, que ordena declarar si el producto flota y describe una foto de
    // catálogo). El forense mira un video: esa orden le contamina los campos de
    // coreografía, y de ahí salían las seis `accionVisual` terminadas en "El producto no
    // está flotando." aguas abajo.
    // El forense es ESTOCÁSTICO y un sorteo con defecto estructural (un corte largo
    // colapsado a un hecho, o el aplicador que sale y vuelve sin aplicar) cuesta un render
    // entero con la key del usuario. Se vuelve a tirar UNA vez y se conserva el sorteo con
    // menos defectos. ⚠️ Es una llamada de video pagada por el hub: `FORENSE_REINTENTOS`.
    let analysis = normalizarCamara(await geminiCallStructured('forensic_report', ForensicReportSchema, parts, 3, VIDEO_SYSTEM_PROMPT))
    let defectos = defectosDelForense(analysis)
    for (let i = 0; i < FORENSE_REINTENTOS && defectos.length; i++) {
      console.warn(`[video-ads/analyze-reference] sesión ${id}: forense con defectos estructurales, se vuelve a tirar:`, defectos)
      const otro = normalizarCamara(await geminiCallStructured('forensic_report', ForensicReportSchema, parts, 3, VIDEO_SYSTEM_PROMPT))
      const otros = defectosDelForense(otro)
      if (otros.length < defectos.length) { analysis = otro; defectos = otros }
    }
    if (defectos.length) console.warn(`[video-ads/analyze-reference] sesión ${id}: se persiste con defectos:`, defectos)
    // Los defectos se calculan sobre la respuesta CRUDA para que una mano contradictoria
    // provoque el reintento. Si ambos sorteos fallan, no se persiste el absurdo: en cada
    // selfie la evidencia física inequívoca (una mano sostiene el producto y la otra la
    // cámara) corrige el rótulo, y el resumen global se deriva de los cortes corregidos.
    analysis = normalizarManosDeCamara(analysis)

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
    // Los hechos con tiempo se ordenan, se ajustan a la ventana del corte y se cubren
    // los huecos con el último estado declarado (`normalizarHechos`); `accion` se deriva.
    const { report: normalizado, rellenos } = normalizarHechos(analysis)
    if (rellenos.length) console.warn(`[video-ads/analyze-reference] sesión ${id}: el forense dejó tramos sin hecho, rellenados con el último estado:`, rellenos)
    const { report: reparado, ajustes } = repairCutTiming(normalizado, MIN_VISIBLE_SEG)
    if (ajustes.length)
      console.warn(
        `[video-ads/analyze-reference] sesión ${id}: ${ajustes.length} cortes con diálogo indecible en su duración, recronometrados:`,
        ajustes.map((a) => `corte ${a.n}: ${a.de.toFixed(1)}s → ${a.a.toFixed(1)}s`),
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
