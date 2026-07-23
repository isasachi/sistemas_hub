import OpenAI, { toFile } from 'openai'
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions'
import { z } from 'zod'
import type { Part } from '@google/genai'

// ─── Cableado ALTERNATIVO a OpenAI (TEMPORAL, para testing) ──────────────────
// Gated por `LLM_PROVIDER=openai`. Con el flag apagado (default) todo el pipeline usa Gemini
// como siempre. Con el flag encendido, las funciones de `lib/gemini.ts` (callStructured/
// callReasoning/generateImage) delegan acá: gpt-4o-mini para texto+visión (structured),
// gpt-image-2 para imágenes. Requiere OPENAI_API_KEY. No es producción — es un banco de pruebas.
export function useOpenAI(): boolean {
  return process.env.LLM_PROVIDER === 'openai'
}

const TEXT_MODEL = 'gpt-4o-mini'
const IMAGE_MODEL = 'gpt-image-2'

let _client: OpenAI | null = null
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

// gpt-image-2 solo acepta 1024x1024 | 1024x1536 | 1536x1024. Mapeo desde el aspectRatio de Gemini.
export type ImgSize = '1024x1024' | '1024x1536' | '1536x1024'
export function sizeFor(aspectRatio?: string): ImgSize {
  switch (aspectRatio) {
    case '1:1': return '1024x1024'
    case '16:9':
    case '3:2': return '1536x1024'
    default: return '1024x1536' // 9:16, 3:4, 4:5 y cualquier portrait
  }
}

// Part[] de Gemini (text | inlineData) → content de chat de OpenAI (text | image_url data URI).
export function toChatContent(parts: Part[]): ChatCompletionContentPart[] {
  const out: ChatCompletionContentPart[] = []
  for (const p of parts) {
    if (p.text) out.push({ type: 'text', text: p.text })
    else if (p.inlineData?.data) out.push({ type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType ?? 'image/png'};base64,${p.inlineData.data}` } })
  }
  return out
}

// Separa parts en (prompt de texto concatenado, imágenes de referencia).
export function splitImageParts(parts: Part[]): { prompt: string; images: { data: string; mimeType: string }[] } {
  const prompt = parts.filter((p) => p.text).map((p) => p.text).join('\n')
  const images = parts
    .filter((p) => p.inlineData?.data)
    .map((p) => ({ data: p.inlineData!.data!, mimeType: p.inlineData!.mimeType ?? 'image/png' }))
  return { prompt, images }
}

// z.toJSONSchema (ya usado por el path Gemini) → schema para response_format. Se limpian las
// claves meta que OpenAI no espera dentro de json_schema.schema.
function jsonSchemaFor<T>(schema: z.ZodSchema<T>): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>
  delete js.$schema
  delete js.$id
  return js
}

export async function openaiCallStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries: number,
  systemInstruction: string,
): Promise<T> {
  let lastError: unknown = new Error(`openaiCallStructured(${schemaName}): no attempts`)
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await client().chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: toChatContent(parts) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, schema: jsonSchemaFor(schema), strict: false } },
      })
      const parsed = schema.safeParse(JSON.parse(res.choices[0]?.message?.content ?? ''))
      if (parsed.success) return parsed.data
      lastError = parsed.error
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

export async function openaiCallReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await client().chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  })
  return res.choices[0]?.message?.content ?? ''
}

// Con imágenes de referencia (producto/foto/talento/ref) usa el endpoint de EDIT multi-imagen
// (mismo rol que los inlineData Part de Gemini); sin ellas, generación text→imagen. Devuelve b64.
export async function openaiGenerateImage(parts: Part[], maxRetries: number, opts?: { aspectRatio?: string }): Promise<string> {
  const { prompt, images } = splitImageParts(parts)
  const size = sizeFor(opts?.aspectRatio)
  let lastError: unknown = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (images.length) {
        const files = await Promise.all(images.map((im, j) => toFile(Buffer.from(im.data, 'base64'), `ref-${j}.png`, { type: im.mimeType })))
        const res = await client().images.edit({ model: IMAGE_MODEL, image: files, prompt, size })
        const b64 = res.data?.[0]?.b64_json
        if (b64) return b64
      } else {
        const res = await client().images.generate({ model: IMAGE_MODEL, prompt, size })
        const b64 = res.data?.[0]?.b64_json
        if (b64) return b64
      }
    } catch (e) {
      lastError = e
    }
  }
  if (lastError) throw lastError
  return ''
}
