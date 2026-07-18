import type { SectionCopy, SectionType, LandingPalette, LandingTypography } from './types'

// Builders puros ($0) para el prompt de imagen de cada sección de la landing.
// La FUENTE DE VERDAD del diseño es el ADN destilado de 4 referencias (funnel DR real
// de CLEARSTEM): atmósfera luminosa dimensional, glassmorphism, dorado-solo-para-valor,
// iconos-con-check, render magazine. Cuatro capas con responsabilidades separadas:
//   SECTION_SPECS  — anatomía por tipo de sección (QUÉ lleva; condicionado al copy)
//   MASTER_LAYOUT  — el esqueleto compartido: roles, jerarquía y posición (QUÉ / DÓNDE)
//   DESIGN_SYSTEM  — la receta de craft FIJA (CÓMO); la escena/mood se adapta al nicho
//   BRAND          — los materiales de la marca: paleta, tipografía y estilo gráfico
// Craft fijo, color por marca: la receta no cambia; la paleta viene de la marca y el
// mood de la escena se elige según el nicho (celestial = ejemplar wellness, no mandato).

// LAYOUT por tipo de sección (qué/dónde), destilado de las referencias. Los elementos van
// condicionados ("si el copy lo trae") para no forzar el mismo layout en todo nicho.
const SECTION_SPECS: Record<SectionType, string> = {
  hero: 'HERO section: the product is the hero — a single faithful unit, large and central, floating over the luminous atmosphere. Headline in the top third with ONE accent word; the product\'s beneficiary (a person fitting the target audience, or the pet/subject for pet products) to one side conveying the aspirational RESULT, calm and confident. A small rounded-corner inset of the "before"/problem state ONLY if the copy contrasts one. First impression: aspirational, high contrast, the product as the star.',
  oferta: 'OFFER section: drive the purchase. A gold urgency banner/plaque at the very top ONLY if the copy supplies urgency. Show the product multiplied into the pack when the offer names a multi-unit tier (clustered units or an open shipping box) and EXACTLY the price tiers the copy lists — one frosted-glass card per tier in a row, each with a quantity label, an optional struck-through "Antes: S/.X" price, a big heavy price numeral, its own rounded CTA pill and an optional per-unit cost line — never adding, padding or duplicating a tier. VISUALLY ELEVATE the recommended/best-value tier: lift it forward, crown it with a GOLD ribbon header ("Recomendado" / "Mejor valor") and give it the gold CTA pill; the other tiers use the brand-accent CTA. Gold "Ahorra X%" ribbons only when the copy supplies the saving. A payment/flag/trust strip may sit at the bottom if the copy provides it. Energetic, conversion-focused.',
  'antes-despues': 'BEFORE/AFTER section: two clearly labelled paired states (problem vs result) split side by side by a clean diagonal or line, each with a person in that state and a short list of its symptoms/results as the copy provides. Keep the real product visible at the centre as the cause of the result. Honest and evidence-like, still premium.',
  beneficios: 'BENEFITS section: present the 3-5 benefits the copy lists as a clean stack of rows inside or beside a large frosted-glass panel — each row = a glossy circular gradient icon in the brand accent carrying a simple SYMBOL (with a small green check badge on its corner) + a bold benefit phrase + a lighter detail line. A small brand/product title and one accent sub-pill may head the panel if the copy supplies them. The real product prominent (bottom or side) with supporting proof props (ingredients/specs) and the beneficiary welcome. Trustworthy, airy, generous spacing.',
  testimonios: 'TESTIMONIALS section: short frosted review cards, each with 5 gold stars, an italic quote, a customer name with location, a small avatar photo and a green verified-check badge. Warm social-proof feel over the luminous atmosphere. Product may appear small as an accent.',
  faq: 'FAQ section: a heading plus a vertical list of question/answer pairs inside a calm frosted panel — each question bold in the brand accent, each answer one short lighter line. Reassuring, generous spacing, low visual noise.',
  garantia: 'GUARANTEE / TRUST section: a column of trust rows, each a frosted pill with a glossy icon (check / shield / truck / clock) + a bold title + a lighter line (shipping, delivery time, pay-on-delivery, secure purchase). Reserve a GOLD metallic finish for the value/trust marks (a "48h" clock, a "100%" shield seal). Add payment-method, retailer and shipping-carrier logos, country flags and a gold guarantee seal/medal when the copy provides them; supporting props (an open pack box, cash) welcome. Reassuring, builds confidence.',
  'cta-final': 'FINAL CTA section: the closing push — the product, a punchy headline with one accent word and ONE prominent rounded call-to-action pill in the brand accent, reinforced with a gold trust seal or an urgency cue when the copy supplies one. Decisive, high contrast, easy to act on.',
}

// MASTER LAYOUT — el esqueleto compartido (QUÉ / DÓNDE). Solo posición y jerarquía; el
// estilo lo aporta DESIGN_SYSTEM. Reglas como ROLES y RELACIONES (no coordenadas) para que
// dos nichos den landings distintas, nunca clones. Destilado de las 4 referencias DR.
const MASTER_LAYOUT = [
  `MASTER LAYOUT — the fixed skeleton every section shares; reason about the exact placement for THIS product/niche, never copy one fixed look:`,
  `• Headline: the largest, heaviest text, top third, 1-3 short lines, with a single word set in the brand accent color for emphasis. It dominates and appears ONCE — never repeated in a banner, ribbon, sticker or as a closing tagline.`,
  `• Subheadline: right under the headline, smaller and lighter, 1-2 lines, outcome-focused — one block with the headline.`,
  `• CTA: ONE prominent rounded pill in the accent color with a short label; right after the subheadline OR just below the product — never both, never floating. In a multi-tier offer each tier owns its own CTA.`,
  `• Product: the faithful hero anchor, large, centred or to one side. Show a SINGLE unit by default; multiply it into a multi-unit pack (clustered units or an open shipping box) ONLY for an explicit multi-pack OFFER whose copy names a multi-unit tier — never in a hero or any other section.`,
  `• Beneficiary: where it fits (typically to one side, upper area), the product's beneficiary showing the RESULT — a person fitting the audience, or the animal/subject for pet and similar products.`,
  `• Copy-driven items: render the benefit / trust / price / badge / stat items the copy provides (and ONLY those, never invented) as tidy frosted cards or rows; head them with a small title or accent sub-pill only if the copy supplies one; close with a bold centred tagline if the copy ends with one. If the copy has no such items, render NONE — do not add a grid or chips to fill the layout.`,
  `• Composition: text top-anchored, product centre/bottom, beneficiary to a side, generous margins, clear top→bottom reading order (headline → subheadline → CTA / items → product → tagline); keep the headline > subheadline > body size order.`,
].join('\n')

// DESIGN SYSTEM — la RECETA de craft (CÓMO se renderiza), destilada del lenguaje visual de
// las 4 referencias. La receta es FIJA y universal a este tipo de media; se EJECUTA con la
// paleta de la marca y una ESCENA/MOOD que calce el NICHO (celestial para wellness es el
// ejemplar, no un mandato). Esta es la capa que de-generaliza: sin ella el modelo rinde
// estructura correcta pero fondos planos y elementos sin vida.
const DESIGN_SYSTEM = [
  `DESIGN SYSTEM — render this as polished, high-converting direct-response e-commerce media, NOT a flat template. The CRAFT recipe below is FIXED; EXECUTE it with the brand palette and a SCENE/MOOD that fits THIS product's niche (a serene luminous mood suits wellness/beauty, a warm mood suits food, a clean bright-tech mood suits gadgets — the recipe stays, the mood adapts). Reason about the craft choices that best fit this product:`,
  `• Atmosphere: a luminous, dimensional background built from the brand palette — a soft vertical gradient (lightest toward the top), a broad radial glow behind the focal subject, faint light rays, soft mist/haze, gentle bokeh orbs and a few sparkle particles. Ethereal and aspirational. NEVER a plain flat fill.`,
  `• Depth: stage the background → beneficiary → product/cards as distinct planes, each lifted with soft contact shadows and a glow halo so nothing looks pasted-on. Clean, confident, directional lighting.`,
  `• Product finish: crisp and well-lit, with realistic reflections and a soft grounding shadow or glow halo — magazine-grade render.`,
  `• Surfaces (signature): soft frosted-glass / glassmorphism cards for every benefit row, price tier, trust row and info panel — translucent, well-rounded, a subtle inner glow, a 1px light top border, a soft drop shadow and a faint tint of the brand accent. Airy, premium, perfectly legible.`,
  `• Graphic devices: render icons, badges, ribbons, seals/medals and tags glossy and dimensional (never generic clip-art). Benefit/trust icons = a glossy circular gradient disc in the brand accent carrying a single SYMBOL (check, drop, star, %, shield, truck, clock), often with a small green check badge on its corner. Reserve a warm METALLIC GOLD finish STRICTLY for value / urgency / trust marks — the recommended price tier, an "ahorra X%" ribbon, a "recomendado"/"mejor valor" plaque, a guarantee seal, a "48h" clock, an urgency banner. Render a device ONLY where the copy supplies that item — never as default furniture. These devices are DECORATIVE — they carry NO lettering of their own; use symbols, not words.`,
  `• Type treatment: heavy, tight headline with strong weight contrast down to subhead and body, oversized heavy price numerals, high contrast and perfectly legible.`,
  `• Polish: richness comes from the PROVIDED COPY, the product scale, the luminous atmosphere and generous whitespace — NOT from padding. A section with little copy stays clean and sparse (big product, glow, beneficiary, breathing room); never fabricate benefit grids, chips, icon rows or captions to fill the canvas. Finish everything to a glossy, premium, magazine-grade quality that matches a high-end direct-response funnel.`,
].join('\n')

// Disciplina de texto (CRÍTICA): el design system mete vocabulario denso (badges, seals,
// gold, premium…) que el modelo tiende a RENDERIZAR como texto en la imagen. Estas reglas
// van end-weighted (al final, lo más prominente) y nombran los modos de fuga concretos.
const TEXT_RULES = [
  'TEXT DISCIPLINE (critical): every visible word in the image must come ONLY from the Copy block below (plus the product\'s own printed labels), spelled correctly in neutral Spanish.',
  'Badges, seals, ribbons, icons and price tags carry NO words of their own — decorate them with symbols (✓, ★, %), never with labels, unless that exact word appears in the copy.',
  'NEVER render instruction or design words (e.g. "badge", "seal", "gold", "value", "guarantee", "premium", "e-commerce", "market", "ingredients", "specification", "dimensional", "section", "palette", "typography", "glassmorphism", "mood"), field or role names ("headline", "subheadline", "bullets", "cta"), any bracketed field label or annotation wrapping a copy line, hex codes, font names, lorem ipsum, or any wording from this prompt.',
  'Render each copy string EXACTLY ONCE and render exactly as many cards / price tiers as the copy lists — never duplicate, pad or invent an extra one. The image\'s only text is the Copy-block strings plus the product\'s own printed labels. Keep every word short and highly legible.',
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

// Bloque BRAND — los materiales de la marca: paleta, tipografía y estilo gráfico. La paleta
// se reparte sobre los roles del ADN (un acento de marca dominante + dorado solo para valor);
// la tipografía es la de marca; el estilo gráfico guía los devices. Todo se aplica A TRAVÉS
// del design system. Reusado sin cambios funcionales del motor previo.
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

// `productMode` decide la frase del producto y qué imágenes se pasan (ver la ruta):
//   'source'   — primera sección: Image 1 es la FOTO REAL. Render fiel de TODOS sus labels
//                reales. Su render limpio se cachea como ancla para las demás secciones.
//   'anchored' — resto: Image 1 es el RECORTE del producto del ancla; Image 2+ son las fotos
//                reales = ground-truth de labels. Consistencia sin arrastrar la estructura.
//   'none'     — sin foto (no debería pasar; el wizard exige ≥1): placeholder genérico.
// Extraídos a nivel módulo para que los reusen buildSectionInstruction (motor viejo) Y
// buildSceneInstruction (motor híbrido) — el producto y sus labels son idénticos en ambos.
function productLine(productMode: 'source' | 'anchored' | 'none'): string {
  return productMode === 'source'
    ? `Image 1 is the REAL product — the exact object this landing sells. Reproduce it with total PHYSICAL fidelity: the SAME shape, proportions, colour, material and finish as in Image 1 — keep its exact colour and tint, do NOT recolour, lighten, whiten, desaturate or restyle the product to match the background or palette. ALSO reproduce ALL the text and graphics actually PRINTED ON IT faithfully and exactly: its main wordmark AND every secondary label, ingredient line, tagline and size/volume, spelled, styled and placed as in Image 1 — do not simplify, drop, translate or restyle any of them, and keep them legible. Invent NOTHING that is not printed on the product (no fake descriptors, sizes or ingredient names). If Image 1 is an ad or infographic, the product is the physical object only — the section copy, captions, callouts and any text or lines pointing AT the product from outside are NOT part of its label; never render those onto it. Place it in the scene per the design system above.`
    : productMode === 'anchored'
      ? `Image 1 is an ISOLATED CROP of THIS landing's product (the product alone, cut out of another section — it carries NO layout, headline, cards or scene of its own). Reproduce that exact product IDENTICALLY: same shape, proportions, colors, finish and every label — all printed text big and small, spelled, styled and placed exactly as in Image 1. Images 2 and later are the real product photo(s) — use them as the ground-truth for label wording and detail. Image 1 is ONLY a product reference: do NOT copy any framing, background or composition from it — this section's entire layout comes from its own section spec and the master layout above. Do NOT invent, drop, restyle or redraw the product. Place it in the scene per the design system above.`
      : `Compose around a generic attractive product placeholder.`
}

function labelBlock(productMode: 'source' | 'anchored' | 'none', productLabels?: string | null): string {
  return productMode !== 'none' && productLabels && productLabels.trim()
    ? `\nPRODUCT LABEL TEXT (authoritative ground-truth): the exact text printed on the product is, line by line:\n${productLabels.trim()}\nRender these exact words correctly and legibly on the product, in the positions they occupy in the reference; use this as the source of truth wherever the label is small or unclear in the photo. Do not put any other words on the product.`
    : ``
}

// `productLabels` (opcional) = texto exacto de las etiquetas tipeado por el usuario; ground-
// truth autoritativo. El copy/fidelidad van end-weighted (lo más crítico). Reusado intacto.
export function buildSectionInstruction(
  copy: SectionCopy,
  productMode: 'source' | 'anchored' | 'none',
  palette?: LandingPalette | null,
  typography?: LandingTypography | null,
  brandStyle?: string | null,
  productLabels?: string | null,
): string {
  return [
    `Design a single vertical landing-page SECTION as one high-resolution image,`,
    `mobile-first, portrait orientation, premium e-commerce styling.`,
    SECTION_SPECS[copy.type],
    MASTER_LAYOUT,
    DESIGN_SYSTEM,
    brandBlock(palette, typography, brandStyle),
    productLine(productMode) + labelBlock(productMode, productLabels),
    ``,
    `Copy to render (and ONLY this copy):`,
    copyBlock(copy),
    ``,
    TEXT_RULES,
  ].join('\n')
}

// ─── Motor HÍBRIDO (Fase 1) ──────────────────────────────────────────────────
// La escena que genera Gemini es un PLATO DE FONDO: fondo + producto + beneficiario, CERO
// texto (salvo el impreso en el propio producto). El texto/UI (tiers, ribbons, CTAs, strip de
// pagos) los compone Satori después. `buildSceneInstruction` reusa las mitades-de-escena de
// SECTION_SPECS/DESIGN_SYSTEM; las mitades-de-UI (Surfaces, Graphic devices, Type treatment,
// MASTER_LAYOUT, copyBlock, TEXT_RULES) NO van al prompt — son la capa de composición.

// Mitad-de-escena de SECTION_SPECS. Parcial: solo las secciones migradas (F1 = oferta); las no
// migradas nunca llaman acá (no están en HYBRID_SECTIONS). Fallback genérico por si acaso.
const SCENE_SPECS: Partial<Record<SectionType, string>> = {
  oferta:
    'OFFER background plate: place the product SMALL and CENTERED in the upper-middle of the frame (a small cluster of a few units is fine), floating over the luminous atmosphere with plenty of clean space around it — the product must NOT be large or fill the width, it sits compact in the centre. Put the beneficiary (a confident person fitting the audience, or the subject for pet products) in ONE LOWER corner only (lower-left OR lower-right), cropped at the frame edge, conveying the aspirational result. Keep the LEFT and RIGHT sides, the band just ABOVE the product, and the BOTTOM-CENTRE calm and uncluttered — price cards, a promo badge and a payment row are composited there afterwards. Energetic, high-contrast, aspirational. Depict NO price cards, tiers, ribbons, badges, plaques, CTAs, banners, urgency stickers or payment/trust strips — every one of those is composited afterwards.',
}
const GENERIC_SCENE =
  'SECTION background plate: the product as the hero over the luminous atmosphere, with an optional beneficiary conveying the result. Depict no UI, cards, badges, seals or text; leave clean negative space for composited copy.'

// Mitad-de-escena de DESIGN_SYSTEM (Atmosphere + Depth + Product finish + breathing room). Las
// Surfaces/Graphic devices/Type treatment quedan afuera: eso lo dibuja Satori con los devices.
const SCENE_CRAFT = [
  `SCENE CRAFT — render this as polished, high-converting direct-response e-commerce imagery, NOT a flat template. The recipe is FIXED; EXECUTE it with the brand palette and a MOOD that fits THIS product's niche (serene-luminous for wellness/beauty, warm for food, clean bright-tech for gadgets — recipe stays, mood adapts):`,
  `• Atmosphere: a luminous, dimensional background built from the brand palette — a soft vertical gradient (lightest toward the top), a broad radial glow behind the focal subject, faint light rays, soft mist/haze, gentle bokeh orbs and a few sparkle particles. Ethereal and aspirational. NEVER a plain flat fill.`,
  `• Depth: stage the background → beneficiary → product as distinct planes, each lifted with soft contact shadows and a glow halo so nothing looks pasted-on. Clean, confident, directional lighting.`,
  `• Product finish: crisp and well-lit, with realistic reflections and a soft grounding shadow or glow halo — magazine-grade render.`,
  `• Breathing room: keep the composition airy; the product sits clear of the top and lower thirds, which stay calm and uncluttered for the copy composited on top.`,
].join('\n')

// Negativa dura de texto, end-weighted (lo más prominente). La ÚNICA excepción es el texto
// impreso en el propio producto (lo maneja productLine/labelBlock).
const SCENE_NEGATIVE =
  'NO TEXT (absolute): render ZERO text, letters, numbers, words, captions, labels, badges-with-words, price tags, logos, watermarks or typography of any kind anywhere in this image — with the SINGLE exception of the text physically printed on the product itself. This is a background plate; all copy is composited afterwards. Leave the composition breathing room where copy will be placed: keep the top third and the lower third visually calm and uncluttered.'

// Prompt de ESCENA para una sección híbrida. Sin `typography` ni `copy`: la escena no lleva
// texto. Reusa brandBlock (paleta/estilo → atmósfera y materiales) + productLine/labelBlock.
export function buildSceneInstruction(
  type: SectionType,
  productMode: 'source' | 'anchored' | 'none',
  palette?: LandingPalette | null,
  brandStyle?: string | null,
  productLabels?: string | null,
): string {
  return [
    `Design a single vertical landing-page SECTION BACKGROUND PLATE as one high-resolution image,`,
    `mobile-first, portrait orientation, premium e-commerce styling.`,
    SCENE_SPECS[type] ?? GENERIC_SCENE,
    SCENE_CRAFT,
    brandBlock(palette, null, brandStyle),
    productLine(productMode) + labelBlock(productMode, productLabels),
    ``,
    SCENE_NEGATIVE,
  ].join('\n')
}
