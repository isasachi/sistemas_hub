import OpenAI, { toFile } from 'openai'
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions'
import { z } from 'zod'
import type { Part } from '@google/genai'

// ─── Motor de IA PRIMARIO: OpenAI SDK ────────────────────────────────────────
// Estas funciones son el motor principal (2026-07-23): `lib/gemini.ts` (callStructured/
// callReasoning/generateImage) las llama PRIMERO y cae a Gemini solo si fallan. gpt-4o-mini para
// texto+visión (structured), gpt-image-2 para imágenes. Requiere OPENAI_API_KEY. El escape hatch
// `LLM_PROVIDER=gemini` (ver gemini.ts `geminiForced`) fuerza Gemini-only y saltea todo esto.
// `useOpenAI` queda como helper legado (ya no gobierna el ruteo; el default es OpenAI-primario).
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

// Vuelve un subschema JSON nullable (OpenAI strict exige que TODA propiedad esté en `required`;
// la opcionalidad se expresa permitiendo `null`). Devuelve el modelo emitiendo `null` para
// ausentes, que luego `stripNulls` convierte en ausencia real para el `.optional()` de zod.
function makeNullable(s: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(s.type)) {
    if (!s.type.includes('null')) s.type = [...s.type, 'null']
    return s
  }
  if (typeof s.type === 'string') {
    s.type = [s.type, 'null']
    return s
  }
  if (Array.isArray(s.anyOf)) {
    if (!s.anyOf.some((o) => (o as Record<string, unknown>)?.type === 'null')) s.anyOf = [...s.anyOf, { type: 'null' }]
    return s
  }
  return { anyOf: [s, { type: 'null' }] }
}

// z.toJSONSchema → JSON Schema estricto que OpenAI acepta y OBLIGA a llenar (all-required +
// additionalProperties:false; los opcionales de zod se marcan nullable). Recursivo. Mantiene
// maxLength/maxItems/minimum/maximum (structured outputs modernos los soportan y ayudan al modelo).
export function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictSchema)
  if (!node || typeof node !== 'object') return node
  const s = node as Record<string, unknown>
  delete s.$schema
  delete s.$id
  delete s.default
  if (s.properties && typeof s.properties === 'object') {
    const props = s.properties as Record<string, Record<string, unknown>>
    const required = Array.isArray(s.required) ? (s.required as string[]) : []
    for (const k of Object.keys(props)) {
      props[k] = toStrictSchema(props[k]) as Record<string, unknown>
      if (!required.includes(k)) props[k] = makeNullable(props[k]) // opcional → nullable
    }
    s.required = Object.keys(props)
    s.additionalProperties = false
  }
  if (s.items) s.items = toStrictSchema(s.items)
  for (const key of ['anyOf', 'allOf', 'oneOf'] as const) {
    if (Array.isArray(s[key])) s[key] = (s[key] as unknown[]).map(toStrictSchema)
  }
  return s
}

// OpenAI structured (strict) emite `null` para los campos opcionales ausentes, pero zod
// `.optional()` espera `undefined` (rechaza `null`). Se podan los null recursivamente antes del
// safeParse para que un opcional ausente pase como corresponde.
export function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      if (val === null) continue
      out[k] = stripNulls(val)
    }
    return out
  }
  return v
}

export async function openaiCallStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries: number,
  systemInstruction: string,
): Promise<T> {
  // strict:true OBLIGA al modelo a emitir TODOS los campos requeridos — sin esto gpt-4o-mini omite
  // headlines en secciones tardías y el zod parse falla. No se usa el helper zodResponseFormat
  // porque tira ante `.optional()` sin `.nullable()` (los schemas de landing usan `.optional()`).
  const response_format = {
    type: 'json_schema' as const,
    json_schema: { name: schemaName, schema: toStrictSchema(z.toJSONSchema(schema)) as Record<string, unknown>, strict: true },
  }
  let lastError: unknown = new Error(`openaiCallStructured(${schemaName}): no attempts`)
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await client().chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: toChatContent(parts) },
        ],
        response_format,
      })
      const choice = res.choices[0]
      // Output truncado por límite de tokens → JSON incompleto; reintenta en vez de parsear a medias.
      if (choice?.finish_reason === 'length') { lastError = new Error(`openaiCallStructured(${schemaName}): respuesta truncada (length)`); continue }
      const parsed = schema.safeParse(stripNulls(JSON.parse(choice?.message?.content ?? '')))
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
