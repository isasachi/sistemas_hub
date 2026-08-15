import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { TrustBlockSchema } from '@/lib/landing/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Bloque de confianza (Fase 5). Hechos OPERATIVOS del negocio que el usuario carga en el paso
// "Confianza y pagos": contraentrega, plazo, cobertura, medios de pago, garantía. NO llama LLM
// (no hay costo): solo persiste lo que el usuario tipeó. garantia/cta-final los consumen.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  let body: { trust?: unknown } = {}
  try { body = await req.json() } catch { /* body opcional */ }
  const parsed = TrustBlockSchema.safeParse(body.trust)
  if (!parsed.success) return NextResponse.json({ error: 'Bloque de confianza inválido' }, { status: 400 })
  await updateLandingSession(id, { trust_block: parsed.data, step: Math.max(session.step, 4) })
  return NextResponse.json({ trustBlock: parsed.data })
}
