import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { AdaptedScriptSchema, applyScriptEdits } from '@/lib/video-ads/adapt'
import { STEP } from '@/lib/video-ads/steps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Guarda el guión editado a mano por el usuario, línea por línea.
 *
 * No llama a ningún modelo, así que no pasa por `gen-quota`: es una escritura de texto.
 * Existe porque la FASE 3 del spec manda dejar los huecos que no se pueden completar
 * como marcadores y NO preguntar — corregirlos es entonces trabajo del usuario sobre el
 * texto, y hasta ahora no había dónde escribirlo (el formulario que había preguntaba
 * variable por variable, que es justo lo que el spec prohíbe, y no dejaba tocar el resto
 * de la frase cuando el modelo elegía un valor que no concordaba).
 *
 * El tope por línea es generoso pero existe: la locución viaja dentro del prompt de
 * lote, que tiene presupuesto de caracteres (`KIE_PROMPT_MAX`), y la duración de la toma
 * está fija — una línea kilométrica se paga allá, en audio cortado a mitad de frase.
 */
const EditsSchema = z.object({
  // `indice` es la POSICIÓN en `adapted.tomas`, no `toma.n`: el `n` lo hereda el forense
  // y nada garantiza que sea único (ver `applyScriptEdits`).
  locuciones: z.array(z.object({ indice: z.number().int().min(0), texto: z.string().max(600) })).max(200),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: z.infer<typeof EditsSchema>
  try {
    body = EditsSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Ediciones inválidas' }, { status: 400 })
  }

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.adapted || !session.forensic_analysis)
    return NextResponse.json({ error: 'Adapta el guión primero' }, { status: 409 })

  // Dato de DB, no de este request: un `.parse` sin try sería un ZodError sin manejar
  // (500 opaco de Next) en vez de un mensaje que dice qué hacer. Mismo criterio que en
  // `generate-lotes/route.ts`.
  let adapted
  try {
    adapted = AdaptedScriptSchema.parse(session.adapted)
  } catch (err) {
    console.error('[video-ads/script] guión adaptado corrupto', err)
    return NextResponse.json(
      { error: 'El guión guardado no es válido. Vuelve a adaptarlo desde el paso anterior.' },
      { status: 500 },
    )
  }

  const ediciones: Record<number, string> = {}
  for (const l of body.locuciones) ediciones[l.indice] = l.texto

  // La diferencia se mide siempre contra el original del análisis forense, no contra la
  // versión anterior de la adaptación: es la métrica que pide el spec ("Diferencia
  // frente al original") y encadenar ediciones no puede hacerla derivar.
  const editado = applyScriptEdits(adapted, ediciones, session.forensic_analysis.guionOriginal.length)

  await updateVideoSession(id, { step: STEP.SCRIPT, adapted: editado })
  return NextResponse.json({ adapted: editado })
}
