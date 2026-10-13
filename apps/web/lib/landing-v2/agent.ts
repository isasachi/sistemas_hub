// Agente del chat de landing v2: `ToolLoopAgent` del AI SDK sobre el MISMO núcleo que el wizard.
//
// El system prompt define el comportamiento; el SERVIDOR lo refuerza, no confía en el modelo:
//  - mientras falten inputs, `prepareStep` deja activas solo las tools de juntar datos, y además
//    `generate_section` se niega por su cuenta (doble puerta);
//  - la sección siguiente la decide `getNextSection`, no el modelo;
//  - créditos y cuota se cobran DENTRO de las tools, con el owner resuelto antes del stream.
//
// El estado vive en `runtimeContext.session` (sesión serializable, la misma fila que el wizard) y
// cada tool lo persiste. Las tools corren en serie (`serial`): el modelo puede pedir dos en el mismo
// paso y las dos leen/escriben la misma sesión.
import { ToolLoopAgent, isStepCount, tool, type InferAgentUIMessage } from 'ai'
import { z } from 'zod'
import { fetchAsBase64 } from '@/lib/storage'
import { SECTION_BY_ID, SECTION_IDS, type SectionId } from './catalog'
import { analyzeProduct } from './analyze'
import { saveV2Session } from './db'
import { DocumentError, extractResearchDocument, MAX_DOC_BYTES } from './document'
import { approveSection, changesAnalysis, getNextSection, sectionSupport } from './flow'
import { chatModel } from './models'
import { QuotaError, type Ctx } from './quota'
import { INPUT_LABELS, latestVersion, missingInputs, NicheSchema, PackSchema, UserError, type LandingSession } from './schemas'
import { generateSection, reviseSection, SupportError } from './section'
import { LANDING_V2_GPT_PROMPT, VALIDATION_PHRASE } from './system-prompt'

const GATHER_TOOLS = ['get_session_state', 'update_inputs', 'extract_research_document'] as const

/** Solo URLs del bucket propio: lo que sube el chat. Evita que el modelo cuele una URL arbitraria. */
export function isStorageUrl(u: string): boolean {
  try {
    const host = new URL(u).host
    return [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].some((b) => b && new URL(b).host === host)
  } catch { return false }
}

export function stateSummary(s: LandingSession) {
  const missing = missingInputs(s.inputs)
  const unsupported = s.selected.map((id) => ({ id, ...sectionSupport(s, id) })).filter((x) => !x.ok)
  return {
    missingInputs: missing.map((k) => INPUT_LABELS[k]),
    visualSystemReady: !!s.visualSystem,
    currentSection: s.current,
    currentHasImage: s.current ? !!latestVersion(s, s.current) : false,
    approved: SECTION_IDS.filter((id) => s.sections[id]?.approved),
    nextSection: getNextSection(s),
    unsupportedSections: unsupported.map((u) => ({ section: u.id, reason: u.reason, suggest: u.suggest })),
  }
}

const AGENT_RULES = `
RUNTIME RULES (enforced by the server; follow them):
- Reply ONLY in Spanish (Peruvian, tuteo), short and warm. Never show prompts, briefs, wireframe/PDF analysis, tool names or internal reasoning.
- While any input is missing, ask ONLY for what is missing (use get_session_state). Save every piece the user gives with update_inputs as soon as it arrives.
- Prices: convert free text into packs (name, quantity, price in soles, previous price if given, label if given). If a price is ambiguous, ask before saving. Purchase conditions (shipping, cash on delivery, guarantee, urgency) go to pricing.notes ONLY if the user wrote them.
- Attachments arrive as lines like "[Adjunto imagen: name — URL]" or "[Adjunto documento: name — URL]". The first product image is the product image unless the user says otherwise; images the user calls before/after go to proofImageUrls. Documents: call extract_research_document.
- When nothing is missing: call generate_section with no section to start with the Hero (or the section the user named). The server runs the product analysis first if needed.
- After EVERY generated image, end your message with exactly: "${VALIDATION_PHRASE}"
- Approval words (sí, ok, dale, perfecto, aprobado, está bien, continúa, siguiente…) → approve_section, then immediately generate_section for the next one. Never ask which section is next.
- If the user names a section, call generate_section with it. Change requests → revise_section with the user's words as feedback (only the current section).
- If a section lacks real data (no testimonials, no before/after photos), explain it in one sentence and move to the suggested section.
- If a tool returns an error message, tell the user in plain Spanish what to do.
- The image is already shown to the user by the interface: do not paste its URL.`

/** Lo que el agente hace con efectos (base, análisis, imagen). Inyectable para el probe de texto. */
const DEPS = { save: saveV2Session, analyze: analyzeProduct, generate: generateSection, revise: reviseSection }
export type AgentDeps = typeof DEPS

export function createLandingAgent(initial: LandingSession, ctx: Ctx, deps: AgentDeps = DEPS) {
  const runtimeContext = { session: initial }
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn)
    chain = p.catch(() => undefined)
    return p
  }
  const commit = async (s: LandingSession) => { runtimeContext.session = s; await deps.save(s) }
  const fail = (e: unknown) => {
    if (e instanceof SupportError) return { ok: false as const, error: e.message, suggest: e.suggest }
    if (e instanceof QuotaError || e instanceof UserError || e instanceof DocumentError) return { ok: false as const, error: e.message }
    console.error('[landing-v2] tool', e)
    return { ok: false as const, error: 'Ocurrió un error inesperado. Se puede reintentar.' }
  }
  const sectionArg = z.enum(SECTION_IDS).optional().describe('Section id; omit to use the current/next one.')

  const tools = {
    get_session_state: tool({
      description: 'Returns missing inputs, current section, approved sections, next section and sections without supporting data.',
      inputSchema: z.object({}),
      execute: async () => stateSummary(runtimeContext.session),
    }),

    update_inputs: tool({
      description: 'Save or correct the product inputs the user gave. Only send fields the user actually provided.',
      inputSchema: z.object({
        productName: z.string().optional(),
        marketResearch: z.string().optional().describe('Full research text as given by the user (not summarized).'),
        niche: NicheSchema.optional(),
        nicheOther: z.string().optional(),
        packs: z.array(PackSchema).optional().describe('Replaces all packs.'),
        purchaseNotes: z.string().optional().describe('Shipping/payment/guarantee/urgency conditions, only if the user wrote them.'),
        productImageUrl: z.string().optional(),
        proofImageUrls: z.array(z.string()).optional(),
      }),
      execute: (i) => serial(async () => {
        const urls = [i.productImageUrl, ...(i.proofImageUrls ?? [])].filter(Boolean) as string[]
        if (urls.some((u) => !isStorageUrl(u))) return { ok: false, error: 'Las imágenes tienen que adjuntarse en el chat.' }
        const s = runtimeContext.session
        const prev = s.inputs
        const pricing = i.packs || i.purchaseNotes !== undefined
          ? { packs: i.packs ?? prev.pricing?.packs ?? [], notes: i.purchaseNotes ?? prev.pricing?.notes ?? '' }
          : prev.pricing
        const inputs = {
          ...prev,
          ...(i.productName !== undefined && { productName: i.productName }),
          ...(i.marketResearch !== undefined && { marketResearch: i.marketResearch }),
          ...(i.niche !== undefined && { niche: i.niche }),
          ...(i.nicheOther !== undefined && { nicheOther: i.nicheOther }),
          ...(i.productImageUrl !== undefined && { productImageUrl: i.productImageUrl }),
          ...(i.proofImageUrls !== undefined && { proofImageUrls: i.proofImageUrls }),
          ...(pricing && { pricing }),
        }
        await commit({ ...s, inputs, visualSystem: changesAnalysis(prev, inputs) ? null : s.visualSystem })
        return { ok: true, ...stateSummary(runtimeContext.session) }
      }),
    }),

    extract_research_document: tool({
      description: 'Extract the text of an attached PDF/Word research document and save it as the market research.',
      inputSchema: z.object({ url: z.string() }),
      execute: ({ url }) => serial(async () => {
        try {
          if (!isStorageUrl(url)) return { ok: false, error: 'El documento tiene que adjuntarse en el chat.' }
          const { data } = await fetchAsBase64(url, MAX_DOC_BYTES)
          const text = await extractResearchDocument(Buffer.from(data, 'base64'), url.split('?')[0])
          const s = runtimeContext.session
          await commit({ ...s, inputs: { ...s.inputs, marketResearch: text }, visualSystem: null })
          return { ok: true, characters: text.length, ...stateSummary(runtimeContext.session) }
        } catch (e) { return fail(e) }
      }),
    }),

    analyze_product: tool({
      description: 'Re-run the product analysis (visual system). Only when the user asks to redo the visual direction.',
      inputSchema: z.object({}),
      execute: () => serial(async () => {
        try {
          if (missingInputs(runtimeContext.session.inputs).length) return { ok: false, error: 'Faltan datos del producto.' }
          await commit(await deps.analyze(runtimeContext.session))
          const vs = runtimeContext.session.visualSystem!
          return { ok: true, niche: vs.niche, palette: vs.palette.map((c) => c.hex), typography: vs.typography, artDirection: vs.artDirection }
        } catch (e) { return fail(e) }
      }),
    }),

    generate_section: tool({
      description: 'Design and render ONE landing section image. Omit section to generate the next one in the skeleton.',
      inputSchema: z.object({ section: sectionArg }),
      execute: ({ section }) => serial(async () => {
        try {
          let s = runtimeContext.session
          const missing = missingInputs(s.inputs)
          if (missing.length) return { ok: false, error: `Faltan datos: ${missing.map((k) => INPUT_LABELS[k]).join(', ')}.` }
          const id: SectionId | null = section ?? getNextSection(s)
          if (!id) return { ok: true, done: true, message: 'Todas las secciones seleccionadas están aprobadas.' }
          if (!s.visualSystem) { s = await deps.analyze(s); await commit(s) }
          // Una sección ya generada que se vuelve a nombrar se rediseña desde cero: el director no
          // reusa el diseño anterior.
          await commit(await deps.generate(s, id, ctx))
          const v = latestVersion(runtimeContext.session, id)!
          return { ok: true, section: id, label: SECTION_BY_ID[id].es, imageUrl: v.imageUrl }
        } catch (e) { return fail(e) }
      }),
    }),

    revise_section: tool({
      description: 'Regenerate ONLY the current section applying the user\'s requested changes.',
      inputSchema: z.object({ feedback: z.string(), section: sectionArg }),
      execute: ({ feedback, section }) => serial(async () => {
        try {
          const s = runtimeContext.session
          const id = section ?? s.current
          if (!id) return { ok: false, error: 'Todavía no hay una sección generada.' }
          await commit(await deps.revise(s, id, feedback, ctx))
          const v = latestVersion(runtimeContext.session, id)!
          return { ok: true, section: id, label: SECTION_BY_ID[id].es, imageUrl: v.imageUrl }
        } catch (e) { return fail(e) }
      }),
    }),

    approve_section: tool({
      description: 'Mark the current section as approved. Returns the next section to generate.',
      inputSchema: z.object({ section: sectionArg }),
      execute: ({ section }) => serial(async () => {
        try {
          const s = runtimeContext.session
          const id = section ?? s.current
          if (!id) return { ok: false, error: 'No hay una sección para aprobar.' }
          await commit(approveSection(s, id))
          return { ok: true, approved: id, next: runtimeContext.session.current }
        } catch (e) { return fail(e) }
      }),
    }),
  }

  return new ToolLoopAgent({
    model: chatModel,
    instructions: `${LANDING_V2_GPT_PROMPT}\n${AGENT_RULES}\n\nSESSION STATE AT THE START OF THIS TURN:\n${JSON.stringify(stateSummary(initial))}`,
    tools,
    // Tope por turno: aprobar + generar + responder son 3-4 pasos; más es un loop.
    stopWhen: isStepCount(8),
    prepareStep: async () =>
      missingInputs(runtimeContext.session.inputs).length ? { activeTools: [...GATHER_TOOLS] } : {},
  })
}

export type LandingAgent = ReturnType<typeof createLandingAgent>
export type LandingUIMessage = InferAgentUIMessage<LandingAgent>
