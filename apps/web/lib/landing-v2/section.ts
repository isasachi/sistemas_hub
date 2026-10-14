// Servicios por sección de landing v2: diseño del director de arte → render, y la revisión con feedback.
//
// Un solo pedido de razonamiento DISEÑA la sección como lo hace el GPT del dueño: su system prompt
// literal, el Knowledge (checklist + PDF de wireframes completo), el producto y lo ya aprobado. El
// director decide la idea visual, la composición y QUÉ textos lleva; no hay casillas de copy. Lo que
// el código garantiza:
//  - El PDF de wireframes va SOLO al director. Al modelo de imagen nunca: copia cajas y bordes.
//  - El texto que se dibuja es LISTA BLANCA: los textos del director, verificados contra los datos del
//    usuario, entre comillas. La composición se limpia de comillas antes de entrar al prompt: es justo
//    el vector por el que una instrucción termina impresa en la imagen.
//  - Precios, packs y testimonios los pone el CÓDIGO desde los datos del usuario, no el modelo.
//  - Sin botones en los renders (`rules.buttons` del system prompt).
//  - Imagen por `generateImage(…, { respaldo: NANO_BANANA_PRO })` (motor del hub), el mismo par para
//    render y revisión: un regen que cae a otro respaldo cambia la estética de una sola sección.
import type { Part } from '@google/genai'
import sharp from 'sharp'
import { editWithPrompt, generateImage, NANO_BANANA_PRO } from '@/lib/gemini'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { SECTION_BY_ID, SECTION_IDS, type SectionId } from './catalog'
import { sectionSupport } from './flow'
import { CRO_CHECKLIST, wireframesPdf } from './knowledge'
import { DIRECTOR, DIRECTOR_TIMEOUT_MS, structured } from './models'
import { gate, record, sectionKind, type Ctx } from './quota'
import {
  completeInputs, latestVersion, NICHE_LABELS, SectionDesignOutSchema,
  UserError, type LandingInputs, type LandingSession, type Pack, type SectionDesign, type VisualSystem,
} from './schemas'
import { LANDING_V2_GPT_PROMPT } from './system-prompt'
import { correctionFor, sourceText, stripUnsupportedTexts, verifyTexts } from './verify-copy'

export const OUT_W = 1080
export const OUT_H = 1920

export class SupportError extends Error {
  constructor(message: string, readonly suggest: SectionId | null) { super(message) }
}

export const money = (n: number) => `S/ ${n.toFixed(2)}`

/** Las líneas de precio de un pack, calculadas del dato del usuario (nunca del modelo). */
export function packLines(p: Pack): string[] {
  const out = [p.name, money(p.price)]
  if (p.compareAt && p.compareAt > p.price) {
    out.push(`Antes ${money(p.compareAt)}`, `Ahorras ${money(p.compareAt - p.price)}`)
  }
  if (p.label) out.push(p.label)
  return out
}

function requireInputs(s: LandingSession): { inputs: LandingInputs; vs: VisualSystem } {
  const inputs = completeInputs(s.inputs)
  if (!inputs) throw new UserError('Faltan datos del producto.')
  if (!s.visualSystem) throw new UserError('Primero hay que analizar el producto.')
  return { inputs, vs: s.visualSystem }
}

function dataBlock(inputs: LandingInputs, s: LandingSession): string {
  return [
    `PRODUCT NAME (exact): ${inputs.productName}`,
    `NICHE: ${NICHE_LABELS[inputs.niche]}${inputs.nicheOther ? ` (${inputs.nicheOther})` : ''}`,
    `PACKS (prices in soles, set by the user):\n${inputs.pricing.packs.map((p) => `- ${packLines(p).join(' · ')} · cantidad ${p.quantity}`).join('\n')}`,
    `PURCHASE CONDITIONS GIVEN BY THE USER: ${inputs.pricing.notes.trim() || '(none — do not mention shipping, payment, guarantee or urgency)'}`,
    `REAL TESTIMONIALS FOUND IN THE RESEARCH: ${s.testimonials.length ? s.testimonials.map((t) => `"${t.text}" — ${[t.name, t.city].filter(Boolean).join(', ')}`).join(' | ') : '(none)'}`,
    `MARKET RESEARCH & CONSUMER PSYCHOLOGY:\n${inputs.marketResearch}`,
  ].filter(Boolean).join('\n\n')
}


/**
 * Elementos de confianza que el brief no puede planear: no tienen copy, y el modelo de imagen los
 * rellena inventando ("Envío Gratis", "Clínicamente Probado"). Medido 2026-10-05: los dos briefs del
 * Hero planearon "trust bar" + "micro-trust icons" desde el wireframe, y las dos imágenes los
 * llenaron con claims falsos. Se quita la ORACIÓN entera del brief.
 */
const TRUST_PLAN = /trust|badge|seal|certif|guarantee|logos?\b|payment icons?|shipping icons?/i
export function sinConfianzaInventada(s: string): string {
  return s.split(/(?<=\.)\s+/).filter((x) => !TRUST_PLAN.test(x)).join(' ').trim()
}

/** Saca todo lo entrecomillado del brief: el texto que se dibuja lo pone el código, no el brief. */
export function sinComillas(s: string): string {
  // Solo comillas dobles y angulares: la simple choca con el apóstrofo del inglés ("product's").
  return s.replace(/["“”«»][^"“”«»\n]{2,}["“”«»]/g, '').replace(/\s{2,}/g, ' ').trim()
}

// ─── Director de arte ──────────────────────────────────────────────────────────
//
// Reemplazó al copy por casillas + brief (adoptado 2026-10-13). Con casillas fijas (`items[{title,text}]`)
// el modelo de imagen recibía SIEMPRE una lista de títulos+párrafos y la única forma de dibujarla era
// una columna de tarjetas, en todo producto y nicho (medido 2026-10-09: Hero de Fluya y de Canesten,
// mismo esqueleto). No lo reintroduzcas para "controlar el largo": el largo lo decide el director.

/** Lo que el director sabe del sistema visual. Sin `graphicResources`: metía tarjetas y sellos en todo. */
function directorVisual(vs: VisualSystem): string {
  return [
    `Palette: ${vs.palette.map((c) => `${c.role} ${c.hex}`).join(', ')}.`,
    `Typography: ${vs.typography}`,
    `Photography & lighting: ${vs.photography}`,
    `Art direction: ${vs.artDirection}`,
    `Product: ${vs.productForm}`,
    vs.usesPeople && vs.peopleDirection ? `People (when a section uses them): ${vs.peopleDirection}` : 'No people/models in this landing.',
  ].join('\n')
}

function approvedTexts(s: LandingSession, except: SectionId): string {
  const lines = SECTION_IDS.filter((id) => id !== except && s.sections[id]?.approved && s.designs[id])
    .map((id) => `- ${SECTION_BY_ID[id].en}: ${s.designs[id]!.texts.map((t) => t.text).join(' / ')}`)
  return lines.length ? `TEXTS ALREADY USED IN APPROVED SECTIONS (do not repeat them):\n${lines.join('\n')}` : ''
}

const DIRECTOR_TASK = (id: SectionId) => {
  const spec = SECTION_BY_ID[id]
  return [
    `TASK: design section ${spec.wf}/14 "${spec.en}" of this landing as its Art Director, following your rules, and hand the design to the image model that will paint it.`,
    // De TITULAR, antes de la lista: entre bullets una orden es una sugerencia (ley del repo). Medido
    // 2026-10-09: sin esto el director describía un layout (fondo, titular, frasco, bullets) y no una
    // idea, y el texto cargaba con todo el mensaje.
    'The image must TELL the section\'s angle, not only illustrate it: the customer should SEE their pain, how the product works or the result. Then use only the text the section needs to be understood: whatever the image can say, the image says.',
    `Image 1 is the real product. The attached PDF is the Knowledge wireframes PDF, one page per section in skeleton order: this section is page ${spec.wf}.`,
    `CRO criteria for this section: ${spec.checklist}.`,
    '- visualConcept: the concrete visual idea of this image, in English: WHAT the customer sees — beyond the product, the person and the text — that shows this section\'s angle from the research. Name the visual elements and how they are rendered, specific to this product and niche; a mood or a feeling is not a visual concept.',
    '- composition: how the image executes the visualConcept, in English prose: layout and focal point, product placement/scale/angle, people if any, background and environment, color, typography treatment and hierarchy, spacing. Any icon depicts the specific idea of the text beside it. Refer to each text by its role; never write the texts here and never use quotation marks.',
    '- texts: EVERY text that will be readable in the image, in Spanish, each with its role in the hierarchy. You decide how many and how long; nothing else will be written in the image.',
    '- usesPerson: whether a person/model appears. When the section\'s message is the customer\'s own experience or result (as the Hero usually is) and this landing\'s art direction uses people, show the person living it.',
    id === 'offer_pricing' || id === 'final_reoffer' ? 'The packs and prices are added to the image by the system from the user data, exactly: plan where they go in composition, but do NOT write prices in texts.' : '',
    id === 'testimonials' ? 'The real testimonials are added by the system verbatim: plan where they go in composition, and do NOT write testimonials in texts.' : '',
  ].filter(Boolean).join('\n')
}

/** El pedido del director (sin llamar). Separado para que un probe mande exactamente el mismo. */
export async function designRequest(s: LandingSession, id: SectionId) {
  const { inputs, vs } = requireInputs(s)
  const source = sourceText(inputs, s.testimonials)
  // Sin la sección aprobada como imagen (ancla de estilo apagada, 2026-10-13): la consistencia sale
  // del sistema visual fijo de abajo y de los textos ya usados.
  const product = await fetchAsBase64(inputs.productImageUrl)
  return {
    source,
    request: {
      name: 'landing_v2_section_design',
      schema: SectionDesignOutSchema,
      system: `${LANDING_V2_GPT_PROMPT}\n\nKNOWLEDGE — CRO CHECKLIST PDF (text):\n${CRO_CHECKLIST}`,
      content: [
        { type: 'file' as const, data: Buffer.from(product.data, 'base64'), mediaType: product.mimeType },
        { type: 'file' as const, data: wireframesPdf(), mediaType: 'application/pdf', filename: 'wireframes.pdf' },
        { type: 'text' as const, text: DIRECTOR_TASK(id) },
        { type: 'text' as const, text: [`VISUAL SYSTEM OF THIS LANDING:\n${directorVisual(vs)}`, dataBlock(inputs, s), approvedTexts(s, id)].filter(Boolean).join('\n\n') },
      ],
      validate: (d: SectionDesign) => {
        if (!d.texts.some((t) => t.text.trim())) return 'CORRECTION: texts is empty. Every section needs at least its headline in texts.'
        const v = verifyTexts(d.texts, source)
        return v.length ? correctionFor(v) : null
      },
    },
  }
}

/** El diseño de UNA sección. Los textos se verifican contra los datos del usuario y se reintenta. */
export async function directSection(s: LandingSession, id: SectionId): Promise<SectionDesign> {
  const { source, request } = await designRequest(s, id)
  const { output, model } = await structured({ ...request, models: DIRECTOR, timeoutMs: DIRECTOR_TIMEOUT_MS })
  console.info(`[landing-v2] diseño ${s.id}/${id} por ${model}`)
  return cleanDesign(output, source)
}

/** Lo que el código le quita al diseño antes de pintarlo: comillas, planes de confianza sin texto, textos sin respaldo. */
export function cleanDesign(d: SectionDesign, source: string): SectionDesign {
  return {
    visualConcept: sinComillas(d.visualConcept),
    composition: sinConfianzaInventada(sinComillas(d.composition)),
    usesPerson: d.usesPerson,
    texts: stripUnsupportedTexts(d.texts, source),
  }
}

/** Las líneas EXACTAS que se pueden dibujar: las del director + precios y testimonios del CÓDIGO. */
export function designTexts(id: SectionId, d: SectionDesign, s: LandingSession, inputs: LandingInputs): string[] {
  const lines = d.texts.map((t) => `${t.role.toUpperCase()}: "${t.text.trim()}"`)
  if (id === 'offer_pricing' || id === 'final_reoffer') {
    inputs.pricing.packs.forEach((p, i) => lines.push(`PACK ${i + 1}: ${packLines(p).map((l) => `"${l}"`).join(' · ')}`))
  }
  if (id === 'testimonials') {
    s.testimonials.forEach((t, i) => lines.push(`TESTIMONIAL ${i + 1}: "${t.text}"${t.name || t.city ? ` — "${[t.name, t.city].filter(Boolean).join(', ')}"` : ''}`))
  }
  return lines
}

export function buildDirectedPrompt(o: { id: SectionId; design: SectionDesign; s: LandingSession; inputs: LandingInputs; vs: VisualSystem; style: number | null; proof: number[] }): string {
  return [
    'ABSOLUTE TEXT RULE: the ONLY words, numbers and labels allowed in the image are the ones in the TEXT list below (plus what is printed on the product label). Do NOT add a trust bar, badges, seals, certifications, guarantees, shipping/payment claims or icon captions that are not in that list.',
    'Paint ONE finished, premium mobile landing-page section as a single portrait 9:16 image, exactly as the Art Director designed it below. Every text legible on a phone without zoom; nothing important near the edges; nothing cropped.',
    `Image 1 is the REAL product (${o.vs.productForm}): reproduce it exactly — shape, proportions, colors and every detail of its label. Never redraw, restyle, duplicate or substitute it.`,
    o.proof.length ? `Images ${o.proof.join(', ')} are the user's REAL before/after photos: place them as they are, without altering them.` : '',
    o.style ? `Image ${o.style} is an already approved section of THIS landing: match its typography, palette, lighting and graphic language. Do NOT copy its layout or composition.` : '',
    o.design.usesPerson ? '' : 'Do not show any person.',
    `VISUAL CONCEPT (the idea this image must make visible):\n${o.design.visualConcept}`,
    `ART DIRECTION:\n${o.design.composition}`,
    `TEXT — render EXACTLY these texts, verbatim and in Spanish, and NO other words, letters or numbers anywhere (except what is printed on the product's own label). Role names before the colon are NOT text to render:\n${designTexts(o.id, o.design, o.s, o.inputs).join('\n')}`,
    'NO BUTTONS: no CTA buttons, no button-like shapes, pills or tabs that read as clickable. Price containers, tags, seals and labels are allowed but never styled as buttons.',
  ].filter(Boolean).join('\n\n')
}

/**
 * El ancla de estilo (la primera sección aprobada como referencia) está APAGADA (decisión del dueño,
 * 2026-10-13). Medido: QA del 2026-10-05, sin ancla la consistencia fue igual y con ancla 1 de 4 clonó
 * el layout del Hero; E2E del 2026-10-13, Beneficios repitió casi la escena del Hero. `anchor: true`
 * solo lo usa el QA de consistencia como brazo de control: no lo prendas en el producto sin medirlo.
 */
export async function renderDirected(s: LandingSession, id: SectionId, design: SectionDesign, opts: { anchor?: boolean } = {}): Promise<string> {
  const { inputs, vs } = requireInputs(s)
  const parts: Part[] = []
  const push = async (url: string) => {
    const { data, mimeType } = await fetchAsBase64(url)
    parts.push({ inlineData: { data, mimeType } })
    return parts.length
  }
  await push(inputs.productImageUrl)
  const proof: number[] = []
  if (id === 'before_after') for (const u of inputs.proofImageUrls.slice(0, 2)) proof.push(await push(u))
  const anchorUrl = opts.anchor ? styleAnchor(s, id) : null
  const style = anchorUrl ? await push(anchorUrl) : null
  parts.push({ text: buildDirectedPrompt({ id, design, s, inputs, vs, style, proof }) })
  const b64 = await generateImage(parts, 3, { aspectRatio: '9:16', respaldo: NANO_BANANA_PRO })
  if (!b64) throw new UserError('No se pudo generar la imagen de la sección. Inténtalo de nuevo.')
  return b64
}

/** Qué modelo produjo la imagen, por su tamaño (la huella del repo), ANTES de reescalar. */
export function modelFromSize(w?: number, h?: number): string {
  if (w === 864 && h === 1536) return 'gpt-image-2.5-sunburst'
  return `google-respaldo(${w}x${h})`
}

async function finalize(s: LandingSession, id: SectionId, b64: string, feedback: string | null): Promise<LandingSession> {
  const raw = Buffer.from(b64, 'base64')
  const meta = await sharp(raw).metadata()
  const model = modelFromSize(meta.width, meta.height)
  // El modelo no acepta 1080x1920 directo (lados múltiplos de 16): se pide 9:16 y se reescala.
  const out = await sharp(raw).resize(OUT_W, OUT_H, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer()
  const n = (s.sections[id]?.versions.length ?? 0) + 1
  const imageUrl = await uploadToStorage(s.id, out, 'image/jpeg', `v2-${id}-${n}`)
  console.info(`[landing-v2] render ${s.id}/${id} v${n} por ${model}`)
  const prev = s.sections[id] ?? { versions: [], approved: false }
  return {
    ...s,
    current: id,
    sections: {
      ...s.sections,
      [id]: { approved: false, versions: [...prev.versions, { imageUrl, model, feedback, createdAt: new Date().toISOString() }] },
    },
  }
}

/** La primera sección aprobada en el orden del esqueleto (solo para el brazo con ancla del QA). */
function styleAnchor(s: LandingSession, id: SectionId): string | null {
  const first = SECTION_IDS.find((x) => x !== id && s.sections[x]?.approved)
  return first ? latestVersion(s, first)?.imageUrl ?? null : null
}

/** Diseño del director → render de UNA sección. Siempre diseña de cero. Cobra 1 crédito. */
export async function generateSection(s: LandingSession, id: SectionId, ctx: Ctx): Promise<LandingSession> {
  requireInputs(s)
  const sup = sectionSupport(s, id)
  if (!sup.ok) throw new SupportError(sup.reason!, sup.suggest)
  const kind = sectionKind(id)
  await gate(s.id, kind, ctx)
  const design = await directSection(s, id)
  const b64 = await renderDirected(s, id, design)
  // El diseño se guarda: de él salen los textos ya usados que el director no debe repetir.
  const next = await finalize({ ...s, designs: { ...s.designs, [id]: design } }, id, b64, null)
  await record(s.id, kind, ctx)
  return next
}

/** Rehace SOLO esa sección con el feedback, como edición sobre la imagen actual. Cobra 1 crédito. */
export async function reviseSection(s: LandingSession, id: SectionId, feedback: string, ctx: Ctx): Promise<LandingSession> {
  const prev = latestVersion(s, id)
  if (!prev) return generateSection(s, id, ctx)
  const kind = sectionKind(id)
  await gate(s.id, kind, ctx)
  const img = await fetchAsBase64(prev.imageUrl)
  const b64 = await editWithPrompt(img.data, img.mimeType, feedback, { aspectRatio: '9:16', respaldo: NANO_BANANA_PRO })
  if (!b64) throw new UserError('No se pudo aplicar el cambio. Inténtalo de nuevo.')
  const next = await finalize(s, id, b64, feedback)
  await record(s.id, kind, ctx)
  return next
}
