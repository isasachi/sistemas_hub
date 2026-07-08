import { NextRequest, NextResponse } from 'next/server'
import { getCalcSession, updateCalcSession, type CalcSnapshot } from '@/lib/calculadora-costos/db'
import type { CalcInputs } from '@/lib/calculadora-costos/model'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getCalcSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json(session)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: { inputs?: CalcInputs; snapshot?: CalcSnapshot }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.inputs || !body.snapshot)
    return NextResponse.json({ error: 'Faltan inputs/snapshot' }, { status: 400 })
  await updateCalcSession(id, body.inputs, body.snapshot)
  return NextResponse.json({ ok: true })
}
