import fs from 'fs'
import path from 'path'
import type { Direction, LabelData, DesignDna } from './types'

// Render del Design DNA (extraído de la ref del usuario) a texto para el prompt de
// imagen. Puro ($0). Lo usa SOLO el path de ETIQUETA (`omitLayout`: la arquitectura es
// dueña de las zonas). El logo usa solo `dna.logoDesc` (ver logoStyleRefBlock).
function designDnaToPrompt(dna: DesignDna, opts?: { omitLayout?: boolean; omitTypeAndPalette?: boolean }): string {
  return [
    dna.logoDesc ? `- Logo to replicate (redraw it for OUR brand name): ${dna.logoDesc}` : '',
    opts?.omitTypeAndPalette ? '' : `- Typography: ${dna.typography}`,
    opts?.omitTypeAndPalette ? '' : `- Color treatment: ${dna.palette}`,
    `- Spacing & density: ${dna.spacing}`,
    `- Repetition / motifs: ${dna.repetition}`,
    `- Component style: ${dna.components}`,
    opts?.omitLayout ? '' : `- Layout: ${dna.layout}`,
    `- Visual personality: ${dna.personality}`,
  ].filter(Boolean).join('\n')
}

// Constructores puros (sin LLM, $0) que arman las instrucciones de generación de
// imagen a partir de la dirección de marca aprobada. Mantienen un prompt rico y
// consistente entre logo / etiqueta / mockup sin gastar una llamada de reasoning.

// Arquitectura canónica de etiqueta (estructura/zonas/jerarquía). Se lee una vez al
// cargar el módulo (solo lo importan routes server, nodejs runtime). Guía el path
// SIN referencia: cuando el usuario no sube una etiqueta de referencia, esta es la
// estructura por defecto, adaptable por mercado (omite el grupo ENVASADO si no aplica).
const LABEL_ARCHITECTURE = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/label-architecture.md'),
  'utf-8'
).trim()

function paletteLine(d: Direction): string {
  return d.palette.map((c) => `${c.hex} (${c.name} — ${c.usage})`).join('; ')
}

function brandBlock(d: Direction, brandName: string): string {
  return [
    `Brand name: "${brandName}".`,
    `Brand concept: ${d.concept}.`,
    // Lo de abajo es GUÍA DE DISEÑO, no contenido a imprimir — el modelo a veces
    // rinde literalmente los hex y los nombres de fuente como texto en la etiqueta.
    `Design guidance (apply visually — NEVER print these words/codes on the artwork):`,
    `- Color palette (use these exact hex values): ${paletteLine(d)}.`,
    `- Typography: headings in "${d.typography.headline}", body in "${d.typography.body}".`,
  ].join('\n')
}

// Baseline curado: tokens del exemplar de la biblioteca (design-system.md) que el
// LLM eligió por use_case, guardados en `direction.designSystem`. Se aplica SOLO en el
// path SIN ref del usuario (la ref del usuario manda cuando existe). AISLADO por artefacto:
// el logo usa solo lógica de logo (construcción + tipografía + spacing + personalidad); la
// etiqueta usa lógica de etiqueta (tipografía + spacing + components + personalidad). `layout`
// nunca entra (la etiqueta lo da la arquitectura; el logo no tiene zonas).
function designSystemBlock(d: Direction, opts?: { forLabel?: boolean }): string {
  const ds = d.designSystem
  if (!ds) return ''
  const forLabel = opts?.forLabel
  return [
    ``,
    `Ground the visual style in this proven design system (reference: ${ds.reference}).`,
    `Apply its tokens to OUR brand — do NOT copy its name or literal content:`,
    // El token `logo` solo aplica al paso de logo; la etiqueta usa estilo, no construcción de marca.
    !forLabel && ds.logo ? `- Logo construction: ${ds.logo}` : '',
    `- Typography: ${ds.typography}`,
    `- Spacing & density: ${ds.spacing}`,
    forLabel ? `- Component style: ${ds.components}` : '', // furniture de etiqueta (badges/pills) — no para el logo
    `- Visual personality: ${ds.personality}`,
  ].filter(Boolean).join('\n')
}

// Bloque de referencia DEL LOGO: la imagen entra como Image 1. Separación clave (pedido
// del usuario): la REF aporta el DISEÑO/ESTRUCTURA del logo (preciso); la IDENTIDAD DE
// MARCA (paleta + tipografía del brandBlock) aporta los COLORES y la TIPOGRAFÍA. Antes la
// paleta de marca quedaba "secondary" → no se aplicaba; ahora es autoritativa para color/tipo.
function logoStyleRefBlock(dna?: DesignDna | null): string {
  return [
    ``,
    `Image 1 is a reference. Design a CLEAN, ISOLATED LOGO — a single mark/wordmark on a`,
    `plain background. Do NOT reproduce the packaging or label: no background pattern, no`,
    `ingredient text, no product descriptors, no count/flavor badges, no label layout.`,
    `If Image 1 is a clean logo, replicate its design. If it is a product photo or MOCKUP,`,
    `locate the actual brand logo on the packaging and replicate ONLY that logo.`,
    dna?.logoDesc
      ? `Replicate this logo's construction PRECISELY — its mark, lettering, lockup and proportions (NOT its colors or font):\n${dna.logoDesc}`
      : `Replicate the reference logo's mark, lettering, lockup and proportions precisely.`,
    `CRITICAL — render it in OUR brand identity, NOT the reference's: use ONLY the brand`,
    `palette (the EXACT hex values above) for color and the brand typography for the`,
    `lettering. Override any colors or fonts from the reference — e.g. do NOT keep a`,
    `rainbow/multicolor wordmark if our palette is different; recolor it with our palette.`,
    `The reference gives the DESIGN/STRUCTURE; our identity gives the COLOR and TYPE.`,
    `Render the brand NAME correctly, legibly and prominently. DISREGARD the reference's`,
    `background, photography, hands, container, product and scene.`,
  ].filter(Boolean).join('\n')
}

// Etapa 3 — logo. `variant` desvía cada opción de la tanda para que las 3-4 salgan
// distintas; con imagen de referencia (Image 1) se emite el style-block, enriquecido
// con el Design DNA quirúrgico (`refDna`) extraído de la ref si está disponible.
export function buildLogoInstruction(
  d: Direction,
  brandName: string,
  variant: string,
  hasReferenceImage?: boolean,
  refDna?: DesignDna | null
): string {
  // Con ref: NO se inyecta `logoDirection` ni el variant ESTRUCTURAL (empujan el logo
  // lejos del diseño de la ref → imprecisión). El variant pasa a ser una variación sutil
  // que conserva la estructura de la ref. Sin ref: comportamiento normal (variant + direction).
  return [
    `Design a professional, production-ready LOGO for "${brandName}".`,
    brandBlock(d, brandName),
    hasReferenceImage ? '' : `Logo direction: ${d.logoDirection}.`,
    hasReferenceImage
      ? `This is one option of a set — keep the reference's design; vary ONLY subtly: ${variant}.`
      : `Variant focus for this option: ${variant}.`,
    hasReferenceImage ? logoStyleRefBlock(refDna) : designSystemBlock(d),
    ``,
    `Requirements:`,
    `- Clean vector-style mark, centered, on a solid flat neutral background (off-white #F5F2EC).`,
    `- Legible, correctly spelled brand name. No lorem ipsum, no random extra text.`,
    `- Simple, memorable, scalable; works small. Modern, not clip-art.`,
    `- Square composition with generous padding around the mark.`,
  ].filter(Boolean).join('\n')
}

// Sin ref: 4 estructuras DISTINTAS (la tanda explora opciones).
export const LOGO_VARIANTS: string[] = [
  'wordmark — typographic logo with a subtle custom detail',
  'icon + wordmark lockup — a simple symbol above the name',
  'monogram / emblem — initials inside a contained shape',
  'minimal lettermark — bold geometric, lots of whitespace',
]

// Con ref: 4 variaciones SUTILES que conservan el diseño de la ref (no divergen su estructura).
export const REF_LOGO_VARIANTS: string[] = [
  'the primary lockup, closest to the reference',
  'a slightly bolder / heavier-weight take',
  'a more compact, tighter-spaced take',
  'a cleaner, more simplified take with the mark emphasized',
]

// Bloque de referencia DE LA ETIQUETA: la imagen cruda entra como Image 2 (Image 1
// es el logo). Espejo del logo con-ref (pedido del usuario): la REF aporta la ESTRUCTURA
// (composición/ilustración/componentes/densidad/layout); la IDENTIDAD DE MARCA (paleta +
// tipografía del brandBlock) aporta COLOR y TIPOGRAFÍA, haciendo override de las del ref.
// Por eso `designDnaToPrompt` omite typography y palette del DNA del ref.
function labelStyleRefBlock(dna?: DesignDna | null): string {
  return [
    ``,
    `Image 2 is a STYLE reference for the label. Take its composition, illustration/graphic`,
    `style, component style, element distribution and density — but NOT its colors or fonts.`,
    `The reference dictates the structure; do NOT impose any fixed template.`,
    dna
      ? `Replicate these EXACT extracted principles (then apply OUR content/brand):\n${designDnaToPrompt(dna, { omitTypeAndPalette: true })}`
      : ``,
    `CRITICAL — render it in OUR brand identity, NOT the reference's: use ONLY the brand`,
    `palette (the EXACT hex values above) for color and the brand typography. Override any`,
    `colors or fonts from the reference — do NOT keep its color scheme or typefaces.`,
    `DISREGARD its background, photography, scene, and any literal product, text, flavor`,
    `or ingredients — render OUR product content and brand defined above, not a copy.`,
    `Keep the provided logo (Image 1) as-is.`,
  ].filter(Boolean).join('\n')
}

// Sin referencia de etiqueta: el modelo sigue la arquitectura canónica destilada.
function labelArchitectureBlock(): string {
  return [
    ``,
    `Follow this PRODUCT LABEL architecture (JSON spec) for structure, zones and proportions;`,
    `fill its placeholders with the real content below (adapt/omit zones per product & market):`,
    LABEL_ARCHITECTURE,
  ].join('\n')
}

// Etapa 4 — etiqueta. Image 1 = logo elegido. Image 2 (opcional) = etiqueta de
// referencia subida por el usuario, como style reference (`hasReferenceImage`).
// Sin referencia, se usa la arquitectura canónica (`labelArchitectureBlock`).
export function buildLabelInstruction(
  d: Direction,
  brandName: string,
  productName: string,
  data: LabelData,
  hasReferenceImage?: boolean,
  refDna?: DesignDna | null
): string {
  const ld = (label: string, v: string) => (v.trim() ? `- ${label}: ${v.trim()}` : '')
  return [
    `Image 1 is the approved brand logo. Use it as-is (do not redraw the mark).`,
    `Design a flat, print-ready PRODUCT LABEL artwork. Brand "${brandName}", product "${productName}".`,
    brandBlock(d, brandName),
    `Packaging format the label must fit: ${data.packagingFormat.trim() || 'standard retail packaging'}.`,
    hasReferenceImage
      ? labelStyleRefBlock(refDna)
      : [labelArchitectureBlock(), designSystemBlock(d, { forLabel: true })].join('\n'),
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
    // El modelo rinde el meta-texto del prompt (nombres de campo, hex, fuentes) como
    // texto impreso — visto en producción. Regla dura para que solo imprima copy real.
    `- NEVER print on the label any prompt label or guidance: field names ("Ingredients", "Net weight", "Highlight"…), the words "typography"/"palette"/"composition", font names, hex color codes, or any instruction text. Print ONLY the real product copy and the brand name. No lorem ipsum, no "Sample/Dummy Text", no placeholders.`,
    hasReferenceImage
      ? `- This is the flat label artwork shown straight-on, not on a container yet; its layout follows the style reference.`
      : `- This is the flat label artwork (the full unrolled face — primary display + information panel together), shown straight-on, not on a container yet.`,
    `- Proportions and layout suited to the packaging format above.`,
    `- Cohesive, retail-quality, premium finish.`,
  ].filter(Boolean).join('\n')
}

// Envase vacío para el modo "describir": sin geometría de envase el wrap del mockup
// falla (recompone la etiqueta plana). Generamos un envase vacío desde la descripción
// y lo usamos como Image 2 → el mockup pasa por el MISMO path que ya funciona en upload.
export function buildContainerInstruction(desc: string | null): string {
  return [
    `Photorealistic studio photo of a single EMPTY, UNLABELED retail product container.`,
    `Container: ${desc?.trim() || 'a container appropriate for the product'}.`,
    `Blank surface — absolutely NO label, NO text, NO graphics on it; plain packaging material.`,
    `Centered, straight-on, seamless neutral studio background, soft realistic lighting and shadow.`,
    `Keep realistic proportions and geometry for that container type.`,
  ].join('\n')
}

// Etapa 5 — mockup. Image 1 = etiqueta. Image 2 = envase (subido o generado). El head
// se elige por SI hay imagen de envase: con envase (incluido el generado en describir)
// se ancla en él; sin envase es el fallback (raro: solo si la generación del envase falló).
export function buildMockupInstruction(
  d: Direction,
  brandName: string,
  opts: { hasContainerImage: boolean; containerDesc: string | null }
): string {
  const head = opts.hasContainerImage
    ? [
        `Image 1 is the flat product label artwork. Image 2 is the real container the client will use.`,
        `Apply the label from Image 1 onto the container in Image 2, wrapped realistically (curvature, lighting, perspective, shadows).`,
        `Keep Image 2's container exactly — its true shape, geometry and contents. Discard the label's flat background; take ONLY its printed design.`,
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
