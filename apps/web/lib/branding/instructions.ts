import type { Direction } from './types'

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

// Etapa 3 — logo. Texto→imagen, sin imágenes de entrada. `variant` desvía cada
// opción de la tanda para que las 3-4 salgan distintas entre sí.
export function buildLogoInstruction(
  d: Direction,
  brandName: string,
  variant: string
): string {
  return [
    `Design a professional, production-ready LOGO for a small business.`,
    brandBlock(d, brandName),
    `Logo direction: ${d.logoDirection}.`,
    `Variant focus for this option: ${variant}.`,
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

// Etapa 4 — etiqueta. Recibe el logo elegido como imagen de entrada (Image 1).
export function buildLabelInstruction(
  d: Direction,
  brandName: string,
  labelBrief: string
): string {
  return [
    `Image 1 is the approved brand logo. Use it as-is (do not redraw the mark).`,
    `Design a flat, print-ready PRODUCT LABEL artwork for "${brandName}".`,
    brandBlock(d, brandName),
    `Product / label brief: ${labelBrief}.`,
    ``,
    `Requirements:`,
    `- Place the provided logo prominently and integrate the palette and typography.`,
    `- This is the flat label design (front face), shown straight-on, not on a container yet.`,
    `- Include realistic label elements: product name, a short tagline, and small placeholder net-weight/info text consistent with the category.`,
    `- Cohesive, retail-quality, premium finish. Correct spelling.`,
  ].join('\n')
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
    `- The label must look physically printed on the container, not pasted flat.`,
    `- Single hero product, centered, e-commerce ready. No extra text overlays.`,
  ].join('\n')
}
