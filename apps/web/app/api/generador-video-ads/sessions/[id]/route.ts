import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession, deleteVideoSession } from '@/lib/video-ads/db'
import { VideoModeSchema } from '@/lib/video-ads/types'

const PatchSchema = z.object({ mode: VideoModeSchema })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json(session)
}

// Paso 0 del wizard: elegir la línea. No llama a ningún modelo, solo persiste el modo
// para que la sesión sea reanudable con la rama correcta.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'mode inválido' }, { status: 400 })

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await updateVideoSession(id, { mode: parsed.data.mode, step: Math.max(session.step, 1) })
  return NextResponse.json({ ok: true })
}

// Lo usa el historial del dashboard (ProjectHistory hace DELETE /api/<slug>/sessions/<id>).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await deleteVideoSession(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
  }
}
