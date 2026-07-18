import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { DerivedBrandSchema, type DerivedBrand, type NicheCode, type LandingPalette, type LandingSessionResponse } from './types'
import { extractLandingStyle } from './style-extract'
import { TYPE_PAIRS, TypePairId } from './typography-catalog'
import type { Part } from '@google/genai'

// Fase 3 C3.2. Resuelve la marca derivada del producto UNA vez por sesión (etapa 2→3):
// nicho, par tipográfico del catálogo, casting del talento y mood de escena en UNA llamada
// estructurada barata (gemini-flash) + la paleta fusionada en código. El resultado es
// editable por el usuario en el wizard antes de quemar una sola generación.

// Familia cromática por NICHO — la ATMÓSFERA del ADN (fondos/superficies). No sale de los
// píxeles del packaging: el frasco blanco de un suplemento no "sabe" que su código de nicho es
// azul-pureza. El accent de MARCA sí sale del packaging (style-extract); esto lo complementa.
const NICHE_PALETTE: Record<NicheCode, LandingPalette> = {
  'salud-clinico':   [{ name: 'Azul marino', hex: '#123C7A', usage: 'marca' }, { name: 'Celeste luminoso', hex: '#7FB4E0', usage: 'brillo' }, { name: 'Blanco cielo', hex: '#EAF4FC', usage: 'atmósfera' }],
  'fitness-energia': [{ name: 'Negro grafito', hex: '#14161A', usage: 'atmósfera' }, { name: 'Naranja energía', hex: '#FF6A2C', usage: 'acento cálido' }, { name: 'Lima', hex: '#C6F53B', usage: 'brillo' }],
  'belleza-premium': [{ name: 'Nude', hex: '#E7D3C2', usage: 'atmósfera' }, { name: 'Dorado suave', hex: '#C9A76B', usage: 'acento cálido' }, { name: 'Crema', hex: '#FAF3EA', usage: 'fondo' }],
  'hogar-calido':    [{ name: 'Terracota', hex: '#C56A45', usage: 'atmósfera' }, { name: 'Beige', hex: '#E4D2B8', usage: 'superficie' }, { name: 'Crema tibia', hex: '#FBF4E9', usage: 'fondo' }],
  'tech-limpio':     [{ name: 'Gris pizarra', hex: '#3A4250', usage: 'atmósfera' }, { name: 'Azul brillante', hex: '#3B82F6', usage: 'brillo' }, { name: 'Gris claro', hex: '#EEF1F6', usage: 'fondo' }],
  'bebe-pastel':     [{ name: 'Celeste pastel', hex: '#BFE3F2', usage: 'atmósfera' }, { name: 'Rosa pastel', hex: '#F6D3DC', usage: 'brillo' }, { name: 'Marfil', hex: '#FBFAF6', usage: 'fondo' }],
}

// Fusiona la paleta: el color dominante del packaging manda como accent de marca (CTA, palabra
// clave, iconos); la familia del nicho aporta la atmósfera. Dedup por hex, tope 6 (el max del
// schema). El packaging va PRIMERO → pickAccent(theme.ts) lo toma como accent salvo que uno
// traiga usage accent/cta/primary explícito.
export function mergePalette(packaging: LandingPalette, niche: LandingPalette): LandingPalette {
  const accent = { ...packaging[0], usage: packaging[0].usage ?? 'accent de marca' }
  const seen = new Set<string>()
  const out: LandingPalette = []
  for (const c of [accent, ...packaging.slice(1), ...niche]) {
    const key = c.hex.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length === 6) break
  }
  return out as LandingPalette
}

const SYSTEM = [
  'You are a brand director for Peruvian direct-response e-commerce landing pages.',
  'You are shown ONE product photo plus a text brief. Derive a coherent visual identity:',
  '(1) niche — the chromatic/emotional family the product belongs to (drives the scene atmosphere, NOT the packaging colors);',
  '(2) typePair — pick the ONE type pair id whose niche axis best fits this product, from the closed catalog given in the prompt. Never invent a font name;',
  '(3) casting — the human talent that should appear in every section. STRONGLY PREFER present=false for products whose value is shown by the OBJECT itself, not by a person using it: accessories, tools, gadgets, auto parts, phone/screen protectors, organizers, hardware, kitchenware, décor. A plausible user existing is NOT enough — only set present=true when a human is genuinely essential to sell the benefit (apparel/footwear, skincare/cosmetics, supplements, fitness/weight-loss, baby care with a caregiver, anything worn or applied to the body). When in doubt, prefer present=false. When present=true, derive ageRange/gender/appearance/context/wardrobe/expression from the audience and benefits, favoring realistic Latin-American people;',
  '(4) sceneMood — one short Spanish phrase describing the atmosphere/ambience for the image scene (e.g. "luz serena y etérea, aire de pureza clínica").',
  'Be decisive and specific to THIS product. Return JSON for the given schema (no palette field — the palette is computed separately).',
].join(' ')

// Schema de la LLAMADA (sin palette: se fusiona en código). El objeto persistido sí la lleva.
const DeriveCallSchema = DerivedBrandSchema.omit({ palette: true })

export async function deriveBrand(session: LandingSessionResponse): Promise<DerivedBrand> {
  const firstUrl = (session.product_photo_urls ?? [])[0]
  if (!firstUrl) throw new Error('deriveBrand: la sesión no tiene fotos del producto')
  const photo = await fetchAsBase64(firstUrl)

  const catalog = TypePairId.options.map((id) => `  - ${id}: ${TYPE_PAIRS[id].niche}`).join('\n')
  const parts: Part[] = [
    { inlineData: { mimeType: photo.mimeType, data: photo.data } },
    {
      text: [
        'Deriva la identidad visual para la landing de este producto.',
        '',
        `Producto: ${session.product_name ?? 'no especificado'}`,
        `Beneficios: ${session.benefits || 'no especificados'}`,
        `Público objetivo: ${session.audience || 'no especificado'}`,
        `Tono: ${(session.tone ?? []).join(', ') || 'no especificado'}`,
        '',
        'Catálogo tipográfico CERRADO — elegí exactamente uno de estos ids en typePair:',
        catalog,
      ].join('\n'),
    },
  ]
  const derived = await callStructured('landing_derived_brand', DeriveCallSchema, parts, 3, SYSTEM)

  // Paleta: si vino del handoff de branding (única fuente de session.palette antes de generar),
  // esa GANA y no se deriva (criterio de aceptación #5). Si no, packaging (style-extract) + nicho.
  let palette: LandingPalette
  if (session.palette?.length) {
    palette = session.palette
  } else {
    const style = await extractLandingStyle(photo.data, photo.mimeType)
    palette = mergePalette(style.palette, NICHE_PALETTE[derived.niche])
  }

  return { ...derived, palette }
}
