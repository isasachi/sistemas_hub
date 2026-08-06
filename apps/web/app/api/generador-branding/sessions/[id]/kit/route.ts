import { NextResponse } from 'next/server'
import { getBrandingSession } from '@/lib/branding/db'
import { briefFromRow } from '@/lib/branding/session-brief'
import { buildKit } from '@/lib/branding/kit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Baja 4 PNG, deriva 2 variantes con sharp y comprime.
export const maxDuration = 60

/** Descarga del kit. Cero llamadas al modelo: solo lee, empaqueta y comprime. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await getBrandingSession(id)
  if (!row) return NextResponse.json({ error: 'Esa sesión no existe' }, { status: 404 })

  const brief = briefFromRow(row as unknown as Record<string, unknown>)
  if (!brief) return NextResponse.json({ error: 'La sesión no tiene un brief válido' }, { status: 400 })

  const grab = async (url: string | null): Promise<Buffer | null> => {
    if (!url) return null
    const res = await fetch(url)
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null
  }

  const { zip, filename } = await buildKit({
    brandName: brief.brandName,
    tagline: brief.tagline,
    productDescription: brief.productDescription,
    audience: brief.audience,
    feel: brief.feel,
    style: brief.style,
    // Columnas legadas reusadas para no pedir migración: `mockup_url` guarda la
    // identidad y `container_url` la foto de producto (ver COLUMN en generar/).
    identidad: await grab((row.mockup_url as string) ?? null),
    logo: await grab((row.logo_url as string) ?? null),
    etiqueta: await grab((row.label_url as string) ?? null),
    mockup: await grab((row.container_url as string) ?? null),
  })

  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      // El slug ya viene sin tildes ni ñ (brandSlug), así que el header es ASCII puro.
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
