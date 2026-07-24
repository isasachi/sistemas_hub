import type { SectionCopy, SectionType, LandingDna, PaletteTokens, Offer, TrustBlock, NicheId } from './types'
import { SECTION_SPEC_KEY } from './types'
import { NICHE_LABELS } from './niches'

// Builders puros ($0) para el prompt de imagen de cada sección de la landing (motor de DIFUSIÓN).
// FUENTE DE VERDAD: docs/superpowers/specs/2026-07-23-generador-landing-spec.md §1-§5 + Anexos.
// El ADN (`LandingDna`, extraído UNA vez por sesión en el step previo 0.b) reemplaza a la marca
// derivada/paleta suelta del motor viejo: paleta por fórmula, partículas, props, tipografía,
// halo, persona y poses ya vienen resueltos y se inyectan literales, sin recalcularlos acá.
// Capas ensambladas en orden (spec): BRAND → DESIGN_SYSTEM → CONTENIDO DE CARRILES →
// SECTION_SPECS → Copy → TEXT_RULES → referencias adjuntas (nota de plantilla).
// Motor plantilla-como-scaffold (2026-07-23 cont.): la composición (zonas Z1-Z6, anatomía de
// cards, carriles) ya NO se describe en texto — la lleva la última imagen adjunta (plantilla
// curada por sección). El prompt solo inyecta lo que la plantilla no puede saber: talento/
// sustituto, props del nicho y partículas on/off (ver `masterLayoutBlock`/`templateNote`).
//
// Filosofía (spec 2026-07-23): las secciones llevan talento (o su sustituto) Y producto Y props.
// EXCEPCIÓN (ajuste 2026-07-23 post-smoke; ampliada motor-plantilla): `faq`, `testimonios`,
// `garantia` y `cta-final` NUNCA llevan al talento/protagonista de la campaña
// (`NO_TALENT_SECTIONS`) — las plantillas curadas de esas 4 secciones no reservan carril de
// persona; faq/garantia/cta-final no llevan persona alguna, testimonios solo muestra clientes
// distintos en sus tarjetas, no al protagonista.

// Secciones que NUNCA muestran al talento/protagonista de la campaña (contrato fijado por la
// plantilla adjunta, no por el nicho). No es el `no_talent` del nicho (sin gente): acá el nicho
// puede tener talento, pero ESTAS secciones no lo usan. `testimonios` sí muestra clientes (caras
// distintas) en sus cards; `faq`/`garantia`/`cta-final` no llevan persona alguna.
export const NO_TALENT_SECTIONS: Set<SectionType> = new Set(['faq', 'testimonios', 'garantia', 'cta-final'])

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
  if (copy.kicker) lines.push(`Kicker (subtítulo dorado con guiones laterales "— TEXTO —"): "${copy.kicker}".`)
  if (copy.closingBold) lines.push(`Closing card — frase bold: "${copy.closingBold}"${copy.closingSub ? `; subcopy: "${copy.closingSub}"` : ''}.`)
  if (copy.closingStrip) lines.push(`Franja de cierre inferior (mayúsculas, reemplaza la barra de confianza): "${copy.closingStrip}".`)
  if (copy.socialProof) lines.push(`Banda de prueba social (con escudo): "${copy.socialProof}".`)
  if (copy.ctaHeadline) lines.push(`Bloque CTA — titular en mayúsculas: "${copy.ctaHeadline}"${copy.ctaSub ? `; subcopy: "${copy.ctaSub}"` : ''}.`)
  return lines.join('\n')
}

// ─── Capa 2 — BRAND (spec §1) ────────────────────────────────────────────────
// El envase = Imagen 1 (canónico), SIEMPRE el mismo objeto — nunca se reinventa forma, tapa,
// proporción ni material. Los labels son EXCLUSIVAMENTE `productLabels` (ground-truth tipeado
// por el usuario) en la jerarquía del spec; sin ellos, se leen de las fotos reales (Imagen 2+).
function brandBlock(productLabels: string | null): string {
  const lines: string[] = [
    'BRAND — el envase renderizado es SIEMPRE el mismo objeto de la Imagen 1 (envase canónico): misma forma, proporciones, tapa, material y color exacto. Nunca se reinventa forma, tapa, proporción ni material.',
  ]
  if (productLabels && productLabels.trim()) {
    lines.push(
      `El texto de la etiqueta es EXCLUSIVAMENTE este (ground-truth), en esta jerarquía de mayor a menor peso visual:\n${productLabels.trim()}\nOrden: 1) marca (mayor peso, negro) 2) sub-marca 3) descriptor 4) línea de ingredientes (dentro de una caja con borde fino) 5) cantidad/unidades. Prohibido inventar, traducir, abreviar o completar ingredientes: si un ingrediente no está en esta lista, no existe. La etiqueta debe ser IDÉNTICA entre secciones — es el criterio de fallo #1.`,
    )
  } else {
    lines.push(
      'Sin texto de etiqueta provisto como dato: lee el texto EXACTO impreso en las fotos reales del producto (Imagen 2 en adelante) y repítelo tal cual, sin inventar, traducir, abreviar ni completar nada.',
    )
  }
  return lines.join('\n')
}

// ─── Capa 3 — DESIGN_SYSTEM (spec §2) ────────────────────────────────────────
// Paleta aplicada POR ROL (nunca "elige un color bonito"): cada token del ADN tiene un uso fijo.
// El oro (#B8860B→#F5D372) y el precio tachado (#D93025) son invariantes, no salen de `dna`.
// NOTA (motor plantilla-como-scaffold, desviación deliberada del brief): la línea de partículas
// que vivía acá se retiró — `masterLayoutBlock` es ahora el ÚNICO emisor de la instrucción de
// partículas (on/off vía `dna.particles_on`). Dejarla acá duplicada contradecía el caso OFF: el
// prompt decía "Siempre presentes" (esta capa) Y "SIN partículas" (masterLayoutBlock) a la vez.
function designSystemBlock(dna: LandingDna): string {
  const p: PaletteTokens = dna.palette
  return [
    'DESIGN_SYSTEM —',
    `Fondo: degradado vertical/diagonal suave de ${p.bg_start} (superior) a ${p.bg_end} (inferior). Nunca fondo plano, nunca blanco puro.`,
    `Halo: ${dna.halo}, detrás del talento (o de su sustituto).${dna.halo === 'none' ? ' La separación figura-fondo se resuelve solo con el degradado y la profundidad.' : ''} Constante en todo el funnel.`,
    'Base (invariante): superficie reflectante en el borde inferior donde el envase proyecta reflejo vertical difuso.',
    'Profundidad (invariante): tres planos — fondo atmosférico, talento, producto + props en primer plano. Ligera profundidad de campo en el fondo.',
    `Paleta aplicada por ROL: titular base en ${p.color_headline}; palabra destacada del titular en ${p.color_accent}; cuerpo de texto en ${p.color_body}; superficie de card en ${p.color_surface} al 75-85% de opacidad; iconos en ${p.color_icon.join(', ')} (uno por atributo).`,
    'Oferta/premium/sellos: degradado dorado #B8860B→#F5D372, y ÚNICAMENTE ahí — oferta, sellos de garantía, cinta "RECOMENDADO" y la etiqueta "DESPUÉS". En ningún otro lugar. Precio ancla tachado en #D93025. Regla de significado (invariante): el color de marca comunica confianza; el oro comunica dinero y urgencia.',
    `Tipografía: una sola familia, ${dna.font_family}. Toda la expresividad viene de peso + color + tamaño, jamás de una segunda fuente.${dna.font_accent ? ` ${dna.font_accent} se usa SOLO en el titular de hero/oferta, nunca en cuerpo ni cards.` : ''}`,
    'Titular (invariante): 3-4 líneas, alineado a la izquierda, ragged right; conviven líneas neutras en el color de titular semibold y 1-2 palabras clave en el color de acento extrabold, a mayor tamaño. Subtítulo: 1 línea, ~40% del tamaño del titular, con una palabra en el color de acento.',
    'Card title (invariante): bold en el color de titular. Card body: regular en el color de cuerpo, máximo 2 líneas. Microcopy: uppercase bold + descriptor regular debajo, a menor tamaño.',
    'Componentes (estructura invariante, solo cambia color): card con radio 28-32px, relleno translúcido, borde blanco 1px, sombra difusa teñida del acento, leve glow — glassmorphism siempre, card sólida nunca. Icono: círculo 3D glossy con degradado del color asignado, símbolo blanco en relieve, sombra interior, diámetro constante dentro de una misma sección. Pill: "ANTES" en gris oscuro, "DESPUÉS" en dorado. Chevron: doble »» en el color de acento dentro de un círculo blanco entre las dos cards de comparación. Cinta de oferta: banda dorada con corona, superpuesta al borde superior de la card central. Sello: medalla circular dorada con texto curvo. CTA: botón redondeado — acento sólido en opciones laterales, dorado en la recomendada.',
  ].join('\n')
}

// ─── Capa 4 — CONTENIDO DE CARRILES (spec §3, motor plantilla-como-scaffold) ─
// La composición (zonas, carriles, anatomía de cards) la lleva la PLANTILLA adjunta (ver
// `templateNote`): este bloque ya NO la describe. Solo cubre lo que la plantilla NO puede saber:
// quién ocupa el carril de talento (persona/sustituto/ninguno), qué props del nicho lleva el
// producto (excluyendo los de otro nicho aunque la plantilla los muestre) y si van partículas.
function masterLayoutBlock(
  dna: LandingDna,
  section: SectionType,
  hasTalent: boolean,
  talentSubstitute: string | undefined,
): string {
  const pose = dna.poses[section] ?? ''
  const talentText = NO_TALENT_SECTIONS.has(section)
    ? section === 'testimonios'
      ? 'Talento: esta sección NO muestra al protagonista de la campaña. Las únicas personas son los CLIENTES de las tarjetas (rostros DISTINTOS, gente común peruana).'
      : 'Talento: esta sección NO lleva persona alguna. El carril lo ocupan el producto, sus props y la atmósfera.'
    : hasTalent
    ? `Persona (misma en todas las secciones con protagonista): ${dna.model_persona}. Pose de ESTA sección (variable, no se repite): ${pose}.`
    : `Sin talento humano: el carril lo ocupa el sustituto — "${talentSubstitute}" — sin renderizar ninguna persona/rostro/silueta.`
  const particles = dna.particles_on
    ? `Partículas: ${dna.particle_type}, densidad ${dna.particle_density}, coherentes con el nicho y los props. En el aire, sin invadir texto.`
    : 'SIN partículas de fondo en este nicho — el fondo queda limpio, solo el degradado re-tintado.'
  return [
    'CONTENIDO DE CARRILES (lo que la plantilla no puede saber; la composición la manda la plantilla adjunta):',
    talentText,
    `Producto (invariante): en su slot de la plantilla, con reflejo en la base. Props derivados del nicho, apoyados con sombra de contacto: ${dna.props.join(', ')}. SOLO estos props — no agregues objetos de otro nicho (p. ej. moléculas/cápsulas fuera de suplementos) aunque la plantilla los muestre.`,
    particles,
  ].join('\n')
}

// ─── Capa 5 — SECTION_SPECS (spec §4) ────────────────────────────────────────
// El módulo central es lo ÚNICO que cambia entre secciones. Texto transcrito del spec, keyed
// por la clave del spec (`SECTION_SPEC_KEY[section]`), no por el slug interno.
const SECTION_SPECS_TEXT: Record<string, string> = {
  hero_problem: 'Pregunta de dolor + card de posicionamiento de producto. NO incluir un par antes/después acá (esa comparación vive en su propia sección).',
  benefits: '4 filas: icono + verbo bold + complemento regular (+ micro-línea opcional).',
  before_after: '2 cards con pill "ANTES"/"DESPUÉS", chevron central, caption con ✕/✓ debajo de cada una, línea de plazo realista.',
  testimonials: '3 cards: avatar circular + nombre + "edad · ciudad" + 5 estrellas oro + quote de 2-3 líneas + comilla decorativa. Cierra con barra agregada (nº de clientes, rating, nº de reseñas).',
  faq: '4 cards: icono + pregunta en bold + respuesta de 2-3 líneas.',
  guarantee: '4 cards horizontales con icono 3D grande a la izquierda + grid de pagos + sello central de devolución.',
  offer: '3 columnas; la central elevada, enmarcada en oro y con corona. Precio gigante, ancla tachada, precio por unidad, badge de % de ahorro, CTA por columna.',
  cta_final: 'Repetición condensada de la oferta ganadora + refuerzo de garantía + CTA único a ancho completo.',
}

function sectionSpecBlock(section: SectionType): string {
  const key = SECTION_SPEC_KEY[section]
  return `SECTION_SPECS — módulo central de ESTA sección (${key}): ${SECTION_SPECS_TEXT[key]}`
}

// ─── Capa 7 — TEXT_RULES (spec §5) ───────────────────────────────────────────
const TEXT_RULES = [
  'TEXT_RULES —',
  'Todo el texto visible en es-PE. Una sola variante regional en todo el funnel: tuteo peruano — prohibido voseo ("acabá", "recuperá", "te merecés") y localismos de otra región.',
  'Titular: verbo imperativo en 2ª persona + problema nombrado + promesa emocional (alternativa válida: pregunta de fricción). La palabra resaltada en el color de acento es siempre el PROBLEMA o la TRANSFORMACIÓN, NUNCA la marca.',
  'Beneficios: estructura idéntica en las 4 filas — "Verbo + objeto" (bold) / "y complemento" (regular). Sin excepciones de formato entre filas.',
  'Prueba: siempre anclada en tiempo ("desde la primera semana", "resultados en 4 a 8 semanas con uso constante"). Nunca promesa sin plazo.',
  'Objeciones: cada una se responde de forma explícita y literal en FAQ, no por insinuación.',
  'Oferta: ancla tachada + % de ahorro + precio por unidad + escasez temporal. Los tres precios y anclas son el MISMO set en todas las secciones del funnel.',
  'Moneda: "S/" siempre antepuesta, con el mismo formato en toda la pieza.',
  'Máximo 1 signo de exclamación por bloque. Sin mayúsculas sostenidas fuera del microcopy y las pills.',
  'Disciplina de texto: todo texto visible sale ÚNICAMENTE del copy de abajo + lo impreso en el producto — nunca renderices vocabulario de esta instrucción (nombres de capas, "ADN", "invariante", códigos hex, nombres de fuente) como si fuera copy de la pieza.',
].join('\n')

// ─── Capa 8 — Referencias adjuntas / nota de plantilla ──────────────────────
// Alineada con el contrato de orden de parts[] de la ruta (Task 9): producto canónico → fotos
// reales → talento (si hay) → plantilla de composición (última). A diferencia del motor viejo,
// la plantilla es ahora la FUENTE DE VERDAD de estructura (no un "apoyo mutable"): manda zonas,
// anatomía de cards, encuadre y tratamiento. Lo que cambia respecto a ella lo dice el resto de la
// instrucción (producto, cara del talento, copy, re-tinte de color, props/partículas del nicho).
function templateNote(talentImageAttached: boolean): string {
  const persona = talentImageAttached
    ? 'Penúltima = retrato del talento (misma persona: cara, pelo, ropa idénticos).'
    : 'No hay imagen de talento adjunta; NO reintroduzcas ninguna persona que la instrucción no pida.'
  return [
    'REFERENCIAS ADJUNTAS (orden) —',
    'Imagen 1 = envase canónico (fidelidad EXACTA de forma y labels). Siguientes = fotos reales del producto.',
    persona,
    'ÚLTIMA = PLANTILLA DE COMPOSICIÓN (fuente de verdad de estructura): reproduce EXACTAMENTE su composición, distribución de zonas, anatomía de tarjetas, encuadre y tratamiento. La ESTRUCTURA manda la plantilla. Cambia SOLO lo que esta instrucción indica: producto, cara del talento, copy, re-tinte de color, props/partículas del nicho. NO copies de la plantilla su producto, marca, textos, ni props/persona de otro nicho.',
  ].join('\n')
}

// ─── Secciones/notas auxiliares (reusadas sin cambios funcionales) ───────────

// Secciones que reservan la banda inferior de métodos de pago en el prompt. El overlay de logos
// reales (PaymentBar) se retiró post-smoke, pero el prompt sigue pidiendo la banda como estaba.
export const PAYMENT_SECTIONS: Set<SectionType> = new Set(['oferta', 'garantia'])

// Secciones que muestran un PACK de varias unidades (no un solo frasco). La ruta les pasa el pack
// pre-compuesto (buildProductPack) como Image 1 y este builder inyecta packNote.
export const MULTI_UNIT_SECTIONS: Set<SectionType> = new Set(['oferta', 'cta-final'])

// Nota de pack: refuerza que las N unidades comparten el label IDÉNTICO de Image 1. End-weighted
// junto al resto de reglas de fidelidad. La escena re-dibuja el pack; esto acota la variación.
function packNote(units: number): string {
  return `MULTI-UNIT PACK: Image 1 is a REFERENCE PACK showing ${units} copies of the SAME single product side by side. Render exactly ${units} units of THIS product as a tight cluster/pack, and copy the IDENTICAL printed label from Image 1 onto every single unit — same wordmark, same secondary text, same colours on all ${units}; never garble, shorten or vary the label from one unit to the next.`
}

// Antes/después ADAPTATIVO por nicho (Task 5): la plantilla de `antes-despues` viene armada sobre
// un acné→piel-limpia genérico, pero la tool es multi-nicho (café, rodillera, limpieza del
// hogar...). Esta nota fuerza dos estados coherentes con el nicho + copy, nunca un "acné" fijo.
// `nicheLabel` (de NICHE_LABELS, vía `nicheId`) ancla el dominio cuando se conoce la categoría —
// sin él, el modelo igual debe inferir el par ANTES/DESPUÉS del copy/producto, solo que sin el
// ancla explícita de categoría.
function beforeAfterNote(hasTalent: boolean, nicheLabel?: string): string {
  return [
    (nicheLabel ? `Para un producto de categoría «${nicheLabel}», ` : '') +
      'ANTES/DESPUÉS ADAPTATIVO: los dos paneles muestran el MISMO sujeto en dos estados coherentes con el nicho y el copy —',
    hasTalent
      ? 'el estado ANTES = el/la protagonista con el problema del nicho visible (piel: brotes; movilidad: rigidez; etc.); el estado DESPUÉS = el mismo rostro ya resuelto. Misma persona en ambos paneles.'
      : 'el estado ANTES = superficie/objeto/situación con el problema del nicho; el estado DESPUÉS = el mismo con el resultado logrado.',
    'Nunca inventes una condición de otro nicho ni actúes sufrimiento explícito.',
  ].join('\n')
}

// Urgencia data-driven ($0, honesta): se renderiza como un badge dorado con la línea de urgencia
// del copy (nunca inventada). offerText ya la inyecta en oferta; esto la lleva a hero/cta-final.
function urgencyText(offer: Offer): string {
  return `URGENCY: render a single metallic-gold urgency badge carrying EXACTLY this text and nothing else: "${offer.urgency}". Do not repeat it elsewhere or invent any other urgency line, stock count or deadline.`
}

// Precio destacado para hero/cta-final: sin él, la difusión INVENTA un precio/moneda. Inyecta la
// cifra EXACTA del tier destacado (la oferta vive en la sesión).
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

// Reserva la banda inferior de métodos de pago. Como antes: la difusión deja la banda limpia y
// puede rotular "Paga como prefieras". (El overlay de logos reales se retiró post-smoke.)
const PAYMENT_BAND =
  'PAYMENT LOGOS (do NOT draw): leave the BOTTOM ~12% of the image as a CLEAN, calm horizontal band (a subtle light strip is fine) with NO payment logos, card icons, brand marks, wallet logos, country flags or the words "yape/visa/mastercard/mercado pago" anywhere. You MAY render a short heading like "Paga como prefieras" just ABOVE the band, but no logos.'

// Reserva la franja superior para el lockup de marca (compuesto aparte, no dibujado).
const LOCKUP_BAND =
  'BRAND LOCKUP (do NOT draw): keep the very TOP ~6% center strip clean and empty — a small crisp brand wordmark lockup is composited there afterwards. Do NOT render any logo, wordmark, brand name or badge in that top strip yourself; start the headline below it.'

// ─── Ensamblador principal ───────────────────────────────────────────────────
export function buildDiffusionInstruction(args: {
  section: SectionType
  copy: SectionCopy
  dna: LandingDna
  productLabels: string | null
  offer?: Offer | null
  trust?: TrustBlock | null
  packUnits?: number | null
  hasTalent: boolean            // false solo si demographic_id === 'no_talent'
  talentSubstitute?: string     // NO_TALENT_SUBSTITUTE[niche] cuando !hasTalent
  reserveLockup?: boolean
  nicheId?: NicheId             // session.niche_id — ancla antes-despues a la categoría del nicho
}): string {
  const { section, copy, dna, productLabels, offer, trust, packUnits, hasTalent, talentSubstitute, reserveLockup, nicheId } = args

  // El talento/protagonista se muestra solo si el nicho lo tiene Y la sección no está en
  // NO_TALENT_SECTIONS (faq/testimonios/garantia/cta-final). Determina si se adjunta el retrato
  // (nota de plantilla).
  const talentImageAttached = hasTalent && !NO_TALENT_SECTIONS.has(section)

  const base = [
    'Diseña UNA sección de landing 9:16 full-bleed, calidad de anuncio comercial premium, mobile-first. La ÚLTIMA imagen adjunta es la PLANTILLA DE COMPOSICIÓN — reproduce EXACTAMENTE su composición y estructura; esta instrucción solo cambia producto, talento, copy, colores y props del nicho.',
    brandBlock(productLabels),
    designSystemBlock(dna),
    masterLayoutBlock(dna, section, hasTalent, talentSubstitute),
    sectionSpecBlock(section),
    '',
    'Copy a renderizar (y SOLO este copy):',
    copyBlock(copy),
    '',
    TEXT_RULES,
    templateNote(talentImageAttached),
  ]

  const extra: string[] = []
  if (section === 'antes-despues') extra.push(beforeAfterNote(hasTalent, nicheId ? NICHE_LABELS[nicheId] : undefined))
  if (section === 'oferta' && offer) extra.push(offerText(offer))
  // Precio + urgencia en hero/cta-final: la cifra EXACTA del tier destacado y el badge único con la
  // línea del copy (oferta ya trae ambos en offerText). Sin esto, hero/cta inventan precio y moneda.
  if (offer && (section === 'hero' || section === 'cta-final')) extra.push(featuredPriceText(offer))
  if (offer?.urgency && (section === 'hero' || section === 'cta-final')) extra.push(urgencyText(offer))
  if (trust && (section === 'garantia' || section === 'cta-final' || section === 'hero')) extra.push(trustText(trust))
  if (packUnits && packUnits > 1) extra.push(packNote(packUnits))
  if (reserveLockup) extra.push(LOCKUP_BAND)
  if (PAYMENT_SECTIONS.has(section)) extra.push(PAYMENT_BAND)

  return [...base, ...extra].filter(Boolean).join('\n\n')
}
