import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { uploadToStorage } from '@/lib/storage'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ReferenceAnalysisSchema } from '@/lib/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'anuncios-reference')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Los datos del formulario no son válidos' }, { status: 400 })
  }

  const file = formData.get('reference') as File | null
  if (!file) return NextResponse.json({ error: 'Falta la imagen de referencia' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'La imagen pesa más de 10 MB' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'image/jpeg'
  const base64 = bytes.toString('base64')
  const precision = ((formData.get('prompt') as string | null) ?? '').trim()

  const [referenceUrl, analysis] = await Promise.all([
    uploadToStorage(id, bytes, mimeType, 'reference'),
    // preferGemini: gpt-4o-mini leyó una referencia 335x597 (vertical) como "16:9" y devolvió
    // style/typography de una línea ("moderno", "estilo moderno y limpio") — el análisis es la
    // base de TODO lo que sigue, así que ahí es donde más cuesta el modelo chico.
    callStructured('reference_analysis', ReferenceAnalysisSchema, [
      { inlineData: { mimeType, data: base64 } },
      { text: [
        'Analyze this reference ad. Return the complete structured analysis including all sceneElements.',
        // Sin exigir el MECANISMO, este campo sale como una etiqueta de una palabra e inservible
        // — es lo que ya pasó con `style` ("moderno") y `typography` ("estilo moderno y limpio").
        // ⚠️ La tipografía es lo que el anuncio nuevo tiene que CONSERVAR (WHAT STAYS de STEP5):
        // solo puede cambiarle el color. Pero el instructivo se arma con texto puro, así que lo
        // único que sabe de ella es este campo — y sin exigir el detalle sale como una etiqueta
        // inservible ("estilo moderno y limpio", medido). Mismo tratamiento que `creativeConcept`.
        'typography: describe the type so it can be REPRODUCED, block by block: typeface character',
        '(geometric sans, grotesque, high-contrast serif, condensed, script…), weight, case,',
        'letter-spacing, alignment, the size hierarchy between blocks, and any effect on the letters',
        '(outline, drop shadow, highlight box, angled or curved baseline, italics, underline).',
        'A one-word label like "modern" or "clean" is useless here — name what is actually on screen.',
        'creativeConcept: name the creative concept the ad IS and describe how it is built.',
        'Common concepts: before/after, testimonial, product demonstration, side-by-side comparison',
        'against an alternative, problem→solution, benefit list, offer/price, social-media screenshot,',
        'unboxing, expert endorsement. If none fits, name the one you actually see.',
        'If it is a BEFORE/AFTER, this is mandatory: state which half is which, where each sits, what',
        'label each carries, and what each side claims — the "before" half states the problem and the',
        '"after" half states the result, and they are NOT interchangeable.',
        'One or two sentences. Never a bare one-word label.',
        // El campo existe para poder RE-APUNTAR esos marcadores a la zona del producto nuevo,
        // así que hay que nombrarlos uno por uno: "hay flechas" no dice cuál mover ni adónde.
        'bodyFocus + attentionMarkers: if the ad directs the viewer\'s attention to a specific body',
        'zone — arrows or lines pointing at it, a circle or highlight over it, a before/after pair',
        'contrasting it, a close-up of it — set bodyFocus to that zone and list every such marker',
        'in attentionMarkers with what it is and where it sits. If the ad points at no body zone,',
        'bodyFocus is null and attentionMarkers is null. Never guess a zone.',
        precision ? 'Ajuste pedido: ' + precision : '',
      ].filter(Boolean).join('\n') },
    ], 3, undefined, { preferGemini: true }),
  ])

  await updateSession(id, { step: 1, reference_url: referenceUrl, reference_analysis: analysis })
  await recordGenQuota(id, 'anuncios-reference', userId)
  return NextResponse.json({ analysis, referenceUrl })
}
