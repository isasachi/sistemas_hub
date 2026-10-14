// El par de TEXTO del hub por el AI SDK: `gemini-3.6-flash` primario, `gpt-5.4-nano` respaldo, con
// las MISMAS keys (`GOOGLE_API_KEY`, `OPENAI_API_KEY`) y sin Gateway: no se mete otro intermediario.
// La IMAGEN no pasa por acá: sigue en `generateImage` (respaldo por pieza, que el AI SDK no tiene).
//
// Lo usan anuncios y landing v2. `lib/landing-v2/models.ts` re-exporta esto y agrega solo su
// `DIRECTOR` (gpt-5.5), la única excepción al par.
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output, type LanguageModel, type ModelMessage } from 'ai'
import type { z } from 'zod'
import { GEMINI_TEXTO } from '@/lib/modelos'

const OPENAI_TEXTO = 'gpt-5.4-nano'
// Ley del repo: toda llamada lleva timeout. Texto medido en 2-3 s; con imágenes, más.
const TIMEOUT_TEXTO_MS = 60_000

const google = createGoogle({ apiKey: process.env.GOOGLE_API_KEY })
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
// El tipo del modelo de proveedor sin importar `@ai-sdk/provider` (dep transitiva, no declarada).
export type LanguageModelV4 = ReturnType<typeof openai.chat>
export type Par = readonly [LanguageModelV4, LanguageModelV4]

// `.chat()` y no el default (Responses): lo medido contra `gpt-5.4-nano` es chat.completions con
// json_schema strict (AGENTS.md, "Motor de modelos").
export const primario: LanguageModelV4 = google(GEMINI_TEXTO)
export const respaldo: LanguageModelV4 = openai.chat(OPENAI_TEXTO)

/**
 * Un modelo que cae al respaldo si el primario falla AL ARRANCAR la llamada. Lo usa el agente del
 * chat (que toma un solo `model`). Un fallo a mitad de stream no se re-enruta: el texto ya salió.
 *
 * ⚠️ El respaldo NO es silencioso: se loguea cuál respondió. Un respaldo mudo convierte un problema
 * de infraestructura en una cacería de prompts (ley del repo).
 */
export function conRespaldo(a: LanguageModelV4, b: LanguageModelV4): LanguageModelV4 {
  const caer = (op: string, e: unknown) => console.warn(`[ai-sdk] ${a.modelId} ${op} falló → respaldo ${b.modelId}`, e)
  return {
    specificationVersion: 'v4',
    provider: `${a.provider}+${b.provider}`,
    modelId: `${a.modelId}|${b.modelId}`,
    supportedUrls: a.supportedUrls,
    async doGenerate(o) { try { return await a.doGenerate(o) } catch (e) { caer('generate', e); return b.doGenerate(o) } },
    async doStream(o) { try { return await a.doStream(o) } catch (e) { caer('stream', e); return b.doStream(o) } },
  }
}

export const chatModel: LanguageModel = conRespaldo(primario, respaldo)

type ProviderOptions = Parameters<typeof generateText>[0]['providerOptions']

/**
 * Salida estructurada con el par del hub. Devuelve también QUÉ modelo respondió.
 *
 * ⚠️ EL SCHEMA TIENE QUE SER "DE SALIDA": todo campo en `required`, lo opcional como `.nullable()`,
 * nada de `.optional()`/`.nullish()`/`.catch`/`.default`. El AI SDK convierte zod con `io: 'input'`,
 * así que cualquiera de esos SACA el campo del `required` y el modelo lo omite en silencio (ley del
 * repo). El mismo schema va plano a Gemini y strict a OpenAI, sin `toStrictSchema`.
 *
 * `validate` es el verificador post-hoc del caller: si devuelve una corrección, se reintenta con
 * ella agregada (el reintento no manda el mismo prompt). Tras `intentos`, devuelve lo último válido
 * por schema y el caller decide.
 */
export async function structured<T>(opts: {
  name: string
  schema: z.ZodType<T>
  system: string
  content: Exclude<ModelMessage['content'], string>
  validate?: (out: T) => string | null
  intentos?: number
  /** Opciones por proveedor (p. ej. el thinking de Gemini). Cada proveedor ignora las claves ajenas. */
  providerOptions?: ProviderOptions
  timeoutMs?: number
  /** El par [primario, respaldo]; por defecto el del hub. */
  models?: Par
}): Promise<{ output: T; model: string }> {
  const { schema, system, validate, intentos = 2, providerOptions, timeoutMs = TIMEOUT_TEXTO_MS, models = [primario, respaldo] } = opts
  let correccion: string | null = null
  let last: { output: T; model: string } | null = null
  let lastError: unknown = null
  for (let i = 0; i < intentos; i++) {
    const messages: ModelMessage[] = [{
      role: 'user',
      content: correccion ? [...opts.content, { type: 'text', text: correccion }] : opts.content,
    } as ModelMessage]
    let got: { output: T; model: string } | null = null
    // El reintento de corrección va SOLO al modelo que ya respondió: caer al respaldo dos veces
    // duplica el peor caso de tiempo.
    const answered = last?.model
    const turno: readonly LanguageModelV4[] = answered ? models.filter((m) => m.modelId === answered) : models
    for (const model of turno) {
      try {
        const { output } = await generateText({
          model, system, messages,
          output: Output.object({ schema, name: opts.name }),
          providerOptions,
          abortSignal: AbortSignal.timeout(timeoutMs),
        })
        got = { output: output as T, model: model.modelId }
        break
      } catch (e) {
        lastError = e
        if (model === models[0] && !last) console.warn(`[ai-sdk] ${opts.name}: ${models[0].modelId} falló → respaldo ${models[1].modelId}`, e)
      }
    }
    // Un reintento de corrección que falla entero devuelve lo último válido; el caller verifica.
    if (!got) { if (last) return last; throw lastError }
    last = got
    correccion = validate?.(last.output) ?? null
    if (!correccion) return last
  }
  return last!
}

/** Texto libre con el par del hub. Vacío no cuenta como respuesta: cae al respaldo igual que un error. */
export async function reasoning(opts: { name: string; system: string; prompt: string; timeoutMs?: number; models?: Par }): Promise<{ text: string; model: string }> {
  const { models = [primario, respaldo], timeoutMs = TIMEOUT_TEXTO_MS } = opts
  let lastError: unknown = new Error(`${opts.name}: respuesta vacía`)
  for (const model of models) {
    try {
      const { text } = await generateText({ model, system: opts.system, prompt: opts.prompt, abortSignal: AbortSignal.timeout(timeoutMs) })
      if (text.trim()) return { text, model: model.modelId }
    } catch (e) { lastError = e }
    if (model === models[0]) console.warn(`[ai-sdk] ${opts.name}: ${models[0].modelId} falló → respaldo ${models[1].modelId}`, lastError)
  }
  throw lastError
}
