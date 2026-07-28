import { NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession, deleteBrandingSession } from '@/lib/branding/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Lectura de la sesión para reanudar el wizard (localStorage guarda el id en el
// cliente). Solo lee de Supabase — sin LLM ni Playwright.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getBrandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(session)
}

// Campos que el cliente puede escribir directo (writes baratos, sin generación):
// elegir estilo y el brief. Sin LLM ni Playwright → respeta la regla de costo.
// Un único PATCH whitelisted en vez de una ruta por campo.
const WRITABLE = new Set([
  'source_mode', 'template_id', 'palette_variant', 'style_id',
  'brand_name', 'product_name', 'product_type', 'product_category',
  'descriptor', 'tagline', 'container_type', 'step',
])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) if (WRITABLE.has(k)) patch[k] = v
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  await updateBrandingSession(id, patch as Parameters<typeof updateBrandingSession>[1])
  return NextResponse.json({ ok: true })
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
