import type { Direction, LabelData } from './types'

// Constructores puros (sin LLM, $0) que arman las instrucciones de generación de
// imagen a partir de la dirección de marca aprobada. Mantienen un prompt rico y
// consistente entre logo / etiqueta / mockup sin gastar una llamada de reasoning.

function paletteLine(d: Direction): string {
  return d.palette.map((c) => `${c.hex} (${c.name} — ${c.usage})`).join('; ')
}

function brandBlock(d: Direction, brandName: string): string {
  return [
    `Brand name: "${brandName}".`,
    `Brand concept: ${d.concept}.`,
    `Color palette (use these exact hex values): ${paletteLine(d)}.`,
    `Typography: headings in "${d.typography.headline}", body in "${d.typography.body}".`,
  ].join('\n')
}

// Bloque de referencia: patrones estructurales extraídos por `analyzeReference`.
// Es TEXTO, no la imagen cruda — el modelo de imagen copia literalmente cualquier
// referencia que se le pase, así que solo transferimos estructura, nunca contenido.
function referenceBlock(analysis: string | null | undefined): string {
  if (!analysis?.trim()) return ''
  return [
    ``,
    `Reference design patterns to emulate — STRUCTURE ONLY. Do NOT adopt the product type,`,
    `subject, flavor, ingredients, materials, text or colors of any reference; use ONLY the`,
    `brand palette and product defined above. Borrow only these abstract patterns:`,
    analysis.trim(),
  ].join('\n')
}

// Bloque de referencia DEL LOGO: aquí la imagen cruda SÍ entra como Image 1 (style
// reference). Decisión del usuario: "la referencia manda el vibe" — emula estética,
// color y mood; la paleta de marca queda subordinada. Se ignora explícitamente el
// fondo/foto/escena para no importar el cielo/manos de una referencia que es una
// foto de producto (el viejo bug "ref de chocolate → producto de chocolate").
function logoStyleRefBlock(): string {
  return [
    ``,
    `Image 1 is a STYLE reference. Emulate its overall aesthetic — color treatment and`,
    `mood, typographic personality, shape & mark language, and energy.`,
    `DISREGARD its background, photography, hands, packaging, product, scene, and any`,
    `literal text/subject — design a clean LOGO for OUR brand, not a copy of the reference.`,
    `Lead with the reference's color mood; the brand palette above is secondary, used only`,
    `where it doesn't fight the reference's energy. The brand NAME must be rendered`,
    `correctly, legibly and prominently.`,
  ].join('\n')
}

// Etapa 3 — logo. `variant` desvía cada opción de la tanda para que las 3-4 salgan
// distintas; `hasReferenceImage` indica que el caller pasó la imagen de referencia
// como Image 1 (entonces se emite el bloque de estilo en vez de texto abstracto).
export function buildLogoInstruction(
  d: Direction,
  brandName: string,
  variant: string,
  hasReferenceImage?: boolean
): string {
  return [
    `Design a professional, production-ready LOGO for a small business.`,
    brandBlock(d, brandName),
    `Logo direction: ${d.logoDirection}.`,
    `Variant focus for this option: ${variant}.`,
    hasReferenceImage ? logoStyleRefBlock() : '',
    ``,
    `Requirements:`,
    `- Clean vector-style mark, centered, on a solid flat neutral background (off-white #F5F2EC).`,
    `- Legible, correctly spelled brand name. No lorem ipsum, no random extra text.`,
    `- Simple, memorable, scalable; works small. Modern, not clip-art.`,
    `- Square composition with generous padding around the mark.`,
  ].join('\n')
}

export const LOGO_VARIANTS: string[] = [
  'wordmark — typographic logo with a subtle custom detail',
  'icon + wordmark lockup — a simple symbol above the name',
  'monogram / emblem — initials inside a contained shape',
  'minimal lettermark — bold geometric, lots of whitespace',
]

// Etapa 4 — etiqueta. Image 1 = logo elegido (única imagen de entrada). La
// referencia de etiqueta entra como TEXTO (`referenceAnalysis`), no como imagen:
// el modelo copiaba literalmente la imagen de referencia (ref de chocolate →
// producto de chocolate); ahora solo transferimos patrones estructurales.
export function buildLabelInstruction(
  d: Direction,
  brandName: string,
  productName: string,
  data: LabelData,
  referenceAnalysis?: string | null
): string {
  const ld = (label: string, v: string) => (v.trim() ? `- ${label}: ${v.trim()}` : '')
  return [
    `Image 1 is the approved brand logo. Use it as-is (do not redraw the mark).`,
    `Design a flat, print-ready PRODUCT LABEL artwork. Brand "${brandName}", product "${productName}".`,
    brandBlock(d, brandName),
    `Packaging format the label must fit: ${data.packagingFormat.trim() || 'standard retail packaging'}.`,
    referenceBlock(referenceAnalysis),
    ``,
    `Label content (render this real text, correctly spelled — do NOT invent placeholders):`,
    `- Product name: ${productName}`,
    ld('Highlight / variety / tagline', data.highlight),
    ld('Net weight / volume', data.netWeight),
    ld('Units / quantity', data.units),
    ld('Ingredients / composition (small print)', data.ingredients),
    ``,
    `Requirements:`,
    `- Place the provided logo prominently and integrate the palette and typography.`,
    `- This is the flat label design (front face), shown straight-on, not on a container yet.`,
    `- Proportions and layout suited to the packaging format above.`,
    `- Cohesive, retail-quality, premium finish.`,
  ].filter(Boolean).join('\n')
}

// Etapa 5 — mockup. Image 1 = etiqueta. Image 2 (opcional) = envase subido.
export function buildMockupInstruction(
  d: Direction,
  brandName: string,
  opts: { mode: 'describe' | 'upload'; containerDesc: string | null }
): string {
  const head =
    opts.mode === 'upload'
      ? [
          `Image 1 is the flat product label artwork. Image 2 is the real container the client will use.`,
          `Apply the label from Image 1 onto the container in Image 2, wrapped realistically (curvature, lighting, perspective, shadows).`,
        ]
      : [
          `Image 1 is the flat product label artwork.`,
          `Render a realistic product container described as: ${opts.containerDesc ?? 'a container appropriate for the product'}.`,
          `Apply the label onto that container, wrapped realistically (curvature, lighting, perspective).`,
        ]

  return [
    ...head,
    `Produce a clean, photorealistic PRODUCT MOCKUP of the finished product for "${brandName}".`,
    `Brand concept: ${d.concept}.`,
    ``,
    `Requirements:`,
    `- Studio product shot: soft realistic lighting, subtle reflections and shadow, neutral or palette-tinted background.`,
    `- Keep the container's true geometry and proportions — do NOT distort, warp, stretch or deform the package shape. Only the label wraps to follow the surface.`,
    `- The label must look physically printed on the container, not pasted flat.`,
    `- Single hero product, centered, e-commerce ready. No extra text overlays.`,
  ].join('\n')
}
