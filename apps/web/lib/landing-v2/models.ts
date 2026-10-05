// Modelos de TEXTO de landing v2 por el AI SDK (decisión del dueño del repo, 2026-10-05: v2 prueba
// este camino). El par es el MISMO del hub —`gemini-3.6-flash` primario, `gpt-5.4-nano` respaldo—,
// con las MISMAS keys (`GOOGLE_API_KEY`, `OPENAI_API_KEY`) y sin Gateway: no se mete otro
// intermediario. La IMAGEN no pasa por acá: sigue en `generateImage` (respaldo por pieza).
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output, type LanguageModel, type ModelMessage } from 'ai'
import type { z } from 'zod'
import { GEMINI_TEXTO } from '@/lib/modelos'

const OPENAI_TEXTO = 'gpt-5.4-nano'
// Ley del repo: toda llamada lleva timeout. Texto medido en 2-3 s; el brief con imágenes, más.
const TIMEOUT_TEXTO_MS = 60_000

const google = createGoogle({ apiKey: process.env.GOOGLE_API_KEY })
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
// El tipo del modelo de proveedor sin importar `@ai-sdk/provider` (dep transitiva, no declarada).
type LanguageModelV4 = ReturnType<typeof openai.chat>

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
  const caer = (op: string, e: unknown) => console.warn(`[landing-v2] ${a.modelId} ${op} falló → respaldo ${b.modelId}`, e)
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

/**
 * Salida estructurada con el par del hub. Devuelve también QUÉ modelo respondió.
 * `validate` es el verificador post-hoc del caller: si devuelve una corrección, se reintenta con
 * ella agregada (el reintento no manda el mismo prompt). Tras `intentos`, devuelve lo último válido
 * por schema y el caller decide (p. ej. `stripUnsupported`).
 */
export async function structured<T>(opts: {
  name: string
  schema: z.ZodType<T>
  system: string
  content: Exclude<ModelMessage['content'], string>
  validate?: (out: T) => string | null
  intentos?: number
}): Promise<{ output: T; model: string }> {
  const { schema, system, validate, intentos = 2 } = opts
  let correccion: string | null = null
  let last: { output: T; model: string } | null = null
  let lastError: unknown = null
  for (let i = 0; i < intentos; i++) {
    const messages: ModelMessage[] = [{
      role: 'user',
      content: correccion ? [...opts.content, { type: 'text', text: correccion }] : opts.content,
    } as ModelMessage]
    let got: { output: T; model: string } | null = null
    for (const model of [primario, respaldo]) {
      try {
        const { output } = await generateText({
          model, system, messages,
          output: Output.object({ schema, name: opts.name }),
          abortSignal: AbortSignal.timeout(TIMEOUT_TEXTO_MS),
        })
        got = { output: output as T, model: model.modelId }
        break
      } catch (e) {
        lastError = e
        if (model === primario) console.warn(`[landing-v2] ${opts.name}: ${primario.modelId} falló → respaldo ${respaldo.modelId}`, e)
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
