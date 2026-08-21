import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, deleteVideoSession } from '@/lib/video-ads/db'
import { readUserId } from '@/lib/product-hunter/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  return NextResponse.json(session)
}

// Lo usa el historial del dashboard (ProjectHistory hace DELETE /api/<slug>/sessions/<id>).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const borrado = await deleteVideoSession(id, await readUserId())
    if (!borrado)
      return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
  }
}
