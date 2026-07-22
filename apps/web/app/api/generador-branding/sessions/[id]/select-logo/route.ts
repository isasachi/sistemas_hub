import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 3 — el usuario elige uno de los logos generados.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getBrandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { logoUrl?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const logoUrl = body.logoUrl?.trim()
  if (!logoUrl || !(session.logo_options ?? []).includes(logoUrl))
    return NextResponse.json({ error: 'Logo inválido' }, { status: 400 })

  await updateBrandingSession(id, { logo_url: logoUrl, step: Math.max(session.step, 4) })
  return NextResponse.json({ logoUrl })
}
