import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { callStructured, BRANDING_SYSTEM_PROMPT } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { DirectionSchema } from '@/lib/branding/types'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Biblioteca curada de referencias de diseño (9 exemplars reales). Se lee una vez
// al cargar el módulo. El LLM elige por use_case la(s) que mejor matchean la marca
// y ancla en ellas la sugerencia (paleta/tipografía/componentes/personalidad).
const DESIGN_SYSTEM = fs.readFileSync(
  path.join(process.cwd(), 'lib/branding/design-system.md'),
  'utf-8'
).trim()

// Etapa 2 — genera (o regenera) la dirección de marca a partir del brief.
// Llamada estructurada, rápida (~3-6s), sin imágenes → cabe en el timeout de Vercel.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'branding-direction')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getBrandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: {
    brandName?: string
    productName?: string
    productCategory?: string
    targetAudience?: string
    personality?: string[]
    briefNotes?: string
    feedback?: string
    prompt?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const precision = (body.prompt ?? '').trim()
  const brandName = body.brandName?.trim()
  const productName = body.productName?.trim()
  const productCategory = body.productCategory?.trim()
  const targetAudience = body.targetAudience?.trim()
  const personality = (body.personality ?? []).map((p) => p.trim()).filter(Boolean)

  if (!brandName || !productCategory)
    return NextResponse.json({ error: 'Faltan datos del brief (marca y producto)' }, { status: 400 })

  const parts: Part[] = [
    {
      text: [
        `Define la DIRECCIÓN DE MARCA para este negocio. Devuelve JSON que cumpla el esquema Direction.`,
        ``,
        `Marca: ${brandName}`,
        `Nombre del producto: ${productName || 'no especificado'}`,
        `Producto / categoría: ${productCategory}`,
        `Público objetivo: ${targetAudience || 'no especificado'}`,
        `Personalidad deseada: ${personality.length ? personality.join(', ') : 'no especificada'}`,
        `Notas: ${body.briefNotes?.trim() || 'ninguna'}`,
        body.feedback?.trim()
          ? `\nAjustes pedidos por el usuario sobre la propuesta anterior: ${body.feedback.trim()}`
          : '',
        precision ? `Ajuste pedido: ${precision}` : '',
        ``,
        `BIBLIOTECA DE REFERENCIAS DE DISEÑO (exemplars reales de empaque). Elige la(s) 1-2`,
        `cuyo use_case mejor matchee este producto/público/personalidad y ANCLA tu propuesta`,
        `en ellas (paleta, tipografía, estilo de componentes, personalidad). NO copies su`,
        `marca ni contenido literal — transfiere el sistema visual. Si ninguna encaja bien,`,
        `diseña libre y omite designSystem.`,
        DESIGN_SYSTEM,
        ``,
        `Entrega: concepto, rationale, una paleta de 3-6 colores (hex reales con nombre y uso),`,
        `tipografía (titular + cuerpo + por qué), dirección de logo, un summaryForUser cálido`,
        `en español, y designSystem (el exemplar elegido con sus tokens logo/typography/`,
        `spacing/components/layout/personality; el token logo describe cómo construir la`,
        `marca/logo en ese estilo. Omítelo solo si ninguno encaja).`,
      ].join('\n'),
    },
  ]

  const direction = await callStructured(
    'brand_direction',
    DirectionSchema,
    parts,
    3,
    BRANDING_SYSTEM_PROMPT
  )

  await updateBrandingSession(id, {
    step: Math.max(session.step, 1),
    brand_name: brandName,
    // Solo escribir product_name si el caller lo manda. Section2 (regenerar dirección) no
    // lo incluye en el body → sin este guard, `?? null` lo borraba y la etiqueta caía al
    // brand_name. El brief inicial (Section1) sí lo manda, así que se preserva.
    ...(productName ? { product_name: productName } : {}),
    product_category: productCategory,
    target_audience: targetAudience ?? null,
    personality,
    brief_notes: body.briefNotes?.trim() ?? null,
    direction,
  })

  await recordGenQuota(id, 'branding-direction', userId)
  return NextResponse.json({ direction })
}
