import { NextResponse } from 'next/server'
import { getLandingSession, deleteLandingSession } from '@/lib/landing/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Lectura de la sesión para reanudar el wizard. Solo lee de Supabase.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(session)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await deleteLandingSession(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
  }
}
