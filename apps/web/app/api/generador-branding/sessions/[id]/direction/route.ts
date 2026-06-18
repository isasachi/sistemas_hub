import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { callStructured, BRANDING_SYSTEM_PROMPT } from '@/lib/gemini'
import { DirectionSchema } from '@/lib/branding/types'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 2 — genera (o regenera) la dirección de marca a partir del brief.
// Llamada estructurada, rápida (~3-6s), sin imágenes → cabe en el timeout de Vercel.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getBrandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: {
    brandName?: string
    productCategory?: string
    targetAudience?: string
    personality?: string[]
    briefNotes?: string
    feedback?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const brandName = body.brandName?.trim()
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
        `Producto / categoría: ${productCategory}`,
        `Público objetivo: ${targetAudience || 'no especificado'}`,
        `Personalidad deseada: ${personality.length ? personality.join(', ') : 'no especificada'}`,
        `Notas: ${body.briefNotes?.trim() || 'ninguna'}`,
        body.feedback?.trim()
          ? `\nAjustes pedidos por el usuario sobre la propuesta anterior: ${body.feedback.trim()}`
          : '',
        ``,
        `Entrega: concepto, rationale, una paleta de 3-6 colores (hex reales con nombre y uso),`,
        `tipografía (titular + cuerpo + por qué), dirección de logo y un summaryForUser cálido en español.`,
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
    product_category: productCategory,
    target_audience: targetAudience ?? null,
    personality,
    brief_notes: body.briefNotes?.trim() ?? null,
    direction,
  })

  return NextResponse.json({ direction })
}
