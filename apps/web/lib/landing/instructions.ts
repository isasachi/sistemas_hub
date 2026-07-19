import type { SectionCopy, SectionType, LandingPalette, LandingTypography, DerivedBrand, CastingSpec, Offer, TrustBlock } from './types'

// Builders puros ($0) para el prompt de imagen de cada sección de la landing (motor de DIFUSIÓN).
// FUENTE DE VERDAD del diseño (spec 2026-07-18): sistema clínico-premium — fondo luminoso celeste
// con partículas SOLO en margen/pie, regla de DOS colores (deep + dorado; acento = 1 frase del
// titular), headline BICOLOR obligatorio, tipografía geométrica de 3 pesos, cards blancas, iconos
// 3D soft-gradient (nunca line-art), CIERRE inferior obligatorio, persona solo en hero/antes-
// después/testimonios y producto en hero/oferta/beneficios/cta. Cuatro capas separadas:
//   SECTION_SPECS  — anatomía exacta por sección (QUÉ lleva y DÓNDE)
//   MASTER_LAYOUT  — el esqueleto + reglas de composición reutilizables
//   DESIGN_SYSTEM  — la receta de craft FIJA (CÓMO); color/mood adaptan al nicho vía derive-brand
//   BRAND          — paleta/tipografía/estilo de la marca (deep/accent salen de la paleta; gold fijo)
// Estructura FIJA, color por NICHO/PRODUCTO: la receta no cambia; los hues vienen de la marca.

// LAYOUT por tipo de sección (qué/dónde), destilado de las referencias. Los elementos van
// condicionados ("si el copy lo trae") para no forzar el mismo layout en todo nicho.
// ANATOMÍA por sección — la nueva fuente de verdad (spec 2026-07-18). Composición exacta por
// panel; el color/mood adapta al nicho (deep = tono profundo de la marca, accent = acento de
// marca, gold = dorado invariante). Cada sección CIERRA anclada abajo, nunca en aire.
const SECTION_SPECS: Record<SectionType, string> = {
  hero:
    'HERO section — a diagonal Z-path: headline TOP-LEFT → beneficiary TOP-RIGHT → product CENTRE-LOW → price block → trust bar. Headline is up to 3 lines (imperative verb + the specific problem + the hidden differential), bicolor. Grey subcopy of 2 lines (mechanism "from within" + result). Beneficiary: ONE real person fitting the audience, cut out with NO background, BLEEDING off the RIGHT edge, ~35% of the width, aligned to the upper-right third, touching their face, gentle contained smile, looking at camera. A SMALL rounded "before"/problem thumbnail (~22% width) BOTTOM-LEFT with a small solid deep-tone chip labelled "ANTES". Product: the real unit CENTRE-LOW, slightly IN FRONT of the beneficiary (upper layer), with a contact shadow and floor reflection, plus a couple of product-relevant natural props at its base and translucent accent spheres to its right. A circular metallic-gold badge (double ring) reading only "MEJOR VALOR" sits on the product\'s lower-right, rotated ~-8°. Price block: a rounded deep-tone rectangle, two lines — a small pack descriptor over the featured tier\'s bold price at ~2× size, ~75% panel width, centred (use the real price from the copy, never an invented number). Trust bar: a white card split into 3 equal cells with thin dividers — truck (Envío 24/48h), cash (Pago Contraentrega), shield (Compra 100% Segura), each icon flat ~24px in its own color (blue/green/gold), 2 short lines.',
  oferta:
    'OFFER section — STRICT axial symmetry with the CENTER tier elevated: the middle card is ~15% taller and ~10% wider than the two sides, with a cream/gold fill (not white) and a 2px gold border. Top: a golden pill-shaped badge with a drop medallion on the left, carrying EXACTLY the offer\'s urgency line and nothing else (from the copy, if one is provided — otherwise omit the badge; never invent a word) flanked by short horizontal rules. Title + an uppercase kicker flanked by dash rules. Show the multi-unit product ONCE, behind/inside the center card (never per option). The 3 price cards share the IDENTICAL structure so prices are comparable: a gold savings tag showing that tier\'s saving % on EVERY card (the FEATURED center card carries the LARGEST % — it MUST be visible, never hidden by the crown), the quantity ("1 Frasco"), a struck-through "Antes: S/X", a big price (small "S/" + a giant number), a CTA pill (deep-tone on the sides, a large metallic-gold CTA reading its button label on the center), and fine print (units + accurate per-unit cost). A "Recomendado" crown ribbon tops the center card, with its "ahorra X%" tag still shown below the crown. On-screen order is 1 → 3 → 2 units (the dearest/decoy in the MIDDLE, not the right). The FEATURED tier must show the LARGEST saving % of the three. Bottom: a deep-tone payment block, "Paga como prefieras" over rows of payment logos (composited afterwards — leave the band clean). Confident, conversion-focused.',
  'antes-despues':
    'BEFORE/AFTER section — a top block of VISUAL proof + a bottom block of CONCEPTUAL proof, in perfect mirror symmetry about a central axis. Bicolor headline (second half in accent) + a mechanism subcopy. A PAIR of face photos with the SAME framing, angle and lighting, EYES CLOSED (directs the eye to the skin, avoids identification), each in a white frame with a centred deep-tone chip on top: "ANTES" / "DESPUÉS". A blue circular ARROW sits on the central axis at mid-height, overlapping BOTH frames (the seam that binds the pair). Below, a DOUBLE column of chips, 4 per side at matching row heights so they read as opposite pairs: LEFT a red circle with ✗ (problems), RIGHT a green circle with ✓ (results); the 4th pair may jump from physical to emotional. Close with a solid deep-tone strip "El cambio comienza desde adentro", with faint accent molecules to the left grazing the strip.',
  beneficios:
    'BENEFITS section — a vertical rhythm of 4 IDENTICAL cards, then the product as a closing note (no person). Each card: a circular soft-gradient icon (~44px) on the LEFT, top-aligned; an accent-colored title of up to 2 lines; a grey description of up to 2 lines; a small green check in the TOP-RIGHT (a "included" mark). Icons are niche-semantic, 3D soft-gradient lit from the upper-left (NOT line-art). Each benefit reads as symptom → mechanism (never an ingredient), with soft non-medical verbs (Apoya, Favorece, Ayuda a, Promueve, Contribuye). Closing note: a single SMALLER bottle with product-relevant natural props and a few bubbles, NO badge and NO price — it closes without selling.',
  testimonios:
    'TESTIMONIALS section — headline with the audience word in accent. 3 IDENTICAL cards: a circular avatar (~56px) on the LEFT with a white border, 5 GOLD stars top-right of the avatar, the quote in italics with proper curly quotation marks, and a grey signature "Name, City". The 3 avatars MUST be DIFFERENT, distinct real PHOTOGRAPHIC people (different face, age, skin tone, hair, background) — never the same stock-looking face. Use deliberately different Peruvian cities (implying national reach) and 3 different angles (a result, an objection handled, an emotion). Close with a people-group icon in accent + "+10,000 mujeres ya confían en la marca", the number in bold.',
  faq:
    'FAQ section — a 2-line headline (second line accent). 5 accordion-style cards: the question in deep-tone semibold on the LEFT, a thin "−" (minus, because the answer is already visible — never a "+") on the right, a horizontal divider, and the grey answer below. Order questions by real friction (time-to-results → how to take it → compatibility → shipping coverage → cash-on-delivery). Answers are 1-2 short lines and actually ANSWER (no empty deflections). This is the ONLY panel with no product and no person — just text over a calm background with decorative accent molecules along the bottom.',
  garantia:
    'GUARANTEE / TRUST section — a bicolor headline (second line accent) + a 1-line subcopy. 4 ROW cards, each with a big 3D icon on the LEFT (~40px): a truck with country flags, a green cash stack, a blue shield with a check, a gold 100% seal; a deep-tone bold title + a grey 2-line description. Then the SAME payment block component as the offer ("Paga como prefieras" + logo rows — composited afterwards, leave the band clean). Close with a FULL-BLEED deep-tone strip carrying a shield-check and "Tu compra está protegida de principio a fin". This is the heaviest panel (double close: payments + strip).',
  'cta-final':
    'FINAL CTA section — the hero MIRRORED, without a model. Headline with one accent phrase → an urgency subcopy → a golden badge carrying EXACTLY the offer\'s urgency line and nothing else (from the copy, if provided; otherwise omit it) → a staggered TRIAD of 3 IDENTICAL bottles (same label on each, copied from the reference) with a few loose capsules in front and a natural prop to the right → a small pack descriptor over a deep-tone block showing the featured tier\'s real price → a WIDE metallic-gold CTA reading its button label (the single highest-contrast element of the whole set) → a 3-cell trust pill bar → a full-bleed deep-tone strip "¡Confiable, fácil y rápido!". Decisive, high-contrast.',
}

// MASTER LAYOUT — el esqueleto compartido (QUÉ / DÓNDE). Solo posición y jerarquía; el
// estilo lo aporta DESIGN_SYSTEM. Reglas como ROLES y RELACIONES (no coordenadas) para que
// dos nichos den landings distintas, nunca clones. Destilado de las 4 referencias DR.
const MASTER_LAYOUT = [
  `MASTER LAYOUT — the fixed skeleton every section shares; reason about the exact placement for THIS product/niche, never copy one fixed look. Side margins ~6-7% of the width; vertical rhythm in multiples of 8px; nothing touches the edge except full-bleed closing strips:`,
  `• Headline: the largest, heaviest text, top area, 1-3 short lines, ALWAYS BICOLOR — the brand's deep tone plus exactly ONE phrase in the accent color (this bicolor headline is the single most recognizable tic of the set). It appears ONCE — never repeated in a banner, ribbon or tagline.`,
  `• Subheadline: right under it, smaller grey, 1-2 lines, mechanism/outcome-focused — one block with the headline.`,
  `• People vs product placement: a human appears ONLY in HERO, BEFORE/AFTER and TESTIMONIALS (3 of 8). The product appears in HERO, OFFER, BENEFITS and FINAL-CTA. Do NOT add a person to any other section, and do not multiply the product except in an explicit multi-pack OFFER or the final CTA.`,
  `• CTA: ONE prominent rounded pill with a short label; in a multi-tier offer each tier owns its own CTA. The GOLD CTA is rationed — it appears only on the offer's featured tier and the final CTA.`,
  `• Copy-driven items: render the price / benefit / trust / faq / stat items the copy provides (and ONLY those, never invented) as tidy cards or rows that SHARE ONE structure so they read as a set; if the copy has no such items, render NONE — never pad with a grid or chips.`,
  `• Reading order: kicker → headline → subheadline → content/CTA → product → BOTTOM ANCHOR. Keep headline > subheadline > body size order.`,
].join('\n')

// DESIGN SYSTEM — la RECETA de craft (CÓMO se renderiza), destilada del lenguaje visual de
// las 4 referencias. La receta es FIJA y universal a este tipo de media; se EJECUTA con la
// paleta de la marca y una ESCENA/MOOD que calce el NICHO (celestial para wellness es el
// ejemplar, no un mandato). Esta es la capa que de-generaliza: sin ella el modelo rinde
// estructura correcta pero fondos planos y elementos sin vida.
const DESIGN_SYSTEM = [
  `DESIGN SYSTEM — render this as a polished, high-converting direct-response e-commerce SECTION, CLINICAL-PREMIUM with a VIBRANT, high-gloss finish (never a flat template, never a washed-out pastel wash). The CRAFT below is FIXED; execute it with THIS brand's palette and a mood that fits the niche (clinical-luminous for health/supplements, energetic for fitness, warm for food — the recipe stays, the mood adapts):`,
  `• Background (constant): a LUMINOUS gradient built from the brand palette — SATURATED, vivid brand-color tints at the edges and corners resolving to a bright near-white core in the UPPER-CENTRE behind the product; an AGGRESSIVE multi-stop gradient with a strong radial HALO / light-bloom behind the focal product and a subtle darkened vignette at the outer corners for depth and pop. Add a niche-appropriate particle texture: glowing white bokeh + translucent, luminous 3D accent-colored spheres/bubbles chained like a molecular/serum motif, each with a bright specular highlight. These particles and the vignette live ONLY in the LOWER ~15% and the SIDE MARGINS — they NEVER invade the text area, which stays clean and high-contrast for legibility. Rich and dimensional; NEVER a plain flat fill.`,
  `• Two-color rule: exactly TWO colors lead every panel — the brand's DEEP/primary tone (headlines, price blocks, secondary buttons, closing strips) and metallic GOLD (offer badges, the main CTA, stars, seals). The brand ACCENT color is used for ONE headline phrase and card titles ONLY, at FULL vivid saturation. GREEN = benefit/verified checks; RED = problem ✗ — each functional color used sparingly, at most one role each. GOLD is RESERVED for value / urgency / CTA / stars / seals — NEVER body text, navigation or default furniture. No rainbow.`,
  `• Metallic & glow finish (RATIONED to the VALUE + PRODUCT layers ONLY): render GOLD as brushed/foil METAL with a bright diagonal specular sweep and a warm outer glow; give the main CTA pill a glossy gradient face, a soft rim-light and a colored drop-glow so it reads as the highest-energy element on the panel; wrap the product in a bright bloom/halo with crisp reflections; make badges, seals, ribbons and crowns dimensional, glossy and metallic. Keep ALL of this OFF the text — headlines, subcopy, body and card text stay clean, matte and flat for maximum legibility. The glow serves the offer and the product, NEVER the paragraph.`,
  `• Typography: ONE geometric sans family (Poppins/Montserrat style) in 3 weights — Bold (headlines + price numerals), SemiBold (card titles + buttons), Regular (body/descriptions). Per panel: an optional UPPERCASE spaced kicker (ONLY as a short echo of the headline's own words, else omit — never a design/section word) → a 2-3 line BICOLOR headline → a grey subcopy ONLY if the copy provides one → the content, in descending size.`,
  `• Cards: WHITE (or a very subtle top-light gradient sheen), ~18px radius, a 1px light border, a soft diffuse shadow with a faint accent-tinted glow, ~16px inner padding, ~10-12px apart. Comparable rows/tiers share the EXACT same structure so they read as a set.`,
  `• Depth & product: stage background → beneficiary → product/cards as distinct planes with soft contact shadows and a luminous glow halo so nothing looks pasted-on. Product crisp and magazine-grade with a grounding shadow/reflection and a bright bloom. Reproduce the product's real printed label EXACTLY and IDENTICALLY on every unit shown — never garble, drop or vary it across bottles.`,
  `• Icons: 3D SOFT-GRADIENT circular discs lit from the UPPER-LEFT with a glossy metallic sheen and a small specular highlight, each carrying ONE symbol, often with a small green check badge — NEVER flat line-art and never mixed styles. Badges, ribbons and seals are glossy, metallic and dimensional and carry NO lettering of their own (symbols only) unless the copy supplies the exact word.`,
  `• Section closer (MANDATORY): every section ends ANCHORED at the bottom — a row of trust pills, a payment block, a brand-deep strip carrying a phrase ONLY if the copy provides one, or an atmospheric particle band. A section NEVER ends in empty air, but NEVER invent closing words to fill a strip — a text-free band is the default closer.`,
  `• Polish: richness comes from the provided copy, the product, the vibrant luminous background and generous whitespace — NOT from padding. Little copy → stays clean and sparse; never fabricate grids, chips or captions to fill the canvas. Magazine-grade finish throughout.`,
].join('\n')

// Disciplina de texto (CRÍTICA): el design system mete vocabulario denso (badges, seals,
// gold, premium…) que el modelo tiende a RENDERIZAR como texto en la imagen. Estas reglas
// van end-weighted (al final, lo más prominente) y nombran los modos de fuga concretos.
const TEXT_RULES = [
  'TEXT DISCIPLINE (critical): every visible word in the image must come ONLY from the Copy block below (plus the product\'s own printed labels), spelled correctly in neutral Spanish.',
  'Badges, seals, ribbons, icons and price tags carry NO words of their own — decorate them with symbols (✓, ★, %), never with labels, unless that exact word appears in the copy.',
  'NEVER render instruction or design words (e.g. "badge", "seal", "gold", "value", "guarantee", "premium", "e-commerce", "market", "ingredients", "specification", "dimensional", "section", "palette", "typography", "glassmorphism", "mood"), field or role names ("headline", "subheadline", "bullets", "cta"), any bracketed field label or annotation wrapping a copy line, hex codes, font names, lorem ipsum, or any wording from this prompt.',
  'Render each copy string EXACTLY ONCE and render exactly as many cards / price tiers as the copy lists — never duplicate, pad or invent an extra one. The image\'s only text is the Copy-block strings plus the product\'s own printed labels. Keep every word short and highly legible.',
  'KICKER: render an uppercase kicker/eyebrow ONLY as a short echo of the headline\'s OWN words (or omit it entirely) — NEVER invent a kicker from these instructions or from the section\'s English name (never render "TESTIMONIALS", "BENEFITS", "FAQ", "HERO", "BICOLOR", "section", "mechanism", "outcome" or any design word as a kicker or heading).',
  'SUBHEADLINE: render a subheadline ONLY if one is explicitly given in the Copy block below. If no subheadline is provided, render NONE — never fabricate one from these design notes (no "Mecanismo / Resultado", no paraphrase of the instructions).',
  'CLOSING STRIP: if a section closes with a solid brand-deep strip, its words must come from the Copy block (e.g. the CTA or a closing line the copy provides). If the copy has NO closing phrase, close with a TEXT-FREE band (particles, trust pills or the payment row) — NEVER invent closing words.',
  'Emphasize a word ONLY with color or weight — NEVER wrap any word in brackets [ ], parentheses, quotes, asterisks or an underline for emphasis; render the accent word as plain text in the accent color.',
  'Spanish typography: render quotes as proper curly marks (“ ”), never straight or broken glyphs; write the affirmative "Sí" WITH its accent; and every accented Spanish letter correctly (á é í ó ú ñ ¿ ¡). Neutral Peruvian Spanish, NO voseo ("Acaba con", not "Acabá").',
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
  noProduct = false,
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
    noProduct ? NO_PRODUCT_OVERRIDE : '',
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

// Secciones que muestran un PACK de varias unidades (no un solo frasco). La ruta les pasa el pack
// pre-compuesto (buildProductPack) como Image 1 y este builder inyecta PACK_NOTE.
export const MULTI_UNIT_SECTIONS: Set<SectionType> = new Set(['oferta', 'cta-final'])

// Nota de pack: refuerza que las N unidades comparten el label IDÉNTICO de Image 1. End-weighted
// junto al resto de reglas de fidelidad. La escena re-dibuja el pack; esto acota la variación.
function packNote(units: number): string {
  return `MULTI-UNIT PACK: Image 1 is a REFERENCE PACK showing ${units} copies of the SAME single product side by side. Render exactly ${units} units of THIS product as a tight cluster/pack, and copy the IDENTICAL printed label from Image 1 onto every single unit — same wordmark, same secondary text, same colours on all ${units}; never garble, shorten or vary the label from one unit to the next.`
}

// Urgencia data-driven ($0, honesta): se renderiza como un badge dorado con la línea de urgencia
// del copy (nunca inventada). offerText ya la inyecta en oferta; esto la lleva a hero/cta-final
// para que la urgencia salga UNA vez por sección y consistente, sin el viejo "SOLO HOY" hardcodeado.
function urgencyText(offer: Offer): string {
  return `URGENCY: render a single metallic-gold urgency badge carrying EXACTLY this text and nothing else: "${offer.urgency}". Do not repeat it elsewhere or invent any other urgency line, stock count or deadline.`
}

// Precio destacado para hero/cta-final: sin él, la difusión INVENTA un precio/moneda ("$25.0",
// "manuel"). Inyecta la cifra EXACTA del tier destacado (la oferta vive en la sesión, F5).
function featuredPriceText(offer: Offer): string {
  const f = offer.tiers.find((t) => t.featured) ?? offer.tiers[0]
  const bits = [
    `the pack label "${f.label}"`,
    `the price EXACTLY "${f.price}"`,
    f.priceBefore ? `a struck-through "Antes: ${f.priceBefore}"` : null,
    f.perUnit ? `fine print "${f.perUnit}"` : null,
  ].filter(Boolean).join(', ')
  return `FEATURED PRICE — the price block shows ONLY the featured offer: ${bits}. Use these EXACT figures with the "S/" currency symbol; NEVER invent a price, a "$" amount, a decimal or a pack name.`
}

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
  return `PRICE TIERS — render EXACTLY these ${offer.tiers.length} price cards, one per tier, and NO others; VISUALLY ELEVATE the DESTACADO one (crown it with a gold "Recomendado"/"Mejor valor" ribbon and a gold CTA pill; the rest use the brand-accent CTA); show each struck-through "antes" price and per-unit cost where given:\n${lines}${offer.urgency ? `\n  Urgency badge at the top carrying EXACTLY this text and nothing else: "${offer.urgency}".` : ''}`
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

// Reserva la franja superior para el lockup de marca (compuesto por Satori, no dibujado).
const LOCKUP_BAND =
  'BRAND LOCKUP (do NOT draw): keep the very TOP ~6% center strip clean and empty — a small crisp brand wordmark lockup is composited there afterwards. Do NOT render any logo, wordmark, brand name or badge in that top strip yourself; start the headline below it.'

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
  packUnits?: number | null,
  reserveLockup = false,
  noProduct = false,
): string {
  const base = buildSectionInstruction(copy, productMode, palette, typography, brandStyle, productLabels, brand, hasTalent, noPersonSection, noProduct)
  const extra: string[] = []
  if (copy.type === 'oferta' && offer) extra.push(offerText(offer))
  // Precio + urgencia en hero/cta-final: la cifra EXACTA del tier destacado y el badge único con la
  // línea del copy (oferta ya trae ambos en offerText). Sin esto, hero/cta inventan precio y moneda.
  if (offer && (copy.type === 'hero' || copy.type === 'cta-final')) extra.push(featuredPriceText(offer))
  if (offer?.urgency && (copy.type === 'hero' || copy.type === 'cta-final')) extra.push(urgencyText(offer))
  if (trust && (copy.type === 'garantia' || copy.type === 'cta-final' || copy.type === 'hero')) extra.push(trustText(trust))
  if (packUnits && packUnits > 1) extra.push(packNote(packUnits))
  if (reserveLockup) extra.push(LOCKUP_BAND)
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

// La sección NO destaca el producto (antes/después, testimonios, faq). El producto se pasa como
// referencia de labels, pero NO debe aparecer como sujeto (tapaba el copy en testimonios).
const NO_PRODUCT_OVERRIDE =
  'NO PRODUCT FEATURE (absolute, OVERRIDES everything above): do NOT feature, place, enlarge or draw the product package/bottle anywhere in this section — it is text/people only. IGNORE any instruction to place the product in the scene; the product reference image is provided ONLY as label ground-truth, NOT as a subject to render here. The product must NOT overlap or cover any text.'

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
