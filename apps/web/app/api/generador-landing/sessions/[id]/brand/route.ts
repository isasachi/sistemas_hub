import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { deriveBrand } from '@/lib/landing/derive-brand'
import { DerivedBrandSchema } from '@/lib/landing/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30 // deriveBrand = 1-2 llamadas gemini-flash (nicho/casting + paleta); cabe en 30s.

// Marca derivada del producto (Fase 3). $0-rule OK: es Gemini flash (no Anthropic) y NO corre
// en el path de imagen — se resuelve una vez, antes de generar nada, en el paso de identidad.

// POST: deriva la marca si aún no existe (idempotente) y la devuelve. La llama el paso de
// identidad al montar; si ya está resuelta, devuelve la cacheada sin re-gastar tokens.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.derived_brand) return NextResponse.json({ derivedBrand: session.derived_brand })
  try {
    const brand = await deriveBrand(session)
    await updateLandingSession(id, { derived_brand: brand })
    return NextResponse.json({ derivedBrand: brand })
  } catch (err) {
    console.error('[landing-derive-brand]', err)
    return NextResponse.json({ error: 'No se pudo derivar la identidad visual', retryable: true }, { status: 502 })
  }
}

// PUT: guarda la marca editada por el usuario (checkpoint bloqueante) y avanza a secciones.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  let body: { brand?: unknown } = {}
  try { body = await req.json() } catch { /* body opcional */ }
  const parsed = DerivedBrandSchema.safeParse(body.brand)
  if (!parsed.success) return NextResponse.json({ error: 'Identidad visual inválida' }, { status: 400 })
  await updateLandingSession(id, { derived_brand: parsed.data, step: Math.max(session.step, 3) })
  return NextResponse.json({ derivedBrand: parsed.data })
}
