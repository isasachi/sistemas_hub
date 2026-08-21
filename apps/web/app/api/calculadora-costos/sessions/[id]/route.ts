import { NextRequest, NextResponse } from 'next/server'
import { getCalcSession, updateCalcSession, deleteCalcSession } from '@/lib/calculadora-costos/db'
import type { StoredInputs, StoredSnapshot } from '@/lib/calculadora-costos/stored'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getCalcSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  return NextResponse.json(session)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: { inputs?: StoredInputs; snapshot?: StoredSnapshot }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  if (!body.inputs || !body.snapshot)
    return NextResponse.json({ error: 'Faltan inputs/snapshot' }, { status: 400 })
  await updateCalcSession(id, body.inputs, body.snapshot)
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await deleteCalcSession(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
  }
}
