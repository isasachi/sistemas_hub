import type { SectionCopy, SectionType, LandingPalette } from './types'

// Builders puros ($0) para el prompt de imagen de cada sección de la landing.
// Clon en espíritu de branding/instructions.ts: spec por tipo + copy aprobado +
// bloque "producto fiel de Image 1" + disciplina de texto.

// Intención/layout por tipo de sección. NO incluye el copy (eso entra aprobado).
const SECTION_SPECS: Record<SectionType, string> = {
  hero: 'HERO section: the product as the hero, large and centered, with the headline above or beside it. First impression — premium, aspirational, high contrast. The product is the star.',
  oferta: 'OFFER section: highlight the price/promo with urgency. A bold price badge or pill, the product alongside, a clear call-to-action button. Energetic, conversion-focused.',
  'antes-despues': 'BEFORE/AFTER section: a split or side-by-side comparison conveying transformation/results. Label the two states clearly. Keep the real product visible.',
  beneficios: 'BENEFITS section: the product with 3-5 short benefit bullets, each paired with a simple icon. Clean grid or vertical list, lots of whitespace, trustworthy.',
  testimonios: 'TESTIMONIALS section: short review cards, each with 5 gold stars, a quote and a customer name. Warm, social-proof feel. Product may appear small as accent.',
  faq: 'FAQ section: a heading plus a vertical list of question/answer pairs, each question bold, each answer one short line. Calm, reassuring, generous spacing.',
  garantia: 'GUARANTEE section: a trust seal/badge (e.g. a shield or medal motif) with a short guarantee statement. Reassuring, premium, builds confidence.',
  'cta-final': 'FINAL CTA section: a closing push — the product, a punchy headline and a prominent call-to-action button. Decisive, high contrast, easy to act on.',
}

// Disciplina de texto: el modelo de imagen rinde texto poco confiable. Imprimir SOLO
// el copy real, corto y bien escrito; nunca etiquetas de campo ni metadatos del prompt.
const TEXT_RULES = [
  'Render ONLY the exact copy listed below, correctly spelled in Spanish.',
  'NEVER print field names ("headline", "bullets", "cta"), the words "section"/"typography"/"palette",',
  'hex codes, font names, lorem ipsum, or any placeholder/instruction text.',
  'Keep all text short and highly legible; do not add extra sentences the copy does not contain.',
].join(' ')

function copyBlock(copy: SectionCopy): string {
  const lines: string[] = [`Headline: "${copy.headline}".`]
  if (copy.subheadline) lines.push(`Subheadline: "${copy.subheadline}".`)
  if (copy.bullets?.length) lines.push(`Bullets:\n${copy.bullets.map((b) => `  • ${b}`).join('\n')}`)
  if (copy.cards?.length)
    lines.push(`Cards:\n${copy.cards.map((c) => `  - "${c.title}": "${c.body}"`).join('\n')}`)
  if (copy.cta) lines.push(`Call-to-action button label: "${copy.cta}".`)
  return lines.join('\n')
}

// `hasPhoto` decide la frase del producto: con foto de input se renderiza fiel; sin
// foto (no debería pasar — el wizard exige ≥1) se describe genérico.
// `templateStyle`: la plantilla aporta ESTRUCTURA/layout/motivos Y TIPOGRAFÍA (no los
// colores). De la marca SOLO predomina la PALETA — pisa los colores de la plantilla.
export function buildSectionInstruction(
  copy: SectionCopy,
  hasPhoto: boolean,
  templateStyle?: string,
  palette?: LandingPalette | null,
): string {
  const paletteLine = palette?.length
    ? `COLOR PALETTE (predominant — use these as the dominant colors throughout this section, overriding any colors implied by the template): ${palette
        .map((c) => `${c.hex}${c.name ? ` (${c.name}${c.usage ? `, ${c.usage}` : ''})` : ''}`)
        .join('; ')}.`
    : ''
  return [
    `Design a single vertical landing-page SECTION as one high-resolution image,`,
    `mobile-first, portrait orientation, premium e-commerce style for the Peruvian market.`,
    SECTION_SPECS[copy.type],
    templateStyle
      ? `STRUCTURE, LAYOUT & TYPOGRAPHY (follow the composition, motifs, mood and font styling of the template — but NOT its specific colors): ${templateStyle}`
      : '',
    paletteLine,
    hasPhoto
      ? `Image 1 is the REAL product. Render it faithfully — same shape, label and colors; do NOT invent a different product. You may place it in a tasteful scene/background.`
      : `Compose around a generic attractive product placeholder.`,
    templateStyle || paletteLine ? '' : `Clean modern layout, generous spacing, warm trustworthy palette, legible sans-serif typography.`,
    ``,
    `Copy to render (and ONLY this copy):`,
    copyBlock(copy),
    ``,
    TEXT_RULES,
  ].join('\n')
}
