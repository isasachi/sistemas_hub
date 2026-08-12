import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { fetchAsBase64 } from '@/lib/storage'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { MIN_DURATION, MAX_DURATION, clampDuration } from '@/lib/video-ads/kie'
import { scriptDuration } from '@/lib/video-ads/duration'
import {
  ForensicAnalysisSchema,
  ScriptTemplateSchema,
  ScriptResultSchema,
  ProductScanSchema,
} from '@/lib/video-ads/types'
import {
  buildTemplateInstruction,
  buildFillInstruction,
  buildFromScratchInstruction,
  type ProductContext,
} from '@/lib/video-ads/prompts'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// El rango lo manda el render (Grok image-to-video: 6–30s). Una duración fuera de
// rango pasaría este paso y reventaría recién en generate-video, minutos después.
const BodySchema = z.object({
  durationSec: z.number().int().min(MIN_DURATION).max(MAX_DURATION).optional(),
})

// Acá se bifurca el pipeline. Con referencia: esqueleto (plantilla) → relleno, dos
// llamadas, y el esqueleto se guarda para mostrarlo en el wizard. Sin referencia:
// guión desde cero a partir del personaje y el producto, una sola llamada.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-script')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.product_name || !session.what_it_does || !session.target_audience)
    return NextResponse.json({ error: 'Completa el paso del producto primero' }, { status: 409 })

  let body: unknown = {}
  try { body = await req.json() } catch { /* sin body = defaults */ }
  const parsedBody = BodySchema.safeParse(body ?? {})
  if (!parsedBody.success) return NextResponse.json({ error: 'Duración inválida' }, { status: 400 })

  const product: ProductContext = {
    productName: session.product_name,
    whatItDoes: session.what_it_does,
    targetAudience: session.target_audience,
    scan: session.product_scan ? ProductScanSchema.parse(session.product_scan) : null,
  }

  try {
    if (session.mode === 'video-ref') {
      if (!session.forensic_analysis)
        return NextResponse.json({ error: 'Falta el análisis del video' }, { status: 409 })
      const forensic = ForensicAnalysisSchema.parse(session.forensic_analysis)

      const template = await callStructured('script_template', ScriptTemplateSchema, [
        { text: buildTemplateInstruction(forensic) },
      ])
      const result = await callStructured('script_result', ScriptResultSchema, [
        { text: buildFillInstruction(forensic, template, product) },
      ])

      // La duración la manda el GUIÓN, no la referencia: la referencia trae el cierre
      // de plataforma y su copy rellenado casi nunca dura lo mismo. Si las marcas de
      // tiempo no se leen, cae a la duración de la referencia. `generate-video` la
      // recalcula igual sobre el guión confirmado (que el usuario pudo editar).
      const duration = clampDuration(
        scriptDuration(result.versions.versionA) ?? forensic.durationSec,
      )
      await updateVideoSession(id, {
        // Sigue en el paso del guión (índice 3): falta elegir versión. Escribirlo como
        // 4 mandaría a la pantalla de render, sin confirmed_script, tras un reload.
        step: Math.max(session.step, 3),
        script_template: template,
        script_versions: result.versions,
        direction: result.direction,
        duration,
      })
      await recordGenQuota(id, 'video-script', userId)
      return NextResponse.json({ template, ...result, duration })
    }

    // Líneas 2 y 3: el personaje es la única referencia visual del guión.
    if (!session.character_url)
      return NextResponse.json({ error: 'Falta el personaje' }, { status: 409 })
    const duration = parsedBody.data.durationSec ?? 10
    const character = await fetchAsBase64(session.character_url)

    const parts: Part[] = [
      { inlineData: { mimeType: character.mimeType, data: character.data } },
      { text: buildFromScratchInstruction(product, duration) },
    ]
    const result = await callStructured('script_result', ScriptResultSchema, parts)

    await updateVideoSession(id, {
      step: Math.max(session.step, 3),
      script_versions: result.versions,
      direction: result.direction,
      duration,
    })
    await recordGenQuota(id, 'video-script', userId)
    return NextResponse.json({ ...result, duration })
  } catch (err) {
    console.error('[video-ads/generate-script]', err)
    return NextResponse.json({ error: 'No se pudo escribir el guión. Inténtalo de nuevo.' }, { status: 500 })
  }
}
