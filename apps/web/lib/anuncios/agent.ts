// Agente del chat de anuncios: `ToolLoopAgent` del AI SDK sobre el MISMO núcleo que el wizard
// (`core.ts`) y la MISMA fila de `sessions`. Lo que se hace por chat se ve al pasar al wizard, y al revés.
//
// El prompt define el comportamiento; el SERVIDOR lo refuerza, no confía en el modelo:
//  - `prepareStep` deja activas solo las tools del paso al que la sesión ya llegó, y además cada
//    función del núcleo se niega por su cuenta (doble puerta);
//  - cuota y créditos se cobran DENTRO del núcleo, con el owner resuelto antes de abrir el stream;
//  - una imagen solo entra por una URL del bucket propio (lo que sube el chat).
//
// Las tools corren en serie (`serial`): el modelo puede pedir dos en el mismo paso y las dos leen y
// escriben la misma sesión.
import { ToolLoopAgent, isStepCount, tool, type InferAgentUIMessage } from 'ai'
import { z } from 'zod'
import { chatModel } from '@/lib/ai-sdk'
import { getSession } from '@/lib/db'
import { fetchAsBase64 } from '@/lib/storage'
import type { SessionResponse } from '@/lib/types'
import { AnunciosError, analyzeProduct, analyzeReference, confirmCopy, generateAd, generateCopy, refineAd, researchOf, type Ctx, type Img } from './core'

export const CHAT_KIND = 'anuncios-chat'
const MAX_IMG = 10 * 1024 * 1024

/** Solo URLs del bucket propio: lo que sube el chat. Evita que el modelo cuele una URL arbitraria. */
export function isStorageUrl(u: string): boolean {
  try {
    const host = new URL(u).host
    return [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].some((b) => b && new URL(b).host === host)
  } catch { return false }
}

/** El paso al que llegó la sesión, en palabras: es lo único que el modelo necesita saber del estado. */
export function stateSummary(s: SessionResponse) {
  const next = !s.reference_analysis ? 'reference'
    : !s.product_scan ? 'product'
    : !s.copy_versions ? 'copy'
    : !s.confirmed_copy ? 'choose_copy'
    : !s.image_url ? 'ad'
    : 'done'
  return {
    next,
    hasReference: !!s.reference_analysis,
    product: s.product_scan ? { name: s.product_name, whatItIs: s.what_it_is, whatItDoes: s.what_it_does, targetAudience: s.target_audience, hasLogo: !!s.logo_url } : null,
    niche: researchOf(s)?.niche ?? null,
    copyWritten: !!s.copy_versions,
    copyChosen: s.confirmed_copy?.version ?? null,
    hasAd: !!s.image_url,
  }
}

// Cada estado habilita sus tools Y las del paso siguiente: el modelo suele pedir dos seguidas en el
// mismo paso (`choose_copy` + `generate_ad`) y `serial` las corre en orden. No abre nada: el núcleo
// se niega igual si falta el paso anterior (`generateAd` sin copy elegido es un 409).
const TOOLS_BY_NEXT: Record<ReturnType<typeof stateSummary>['next'], readonly string[]> = {
  reference: ['get_state', 'set_reference', 'set_product'],
  product: ['get_state', 'set_reference', 'set_product', 'write_copy'],
  copy: ['get_state', 'set_reference', 'set_product', 'write_copy', 'choose_copy'],
  choose_copy: ['get_state', 'set_reference', 'set_product', 'write_copy', 'choose_copy', 'generate_ad'],
  ad: ['get_state', 'set_reference', 'set_product', 'write_copy', 'choose_copy', 'generate_ad', 'adjust_ad'],
  done: ['get_state', 'set_reference', 'set_product', 'write_copy', 'choose_copy', 'generate_ad', 'adjust_ad'],
}

// Lo que puede ser el último mensaje del usuario. Solo las intenciones de acción INEQUÍVOCA obligan
// una tool: dar la referencia o los datos del producto no, porque pueden venir incompletos y forzar
// `set_product` ahí es pedirle al modelo que invente lo que falta.
const INTENTS = ['greeting_or_question', 'undecided', 'gave_reference', 'gave_product_info', 'wants_copy_rewritten', 'picked_copy_version', 'wants_ad_changed', 'thanks_or_approval'] as const
type ForcedTool = 'write_copy' | 'choose_copy' | 'adjust_ad'
type Intent = (typeof INTENTS)[number]
const FORCED_BY_INTENT: Partial<Record<Intent, ForcedTool>> = {
  wants_copy_rewritten: 'write_copy',
  picked_copy_version: 'choose_copy',
  wants_ad_changed: 'adjust_ad',
}
/**
 * Las tools que gastan un crédito o comprometen una elección SOLO existen en el turno si la
 * intención declarada las habilita. Con "gracias" o una pregunta, `adjust_ad` ni siquiera está en
 * la lista: no hay nada que el modelo pueda llamar para gastar.
 *
 * ⚠️ Medido: con el primer paso obligado a "alguna tool", ante "Gracias, me encanta cómo quedó" el
 * modelo llamó `adjust_ad` con el feedback *"El usuario agradece; no hacer cambios"* (2 de 6 draws)
 * — un crédito gastado para no cambiar nada.
 */
const GATED_BY_INTENT: Record<string, readonly Intent[]> = {
  choose_copy: ['picked_copy_version'],
  generate_ad: ['picked_copy_version', 'wants_ad_changed'],
  adjust_ad: ['wants_ad_changed'],
}

const INSTRUCTIONS = `You are the assistant of an ad generator. You help the user replicate a static reference ad with their own product, step by step, by calling tools. The tools do the work; you only talk.

YOU CANNOT DO ANYTHING YOURSELF. Reading an image, saving the product, writing copy, creating the ad and changing the ad happen ONLY through a tool call made in THIS turn. If you did not call the tool in this turn, it did not happen: never tell the user something is done, changed or ready unless the tool you just called returned ok. When the user asks for a change to the ad, the answer is always a call to adjust_ad — never a sentence saying you changed it.

THE RULE THAT COSTS MONEY: generate_ad and adjust_ad spend one of the user's image credits each time. Call generate_ad only after the user has picked version A or B. Call adjust_ad once per change the user asks for, on an ad that already exists. Never call either one twice for the same request.

THE FLOW, in order — never skip a step, never ask for something a later step needs:
1. Reference: the user attaches the ad they want to emulate → set_reference. Once a reference is saved, an image that arrives together with product details is the PRODUCT photo: do not call set_reference again unless the user says they want a different reference ad.
2. Product: you need a product photo plus four answers — the product's name, what it is, what it does, and who it is for. Ask for whatever is missing in ONE short message. When you have all of it → set_product. A logo is optional; never ask for it twice.
3. Copy: right after set_product succeeds → write_copy, without asking. The interface shows both versions to the user; do not repeat or rewrite their text. Ask which one they want.
4. Choice: the user picks → choose_copy, then generate_ad immediately.
5. Changes to the finished ad → adjust_ad with the user's own words.

RUNTIME RULES:
- Every turn starts with get_state, where you say what the user's last message is. Be literal: a question, a compliment or a thank-you is never a request for a change. If get_state answers with mustCallNow, call that tool: it is what the user asked for.
- Reply ONLY in Spanish (Peruvian, tuteo), short and warm. Never show tool names, URLs, JSON or internal reasoning.
- Attachments arrive as lines like "[Adjunto imagen: name — URL]". Pass that URL exactly as it is. If the user attaches several images at once, the reference ad is the one that already looks like a finished ad with text on it; a plain product photo is the product; a logo is a logo. If you cannot tell which is which, ask.
- Never invent product data. Only what the user wrote goes into set_product.
- If the user asks for different copy ("más directo", "otro tono") → write_copy with their words as note.
- If a tool returns an error, tell the user in plain Spanish what to do next.
- Images and copy are already shown by the interface: never paste a URL, never describe the image you have not seen.`

/** Lo que el agente hace con efectos. Inyectable para el probe (base, modelos de texto e imagen stubeados). */
const DEPS = { analyzeReference, analyzeProduct, generateCopy, confirmCopy, generateAd, refineAd, reload: getSession, fetchImage: fetchAsBase64 }
export type AgentDeps = typeof DEPS

/**
 * ¿Qué versión eligió el usuario en SU mensaje? `null` si no nombró ninguna, o si nombró las dos.
 *
 * ⚠️ ES EL CANDADO DE CONSENTIMIENTO DEL CRÉDITO, y por eso lo calcula el código. Medido con
 * `scripts/probe-anuncios-agent.ts`: ante "¿Cuál de las dos me recomiendas?" el modelo eligió por
 * el usuario y generó el anuncio en 1 de 5 draws. Elegir el copy es lo que habilita `generate_ad`,
 * así que la elección tiene que estar escrita por el usuario, no deducida por el modelo.
 *
 * Una "a" suelta no cuenta (es una preposición): tiene que venir como "versión/opción/la X", ser
 * el mensaje entero, o decir "primera"/"segunda".
 */
export function pickedVersion(userText: string): 'A' | 'B' | null {
  const t = userText.split('\n').filter((l) => !l.startsWith('[Adjunto ')).join(' ').trim()
  const vistas = new Set<'A' | 'B'>()
  const ver = (m: RegExpMatchArray) => vistas.add(m[1].toUpperCase() as 'A' | 'B')
  // "la B", "versión b", "elijo b", "me quedo con b", "prefiero la A".
  for (const m of t.matchAll(/(?:versi[oó]n|opci[oó]n|\bla|\bel|\bcon|\belijo|\bprefiero|\bquiero|\bescojo|\bdame|\busa)\s+(?:la\s+)?["'«]?([ab])(?![\p{L}\p{N}])/giu)) ver(m)
  // Una A o B MAYÚSCULA suelta: "Elijo B", "B porfa", "B!!". La "A" seguida de una palabra de
  // función es la preposición a principio de frase ("A mí me gusta…", "A ver…"), no una versión.
  for (const m of t.matchAll(/(?<![\p{L}\p{N}])([AB])(?![\p{L}\p{N}])(?!\s+(?:m[ií]|ver|la|el|los|las|lo|que|veces|es[oae]|todo|nadie)(?![\p{L}\p{N}]))/gu)) ver(m)
  const solo = t.match(/^["'«¡]?([ab])["'»]?[\s.!]*$/i)
  if (solo) ver(solo)
  if (/\bprimera\b/i.test(t)) vistas.add('A')
  if (/\bsegunda\b/i.test(t)) vistas.add('B')
  return vistas.size === 1 ? [...vistas][0] : null
}

const palabras = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) ?? []

/**
 * ¿El cambio que el modelo quiere aplicar lo PIDIÓ el usuario en su mensaje?
 *
 * ⚠️ EL OTRO CANDADO DEL CRÉDITO. Medido: ante "Gracias, me encanta cómo quedó" el modelo repitió
 * el ajuste del turno anterior ("ponle el fondo más claro") en 2 de 5 draws — un crédito gastado en
 * algo que nadie pidió.
 *
 * ⚠️ LO QUE SE RECHAZA ES EL PEDIDO VIEJO, no la paráfrasis. La primera versión exigía que la mitad
 * de las palabras del cambio estuvieran en el mensaje del turno, y eso rechazaba pedidos legítimos:
 * el usuario escribe "el texto se ve muy chico" y el modelo lo pasa como "aumentar el tamaño del
 * texto" (1 palabra de 3). Negarse ahí es el fallo de "dije que lo hacía y no lo hice" por otra
 * puerta. Ahora un cambio que no calza con el mensaje actual se rechaza SOLO si calza con uno
 * ANTERIOR (o sea, es un pedido repetido); uno que no calza con ninguno es una paráfrasis y pasa.
 * Un "regenerar" sin texto vale solo si el mensaje pide otra versión.
 *
 * ponytail: solapamiento de palabras de 4+ letras. Un cambio INVENTADO desde cero no lo caza; ese
 * caso no apareció en el probe y lo acotan el tope de un crédito por turno y las 3 regeneraciones
 * por sesión de `gen-quota`.
 */
export function userAskedFor(feedback: string, userText: string, previos: string[] = []): boolean {
  const pedido = palabras(feedback)
  if (!pedido.length) return /regener|otra|variaci|de nuevo|cambi|distint|diferent/.test(userText.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const calza = (texto: string) => { const dichas = new Set(palabras(texto)); return pedido.filter((w) => dichas.has(w)).length / pedido.length >= 0.5 }
  return calza(userText) || !previos.some(calza)
}

/**
 * @param turn El texto del mensaje del usuario de ESTE turno y los de los turnos anteriores (el
 *   agente se crea por request). Los leen los candados deterministas: qué imagen adjuntó, qué
 *   versión eligió y si el cambio que se quiere aplicar es de ahora o es uno viejo.
 */
export function createAnunciosAgent(initial: SessionResponse, ctx: Ctx, turn: { userText: string; previos?: string[] }, deps: AgentDeps = DEPS) {
  const { userText, previos = [] } = turn
  const state = { session: initial }
  // Cuántas tools con efecto terminaron bien en ESTE turno.
  let hechas = 0
  // La tool que `get_state` dejó obligada para el paso siguiente (ver `get_state`).
  let pendiente: ForcedTool | undefined
  // Lo que el modelo declaró que es el mensaje del usuario, en el paso 0 de este turno.
  let intent: Intent | undefined
  // Tope duro: UN crédito de imagen por turno, pida lo que pida el modelo.
  let imagenes = 0
  const unaImagen = () => {
    if (imagenes++) throw new AnunciosError('An image was already generated in this turn. Show it to the user and wait for their next message.')
  }
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn)
    chain = p.catch(() => undefined)
    return p
  }
  // El núcleo escribe parches en la fila; la sesión entera se relee después de cada tool.
  const run = <T extends object>(fn: (s: SessionResponse) => Promise<T>) => serial(async () => {
    try {
      const out = await fn(state.session)
      hechas++
      state.session = (await deps.reload(state.session.id, ctx.userId)) ?? state.session
      return { ok: true as const, ...out, next: stateSummary(state.session).next }
    } catch (e) {
      if (e instanceof AnunciosError) return { ok: false as const, error: e.message }
      console.error('[anuncios] tool', e)
      return { ok: false as const, error: 'Ocurrió un error inesperado. Se puede reintentar.' }
    }
  })
  const image = async (url: string): Promise<Img> => {
    if (!isStorageUrl(url)) throw new AnunciosError('Las imágenes tienen que adjuntarse en el chat.')
    const { data, mimeType } = await deps.fetchImage(url, MAX_IMG)
    return { bytes: Buffer.from(data, 'base64'), mimeType }
  }

  const tools = {
    get_state: tool({
      description: 'Returns which step the session is at. You MUST say what the user\'s last message is: the server uses it to decide the next action.',
      // ⚠️ EL MODELO DECLARA LA INTENCIÓN COMO DATO Y EL SERVIDOR ACTÚA SOBRE ELLA. `get_state` era
      // la salida inocua del primer paso obligado, y por eso mismo era un escape: medido, ante
      // "ponle el fondo más claro" el modelo llamaba `get_state` y terminaba el turno sin hacer el
      // cambio (1 de 6 draws, con la regla en el prompt Y un recordatorio en este resultado). Ahora
      // un `userIntent` de acción deja OBLIGADA la tool correspondiente en el paso siguiente.
      inputSchema: z.object({
        userIntent: z.enum(INTENTS).describe('What the user\'s LAST message is. Pick the one that fits; a question or a compliment is never a request for a change.'),
      }),
      execute: async ({ userIntent }) => {
        // La intención se fija UNA vez por turno: volver a llamar no puede escalar un "gracias" a
        // un pedido de cambio.
        if (intent) return { ...stateSummary(state.session), actionsDoneThisTurn: hechas }
        intent = userIntent
        const obligada = FORCED_BY_INTENT[userIntent]
        if (obligada) pendiente = obligada
        return { ...stateSummary(state.session), actionsDoneThisTurn: hechas, ...(obligada ? { mustCallNow: obligada } : {}) }
      },
    }),

    set_reference: tool({
      description: 'Analyze the reference ad the user attached. Replaces any previous reference.',
      inputSchema: z.object({
        imageUrl: z.string().describe('URL of the attached reference ad, exactly as given.'),
        note: z.string().optional().describe('Only if the user asked for something specific about how to read the reference.'),
      }),
      execute: ({ imageUrl, note }) => run(async (s) => {
        // La referencia solo se (re)analiza con una imagen adjunta en ESTE mensaje. Medido: al
        // recibir la foto del producto el modelo volvía a mandar la referencia vieja "por las
        // dudas" (2 de 5 draws), que es un análisis de más y borra el copy ya escrito.
        if (!userText.includes(imageUrl)) throw new AnunciosError(s.reference_analysis
          ? 'The reference ad is already saved. Do not set it again; continue with the next step.'
          : 'Las imágenes tienen que adjuntarse en el chat.')
        const { analysis } = await deps.analyzeReference(s, await image(imageUrl), note ?? '', ctx)
        return { summary: analysis.summaryForUser }
      }),
    }),

    set_product: tool({
      description: 'Save the product and analyze its photo. Needs every field the user gave; never invent one.',
      inputSchema: z.object({
        imageUrl: z.string().optional().describe('URL of the attached product photo. Omit to keep the photo already saved.'),
        logoUrl: z.string().optional().describe('URL of the attached brand logo, only if the user attached one.'),
        productName: z.string(),
        whatItIs: z.string().describe('What the product IS: its category or format.'),
        whatItDoes: z.string(),
        targetAudience: z.string(),
      }),
      execute: (i) => run(async (s) => {
        const productUrl = i.imageUrl ?? s.product_url
        if (!productUrl) throw new AnunciosError('Falta la foto del producto: adjúntala en el chat.')
        const logoUrl = i.logoUrl ?? s.logo_url
        const [product, logo] = await Promise.all([image(productUrl), logoUrl ? image(logoUrl) : null])
        const { scan, research } = await deps.analyzeProduct(s, {
          product, logo,
          productName: i.productName.trim(), whatItIs: i.whatItIs.trim() || null,
          whatItDoes: i.whatItDoes.trim(), targetAudience: i.targetAudience.trim(),
        }, ctx)
        return { summary: scan.summaryForUser, niche: research?.niche ?? null }
      }),
    }),

    write_copy: tool({
      description: 'Write the two copy versions (A: new copy, B: the reference structure filled in). The interface shows them.',
      inputSchema: z.object({ note: z.string().optional().describe('The user\'s own words if they asked for a change of tone or angle.') }),
      execute: ({ note }) => run(async (s) => {
        const { copyVersions } = await deps.generateCopy(s, note ?? '', ctx)
        const lines = (v: typeof copyVersions.versionA) => v.map((e) => ({ element: e.element, text: e.text }))
        return { versionA: lines(copyVersions.versionA), versionB: lines(copyVersions.versionB) }
      }),
    }),

    choose_copy: tool({
      description: 'Record which copy version the user picked.',
      inputSchema: z.object({ version: z.enum(['A', 'B']) }),
      execute: ({ version }) => run(async (s) => {
        if (pickedVersion(userText) !== version)
          throw new AnunciosError('The user has not picked a version in their last message. Do not choose for them: answer their question and ask them to pick A or B.')
        return { chosen: (await deps.confirmCopy(s, version)).version }
      }),
    }),

    generate_ad: tool({
      description: 'Render the final ad image. SPENDS ONE IMAGE CREDIT. Only after the user picked a copy version.',
      inputSchema: z.object({ note: z.string().optional().describe('An adjustment the user asked for before generating, in their words.') }),
      execute: ({ note }) => run((s) => {
        // Con un anuncio ya hecho, generar de cero solo vale si el usuario eligió versión en ESTE
        // mensaje; cualquier otro cambio es `adjust_ad`.
        if (s.image_url && !pickedVersion(userText))
          throw new AnunciosError('The ad already exists. Do not generate it again. If the user asked for a change, call adjust_ad with their words.')
        unaImagen()
        return deps.generateAd(s, { precision: note }, ctx)
      }),
    }),

    adjust_ad: tool({
      description: 'Regenerate the existing ad applying the user\'s requested change. SPENDS ONE IMAGE CREDIT.',
      inputSchema: z.object({ feedback: z.string().describe('The change the user asked for, in their words. Empty for a plain variation.') }),
      execute: ({ feedback }) => run((s) => {
        if (!userAskedFor(feedback, userText, previos))
          throw new AnunciosError('The user did not ask for that change in their last message. Do not regenerate the ad; just reply to what they said.')
        unaImagen()
        return deps.refineAd(s, feedback.slice(0, 1000), ctx)
      }),
    }),
  }

  return new ToolLoopAgent({
    model: chatModel,
    instructions: `${INSTRUCTIONS}\n\nSESSION STATE AT THE START OF THIS TURN:\n${JSON.stringify(stateSummary(initial))}`,
    tools,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: 'high' } } },
    // Tope por turno: producto + copy + responder son 3-4 pasos; más es un loop.
    stopWhen: isStepCount(8),
    // ⚠️ EL TURNO SE RUTEA EN CÓDIGO, NO EN EL PROMPT. Medido con `scripts/probe-anuncios-agent.ts`:
    // librado a sí mismo, ~1 de cada 4 veces el modelo terminaba el turno en el paso 0 diciendo
    // "listo, ya apliqué el cambio" SIN haber llamado a nada, y subir la regla a titular del prompt
    // no lo movió (2 de 4 draws). Obligarlo a llamar "alguna tool" tampoco: gastaba un crédito ante
    // un "gracias". Lo que quedó: paso 0 = `get_state` con la intención declarada; de ahí salen
    // las tools que existen en el turno (`GATED_BY_INTENT`) y la que queda obligada.
    prepareStep: async ({ stepNumber }) => {
      // Paso 0: SIEMPRE `get_state`, que es donde el modelo declara qué quiere el usuario. Es un
      // paso de texto corto (1-2 s) y es lo que vuelve determinista todo lo que sigue.
      if (stepNumber === 0 || !intent) return { activeTools: ['get_state' as const], toolChoice: { type: 'tool' as const, toolName: 'get_state' as const } }
      const declarada = intent
      const activeTools = ([...TOOLS_BY_NEXT[stateSummary(state.session).next]] as (keyof typeof tools)[])
        .filter((t) => !GATED_BY_INTENT[t] || GATED_BY_INTENT[t].includes(declarada))
      // La tool obligada se exige UNA vez: si un candado la rechaza, el modelo tiene que poder
      // contestarle al usuario en vez de quedar en un loop.
      const obligada = pendiente
      pendiente = undefined
      if (obligada && activeTools.includes(obligada)) return { activeTools, toolChoice: { type: 'tool' as const, toolName: obligada } }
      return { activeTools, toolChoice: 'auto' as const }
    },
  })
}

export type AnunciosAgent = ReturnType<typeof createAnunciosAgent>
export type AnunciosUIMessage = InferAgentUIMessage<AnunciosAgent>
