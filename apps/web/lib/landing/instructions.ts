import type { SectionCopy, SectionType, LandingPalette, LandingTypography } from './types'

// Builders puros ($0) para el prompt de imagen de cada sección de la landing.
// Tres capas con responsabilidades separadas para NO doble-legislar ni saturar el prompt:
//   SECTION_SPECS  — qué lleva cada tipo de sección (elementos clave, condicionados al copy)
//   MASTER_LAYOUT  — el esqueleto compartido: roles, jerarquía y posición (QUÉ / DÓNDE)
//   DESIGN_SYSTEM  — el craft visual: atmósfera, profundidad, acabado, devices (CÓMO)
//   BRAND          — los materiales: paleta, tipografía y estilo gráfico de la marca
// La marca (producto o branding en el handoff) aporta colores/tipografía/recursos; el
// design system es fijo y universal a este tipo de media → el craft no cambia, el
// contenido (colores, escena, tipo, motivos) sí. Sin la capa de craft las secciones
// salían planas/genéricas.

// LAYOUT por tipo de sección (qué/dónde). Los elementos clave van condicionados ("si el
// copy lo trae") para no forzar el mismo layout en todo nicho — el modelo razona la
// composición y solo replica lo esencial.
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

// MASTER LAYOUT — el esqueleto compartido (QUÉ / DÓNDE). Solo posición y jerarquía; el
// estilo lo aporta DESIGN_SYSTEM. Reglas como ROLES y RELACIONES (no coordenadas) para
// que dos nichos den landings distintas, nunca clones. Destilado de las 7 plantillas hero
// + 5 funnels DR reales (clearstem, glicofuse, pet-oil, remolacha, nad, uro) que reusan
// una sola estructura en nichos y paletas opuestos.
const MASTER_LAYOUT = [
  `MASTER LAYOUT — the fixed skeleton every section shares; reason about the exact placement for THIS product/niche, never copy one fixed look:`,
  `• Headline: the largest, heaviest text, top third, 1-3 short lines, with one key word in the brand accent. It dominates.`,
  `• Subheadline: right under the headline, smaller and lighter, 1-2 lines, benefit-driven — one block with the headline.`,
  `• CTA: ONE prominent rounded button/pill in the accent color with a short label; right after the subheadline OR just below the product — never both, never floating.`,
  `• Product: the faithful hero anchor, large, centered or to one side; multiplied into the pack for pack offers.`,
  `• Beneficiary: where it fits, the product's beneficiary showing the result — a person fitting the audience, or the animal/subject for pet and similar products.`,
  `• Copy-driven items: render the benefit / trust / price / badge / stat items the copy provides (and ONLY those, never invented) as tidy cards or rows; close with a bold tagline if the copy ends with one. If the copy has no such items, render NONE — do not add a benefit grid, feature chips or captioned icons to fill the layout.`,
  `• Composition: text top-anchored, product center/bottom, generous margins, clear top→bottom reading order (brand → headline → subheadline → CTA → product); keep the headline > subheadline > body size order.`,
].join('\n')

// DESIGN SYSTEM — el CRAFT visual (CÓMO se renderiza), destilado del lenguaje de los
// funnels DR reales. Es FIJO y universal a este tipo de media; se EJECUTA con la paleta,
// tipografía y nicho de la marca. Esta es la capa que de-generaliza: sin ella el modelo
// rinde estructura correcta pero fondos planos y elementos pegados/sin vida.
const DESIGN_SYSTEM = [
  `DESIGN SYSTEM — render this as polished, high-converting direct-response e-commerce media, NOT a flat template. The CRAFT below is FIXED; EXECUTE it with the brand palette, typography and niche (the craft stays, the colors/scene/type vary). Reason about the craft choices that best fit this product:`,
  `• Atmosphere: a luminous, dimensional background built from the brand palette — soft gradient, a radial glow behind the focal point, faint light rays, soft bokeh/mist and a few sparkle particles. NEVER a plain flat fill.`,
  `• Depth: stage background → beneficiary → product/cards as distinct planes, each lifted with soft contact shadows and glow so nothing looks pasted-on. Clean, confident, directional lighting.`,
  `• Product finish: crisp and well-lit, with realistic reflections and a soft grounding shadow or glow halo — magazine-grade render.`,
  `• Surfaces: soft frosted-glass / glassmorphism cards — translucent, well-rounded, a subtle inner glow, a 1px light border and a soft drop shadow. Airy, premium, legible.`,
  `• Graphic devices: render badges, ribbons, seals/medals, savings tags and benefit/trust icons glossy and dimensional in the brand palette (never generic clip-art) — benefit icons as a colored gradient circle with a simple SYMBOL (check, drop, star, %), and value/urgency/trust marks with a warm metallic finish. Render a device ONLY where the copy supplies that item (a benefit, a price, a trust point) — never as default furniture to fill space. These devices are DECORATIVE — they carry NO lettering of their own; use symbols, not words (do not write "gold", "badge", "seal", "value" on them). Struck-through "antes" prices only when the copy supplies them.`,
  `• Type treatment: heavy, tight headline with strong weight contrast down to subhead and body, oversized heavy price numbers, high contrast and perfectly legible.`,
  `• Polish: richness comes from the PROVIDED COPY, the product scale, the atmosphere and generous whitespace — NOT from padding. A section with little copy stays clean and sparse (big product, glow, beneficiary, breathing room); never fabricate benefit grids, feature chips, icon rows or captions to fill the canvas. Finish everything to a glossy, premium, magazine-grade quality.`,
].join('\n')

// Disciplina de texto (CRÍTICA): el design system mete vocabulario denso (badges, seals,
// gold, premium…) que el modelo tiende a RENDERIZAR como texto en la imagen. Estas reglas
// van end-weighted (al final, lo más prominente) y nombran los modos de fuga concretos.
const TEXT_RULES = [
  'TEXT DISCIPLINE (critical): every visible word in the image must come ONLY from the Copy block below, spelled correctly in neutral Spanish.',
  'Badges, seals, ribbons, icons and price tags carry NO words of their own — decorate them with symbols (✓, ★, %), never with labels, unless that exact word appears in the copy.',
  'NEVER render instruction or design words (e.g. "badge", "seal", "gold", "value", "guarantee", "premium", "e-commerce", "market", "ingredients", "specification", "dimensional", "section", "palette", "typography"), field names ("headline", "bullets", "cta"), hex codes, font names, lorem ipsum, or any wording from this prompt.',
  'Do not duplicate, pad or invent text the copy does not contain. Keep every word short and highly legible.',
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

// Bloque BRAND — los materiales de la marca (producto o branding en el handoff): paleta,
// tipografía y estilo gráfico. La paleta se reparte sobre los roles (un acento de marca +
// dorado solo para valor); la tipografía es la de marca; el estilo gráfico guía los
// devices que el modelo genera. Todo se aplica A TRAVÉS del design system.
function brandBlock(
  palette?: LandingPalette | null,
  typography?: LandingTypography | null,
  brandStyle?: string | null,
): string {
  const lines: string[] = [
    palette?.length
      ? `Palette — build everything from these brand colors: ${palette
          .map((c) => `${c.hex}${c.name ? ` (${c.name}${c.usage ? `, ${c.usage}` : ''})` : ''}`)
          .join('; ')}. Pick ONE as the dominant brand accent (CTA fill, one key headline word, icons); use the rest for backgrounds and surfaces. Do not rainbow. A warm/gold tone is allowed ONLY for value/urgency/trust marks.`
      : `Palette — choose a cohesive palette with a single dominant brand accent that fits the product; reserve a warm/gold tone only for value/urgency/trust marks.`,
  ]
  if (typography?.headline || typography?.body)
    lines.push(
      `Typography — use the brand type style (headline: ${typography.headline}; body: ${typography.body}); keep the headline bold/high-impact and the body clean and legible.`,
    )
  if (brandStyle && brandStyle.trim())
    lines.push(`Brand identity — match the scene, motifs and generated graphic devices to this brand: ${brandStyle.trim()}.`)
  return `BRAND — the look comes from the product/brand; apply it THROUGH the design system and generate any badges, seals, icons and props in this palette (never generic stock):\n${lines.join('\n')}`
}

// `hasPhoto` decide la frase del producto: con foto de input se renderiza fiel; sin foto
// (no debería pasar — el wizard exige ≥1) se describe genérico. La marca aporta paleta,
// tipografía y estilo gráfico; el design system aporta el craft; el master layout, la
// estructura. El copy/fidelidad van end-weighted (lo más crítico, al final).
export function buildSectionInstruction(
  copy: SectionCopy,
  hasPhoto: boolean,
  palette?: LandingPalette | null,
  typography?: LandingTypography | null,
  brandStyle?: string | null,
): string {
  return [
    `Design a single vertical landing-page SECTION as one high-resolution image,`,
    `mobile-first, portrait orientation, premium e-commerce styling.`,
    SECTION_SPECS[copy.type],
    MASTER_LAYOUT,
    DESIGN_SYSTEM,
    brandBlock(palette, typography, brandStyle),
    hasPhoto
      ? `Image 1 is the REAL product — the exact object this landing sells. Render it faithfully and IDENTICALLY in every section: same shape, proportions, colors and finish. Its label is ONLY what is printed on the product itself in Image 1 (its wordmark / brand name) — reproduce that and NOTHING else: never add, invent or guess other packaging text (product descriptors, taglines, sizes or volumes, ingredient names), and never render the section copy or benefit text onto the product. If Image 1 is an ad or infographic, the product is the physical object only — captions, callouts and any text or lines pointing at it are NOT part of its label; do not copy them onto it. Do NOT redraw it as a different product. Place it in the scene per the design system above.`
      : `Compose around a generic attractive product placeholder.`,
    ``,
    `Copy to render (and ONLY this copy):`,
    copyBlock(copy),
    ``,
    TEXT_RULES,
  ].join('\n')
}
