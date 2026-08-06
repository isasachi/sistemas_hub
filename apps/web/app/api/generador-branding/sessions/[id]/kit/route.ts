import { NextResponse } from 'next/server'
import { getBrandingSession } from '@/lib/branding/db'
import { briefFromRow } from '@/lib/branding/session-brief'
import { buildBrandboard } from '@/lib/branding/brandboard'
import { buildKit } from '@/lib/branding/kit'
import { storagePublicUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Zip + PDF sobre 3 PNG: es CPU, no red lenta, pero el margen no estorba.
export const maxDuration = 60

/** Descarga del kit (spec 6.5). Cero llamadas al modelo: solo lee, compone y comprime. */
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

  const logo = await grab((row.logo_url as string) ?? null)
  const mockup = await grab((row.mockup_url as string) ?? null)
  const label = await grab((row.label_url as string) ?? null)

  // El brandboard se subió al terminar la generación; si esa sesión es vieja o
  // aquello falló, se arma acá al vuelo (sigue sin costar una llamada al modelo).
  const common = {
    brandName: brief.brandName,
    productDescription: brief.productDescription,
    audience: brief.audience,
    style: brief.style, feel: brief.feel, logo, mockup, label,
  }
  const brandboard = (await grab(storagePublicUrl(`${id}/brandboard.pdf`))) ?? (await buildBrandboard(common))

  const { zip, filename } = await buildKit({ ...common, brandboard })

  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      // El slug ya viene sin tildes ni ñ (brandSlug), así que el header es ASCII puro.
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
