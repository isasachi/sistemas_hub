import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { readUserId } from '@/lib/product-hunter/session'
import { getTemplate, templateImageUrl } from '@/lib/anuncios/templates'
import { STEP } from '@/lib/anuncios/steps'

/**
 * Elegir una plantilla — el paso 1 del flujo de plantilla.
 *
 * ⚠️ ESTA RUTA ES LA ARQUITECTURA ENTERA DEL FLUJO NUEVO, y por eso es tan corta: escribe el
 * blueprint precomputado de la plantilla en `reference_analysis` y su imagen maestra en
 * `reference_url`, o sea deja la sesión EXACTAMENTE en el estado en que la dejaría el análisis
 * forense de una referencia del usuario. De ahí en adelante `analyze-product`, STEP5, `editImage`,
 * `refine-image` y la miniatura del dashboard corren sin enterarse de que hay dos flujos.
 *
 * Eso es §6 del spec ("el forense no debería ejecutarse en cada generación") sin pipeline nuevo:
 * el análisis de una plantilla no se cachea, se escribe a mano una vez en `templates.ts`.
 *
 * NO gasta cuota ni créditos: no llama a ningún modelo. Es una escritura.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await readUserId()

  const session = await getSession(id, userId)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let body: { templateId?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const template = getTemplate(typeof body.templateId === 'string' ? body.templateId : null)
  if (!template)
    return NextResponse.json({ error: 'Esa plantilla no existe' }, { status: 400 })

  // ⚠️ CAMBIAR DE PLANTILLA INVALIDA EL LOTE. El copy se escribió contra los huecos de la
  // plantilla anterior: dejarlo dejaría variantes con slots que la plantilla nueva no dibuja, y
  // el render las imprimiría a ciegas. Se borran las variantes que todavía NO se pagaron; si ya
  // hay imágenes generadas se rechaza el cambio en vez de tirar dinero del usuario.
  const yaPagadas = (session.variants ?? []).filter((v) => v.imageUrl)
  if (session.template_id && session.template_id !== template.id && yaPagadas.length > 0)
    return NextResponse.json(
      { error: 'Este lote ya tiene anuncios generados. Empieza una sesión nueva para cambiar de plantilla.' },
      { status: 409 }
    )

  await updateSession(id, {
    step: STEP.PRODUCTO,
    template_id: template.id,
    reference_url: templateImageUrl(template.id),
    reference_analysis: template.blueprint,
    variants: null,
  })

  return NextResponse.json({
    referenceUrl: templateImageUrl(template.id),
    analysis: template.blueprint,
    templateId: template.id,
  })
}
