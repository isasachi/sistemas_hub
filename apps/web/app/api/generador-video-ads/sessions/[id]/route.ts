import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, deleteVideoSession } from '@/lib/video-ads/db'
import { readUserId } from '@/lib/product-hunter/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json(session)
}

// Lo usa el historial del dashboard (ProjectHistory hace DELETE /api/<slug>/sessions/<id>).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Un DELETE que no matchea NO es error: sin mirar el count responderíamos
    // `ok` sobre la sesión de otra cuenta, que sigue viva.
    const borrada = await deleteVideoSession(id, await readUserId())
    if (!borrada) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
  }
}
