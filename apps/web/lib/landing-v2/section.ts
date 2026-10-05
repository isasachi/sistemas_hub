// Servicios por sección de landing v2: copy → brief → render, y la revisión con feedback.
//
// Reglas heredadas de la doctrina de landing (agents/landing.md) que este archivo sostiene:
//  - El wireframe gris va SOLO al modelo de razonamiento (copy y brief). Al de imagen nunca: copia
//    cajas y bordes.
//  - El texto que se dibuja es LISTA BLANCA y lo arma el código: las casillas de copy entre comillas.
//    El brief del modelo se limpia de comillas antes de entrar al prompt, porque un brief es justo
//    el vector por el que una instrucción termina impresa en la imagen (landing.md).
//  - Precios, packs y testimonios los pone el CÓDIGO desde los datos del usuario, no el modelo.
//  - Imagen por `generateImage(…, { respaldo: NANO_BANANA_PRO })`, el mismo par para render y
//    revisión: un regen que cae a otro respaldo cambia la estética de una sola sección.
import type { Part } from '@google/genai'
import sharp from 'sharp'
import { editWithPrompt, generateImage, NANO_BANANA_PRO } from '@/lib/gemini'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { SECTION_BY_ID, SECTION_IDS, type SectionId } from './catalog'
import { sectionSupport } from './flow'
import { CRO_CHECKLIST, wireframeFor } from './knowledge'
import { structured } from './models'
import { gate, record, sectionKind, type Ctx } from './quota'
import {
  completeInputs, latestVersion, NICHE_LABELS, RenderBriefOutSchema, SectionCopyOutSchema,
  UserError, type LandingInputs, type LandingSession, type Pack, type RenderBrief, type SectionCopy, type VisualSystem,
} from './schemas'
import { LANDING_V2_SYSTEM_PROMPT } from './system-prompt'
import { correctionFor, sourceText, stripUnsupported, verifyCopy } from './verify-copy'

export const OUT_W = 1080
export const OUT_H = 1920

export class SupportError extends Error {
  constructor(message: string, readonly suggest: SectionId | null) { super(message) }
}

const NICHE_TONE: Record<string, string> = {
  health: 'Clean, trust-driven, premium, spacious, credible.',
  beauty: 'Premium, aesthetic, editorial, polished.',
  fitness: 'Bold, dynamic, aspirational, energetic, uncluttered.',
  home: 'Clear, practical, visually strong, lifestyle-driven, before/after focused when relevant.',
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
    inputs.ctaText ? `CTA TEXT GIVEN BY THE USER: ${inputs.ctaText}` : '',
    `REAL TESTIMONIALS FOUND IN THE RESEARCH: ${s.testimonials.length ? s.testimonials.map((t) => `"${t.text}" — ${[t.name, t.city].filter(Boolean).join(', ')}`).join(' | ') : '(none)'}`,
    `MARKET RESEARCH & CONSUMER PSYCHOLOGY:\n${inputs.marketResearch}`,
  ].filter(Boolean).join('\n\n')
}

function visualBlock(vs: VisualSystem): string {
  return [
    `Palette: ${vs.palette.map((c) => `${c.role} ${c.hex}`).join(', ')} (${vs.polarity} background).`,
    `Typography: ${vs.typography}`,
    `Photography & lighting: ${vs.photography}`,
    `Graphic resources allowed: ${vs.graphicResources.join('; ') || 'minimal'}`,
    `Art direction: ${vs.artDirection} Niche tone: ${NICHE_TONE[vs.niche] ?? ''}`,
    `Product: ${vs.productForm}`,
  ].join('\n')
}

function approvedSummary(s: LandingSession, except: SectionId): string {
  const lines = SECTION_IDS.filter((id) => id !== except && s.sections[id]?.approved && s.copies[id])
    .map((id) => `- ${SECTION_BY_ID[id].en}: ${s.copies[id]!.headline}`)
  return lines.length ? `ALREADY APPROVED SECTIONS (do not repeat their headlines):\n${lines.join('\n')}` : ''
}

const COPY_TASK = (id: SectionId) => {
  const spec = SECTION_BY_ID[id]
  return [
    `TASK: write the Spanish copy for section ${spec.wf}/14 "${spec.en}" (${spec.es}).`,
    'The attached gray image is this section\'s WIREFRAME: it defines which blocks exist and their hierarchy. Its "Ej:" lines, placeholder texts and numbers are SCHEMATIC NOTATION, never content: do not reuse them. "REGLA DE ESTA SECCIÓN" is internal criteria.',
    `Checklist criteria for this section: ${spec.checklist}.`,
    'Use ONLY facts present in the user data below. If the data does not support a block, omit it. Short, mobile-readable, natural Peruvian Spanish (tuteo).',
    '- headline: the section title. subheadline: one supporting line or null.',
    '- items: the wireframe\'s blocks (benefits, steps, reasons, columns…), each with an optional short title and a short text. For two-column sections set `group` to the column name; otherwise null.',
    '- closingLine: a short transition line only if it improves flow, else null.',
    spec.cta
      ? '- cta: a short actionable button text derived from the offer (use the user\'s CTA text if given).'
      : '- cta: null (this section has no button).',
    id === 'offer_pricing' || id === 'final_reoffer'
      ? 'The packs and prices are rendered by the system from the user data: do NOT write prices in items.'
      : '',
    id === 'testimonials'
      ? 'The testimonials are rendered by the system verbatim from the research: write only headline/subheadline/closingLine; items = [].'
      : '',
  ].filter(Boolean).join('\n')
}

export async function generateSectionCopy(s: LandingSession, id: SectionId): Promise<SectionCopy> {
  const { inputs } = requireInputs(s)
  const source = sourceText(inputs, s.testimonials)
  const { output, model } = await structured({
    name: 'landing_v2_section_copy',
    schema: SectionCopyOutSchema,
    system: `${LANDING_V2_SYSTEM_PROMPT}\n\nCRO CHECKLIST:\n${CRO_CHECKLIST}`,
    content: [
      { type: 'image', image: wireframeFor(id), mediaType: 'image/jpeg' },
      { type: 'text', text: COPY_TASK(id) },
      { type: 'text', text: [dataBlock(inputs, s), approvedSummary(s, id)].filter(Boolean).join('\n\n') },
    ],
    validate: (c) => { const v = verifyCopy(c, source); return v.length ? correctionFor(v) : null },
  })
  console.info(`[landing-v2] copy ${s.id}/${id} por ${model}`)
  const spec = SECTION_BY_ID[id]
  let copy = stripUnsupported(output, source, inputs.productName)
  if (id === 'testimonials') {
    copy = { ...copy, items: s.testimonials.map((t) => ({ group: null, title: [t.name, t.city].filter(Boolean).join(', ') || null, text: t.text })) }
  }
  // CTA: el del usuario manda; si no, el del modelo (ya verificado); si no, uno neutro. Sin CTA donde
  // el wireframe no lo pone.
  const cta = spec.cta ? (inputs.ctaText?.trim() || copy.cta?.trim() || 'Comprar ahora') : null
  return { ...copy, cta }
}

/** Saca todo lo entrecomillado del brief: el texto que se dibuja lo pone el código, no el brief. */
export function sinComillas(s: string): string {
  // Solo comillas dobles y angulares: la simple choca con el apóstrofo del inglés ("product's").
  return s.replace(/["“”«»][^"“”«»\n]{2,}["“”«»]/g, '').replace(/\s{2,}/g, ' ').trim()
}

export async function buildRenderBrief(s: LandingSession, id: SectionId, copy: SectionCopy): Promise<RenderBrief> {
  const { inputs, vs } = requireInputs(s)
  const spec = SECTION_BY_ID[id]
  const { output, model } = await structured({
    name: 'landing_v2_render_brief',
    schema: RenderBriefOutSchema,
    system: `${LANDING_V2_SYSTEM_PROMPT}\n\nCRO CHECKLIST:\n${CRO_CHECKLIST}`,
    content: [
      { type: 'image', image: wireframeFor(id), mediaType: 'image/jpeg' },
      { type: 'text', text: [
        `TASK: translate this section's wireframe (attached) into a premium art-directed COMPOSITION BRIEF for an image model. Section ${spec.wf}/14 "${spec.en}".`,
        'Write in English. Describe layout, focal point, product placement/scale/angle, background/environment, typographic treatment and CTA treatment. Merge or reinterpret wireframe blocks editorially; never boxes, gray frames, arrows or labels.',
        'Refer to texts ONLY by role (headline, subheadline, items, closing line, CTA, prices). Do NOT write any text to render and do NOT use quotation marks.',
        `usesPerson: true only if a person truly improves this section${vs.talentUrl ? ' (a fixed talent reference exists)' : ' (no person reference exists: answer false)'}. Never a faceless body crop.`,
        spec.cta ? `CTA: ${spec.cta === 'main' ? 'the most eye-catching element of the section, micro-trust icons below only if the data supports them' : spec.cta === 'final' ? 'the largest button of the whole landing' : 'the offer button'}.` : 'ctaTreatment: null (no button in this section).',
      ].join('\n') },
      { type: 'text', text: `VISUAL SYSTEM (fixed for the whole landing):\n${visualBlock(vs)}\n\nCOPY BLOCKS:\n${JSON.stringify(copy)}\n\nPRODUCT: ${inputs.productName}` },
      { type: 'text', text: approvedSummary(s, id) },
    ],
  })
  console.info(`[landing-v2] brief ${s.id}/${id} por ${model}`)
  return {
    composition: sinComillas(output.composition),
    focalPoint: sinComillas(output.focalPoint),
    productPlacement: sinComillas(output.productPlacement),
    usesPerson: output.usesPerson && !!vs.talentUrl,
    background: sinComillas(output.background),
    typographyTreatment: sinComillas(output.typographyTreatment),
    ctaTreatment: spec.cta && output.ctaTreatment ? sinComillas(output.ctaTreatment) : null,
  }
}

/** Las líneas EXACTAS que se pueden dibujar. Lista blanca armada por el código. */
export function renderTexts(id: SectionId, copy: SectionCopy, inputs: LandingInputs): string[] {
  const q = (role: string, t: string | null | undefined) => (t?.trim() ? [`${role}: "${t.trim()}"`] : [])
  const lines = [
    ...q('HEADLINE', copy.headline),
    ...q('SUBHEADLINE', copy.subheadline),
    ...copy.items.flatMap((it, i) => [
      ...q(`ITEM ${i + 1}${it.group ? ` [column ${it.group}]` : ''} TITLE`, it.title),
      ...q(`ITEM ${i + 1} TEXT`, it.text),
    ]),
  ]
  if (id === 'offer_pricing' || id === 'final_reoffer') {
    inputs.pricing.packs.forEach((p, i) => lines.push(`PACK ${i + 1}: ${packLines(p).map((l) => `"${l}"`).join(' · ')}`))
  }
  lines.push(...q('CLOSING LINE', copy.closingLine), ...q('CTA BUTTON', copy.cta))
  return lines
}

export function buildImagePrompt(o: {
  id: SectionId; copy: SectionCopy; brief: RenderBrief; vs: VisualSystem; inputs: LandingInputs
  refs: { talent: number | null; proof: number[]; style: number | null }
}): string {
  const spec = SECTION_BY_ID[o.id]
  return [
    `Design ONE finished, premium mobile landing-page section as a single portrait 9:16 image. Section: ${spec.en}. It must feel professionally art-directed — never an infographic, slide, dashboard, poster, info sheet or generic AI template. One dominant idea, clear focal point, generous margins and negative space, every text legible on a phone without zoom, nothing important near the edges, nothing cropped.`,
    `Image 1 is the REAL product (${o.vs.productForm}): reproduce it exactly — shape, proportions, colors and every detail of its label. Never redraw, restyle, duplicate or substitute it.`,
    o.refs.talent ? `Image ${o.refs.talent} is the fixed person of this campaign: same face, skin tone, hair and build. Show the face; never a faceless body crop.` : 'Do not show any person.',
    o.refs.proof.length ? `Images ${o.refs.proof.join(', ')} are the user's REAL before/after photos: place them as they are, without altering them.` : '',
    o.refs.style ? `Image ${o.refs.style} is an already approved section of THIS landing: match its typography, palette, lighting and graphic resources exactly. Do NOT copy its layout or composition.` : '',
    `VISUAL SYSTEM:\n${visualBlock(o.vs)}`,
    `COMPOSITION: ${o.brief.composition}\nFocal point: ${o.brief.focalPoint}\nProduct: ${o.brief.productPlacement}\nBackground: ${o.brief.background}\nTypography: ${o.brief.typographyTreatment}${o.brief.ctaTreatment ? `\nCTA: ${o.brief.ctaTreatment}` : ''}`,
    `TEXT — render EXACTLY these texts, verbatim and in Spanish, and NO other words, letters or numbers anywhere (except what is printed on the product's own label). Role names before the colon are NOT text to render:\n${renderTexts(o.id, o.copy, o.inputs).join('\n')}`,
    spec.cta ? 'Exactly one CTA button. Price containers, tags, seals and labels must not compete with it.' : 'No buttons in this section.',
  ].filter(Boolean).join('\n\n')
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

/** La primera sección aprobada en el orden del esqueleto: fija el sistema visual de las siguientes. */
function styleAnchor(s: LandingSession, id: SectionId): string | null {
  const first = SECTION_IDS.find((x) => x !== id && s.sections[x]?.approved)
  return first ? latestVersion(s, first)?.imageUrl ?? null : null
}

export async function renderSection(s: LandingSession, id: SectionId, copy: SectionCopy, brief: RenderBrief): Promise<string> {
  const { inputs, vs } = requireInputs(s)
  const parts: Part[] = []
  const push = async (url: string) => {
    const { data, mimeType } = await fetchAsBase64(url)
    parts.push({ inlineData: { data, mimeType } })
    return parts.length
  }
  await push(s.productCanonicalUrl ?? inputs.productImageUrl)
  const talent = brief.usesPerson && vs.talentUrl ? await push(vs.talentUrl) : null
  const proof: number[] = []
  if (id === 'before_after') for (const u of inputs.proofImageUrls.slice(0, 2)) proof.push(await push(u))
  const anchorUrl = styleAnchor(s, id)
  const style = anchorUrl ? await push(anchorUrl) : null
  parts.push({ text: buildImagePrompt({ id, copy, brief, vs, inputs, refs: { talent, proof, style } }) })
  const b64 = await generateImage(parts, 3, { aspectRatio: '9:16', respaldo: NANO_BANANA_PRO })
  if (!b64) throw new UserError('No se pudo generar la imagen de la sección. Inténtalo de nuevo.')
  return b64
}

/** Copy (si falta) → brief → render de UNA sección. Cobra 1 crédito. */
export async function generateSection(s: LandingSession, id: SectionId, ctx: Ctx, opts: { copy?: SectionCopy } = {}): Promise<LandingSession> {
  requireInputs(s)
  const sup = sectionSupport(s, id)
  if (!sup.ok) throw new SupportError(sup.reason!, sup.suggest)
  const kind = sectionKind(id)
  await gate(s.id, kind, ctx)
  const copy = opts.copy ?? s.copies[id] ?? await generateSectionCopy(s, id)
  const withCopy: LandingSession = { ...s, copies: { ...s.copies, [id]: copy } }
  const brief = await buildRenderBrief(withCopy, id, copy)
  const b64 = await renderSection(withCopy, id, copy, brief)
  const next = await finalize(withCopy, id, b64, null)
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
