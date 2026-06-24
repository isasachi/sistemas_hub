import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { TEMPLATE_BY_ID } from '@/lib/landing/templates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 3 — persiste la plantilla elegida. Sin LLM, sin quota (solo escribe DB).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { template?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.template || !TEMPLATE_BY_ID[body.template])
    return NextResponse.json({ error: 'Plantilla inválida' }, { status: 400 })

  await updateLandingSession(id, { step: Math.max(session.step, 3), template: body.template })
  return NextResponse.json({ ok: true })
}
