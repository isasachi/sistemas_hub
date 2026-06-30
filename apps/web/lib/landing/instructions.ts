import type { SectionCopy, SectionType, LandingPalette } from './types'

// Builders puros ($0) para el prompt de imagen de cada sección de la landing.
// Clon en espíritu de branding/instructions.ts: spec por tipo + copy aprobado +
// bloque "producto fiel de Image 1" + disciplina de texto.

// Intención/layout por tipo de sección. NO incluye el copy (eso entra aprobado).
// Los elementos clave van condicionados ("si el copy lo trae") para no forzar el mismo
// layout en todo nicho — el modelo razona la composición, solo replica lo esencial.
const SECTION_SPECS: Record<SectionType, string> = {
  hero: 'HERO section: the product as the hero, large and central, headline in the top third, with the product\'s beneficiary (a person fitting the target audience, or the pet/subject for pet products) conveying the desired result. First impression — aspirational, high contrast. The product is the star.',
  oferta: 'OFFER section: drive the purchase. Show the product (multiplied into the pack when the offer is a multi-pack), a bold price treatment and price-tier cards in a row (each: quantity label, big price, its own CTA button); visually ELEVATE the recommended/best-value tier. Render the value & urgency cues the copy provides — a "solo hoy" banner, a struck-through "antes" price, a savings % badge, a "mejor valor"/"recomendado" seal. Energetic, conversion-focused.',
  'antes-despues': 'BEFORE/AFTER section: two clearly labelled paired states (problem vs result) split side by side, each with a person in that state and a short list of its symptoms/results, divided by a clean diagonal or line. Keep the real product visible at the center as the cause of the result.',
  beneficios: 'BENEFITS section: present 3-5 benefits as a clean card of rows (icon + bold phrase + lighter detail), icon callouts arranged around the centered product, OR a comparison table (this product ✓ vs common alternatives ✗) — pick what fits. The real product prominent, with supporting proof props (ingredients/specs) and the beneficiary welcome. Trustworthy, airy.',
  testimonios: 'TESTIMONIALS section: short review cards, each with 5 gold stars, an italic quote and a customer name with location, a small avatar photo and a verified check badge. Warm, social-proof feel. Product may appear small as accent.',
  faq: 'FAQ section: a heading plus a vertical list of question/answer pairs, each question bold, each answer one short line. Calm, reassuring, generous spacing.',
  garantia: 'GUARANTEE / TRUST section: a column of trust rows, each a check/shield icon + a bold title + a lighter line (shipping, delivery time, pay-on-delivery, secure purchase). Add payment, retailer or shipping-carrier logos and a guarantee seal/medal when the copy provides them. Reassuring, builds confidence.',
  'cta-final': 'FINAL CTA section: a closing push — the product, a punchy headline and ONE prominent call-to-action button, reinforced with a trust seal or urgency cue. Decisive, high contrast, easy to act on.',
}

// PLANTILLA MAESTRA — la lógica estructural destilada de las referencias: las plantillas
// hero (apps/web/public/templates/*.jpg) y 5 funnels de conversión reales de una misma
// agencia (ecommagic: clearstem, glicofuse, pet-oil, remolacha, nad, uro) que reusan UNA
// plantilla maestra en nichos y paletas opuestos — atletas (azul/rojo), mascotas
// (negro/amarillo), seniors (verde), salud íntima (rosa suave), belleza (celeste). NO es
// un estilo de nicho: son los patrones que se repiten en TODA landing de conversión sin
// importar el nicho ni la paleta. Las reglas se expresan como ROLES y RELACIONES (no
// coordenadas) para que el modelo razone la tipografía, la escena y cómo acomodar la
// paleta DENTRO de ellas — dos nichos distintos deben dar landings visiblemente
// distintas, nunca clones de una.
const MASTER_TEMPLATE = [
  `MASTER LAYOUT — always replicate this structure; reason about the exact placement and styling for THIS product and niche, never copy one fixed look:`,
  `• Headline: the largest, heaviest text element, anchored in the top third. 1-3 short lines. It dominates the composition — nothing else competes with it in size.`,
  `• Subheadline: immediately under the headline, clearly smaller and lighter, 1-2 lines, benefit-driven. Tight spacing so headline + subheadline read as one block.`,
  `• CTA: ONE solid rounded button/pill filled with the accent color and a short high-contrast label. Very prominent. Place it right after the subheadline OR just below the product — pick one, never both, never floating loose.`,
  `• Product (hero): rendered large and faithful as the visual anchor — centered or to one side — on a scene/background that fits the niche, lifted off the background with a subtle glow, pedestal or spotlight. For pack offers, multiply the same product into the pack faithfully.`,
  `• Beneficiary: where it fits, show the product's beneficiary naturally integrated and showing the emotional result — a real person fitting the target audience, or the animal/subject for pet and similar products — not a flat stock cut-out.`,
  `• Support cards: render benefit/trust/price items the copy provides as a tidy row or column of cards — a circular icon + a bold label + a lighter detail line each; clean or soft-frosted cards over the background. Never invent items the copy does not list.`,
  `• Social proof: render the proof the copy provides — a big "XX% …" stat, an authority figure's endorsement (doctor, vet, expert) or a "hecho y probado" trust seal — as a compact credible accent, never invented.`,
  `• Value & urgency: render the badges/seals/savings the copy provides ("solo hoy", "ahorra 30%", "mejor valor", a guarantee medal) as small WARM/GOLD accents — a secondary accent reserved for value, trust and urgency, kept subordinate to the brand accent.`,
  `• Closing tagline: if the section copy ends with a short punchy line, render it as a bold tagline across the bottom.`,
  `• Composition: text top-anchored, product center/bottom; generous margins (text never touches the edges); strong contrast between text and whatever is behind it (add a soft scrim or a light card only where needed for legibility). Reading order top→bottom: brand → headline → subheadline → CTA → product.`,
  `• Typography: choose a typeface that fits the product and niche, but always keep the headline bold and high-impact and the body clean and legible, and preserve the size hierarchy above.`,
].join('\n')

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
// La PLANTILLA MAESTRA fija la estructura; de la marca/producto predomina la PALETA,
// que el modelo reparte sobre los roles (un solo acento). La tipografía la razona el
// modelo dentro de la jerarquía de la plantilla maestra.
export function buildSectionInstruction(
  copy: SectionCopy,
  hasPhoto: boolean,
  palette?: LandingPalette | null,
): string {
  const paletteLine = palette?.length
    ? `COLOR PALETTE — build the section from these colors: ${palette
        .map((c) => `${c.hex}${c.name ? ` (${c.name}${c.usage ? `, ${c.usage}` : ''})` : ''}`)
        .join('; ')}. Pick ONE as the single dominant brand accent and apply it to the CTA fill, one key headline word and the icons; use the rest for backgrounds and supporting surfaces. Do not rainbow the colors. The ONLY exception is a warm/gold tone, allowed solely for value/urgency badges, savings tags and guarantee seals.`
    : `Choose a cohesive palette with a single dominant accent that fits the product, applied to the CTA and one key headline word; reserve a warm/gold tone only for value/urgency badges and seals.`
  return [
    `Design a single vertical landing-page SECTION as one high-resolution image,`,
    `mobile-first, portrait orientation, premium e-commerce style for the Peruvian market.`,
    SECTION_SPECS[copy.type],
    MASTER_TEMPLATE,
    paletteLine,
    hasPhoto
      ? `Image 1 is the REAL product. Render it faithfully — same shape, label and colors; do NOT invent a different product. You may place it in a tasteful scene/background.`
      : `Compose around a generic attractive product placeholder.`,
    ``,
    `Copy to render (and ONLY this copy):`,
    copyBlock(copy),
    ``,
    TEXT_RULES,
  ].join('\n')
}
