import { NextResponse } from 'next/server'
import { getBrandingSession, deleteBrandingSession } from '@/lib/branding/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Lectura de la sesión para reanudar el wizard (localStorage guarda el id en el
// cliente). Solo lee de Supabase — sin LLM ni Playwright.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getBrandingSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  return NextResponse.json(session)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await deleteBrandingSession(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
  }
}
