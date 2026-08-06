import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession } from '@/lib/branding/db'
import { paletteFromRow, typographyFromRow } from '@/lib/branding/session-brief'
import { createLandingSession, updateLandingSession } from '@/lib/landing/db'
import { readUserId } from '@/lib/product-hunter/session'
import type { SectionType } from '@/lib/landing/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Handoff branding → landing: crea una sesión de landing pre-llenada con los datos de
// la marca (producto, fotos del mockup/logo, paleta/tipografía, tono) y la deja en el
// paso de SECCIONES (step 2) para que el usuario continúe el wizard (secciones → copy
// → preview). Sin LLM aquí → sin costo ni cuota. Las URLs de mockup/logo (Storage) se
// escriben directo a product_photo_urls (la ruta de fotos solo acepta uploads binarios).
//
// La identidad sale del ESTILO que el usuario compuso en el editor de branding
// (refactor 2026-08-05): paleta y tipografías salen de las columnas de la sesión, no
// de una lista de presets. `tone` queda vacío a propósito — la actitud de branding no
// mapea 1:1 con los 6 tonos de landing y el usuario lo elige en ese wizard.

const PALETTE_NAMES: Record<string, string> = {
  primary: 'Primario', secondary: 'Secundario', accent: 'Acento', dark: 'Oscuro', light: 'Claro',
}

const DEFAULT_SECTIONS: SectionType[] = ['hero', 'beneficios', 'oferta', 'testimonios', 'garantia', 'cta-final']

export async function POST(req: NextRequest) {
  let body: { brandingSessionId?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.brandingSessionId)
    return NextResponse.json({ error: 'Falta brandingSessionId' }, { status: 400 })

  const bs = await getBrandingSession(body.brandingSessionId)
  if (!bs) return NextResponse.json({ error: 'Sesión de branding no encontrada' }, { status: 404 })

  // Una sesión legada (anterior al editor, sin paleta guardada) pasa sin identidad
  // derivada, igual que antes: la landing se crea y el usuario la completa.
  const row = bs as unknown as Record<string, unknown>
  const palette = paletteFromRow(row)
  const typography = typographyFromRow(row)
  const photo = bs.mockup_url || bs.logo_url

  const id = await createLandingSession((await readUserId()) ?? undefined)
  await updateLandingSession(id, {
    product_name: bs.brand_name ?? null,
    audience: bs.target_audience || null,
    benefits: bs.product_type || null,
    price: '',
    tone: [],
    product_photo_urls: photo ? [photo] : [],
    palette: palette
      ? Object.entries(palette).map(([role, hex]) => ({ name: PALETTE_NAMES[role] ?? role, hex, usage: role }))
      : null,
    typography: typography ? { headline: typography.display, body: typography.body } : null,
    // La actitud que se eligió en branding, tal cual: es la dirección de arte.
    brand_style: (bs.descriptor as string) || null,
    selected_sections: DEFAULT_SECTIONS,
    // Para en el paso de IDENTIDAD visual (step 2, F3): el usuario revisa la marca
    // derivada (su paleta de branding gana) y sigue el wizard.
    step: 2,
  })

  return NextResponse.json({ id })
}
