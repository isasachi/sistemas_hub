import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession } from '@/lib/branding/db'
import { createLandingSession, updateLandingSession } from '@/lib/landing/db'
import type { SectionType } from '@/lib/landing/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Handoff branding → landing: crea una sesión de landing pre-llenada con los datos de
// la marca (producto, fotos del mockup/logo, paleta/tipografía, tono) y la deja en el
// paso de PLANTILLA (step 2) para que el usuario elija la plantilla y continúe el
// wizard (secciones → copy → preview). Sin LLM aquí → sin costo ni cuota; el copy se
// genera más adelante en el wizard. Las URLs de mockup/logo (Storage) se escriben
// directo a product_photo_urls (la ruta de fotos solo acepta uploads binarios).

// ponytail: lookup chico; las chips de personalidad del branding mapean a las 6 de
// tono de landing. Fallback Profesional. El usuario lo edita en el wizard.
const TONE_MAP: Record<string, string> = {
  Premium: 'Lujoso', Elegante: 'Lujoso',
  Divertido: 'Divertido', Juvenil: 'Divertido',
  Cálido: 'Cercano', Natural: 'Cercano', Artesanal: 'Cercano',
  Confiable: 'Confiable',
  Moderno: 'Profesional', Minimalista: 'Profesional',
  Atrevido: 'Urgente',
}

// ponytail: la paleta ya predomina sobre la plantilla (que solo da estructura), así
// que el template es una sugerencia. Heurística simple por personalidad; el usuario
// la confirma o cambia en el paso de plantilla. Fallback neutro.
const TEMPLATE_MAP: Record<string, string> = {
  Premium: 'wellness-dark', Elegante: 'wellness-dark', Confiable: 'wellness-dark',
  Natural: 'vital-green', Artesanal: 'vital-green',
  Divertido: 'kids-adventure', Juvenil: 'kids-adventure',
  Moderno: 'sport-blue', Atrevido: 'industrial', Minimalista: 'wellness-magenta',
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

  const personality = bs.personality ?? []
  const tone = [...new Set(personality.map((p) => TONE_MAP[p] ?? 'Profesional'))]
  const template = personality.map((p) => TEMPLATE_MAP[p]).find(Boolean) ?? 'wellness-dark'
  const photo = bs.mockup_url || bs.logo_url
  const direction = bs.direction

  const id = await createLandingSession()
  await updateLandingSession(id, {
    product_name: bs.product_name ?? bs.brand_name ?? null,
    audience: bs.target_audience ?? null,
    // ponytail: el branding captura vibe, no beneficios; el copy LLM lo completa luego.
    benefits: bs.brief_notes || direction?.summaryForUser || direction?.concept || null,
    price: '',
    tone,
    product_photo_urls: photo ? [photo] : [],
    template,
    palette: direction?.palette ?? null,
    typography: direction ? { headline: direction.typography.headline, body: direction.typography.body } : null,
    selected_sections: DEFAULT_SECTIONS,
    // Para en el paso de PLANTILLA: el usuario elige la plantilla y sigue el wizard.
    step: 2,
  })

  return NextResponse.json({ id })
}
