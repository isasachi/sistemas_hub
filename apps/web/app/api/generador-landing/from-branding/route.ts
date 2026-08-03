import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession } from '@/lib/branding/db'
import { getPreset, isPresetId, type PresetId } from '@/lib/branding/presets'
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
// La identidad sale del PRESET (refactor 2026-08): antes se resolvía un ADN por
// plantilla o por imagen subida; ahora `style_id` es uno de los 7 presets y su paleta
// y sus tipografías ya vienen decididas.

// ponytail: lookup chico — cada preset cae en uno de los 6 tonos de landing. El
// usuario lo edita en el wizard. Vive acá y no en el registro de presets porque es
// vocabulario de landing, no de branding.
const TONE_BY_PRESET: Record<PresetId, string> = {
  clinical_premium: 'Profesional',
  luxury_minimal: 'Lujoso',
  botanical_apothecary: 'Cercano',
  soft_modern: 'Cercano',
  warm_editorial: 'Cercano',
  performance_dark: 'Urgente',
  heritage_craft: 'Confiable',
}

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

  // Una sesión legada (o con un style_id que ya no existe) pasa sin identidad
  // derivada, igual que antes: la landing se crea y el usuario la completa.
  const styleId = String(bs.style_id ?? '')
  const preset = isPresetId(styleId) ? getPreset(styleId) : null
  const photo = bs.mockup_url || bs.logo_url

  const id = await createLandingSession((await readUserId()) ?? undefined)
  await updateLandingSession(id, {
    product_name: bs.brand_name ?? null,
    audience: bs.target_audience || null,
    benefits: bs.product_type || null,
    price: '',
    tone: preset ? [TONE_BY_PRESET[preset.id]] : [],
    product_photo_urls: photo ? [photo] : [],
    palette: preset
      ? Object.entries(preset.palette).map(([role, hex]) => ({ name: PALETTE_NAMES[role] ?? role, hex, usage: role }))
      : null,
    typography: preset ? { headline: preset.typography.display, body: preset.typography.body } : null,
    brand_style: preset ? `${preset.signature} ${preset.promptStyle}` : null,
    selected_sections: DEFAULT_SECTIONS,
    // Para en el paso de IDENTIDAD visual (step 2, F3): el usuario revisa la marca
    // derivada (su paleta de branding gana) y sigue el wizard.
    step: 2,
  })

  return NextResponse.json({ id })
}
