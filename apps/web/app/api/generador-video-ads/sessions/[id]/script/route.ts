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
 * ⚠️ El tope por línea NO puede dimensionarse pensando en una toma "normal". Un video de
 * referencia SIN CORTES —una sola toma continua de cámara, que en UGC de cabeza parlante
 * es de lo más común— produce UN corte, UNA toma y por tanto UNA línea con el guión
 * entero. Caso real: 33 s de toma continua dieron 706 caracteres en una sola locución, el
 * tope estaba en 600, y el usuario no pudo guardar ediciones que ya había escrito. Peor:
 * el error salía como "Ediciones inválidas" a secas, porque el `catch` del parse colapsa
 * todas las causas en un mismo string y hay que leer los logs del servidor para saber qué
 * pasó.
 *
 * `MAX_LINEA` se dimensiona contra ese caso: el guión completo de una referencia larga.
 * A ~20 caracteres por segundo (el techo de habla de `CPS_MAX`), un minuto entero de
 * locución son ~1200 caracteres; 2500 deja holgura de sobra sin volverse ilimitado. El
 * presupuesto de KIE no lo administra este tope sino `buildLotePrompt`, que degrada por
 * niveles, y una toma de más de 15 s la parte `splitLongToma` antes de llegar allá.
 */
const MAX_LINEA = 2500
const MAX_LINEAS = 200

const EditsSchema = z.object({
  // `indice` es la POSICIÓN en `adapted.tomas`, no `toma.n`: el `n` lo hereda el forense
  // y nada garantiza que sea único (ver `applyScriptEdits`).
  locuciones: z.array(z.object({ indice: z.number().int().min(0), texto: z.string() })),
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
    return NextResponse.json({ error: 'No se entendió el formato de las ediciones.' }, { status: 400 })
  }

  // Los topes se comprueban acá y no en el schema para poder decir CUÁL línea y POR
  // CUÁNTO se pasa: un `.max()` de zod colapsa cualquier motivo en un mismo mensaje, y
  // eso fue exactamente lo que dejó al usuario sin saber por qué no podía guardar.
  if (body.locuciones.length > MAX_LINEAS)
    return NextResponse.json(
      { error: `El guión tiene ${body.locuciones.length} líneas y el máximo es ${MAX_LINEAS}.` },
      { status: 400 },
    )
  const larga = body.locuciones.find((l) => l.texto.length > MAX_LINEA)
  if (larga)
    return NextResponse.json(
      {
        error: `La línea de la toma ${larga.indice + 1} tiene ${larga.texto.length} caracteres y el máximo es ${MAX_LINEA}. `
          + `Recórtala en ${larga.texto.length - MAX_LINEA} caracteres.`,
      },
      { status: 400 },
    )

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
