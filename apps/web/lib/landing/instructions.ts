import type { SectionCopy, SectionType, LandingPalette, LandingTypography, DerivedBrand, CastingSpec, Offer, TrustBlock } from './types'

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
  testimonios: 'TESTIMONIALS section: short frosted review cards, each with 5 gold stars, an italic quote, a customer name with location, a small circular avatar and a green verified-check badge. Each avatar MUST be a REALISTIC PHOTOGRAPHIC headshot of a real, ordinary Latin-American person — a genuine photo, NOT an illustration, cartoon, 3D character, drawing or flat vector avatar. Every card shows a DIFFERENT, distinct person (different face, age, skin tone and hair per card), each looking believable and candid. Warm social-proof feel over the luminous atmosphere. Product may appear small as an accent.',
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
  'Emphasize a word ONLY with color or weight — NEVER wrap any word in brackets [ ], parentheses, quotes, asterisks or an underline for emphasis; render the accent word as plain text in the accent color.',
].join(' ')

function copyBlock(copy: SectionCopy): string {
  const lines: string[] = [`Headline: "${copy.headline}".`]
  // La palabra-acento se resalta con COLOR (no con corchetes ni comillas). Dirigirla evita que el
  // modelo elija otra o la envuelva en [ ] para "enfatizar".
  if (copy.accentWord) lines.push(`Emphasis: within the headline, render the words "${copy.accentWord}" in the brand ACCENT COLOR only — same font and size, NO brackets, quotes, underline or box around them.`)
  if (copy.subheadline) lines.push(`Subheadline: "${copy.subheadline}".`)
  if (copy.type === 'antes-despues') lines.push(`Label the left/before state "ANTES" and the right/after state "DESPUÉS" (those exact Spanish words, not "before/after").`)
  if (copy.bullets?.length) lines.push(`${copy.type === 'antes-despues' ? 'ANTES column — problems, each with a red ✗' : 'Bullets'}:\n${copy.bullets.map((b) => `  • ${b}`).join('\n')}`)
  if (copy.bulletsAfter?.length) lines.push(`AFTER column — results, each with a green ✓ (paired beside the BEFORE column):\n${copy.bulletsAfter.map((b) => `  • ${b}`).join('\n')}`)
  if (copy.cards?.length)
    lines.push(`Cards:\n${copy.cards.map((c) => `  - "${c.title}": "${c.body}"`).join('\n')}`)
  if (copy.cta) lines.push(`Call-to-action button label: "${copy.cta}".`)
  return lines.join('\n')
}

// Bloque BRAND — los materiales de la marca: paleta, tipografía y estilo gráfico. La paleta
// se reparte sobre los roles del ADN (un acento de marca dominante + dorado solo para valor);
// la tipografía es la de marca; el estilo gráfico guía los devices. Todo se aplica A TRAVÉS
// del design system. Reusado sin cambios funcionales del motor previo.
const BRAND_HEADER = `BRAND — the look comes from the product/brand; apply it THROUGH the design system and generate any badges, seals, icons and props in this palette (never generic stock):`

function paletteLine(palette?: LandingPalette | null): string {
  return palette?.length
    ? `Palette — build everything from these brand colors: ${palette
        .map((c) => `${c.hex}${c.name ? ` (${c.name}${c.usage ? `, ${c.usage}` : ''})` : ''}`)
        .join('; ')}. Pick ONE as the dominant brand accent (CTA fill, one key headline word, icons); use the rest for backgrounds and surfaces. Do not rainbow. A warm/gold tone is allowed ONLY for value/urgency/trust marks.`
    : `Palette — choose a cohesive palette with a single dominant brand accent that fits the product; reserve a warm/gold tone only for value/urgency/trust marks.`
}

function brandBlock(
  palette?: LandingPalette | null,
  typography?: LandingTypography | null,
  brandStyle?: string | null,
): string {
  const lines: string[] = [paletteLine(palette)]
  if (typography?.headline || typography?.body)
    lines.push(
      `Typography — use the brand type style (headline: ${typography.headline}; body: ${typography.body}); keep the headline bold/high-impact and the body clean and legible.`,
    )
  if (brandStyle && brandStyle.trim())
    lines.push(`Brand identity — match the scene, motifs and generated graphic devices to this brand: ${brandStyle.trim()}.`)
  return `${BRAND_HEADER}\n${lines.join('\n')}`
}

// Variante que consume DerivedBrand (Fase 3 C3.5): la paleta ya viene fusionada, el mood de
// escena reemplaza al brand_style suelto y el casting fija QUIÉN aparece (la misma persona en
// todas las secciones). Sin `typography` textual: en el híbrido las fuentes las pone Satori.
function castingLine(casting: CastingSpec): string {
  if (!casting.present)
    return `Talent — NO PERSON: the product stands ALONE as the hero. Do NOT add any human, model, hand, silhouette or beneficiary anywhere in the scene.`
  const bits = [
    casting.ageRange && `age ${casting.ageRange}`,
    casting.gender,
    casting.appearance,
    casting.context && `in a ${casting.context} setting`,
    casting.wardrobe,
    casting.expression && `${casting.expression} expression`,
  ].filter(Boolean).join(', ')
  return `Talent (the SAME person in every section — keep casting consistent): a realistic Latin-American person${bits ? ` — ${bits}` : ''}, natural skin, believable, never a generic stock model.`
}

export function brandBlockFromDerived(brand: DerivedBrand): string {
  const lines = [paletteLine(brand.palette), `Scene mood — ${brand.sceneMood}.`, castingLine(brand.casting)]
  return `${BRAND_HEADER}\n${lines.join('\n')}`
}

// `productMode` decide la frase del producto y qué imágenes se pasan (ver la ruta):
//   'source'   — primera sección: Image 1 es la FOTO REAL. Render fiel de TODOS sus labels
//                reales. Su render limpio se cachea como ancla para las demás secciones.
//   'anchored' — resto: Image 1 es el RECORTE del producto del ancla; Image 2+ son las fotos
//                reales = ground-truth de labels. Consistencia sin arrastrar la estructura.
//   'none'     — sin foto (no debería pasar; el wizard exige ≥1): placeholder genérico.
// Modo de producto. Fase 2: 'canonical' (placa canónica derivada de la foto real en etapa 2)
// unifica lo mejor de los dos modos viejos. 'source'/'anchored' quedan SOLO por compatibilidad
// con sesiones en curso — @deprecated, no usar en código nuevo.
export type ProductMode = 'canonical' | 'none' | 'source' | 'anchored'

// Extraídos a nivel módulo para que los reusen buildSectionInstruction (motor viejo) Y
// buildSceneInstruction (motor híbrido) — el producto y sus labels son idénticos en ambos.
function productLine(productMode: ProductMode): string {
  switch (productMode) {
    case 'canonical':
      // Fusión de source (fidelidad física + labels exactos) + anchored (recorte aislado, no
      // copiar encuadre/fondo). Image 1 = placa canónica; Images 2+ = fotos reales (ground-truth).
      return `Image 1 is an ISOLATED CROP of THIS landing's product — the product alone, cut out of its own photo; it carries NO layout, headline, cards, scene, framing or background of its own. Reproduce that exact product with total PHYSICAL fidelity: the SAME shape, proportions, colour, material and finish as in Image 1 — keep its exact colour and tint, do NOT recolour, lighten, whiten, desaturate or restyle it to match the background or palette. ALSO reproduce ALL the text and graphics actually PRINTED ON IT exactly: its main wordmark AND every secondary label, ingredient line, tagline and size/volume, spelled, styled and placed as in Image 1 — do not simplify, drop, translate or restyle any of them, keep them legible. Invent NOTHING that is not printed on it. Images 2 and later, when present, are the real product photo(s) — use them as the ground-truth for label wording and detail. Image 1 is ONLY a product reference: do NOT copy any framing, background or composition from it — this section's entire layout comes from its own section spec above. Place it in the scene per the design system above.`
    case 'source': // @deprecated (sesiones en curso)
      return `Image 1 is the REAL product — the exact object this landing sells. Reproduce it with total PHYSICAL fidelity: the SAME shape, proportions, colour, material and finish as in Image 1 — keep its exact colour and tint, do NOT recolour, lighten, whiten, desaturate or restyle the product to match the background or palette. ALSO reproduce ALL the text and graphics actually PRINTED ON IT faithfully and exactly: its main wordmark AND every secondary label, ingredient line, tagline and size/volume, spelled, styled and placed as in Image 1 — do not simplify, drop, translate or restyle any of them, and keep them legible. Invent NOTHING that is not printed on the product (no fake descriptors, sizes or ingredient names). If Image 1 is an ad or infographic, the product is the physical object only — the section copy, captions, callouts and any text or lines pointing AT the product from outside are NOT part of its label; never render those onto it. Place it in the scene per the design system above.`
    case 'anchored': // @deprecated (sesiones en curso)
      return `Image 1 is an ISOLATED CROP of THIS landing's product (the product alone, cut out of another section — it carries NO layout, headline, cards or scene of its own). Reproduce that exact product IDENTICALLY: same shape, proportions, colors, finish and every label — all printed text big and small, spelled, styled and placed exactly as in Image 1. Images 2 and later are the real product photo(s) — use them as the ground-truth for label wording and detail. Image 1 is ONLY a product reference: do NOT copy any framing, background or composition from it — this section's entire layout comes from its own section spec and the master layout above. Do NOT invent, drop, restyle or redraw the product. Place it in the scene per the design system above.`
    default:
      return `Compose around a generic attractive product placeholder.`
  }
}

function labelBlock(productMode: ProductMode, productLabels?: string | null): string {
  return productMode !== 'none' && productLabels && productLabels.trim()
    ? `\nPRODUCT LABEL TEXT (authoritative ground-truth): the exact text printed on the product is, line by line:\n${productLabels.trim()}\nRender these exact words correctly and legibly on the product, in the positions they occupy in the reference; use this as the source of truth wherever the label is small or unclear in the photo. Do not put any other words on the product.`
    : ``
}

// `productLabels` (opcional) = texto exacto de las etiquetas tipeado por el usuario; ground-
// truth autoritativo. El copy/fidelidad van end-weighted (lo más crítico). Reusado intacto.
// `brand`/`hasTalent` (Fase 4): el motor viejo también recibe el talento canónico y el override
// no-persona, para que la MISMA persona (o ninguna) salga en las 8 secciones, no solo en la
// híbrida. brand opcional → firma vieja intacta para llamadas sin marca derivada.
export function buildSectionInstruction(
  copy: SectionCopy,
  productMode: ProductMode,
  palette?: LandingPalette | null,
  typography?: LandingTypography | null,
  brandStyle?: string | null,
  productLabels?: string | null,
  brand?: DerivedBrand | null,
  hasTalent = false,
  noPersonSection = false,
): string {
  const productOnly = !!brand && !brand.casting.present
  const noPersonHere = noPersonSection && !!brand && brand.casting.present
  return [
    `Design a single vertical landing-page SECTION as one high-resolution image,`,
    `mobile-first, portrait orientation, premium e-commerce styling.`,
    SECTION_SPECS[copy.type],
    MASTER_LAYOUT,
    DESIGN_SYSTEM,
    brandBlock(palette, typography, brandStyle),
    productLine(productMode) + labelBlock(productMode, productLabels),
    talentLine(hasTalent),
    ``,
    `Copy to render (and ONLY this copy):`,
    copyBlock(copy),
    ``,
    TEXT_RULES,
    productOnly ? PRODUCT_ONLY_OVERRIDE : noPersonHere ? NO_PERSON_SCENE : '',
  ].filter(Boolean).join('\n')
}

// ─── Motor de DIFUSIÓN (goal 2026-07-18) ─────────────────────────────────────
// La IA renderiza la sección COMPLETA con su texto (headlines, precios, filas), como el motor
// original — se abandona la composición Satori del texto. Lo ÚNICO que NO dibuja la difusión son
// los logos de marca reales (medios de pago, banderas): se reservan en una banda y se compositan
// aparte (los logos por difusión salen deformados). Esta función reusa buildSectionInstruction e
// inyecta lo que F5 sacó del copy (tiers de oferta, filas de confianza del TrustBlock).

// Secciones que llevan la banda de logos de pago compuesta (el resto NO reserva banda).
export const PAYMENT_SECTIONS: Set<SectionType> = new Set(['oferta', 'garantia'])

function offerText(offer: Offer): string {
  const lines = offer.tiers.map((t) => {
    const bits = [
      `"${t.label}"`,
      t.priceBefore ? `antes ${t.priceBefore} (tachado)` : null,
      `precio ${t.price}`,
      t.perUnit ? `(${t.perUnit})` : null,
      typeof t.savingsPct === 'number' ? `ahorra ${t.savingsPct}%` : null,
      `botón "${t.cta}"`,
      t.featured ? 'DESTACADO' : null,
    ].filter(Boolean).join(', ')
    return `  - ${bits}`
  }).join('\n')
  return `PRICE TIERS — render EXACTLY these ${offer.tiers.length} price cards, one per tier, and NO others; VISUALLY ELEVATE the DESTACADO one (crown it with a gold "Recomendado"/"Mejor valor" ribbon and a gold CTA pill; the rest use the brand-accent CTA); show each struck-through "antes" price and per-unit cost where given:\n${lines}${offer.urgency ? `\n  Gold urgency banner at the top: "${offer.urgency}".` : ''}`
}

function trustText(trust: TrustBlock): string {
  const rows: string[] = []
  if (trust.coverage?.length) rows.push(`Envío a domicilio en ${trust.coverage.join(' y ')}${trust.freeShipping ? ' (envío gratis)' : ''}`)
  if (trust.deliveryTime) rows.push(`Entrega en ${trust.deliveryTime}`)
  if (trust.codDelivery) rows.push('Pago contraentrega — pagas en efectivo cuando llega')
  if (trust.guaranteeDays) rows.push(`Compra 100% segura${trust.guaranteeText ? ` — ${trust.guaranteeText}` : ` — garantía de ${trust.guaranteeDays} días`}`)
  if (!rows.length) return ''
  return `TRUST ROWS — render each of these as a frosted pill with a glossy icon (truck / clock / check / shield) + a bold title + a lighter line, using EXACTLY these facts (invent none):\n${rows.map((r) => `  - ${r}`).join('\n')}`
}

// Reserva la banda inferior para el overlay de logos reales. End-weighted para ganarle a
// cualquier mención de logos en SECTION_SPECS. La composición dibuja los logos ahí después.
const PAYMENT_BAND =
  'PAYMENT LOGOS (do NOT draw): leave the BOTTOM ~12% of the image as a CLEAN, calm horizontal band (a subtle light strip is fine) with NO payment logos, card icons, brand marks, wallet logos, country flags or the words "yape/visa/mastercard/mercado pago" anywhere — the REAL payment-brand logos are composited into that band afterwards. You MAY render a short heading like "Paga como prefieras" just ABOVE the band, but no logos.'

export function buildDiffusionInstruction(
  copy: SectionCopy,
  productMode: ProductMode,
  palette?: LandingPalette | null,
  typography?: LandingTypography | null,
  brandStyle?: string | null,
  productLabels?: string | null,
  brand?: DerivedBrand | null,
  hasTalent = false,
  noPersonSection = false,
  offer?: Offer | null,
  trust?: TrustBlock | null,
): string {
  const base = buildSectionInstruction(copy, productMode, palette, typography, brandStyle, productLabels, brand, hasTalent, noPersonSection)
  const extra: string[] = []
  if (copy.type === 'oferta' && offer) extra.push(offerText(offer))
  if (trust && (copy.type === 'garantia' || copy.type === 'cta-final' || copy.type === 'hero')) extra.push(trustText(trust))
  if (PAYMENT_SECTIONS.has(copy.type)) extra.push(PAYMENT_BAND)
  return [base, ...extra].filter(Boolean).join('\n\n')
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
    'OFFER background plate: place the product SMALL-TO-MEDIUM and CENTERED in the middle of the frame (a small cluster of a few units is fine), floating over the luminous atmosphere with clean space around it — the product must NOT fill the width, it sits compact in the centre around 32%-70% of the width and 30%-58% of the height. Put the beneficiary (a confident person fitting the audience, or the subject for pet products) ONLY in the LOWER-LEFT corner, head-and-shoulders, cropped at the frame edge, occupying roughly the bottom-left eighth, conveying the aspirational result. Keep the RIGHT side, the band just ABOVE the product, and the BOTTOM-CENTRE calm and uncluttered — price cards, a promo crown and a payment row are composited there afterwards. Energetic, high-contrast, aspirational. Depict NO price cards, tiers, ribbons, badges, plaques, CTAs, banners, urgency stickers or payment/trust strips — every one of those is composited afterwards.',
  garantia:
    'GUARANTEE / TRUST background plate: place the product in the LOWER-RIGHT area — optionally as a few units in an open shipping box with a couple of loose units nearby — floating over the luminous atmosphere. Put the beneficiary (a calm, reassured person fitting the audience) optionally in the UPPER-RIGHT corner, head-and-shoulders, cropped at the frame edge. Keep the ENTIRE LEFT COLUMN and the BOTTOM strip clean and uncluttered — a stack of trust pills, payment-method logos and a guarantee seal are composited there afterwards. Reassuring, luminous, premium. Depict NO text, pills, cards, badges, seals, icons, shields, trucks, clocks, flags or payment/logo marks — every one of those is composited afterwards.',
  'cta-final':
    'FINAL CTA background plate: the product as the confident hero, centered or slightly high in the frame, floating over the luminous atmosphere, with the beneficiary optionally to one side conveying the happy result. Keep the LOWER THIRD and the CENTRE calm and uncluttered — a headline, a price, one call-to-action button and a trust seal are composited there afterwards. Decisive, high-contrast, aspirational. Depict NO text, price numbers, buttons, CTAs, badges, ribbons or seals — every one of those is composited afterwards.',
  hero:
    'HERO background plate: the beneficiary (a confident, happy person fitting the audience) on the RIGHT half, and the real product LARGE and clear in the LOWER-CENTRE, floating over the luminous atmosphere with supporting botanical/ingredient props around its base. Include a small rounded-corner INSET on the MIDDLE-LEFT showing the "before"/problem state of the same kind of person. Keep the UPPER-LEFT (for the headline), the area beside the product (for a seal) and the BOTTOM band calm and uncluttered — headline, a "before" label, a value seal, a price plaque and a trust strip are composited there afterwards. Aspirational, high-contrast, the product as the star. Depict NO text, labels, prices, plaques, seals, badges or trust icons — every one of those is composited afterwards.',
    'antes-despues':
    'BEFORE/AFTER background plate: TWO tightly-cropped face/head portraits of the same kind of person SIDE BY SIDE HIGH in the frame (strictly between y 14% and y 40%, each fitting within its own half-width) — the LEFT one showing the "before"/problem state, the RIGHT one the improved "after" state — with a clean gap between them. The ENTIRE LOWER HALF (below y 42%) must stay EMPTY and uncluttered — do NOT place any product bottle, box, hands or props in the centre or lower half; at most a faint molecule/bokeh motif. Two comparison lists, an arrow and a tagline are composited over that lower area afterwards. Honest, evidence-like, luminous. Depict NO text, labels, arrows, checkmarks, lists or badges — every one of those is composited afterwards.',
  beneficios:
    'BENEFITS background plate: the real product in the LOWER area (optionally with botanical/ingredient props), floating over the luminous atmosphere. Keep the TOP (for the headline) and the LEFT-CENTRE column calm and uncluttered — the headline and a stack of benefit rows are composited there afterwards. Airy, trustworthy, generous negative space. Depict NO text, cards, rows, icons, discs, badges or checkmarks — every one of those is composited afterwards.',
  testimonios:
    'TESTIMONIALS background plate: JUST the luminous, dimensional atmosphere — a soft aspirational gradient with gentle glow, mist and a few sparkle particles, and optionally the product very small and subtle in a lower corner. NO people at all (the customer avatars are composited separately). Keep the whole frame calm and uncluttered so review cards can be composited on top. Depict NO text, faces, avatars, cards, stars or badges — every one of those is composited afterwards.',
  faq:
    'FAQ background plate: a calm, luminous atmosphere with low visual noise — a soft gradient, gentle glow and a few subtle molecule/bubble motifs toward the bottom, optionally the product small in a lower corner. Keep the top and centre clean and uncluttered for a heading and a vertical list of question cards composited afterwards. Depict NO text, questions, cards, lists or icons — every one of those is composited afterwards.',
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

// Override PRODUCT-ONLY (casting.present=false). End-weighted y absoluto, para GANARLE a las
// menciones de beneficiario de SCENE_SPECS/MASTER_LAYOUT (la oferta pone una persona en la
// esquina; el master layout describe beneficiarios). Compartido por AMBOS motores (escena
// híbrida y sección vieja) — sin él, "NO PERSON" y esas menciones se pelean.
const PRODUCT_ONLY_OVERRIDE =
  'PRODUCT-ONLY (absolute, OVERRIDES everything above): this product has NO human beneficiary. Do NOT render any person, model, face, hand, arm or silhouette anywhere in the image; IGNORE every earlier mention of a beneficiary, person or someone in a corner. The product ALONE is the subject.'

// La campaña SÍ tiene un talento, pero ESTA sección no lo lleva (beneficios/faq/testimonios en el
// ADN no muestran persona). Suprime la persona en la escena sin forzar "producto solo" (a
// diferencia de PRODUCT_ONLY_OVERRIDE) — respeta el plato de la sección (atmósfera y/o producto).
const NO_PERSON_SCENE =
  'NO PERSON in this section (absolute, OVERRIDES everything above): do NOT render any human, face, model, hand, arm, shoulder or silhouette anywhere in this image; IGNORE every earlier mention of a beneficiary or campaign person. Show ONLY what the section plate above describes (product and/or atmosphere) — no people at all.'

// Bloque de TALENTO canónico (Fase 4), paralelo a productLine y con el mismo rigor: la persona
// es una imagen de referencia (la ÚLTIMA del parts[]) que debe salir IDÉNTICA en todas las
// secciones. `hasTalent` lo decide el caller (hay talent_canonical_url y casting.present).
function talentLine(hasTalent: boolean): string {
  return hasTalent
    ? `The FINAL reference image is the CAMPAIGN TALENT — the exact person who appears across this ENTIRE landing (it is a PERSON reference, NOT a product photo). Reproduce this SAME person IDENTICALLY in every section: same face, age, skin tone, hair, build and features. Re-pose, re-light and re-frame them to fit THIS section's composition, but NEVER substitute, swap, restyle, beautify, slim or age them. This talent is the ONE AND ONLY human in this section, shown EXACTLY ONCE as a single solid figure: do NOT add, invent, include or duplicate ANY other person, model, face, extra beneficiary or background figure, and do NOT render a reflection, echo, double-exposure, ghosted or translucent second copy of them — every person visible in the image must BE this exact talent, appearing once. This image is ONLY a person reference: do NOT copy its neutral background, framing or pose.`
    : ``
}

// Prompt de ESCENA para una sección híbrida. Sin `typography` ni `copy`: la escena no lleva
// texto. Reusa brandBlock (paleta/estilo → atmósfera y materiales) + productLine/labelBlock.
// `brand` (Fase 3): si viene, aporta paleta fusionada + mood + casting. Fallback al camino
// viejo (palette/brandStyle sueltos) cuando es null → seguro antes de que el wizard lo siembre.
export function buildSceneInstruction(
  type: SectionType,
  productMode: ProductMode,
  palette?: LandingPalette | null,
  brandStyle?: string | null,
  productLabels?: string | null,
  brand?: DerivedBrand | null,
  hasTalent = false,
  noPersonSection = false,
): string {
  // productOnly: el producto no lleva persona en NINGUNA sección (casting.present=false).
  // noPersonHere: la campaña SÍ tiene persona, pero ESTA sección no la muestra (beneficios/faq/
  // testimonios). Lo decide el caller (NO_TALENT_SECTIONS), NO `!hasTalent` — sin la placa de
  // talento todavía, oferta/hero igual deben describir a la persona para que Gemini la genere.
  const productOnly = !!brand && !brand.casting.present
  const noPersonHere = noPersonSection && !!brand && brand.casting.present
  return [
    `Design a single vertical landing-page SECTION BACKGROUND PLATE as one high-resolution image,`,
    `mobile-first, portrait orientation, premium e-commerce styling.`,
    SCENE_SPECS[type] ?? GENERIC_SCENE,
    SCENE_CRAFT,
    brand ? brandBlockFromDerived(brand) : brandBlock(palette, null, brandStyle),
    productLine(productMode) + labelBlock(productMode, productLabels),
    talentLine(hasTalent),
    ``,
    SCENE_NEGATIVE,
    productOnly ? PRODUCT_ONLY_OVERRIDE : noPersonHere ? NO_PERSON_SCENE : '',
  ].filter(Boolean).join('\n')
}
