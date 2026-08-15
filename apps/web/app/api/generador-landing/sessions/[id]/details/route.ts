import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 1 — persiste el brief del producto. Sin LLM, sin quota (solo escribe DB).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let body: { productName?: string; price?: string; benefits?: string; audience?: string; tone?: string[]; productLabels?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const productName = body.productName?.trim()
  if (!productName) return NextResponse.json({ error: 'Falta el nombre del producto' }, { status: 400 })

  await updateLandingSession(id, {
    step: Math.max(session.step, 1),
    product_name: productName,
    price: body.price?.trim() ?? null,
    benefits: body.benefits?.trim() ?? null,
    audience: body.audience?.trim() ?? null,
    tone: (body.tone ?? []).map((t) => t.trim()).filter(Boolean),
    product_labels: body.productLabels?.trim() || null,
  })
  return NextResponse.json({ ok: true })
}
