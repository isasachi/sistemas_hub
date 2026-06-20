import fs from 'fs'
import path from 'path'
import type { Direction, LabelData, DesignDna } from './types'

// Render del Design DNA (extraído de la ref del usuario) a texto para el prompt de
// imagen. Puro ($0). Para label se omite `layout` (la arquitectura es dueña de las
// zonas); para logo entra completo.
function designDnaToPrompt(dna: DesignDna, opts?: { omitLayout?: boolean }): string {
  return [
    dna.logoDesc ? `- Logo to replicate (redraw it for OUR brand name): ${dna.logoDesc}` : '',
    `- Typography: ${dna.typography}`,
    `- Color treatment: ${dna.palette}`,
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
// path SIN ref del usuario (la ref del usuario manda cuando existe). Para label se omite
// `layout` (la arquitectura es dueña de las zonas); para logo entra completo.
function designSystemBlock(d: Direction, opts?: { omitLayout?: boolean }): string {
  const ds = d.designSystem
  if (!ds) return ''
  return [
    ``,
    `Ground the visual style in this proven design system (reference: ${ds.reference}).`,
    `Apply its tokens to OUR brand — do NOT copy its name or literal content:`,
    `- Typography: ${ds.typography}`,
    `- Spacing & density: ${ds.spacing}`,
    `- Component style: ${ds.components}`,
    opts?.omitLayout ? '' : `- Layout: ${ds.layout}`,
    `- Visual personality: ${ds.personality}`,
  ].filter(Boolean).join('\n')
}

// Bloque de referencia DEL LOGO: aquí la imagen cruda SÍ entra como Image 1 (style
// reference). Decisión del usuario: "la referencia manda el vibe" — emula estética,
// color y mood; la paleta de marca queda subordinada. Se ignora explícitamente el
// fondo/foto/escena para no importar el cielo/manos de una referencia que es una
// foto de producto (el viejo bug "ref de chocolate → producto de chocolate").
function logoStyleRefBlock(dna?: DesignDna | null): string {
  return [
    ``,
    `Image 1 is a STYLE reference. Replicate its design DNA, then apply OUR brand for a`,
    `perfect match. If Image 1 is a clean logo, emulate it directly. If it is a product`,
    `photo or MOCKUP, locate the actual brand logo printed on the packaging (it may be`,
    `small — a corner of the label) and treat THAT printed logo as the PRIMARY reference.`,
    dna
      ? `Replicate these EXACT extracted principles (then swap in OUR brand name):\n${designDnaToPrompt(dna)}`
      : `Emulate its lettering, mark, colors, proportions and energy.`,
    `DISREGARD the background, photography, hands, container, product and scene — design a`,
    `clean LOGO for OUR brand, not a copy of the reference's packaging.`,
    `Lead with the reference's design DNA; the brand palette above is secondary, used only`,
    `where it doesn't fight the reference. The brand NAME must be rendered correctly,`,
    `legibly and prominently.`,
  ].join('\n')
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
  return [
    `Design a professional, production-ready LOGO for a small business.`,
    brandBlock(d, brandName),
    `Logo direction: ${d.logoDirection}.`,
    `Variant focus for this option: ${variant}.`,
    hasReferenceImage ? logoStyleRefBlock(refDna) : designSystemBlock(d),
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

// Bloque de referencia DE LA ETIQUETA: la imagen cruda entra como Image 2 (Image 1
// es el logo). Misma decisión que el logo: "la referencia manda el vibe" — emula
// estética/color/mood; ignora el producto/escena literal de la referencia.
function labelStyleRefBlock(dna?: DesignDna | null): string {
  return [
    ``,
    `Image 2 is a STYLE reference for the label. Take its WHOLE vibe AND composition —`,
    `typography, color, illustration/graphic style, component style, element distribution`,
    `and density. The reference dictates the structure; do NOT impose any fixed template.`,
    dna
      ? `Replicate these EXACT extracted principles (then apply OUR content/brand):\n${designDnaToPrompt(dna)}`
      : ``,
    `DISREGARD its background, photography, scene, and any literal product, text, flavor`,
    `or ingredients — render OUR product content and brand defined above, not a copy.`,
    `Lead with the reference's design DNA; the brand palette above is secondary, used only`,
    `where it doesn't fight the reference. Keep the provided logo (Image 1) as-is.`,
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
      : [labelArchitectureBlock(), designSystemBlock(d, { omitLayout: true })].join('\n'),
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
