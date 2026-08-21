import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { fetchAsBase64, PayloadTooLargeError } from '@/lib/storage'
import { geminiCallStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ForensicReportSchema } from '@/lib/video-ads/types'
import { buildForensicInstruction, repairCutTiming, limpiarDialogos, verificarHablantes } from '@/lib/video-ads/forensic'
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
    // El tope de MAX_VIDEO_MB hoy solo se valida en el browser (Section0Reference) —
    // UX, no seguridad: un request armado a mano se lo salta. `fetchAsBase64` revisa
    // `content-length` ANTES de bufferear el video entero (que además se infla 4/3 en
    // base64), así que un video sobredimensionado falla acá con un 413 claro en vez
    // de reventar el runtime de Node por memoria o timeout minutos después.
    const { data, mimeType } = await fetchAsBase64(parsed.data.videoUrl, MAX_VIDEO_MB * 1024 * 1024)

    const parts: Part[] = [
      { inlineData: { mimeType, data } },
      { text: buildForensicInstruction() },
    ]
    const analysis = await geminiCallStructured('forensic_report', ForensicReportSchema, parts)

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
    const { report: atribuido, descartados } = verificarHablantes(limpiarDialogos(analysis))
    if (descartados.length) {
      console.warn(`[video-ads/analyze-reference] sesión ${id}: el reparto por hablante no reproducía el diálogo en los cortes ${descartados.join(', ')} — se descartó su atribución`)
    }
    const { report: reparado, ajustes } = repairCutTiming(atribuido)
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
