// NÚCLEO del generador de anuncios: una función por paso del pipeline.
//
// Lo llaman las rutas del wizard (`app/api/generador-anuncios/sessions/[id]/*`) y las tools del
// chat (`agent.ts`). Las dos entradas son delgadas a propósito: toda regla de negocio —prompts,
// verificación del copy, cuota y créditos, qué `step` escribe cada paso— vive acá, así el chat no
// puede generar sin cobrar ni saltarse un candado que el wizard sí tiene.
//
// TEXTO por el AI SDK (`lib/ai-sdk.ts`, el par del hub). La IMAGEN sigue en `editImage`/
// `refineImage` → `generateImage` (respaldo por pieza, `SPANISH_RULE` y los tres candados del
// refine): no se toca.
import { reasoning, structured } from '@/lib/ai-sdk'
import { aspectRatioOf } from '@/lib/aspect'
import type { CreditOwner } from '@/lib/credits'
import { updateSession } from '@/lib/db'
import { editImage, refineImage, STEP5_PROMPT, SYSTEM_PROMPT } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import {
  ConfirmedCopySchema, CopyVersionsSchema, ProductScanSchema, ReferenceAnalysisSchema, normalizeBrandColors,
  type ConfirmedCopy, type CopyVersions, type ProductScan, type ReferenceAnalysis, type SessionResponse,
} from '@/lib/types'
import { FIDELIDAD_MIN, scaffoldFidelity, transcribeLaReferencia } from './copy-check'
import { researchMarket } from './research'
import { CopyVersionsOut, MarketResearchSchema, ProductScanOut, ReferenceAnalysisOut, type MarketResearch } from './schemas'

/** Quién paga. El `owner` se resuelve ANTES de abrir un stream: adentro las cookies ya no son confiables. */
export interface Ctx { userId: string; owner: CreditOwner | null }
export interface Img { bytes: Buffer; mimeType: string }

/** Un error que se le muestra al usuario tal cual, con su status HTTP. */
export class AnunciosError extends Error {
  constructor(message: string, readonly status = 400, readonly body: Record<string, unknown> = { error: message }) { super(message) }
}

const MAX_IMG = 10 * 1024 * 1024

/** Cuota + créditos ANTES de generar. Tira el mismo cuerpo/status que devolvía la ruta. */
export async function gate(sessionId: string, kind: string, ctx: Ctx): Promise<number | null> {
  const q = await checkGenQuota(sessionId, kind, ctx.owner)
  if (q.blocked) {
    const body = (await q.blocked.json().catch(() => ({}))) as Record<string, unknown>
    throw new AnunciosError(typeof body.error === 'string' ? body.error : 'Llegaste al límite.', q.blocked.status, body)
  }
  return q.regensLeft
}
const record = (sessionId: string, kind: string, ctx: Ctx) => recordGenQuota(sessionId, kind, ctx.userId)

const file = (img: Img) => ({ type: 'file' as const, data: img.bytes, mediaType: img.mimeType })
const text = (lines: (string | false | null | undefined)[]) => ({ type: 'text' as const, text: lines.filter((l) => l !== false && l != null).join('\n') })

/** La investigación guardada, o null si la sesión es anterior a ella o vino malformada. */
export function researchOf(s: SessionResponse): MarketResearch | null {
  const p = MarketResearchSchema.safeParse(s.market_research)
  return p.success ? p.data : null
}

// ─── Paso 1: referencia ──────────────────────────────────────────────────────

export async function analyzeReference(s: SessionResponse, ref: Img, precision: string, ctx: Ctx): Promise<{ analysis: ReferenceAnalysis; referenceUrl: string }> {
  if (ref.bytes.length > MAX_IMG) throw new AnunciosError('La imagen pesa más de 10 MB')
  await gate(s.id, 'anuncios-reference', ctx)
  const [referenceUrl, { output, model }] = await Promise.all([
    uploadToStorage(s.id, ref.bytes, ref.mimeType, 'reference'),
    // El análisis es la base de TODO lo que sigue, así que ahí es donde más cuesta un modelo
    // chico: el de respaldo leyó una referencia 335x597 (vertical) como "16:9" y devolvió
    // style/typography de una línea ("moderno", "estilo moderno y limpio"). Por eso el primario
    // del hub es Gemini.
    structured({
      name: 'reference_analysis', schema: ReferenceAnalysisOut, system: SYSTEM_PROMPT,
      content: [file(ref), text([
        'Analyze this reference ad. Return the complete structured analysis including all sceneElements.',
        // Sin exigir el MECANISMO, este campo sale como una etiqueta de una palabra e inservible
        // — es lo que ya pasó con `style` ("moderno") y `typography` ("estilo moderno y limpio").
        // ⚠️ La tipografía es lo que el anuncio nuevo tiene que CONSERVAR (WHAT STAYS de STEP5):
        // solo puede cambiarle el color. Pero el instructivo se arma con texto puro, así que lo
        // único que sabe de ella es este campo — y sin exigir el detalle sale como una etiqueta
        // inservible ("estilo moderno y limpio", medido). Mismo tratamiento que `creativeConcept`.
        'typography: describe the type so it can be REPRODUCED, block by block: typeface character',
        '(geometric sans, grotesque, high-contrast serif, condensed, script…), weight, case,',
        'letter-spacing, alignment, the size hierarchy between blocks, and any effect on the letters',
        '(outline, drop shadow, highlight box, angled or curved baseline, italics, underline).',
        'A one-word label like "modern" or "clean" is useless here — name what is actually on screen.',
        'creativeConcept: name the creative concept the ad IS and describe how it is built.',
        'Common concepts: before/after, testimonial, product demonstration, side-by-side comparison',
        'against an alternative, problem→solution, benefit list, offer/price, social-media screenshot,',
        'unboxing, expert endorsement. If none fits, name the one you actually see.',
        'If it is a BEFORE/AFTER, this is mandatory: state which half is which, where each sits, what',
        'label each carries, and what each side claims — the "before" half states the problem and the',
        '"after" half states the result, and they are NOT interchangeable.',
        'One or two sentences. Never a bare one-word label.',
        // El campo existe para poder RE-APUNTAR esos marcadores a la zona del producto nuevo,
        // así que hay que nombrarlos uno por uno: "hay flechas" no dice cuál mover ni adónde.
        'bodyFocus + attentionMarkers: if the ad directs the viewer\'s attention to a specific body',
        'zone — arrows or lines pointing at it, a circle or highlight over it, a before/after pair',
        'contrasting it, a close-up of it — set bodyFocus to that zone and list every such marker',
        'in attentionMarkers with what it is and where it sits. If the ad points at no body zone,',
        'bodyFocus is null and attentionMarkers is null. Never guess a zone.',
        precision && 'Ajuste pedido: ' + precision,
      ])],
    }),
  ])
  // Queda escrito QUÉ modelo leyó la referencia: un análisis malo del respaldo era indistinguible
  // de uno malo del primario (doctrina, "nada registra qué modelo escribió un análisis").
  console.log(`[anuncios] ${s.id}: reference_analysis por ${model}`)
  const analysis = ReferenceAnalysisSchema.parse(output)
  // Una referencia nueva invalida el copy escrito para la anterior.
  await updateSession(s.id, { step: 1, reference_url: referenceUrl, reference_analysis: analysis, copy_versions: null, confirmed_copy: null })
  await record(s.id, 'anuncios-reference', ctx)
  return { analysis, referenceUrl }
}

// ─── Paso 2: producto (+ investigación de mercado, en paralelo) ───────────────

export interface ProductInput {
  product: Img
  logo: Img | null
  productName: string
  whatItIs: string | null
  whatItDoes: string
  targetAudience: string
  precision?: string
}

export async function analyzeProduct(s: SessionResponse, i: ProductInput, ctx: Ctx): Promise<{ scan: ProductScan; productUrl: string; logoUrl: string | null; research: MarketResearch | null }> {
  if (!s.reference_analysis) throw new AnunciosError('Completa el paso anterior primero', 409)
  if (!i.productName || !i.whatItDoes || !i.targetAudience) throw new AnunciosError('Faltan datos del producto')
  if (i.product.bytes.length > MAX_IMG) throw new AnunciosError('La foto del producto pesa más de 10 MB')
  await gate(s.id, 'anuncios-product', ctx)
  const refAnalysis = ReferenceAnalysisSchema.parse(s.reference_analysis)

  const [productUrl, logoUrl, { output, model }, research] = await Promise.all([
    uploadToStorage(s.id, i.product.bytes, i.product.mimeType, 'product'),
    i.logo ? uploadToStorage(s.id, i.logo.bytes, i.logo.mimeType, 'logo') : null,
    structured({
      name: 'product_scan', schema: ProductScanOut, system: SYSTEM_PROMPT,
      content: [file(i.product), ...(i.logo ? [file(i.logo)] : []), text([
        `Reference ad style: ${refAnalysis.style}`,
        `Reference composition: ${refAnalysis.composition.join(', ')}`,
        `Product name: ${i.productName}`,
        `What it is: ${i.whatItIs || 'not provided'}`,
        `What it does: ${i.whatItDoes}`,
        `Target audience: ${i.targetAudience}`,
        // ⚠️ El logo entra como imagen 2 y el scan lo confundía con el producto: medido en la
        // sesión 4c8f6c8b, `brandingDescription` salió "LUMINA - ciencia que ilumina tu piel",
        // que es el lockup del LOGO, no la etiqueta del frasco. Ese string viaja a STEP5 como
        // `Branding:` y ahí se convierte en algo a renderizar → el logo entero flotando al medio.
        i.logo
          ? 'Image 1 is the PRODUCT. Image 2 is the brand LOGO — a separate asset, not part of the product. Describe ONLY image 1: never fold the logo lockup, its tagline or its layout into productDescription or brandingDescription.'
          : 'No logo provided.',
        'brandingDescription = only the text and graphics actually printed on the product in image 1 (label, packaging). If the product carries no readable text, return null.',
        // ÚNICA excepción a la regla de arriba: los COLORES sí se leen del logo. La regla existe
        // para que el lockup y su tagline no se conviertan en texto a renderizar; una paleta no
        // se renderiza como texto, y el logo es donde la marca elige sus colores.
        'brandColors = the brand palette, as hex codes ordered by prominence: the dominant colors'
          + (i.logo ? ' of the packaging in image 1 AND of the logo in image 2' : ' of the packaging in image 1')
          + '. Read the colors off the artwork, never off the photo background, the surface it rests on or the lighting.'
          + ' Return at most 4. If the product has no deliberate palette (plain white, unbranded, unreadable), return null — do not invent one.',
        // Antes este campo era opcional en el schema de Gemini; ahora viaja en el `required` (un
        // solo schema para los dos modelos), así que la salida legal se dice acá, junto al campo.
        'styleCompatibilityNote = only if the product clashes with the reference style in a way the user should know. Otherwise return null.',
        i.precision && `Ajuste pedido: ${i.precision}`,
        'Analyze the product image. Return ProductScan JSON.',
      ])],
    }),
    // Corre junto al scan y nunca tira: ver `research.ts`.
    researchMarket(i),
  ])
  console.log(`[anuncios] ${s.id}: product_scan por ${model}`)

  const scan = ProductScanSchema.parse(output)
  // La paleta entra al sistema acá: se limpia en la frontera, para que lo guardado y lo que ve
  // el usuario sean hex de verdad. Ver `normalizeBrandColors` — por qué no puede ir en el schema.
  scan.brandColors = normalizeBrandColors(scan.brandColors)

  await updateSession(s.id, {
    step: 2,
    product_url: productUrl,
    logo_url: logoUrl,
    product_scan: scan,
    product_name: i.productName,
    // ponytail: opcional en el servidor a propósito — el formulario lo exige, pero meterlo en el
    // 400 de arriba rompería cualquier cliente/sesión anterior a este campo.
    what_it_is: i.whatItIs || null,
    what_it_does: i.whatItDoes,
    target_audience: i.targetAudience,
    market_research: research,
    // Un producto nuevo invalida el copy escrito para el anterior.
    copy_versions: null,
    confirmed_copy: null,
  })
  await record(s.id, 'anuncios-product', ctx)
  return { scan, productUrl, logoUrl, research }
}

// ─── Paso 3: copy A/B ────────────────────────────────────────────────────────

/** El bloque de mercado del prompt de copy. Vacío si no hay investigación: el copy se escribe igual. */
function marketBlock(r: MarketResearch | null): string[] {
  if (!r) return []
  return [
    'MARKET RESEARCH — how this niche talks and what it searches for (vocabulary, not quotes from real people):',
    `Niche: ${r.niche}`,
    `Search keywords: ${r.keywords.join(' | ')}`,
    `How buyers name the problem: ${r.pains.join(' | ')}`,
    `What they hope for: ${r.desires.join(' | ')}`,
    '',
  ]
}

export function copyPrompt(s: SessionResponse, refAnalysis: ReferenceAnalysis, productScan: ProductScan, research: MarketResearch | null, precision: string): string {
  return [
    `Reference ad visual layout (NOT copy slots): ${JSON.stringify(refAnalysis.composition)}`,
    `Creative concept: ${refAnalysis.creativeConcept ?? 'not identified'}`,
    `Persuasive logic: ${refAnalysis.persuasiveLogic}`,
    `Product: ${s.product_name} — ${s.what_it_does}`,
    `What the product is: ${s.what_it_is ?? 'not provided'}`,
    `Target audience: ${s.target_audience}`,
    `Product description: ${productScan.productDescription}`,
    `Product label text: ${productScan.brandingDescription ?? 'not provided'}`,
    '',
    ...marketBlock(research),
    'The first image is the reference ad. Read the words actually rendered on it — headline,',
    'subhead, badge, CTA, any burned-in text. Those visible text blocks, in reading order, are',
    'the copy slots. One element per text block, and NOTHING else: never emit an element for a',
    'person, a product shot, a prop or any other visual — those are not copy. If the reference',
    'has a single text block, return a single element.',
    'A text block is one continuous phrase: line breaks INSIDE a phrase do not split it into',
    'separate blocks. Name each element by its persuasive role (headline, subhead, badge, CTA…),',
    'never by position.',
    '',
    'The creative concept above is the mechanism the ad IS, and both versions keep it. If it is',
    'a before/after, the slots are NOT interchangeable: the slot on the "before" side states the',
    'problem and the one on the "after" side states the result. Never swap them and never let',
    'both sides say the same thing.',
    '',
    'AUDIENCE VOICE — applies to BOTH versions:',
    ...(research ? [
      '  The market research above is how these buyers name their problem and what they look for.',
      '  Use that vocabulary; never paste a list of keywords into a slot, never string several terms',
      '  together, never drop in text that does not agree grammatically with the sentence around it.',
      '  A term that maps to no slot is simply not used.',
      '  The research is vocabulary, not evidence.',
    ] : []),
    '  Never invent reviews, numbers, ratings, guarantees or claims.',
    '',
    'Generate two copy versions as structured element arrays.',
    '',
    'VERSION A — new copy, inspired by the reference:',
    '  Keep the creative concept, the number of slots, their order, and each slot\'s persuasive',
    '  role and length register. Everything else is yours: write NEW copy for this product and',
    '  this audience, and the sentence structure may change. This is NOT a template — do not',
    '  reuse the reference wording, which would advertise the other brand.',
    research && '  The market research feeds the writing as raw material: what hurts, how they name it, what they want.',
    '  Write it in neutral Peruvian Spanish: tuteo, never voseo (sos, vos, tenés, querés) and no',
    '  regionalism from the reference (che, güey, parcero, chévere, vosotros…).',
    '  This version is written from scratch, so the reference\'s own accent must not survive in it.',
    '  `template` is null for every element of version A.',
    '',
    'VERSION B — fill in the blank, built from the reference copy:',
    '  Three explicit stages per slot, in this order:',
    '    1. Transcribe the slot\'s literal text as rendered in the reference image, and return',
    '       that transcription in the element\'s `source` field. It is the INPUT to stage 2 —',
    '       never the answer to stage 3.',
    '    2. Turn it into a template: bracket ONLY the words carrying data specific to the other',
    '       product, brand, promise or problem. Everything else is scaffolding and stays put.',
    '       "Grasa rebelde que no se va" becomes "[problema común] que no se va".',
    '       Bracket the WHOLE piece of data, never half of it, and never swallow the scaffolding',
    '       around it. Return this string in the element\'s `template` field.',
    '    3. Fill each bracket with THIS product\'s data, written in the audience\'s vocabulary and',
    '       agreeing grammatically with the sentence around it: "Flacidez que no se va".',
    '  The scaffolding is copied LITERALLY into the final text. ONE exception: if it carries voseo',
    '  or expressions that are not Peruvian Spanish (sos, vos, tenés, querés, che, güey, parcero,',
    '  chévere, vosotros…), rewrite those words into neutral Peruvian Spanish — and nothing else.',
    '  Scaffolding that is already neutral does not change at all.',
    '  A slot with no product-specific data (a bare CTA like "COMPRAR AHORA") has itself as its',
    '  template and is copied unchanged.',
    '  ⚠️ A slot that is ENTIRELY data — a list of the other product\'s problems, a headline that',
    '  is all promise — becomes a single bracket, and that is correct. But then stage 3 is the',
    '  whole job: it MUST be written from THIS product. Returning the reference\'s own words there',
    '  is the worst outcome of all, because it prints the other brand\'s ad for this user. If the',
    '  final text of a slot equals its `source`, version B did not do its job.',
    '',
    'RULES:',
    '  - Both versions have the SAME number of elements, in the SAME order, with the SAME names.',
    '  - One element per text block of the reference. Never an element for a visual.',
    '  - Version A never reuses the reference wording; version B never abandons its scaffolding.',
    precision && `\nAjuste pedido: ${precision}`,
  ].filter((l) => l != null).join('\n')
}

/**
 * El modelo redacta, el código verifica. Devuelve la corrección que se le manda en el reintento,
 * o null si el copy pasa. Reemplaza al `.min(1)` y al `.refine` de `CopyVersionsSchema`, que por el
 * AI SDK serían un error y no un reintento.
 */
export function copyCorrection(c: CopyVersions): string | null {
  if (!c.versionA.length || !c.versionB.length) return 'Both versions must have at least one element: one per visible text block of the reference.'
  if (c.versionA.length !== c.versionB.length) return 'Version A and version B must have the SAME number of elements, in the same order, with the same names.'
  const calcados = c.versionB.filter(transcribeLaReferencia).map((e) => e.element)
  if (calcados.length)
    return `Version B returned the reference's own words in: ${calcados.join(', ')}. That prints the other brand's ad. Redo stage 3 for those slots: fill the brackets with THIS product's data.`
  return null
}

export async function generateCopy(s: SessionResponse, precision: string, ctx: Ctx): Promise<{ copyVersions: CopyVersions; research: MarketResearch | null }> {
  if (s.step < 2 || !s.reference_url) throw new AnunciosError('Completa los pasos anteriores primero', 409)
  if (!s.product_name || !s.what_it_does || !s.target_audience) throw new AnunciosError('Faltan datos del producto', 409)
  await gate(s.id, 'anuncios-copy', ctx)

  const refAnalysis = ReferenceAnalysisSchema.parse(s.reference_analysis)
  const productScan = ProductScanSchema.parse(s.product_scan)
  // Una sesión anterior a la investigación (o una en la que falló) la calcula acá, junto con la
  // descarga de la referencia: sigue sin agregar una espera propia.
  const guardada = researchOf(s)
  const [ref, research] = await Promise.all([
    fetchAsBase64(s.reference_url),
    guardada ?? researchMarket({ productName: s.product_name, whatItIs: s.what_it_is, whatItDoes: s.what_it_does, targetAudience: s.target_audience }),
  ])

  const { output, model } = await structured({
    name: 'copy_versions', schema: CopyVersionsOut, system: SYSTEM_PROMPT,
    content: [
      { type: 'file', data: Buffer.from(ref.data, 'base64'), mediaType: ref.mimeType },
      { type: 'text', text: copyPrompt(s, refAnalysis, productScan, research, precision) },
    ],
    validate: copyCorrection,
    intentos: 3,
  })
  // Tras 3 intentos `structured` devuelve lo último: si B sigue calcando a la otra marca, no se
  // le ofrece al usuario (antes lo cortaba el `.refine` del schema, que acá sigue parseando).
  const parsed = CopyVersionsSchema.safeParse(output)
  if (!parsed.success) {
    console.error(`[anuncios] ${s.id}: copy inválido tras los reintentos (${model})`, parsed.error.issues[0]?.message)
    throw new AnunciosError('No se pudo generar el copy. Inténtalo de nuevo.', 500)
  }
  const copyVersions = parsed.data

  // Si el andamiaje de la plantilla no sobrevive en el texto final, B no templó: redactó — y
  // entonces las dos versiones son lo mismo con otro nombre.
  // ponytail: solo se loguea. Acá no hay piso determinista al que caer (a diferencia de video-ads,
  // no tenemos el valor del hueco por separado) y el fallo es visible en pantalla, no un cobro
  // perdido; si se mide que pasa seguido, el upgrade es meterlo en `copyCorrection`.
  for (const el of copyVersions.versionB) {
    if (!el.template) { console.warn(`[anuncios] ${s.id}: "${el.element}" volvió sin plantilla`); continue }
    const fidelidad = scaffoldFidelity(el.template, el.text)
    if (fidelidad !== null && fidelidad < FIDELIDAD_MIN)
      console.warn(`[anuncios] ${s.id}: "${el.element}" perdió el andamiaje (${Math.round(fidelidad * 100)}%) — "${el.template}" → "${el.text}"`)
  }
  await updateSession(s.id, { step: 3, copy_versions: copyVersions, confirmed_copy: null, ...(guardada ? {} : { market_research: research }) })
  await record(s.id, 'anuncios-copy', ctx)
  return { copyVersions, research }
}

// ─── Paso 4: confirmar ───────────────────────────────────────────────────────

export async function confirmCopy(s: SessionResponse, version: 'A' | 'B'): Promise<ConfirmedCopy> {
  if (s.step < 3 || !s.copy_versions) throw new AnunciosError('Completa los pasos anteriores primero', 409)
  const copyVersions = CopyVersionsSchema.parse(s.copy_versions)
  const confirmedCopy = ConfirmedCopySchema.parse({ version, breakdown: version === 'A' ? copyVersions.versionA : copyVersions.versionB })
  await updateSession(s.id, { step: 4, confirmed_copy: confirmedCopy })
  return confirmedCopy
}

// ─── Paso 5: anuncio ─────────────────────────────────────────────────────────

export type AdStage = 'loading_images' | 'building_prompt' | 'generating' | 'uploading'

/**
 * `gated`: la ruta SSE hace el `gate` ANTES de abrir el stream (para poder responder un 429 de
 * verdad) y lo pasa acá; el chat no lo pasa y el gate corre adentro.
 */
export async function generateAd(
  s: SessionResponse,
  opts: { precision?: string; onStage?: (stage: AdStage) => void; gated?: { regensLeft: number | null } },
  ctx: Ctx,
): Promise<{ imageUrl: string; regensLeft: number | null }> {
  if (!s.reference_url || !s.product_url || !s.confirmed_copy) throw new AnunciosError('Falta elegir el copy antes de generar el anuncio', 409)
  const regensLeft = opts.gated ? opts.gated.regensLeft : await gate(s.id, 'anuncios-image', ctx)

  const refAnalysis = ReferenceAnalysisSchema.parse(s.reference_analysis)
  const productScan = ProductScanSchema.parse(s.product_scan)
  // Otra vez acá, y no solo al escribir: las sesiones guardadas ANTES de este arreglo
  // traen la paleta sucia, y este es el único sitio del hub que la convierte en prompt.
  productScan.brandColors = normalizeBrandColors(productScan.brandColors)
  const confirmedCopy = ConfirmedCopySchema.parse(s.confirmed_copy)

  // Imágenes ANTES del prompt — el ratio real sale de los bytes de la referencia, no de
  // `format.ratio` (que el análisis puede leer al revés), y tiene que entrar al instructivo además
  // de a la config del modelo. `Section5Generate` tiene las etapas en este mismo orden.
  opts.onStage?.('loading_images')
  const [ref, product, logo] = await Promise.all([
    fetchAsBase64(s.reference_url),
    fetchAsBase64(s.product_url),
    s.logo_url ? fetchAsBase64(s.logo_url) : Promise.resolve(null),
  ])
  const aspectRatio = await aspectRatioOf(Buffer.from(ref.data, 'base64'))

  opts.onStage?.('building_prompt')
  const contexto = [
    `=== REFERENCE ANALYSIS ===`,
    `Format: ${aspectRatio ?? refAnalysis.format.ratio} — ${refAnalysis.format.platform}`,
    `Physical position: ${refAnalysis.physicalPosition}`,
    `Layout: ${refAnalysis.layoutDescription}`,
    `Composition: ${refAnalysis.composition.join(' | ')}`,
    `Style: ${refAnalysis.style}`,
    `Colorimetry: ${refAnalysis.colorimetry}`,
    `Typography: ${refAnalysis.typography}`,
    `Creative concept: ${refAnalysis.creativeConcept ?? 'not identified'}`,
    `Persuasive logic: ${refAnalysis.persuasiveLogic}`,
    `Scene elements:`,
    `  People: ${JSON.stringify(refAnalysis.sceneElements.people)}`,
    `  Props: ${JSON.stringify(refAnalysis.sceneElements.props)}`,
    `  Brand elements: ${JSON.stringify(refAnalysis.sceneElements.brandElements)}`,
    `  Setting: ${refAnalysis.sceneElements.setting}`,
    `Body zone the reference points at: ${refAnalysis.bodyFocus ?? 'none — the ad points at no body zone'}`,
    `Attention markers: ${refAnalysis.attentionMarkers?.length ? refAnalysis.attentionMarkers.join(' | ') : 'none'}`,
    ``,
    `=== PRODUCT INFO ===`,
    `Product name: ${s.product_name}`,
    `What it is: ${s.what_it_is ?? 'not provided'}`,
    `What it does: ${s.what_it_does}`,
    `Target audience: ${s.target_audience}`,
    `Product description: ${productScan.productDescription}`,
    `Branding: ${productScan.brandingDescription ?? 'not provided'}`,
    `Brand colors: ${productScan.brandColors?.length ? productScan.brandColors.join(', ') : 'not detected — keep the reference palette'}`,
    `Logo provided: ${s.logo_url ? 'YES — Image 3 is the brand logo' : 'NO'}`,
    ``,
    `=== APPROVED COPY ===`,
    `Version ${confirmedCopy.version}:`,
    ...confirmedCopy.breakdown.map((e) => `  ${e.element}: "${e.text}"`),
  ].join('\n')

  let editInstruction = (await reasoning({ name: 'step5', system: STEP5_PROMPT, prompt: contexto })).text
  if (opts.precision) editInstruction += `\nAjuste solicitado por el usuario (priorízalo): ${opts.precision}`

  opts.onStage?.('generating')
  const b64 = await editImage(ref.data, ref.mimeType, product.data, product.mimeType, logo?.data ?? null, logo?.mimeType ?? null, editInstruction, aspectRatio)
  if (!b64) throw new AnunciosError('La generación volvió vacía. Inténtalo de nuevo.', 422)

  opts.onStage?.('uploading')
  const imageUrl = await uploadToStorage(s.id, Buffer.from(b64, 'base64'), 'image/png', 'result')
  await updateSession(s.id, { step: 5, edit_instruction: editInstruction, image_url: imageUrl })
  await record(s.id, 'anuncios-image', ctx)
  return { imageUrl, regensLeft }
}

/** Regenera sobre el anuncio ya hecho. `refineImage` trae sus tres candados (identidad, zona+paleta, tipografía). */
export async function refineAd(s: SessionResponse, feedback: string, ctx: Ctx): Promise<{ imageUrl: string; regensLeft: number | null }> {
  if (!s.image_url || !s.reference_url || !s.product_url) throw new AnunciosError('Todavía no hay una imagen que ajustar', 409)
  if (feedback.length > 1000) throw new AnunciosError('feedback max 1000 chars')
  const regensLeft = await gate(s.id, 'anuncios-image', ctx)

  const [ref, product, logo, result] = await Promise.all([
    fetchAsBase64(s.reference_url),
    fetchAsBase64(s.product_url),
    s.logo_url ? fetchAsBase64(s.logo_url) : Promise.resolve(null),
    fetchAsBase64(s.image_url),
  ])
  // El ratio se re-mide de la REFERENCIA en cada refine: si no, un ad que ya salió con el
  // formato equivocado lo arrastra en cada regeneración.
  const aspectRatio = await aspectRatioOf(Buffer.from(ref.data, 'base64'))
  const b64 = await refineImage(
    ref.data, ref.mimeType, product.data, product.mimeType,
    logo?.data ?? null, logo?.mimeType ?? null,
    result.data, result.mimeType, feedback, aspectRatio,
  )
  if (!b64) throw new AnunciosError('La regeneración volvió vacía. Inténtalo de nuevo.', 422)

  const imageUrl = await uploadToStorage(s.id, Buffer.from(b64, 'base64'), 'image/png', `result-${Date.now()}`)
  await updateSession(s.id, { image_url: imageUrl })
  await record(s.id, 'anuncios-image', ctx)
  return { imageUrl, regensLeft }
}
