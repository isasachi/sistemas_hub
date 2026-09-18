import OpenAI, { toFile } from 'openai'
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions'
import { z } from 'zod'
import type { Part } from '@google/genai'
import { correccionDeTope, stringsEnElTope } from './llm-clamp'

// ─── El lado OpenAI del motor, por el SDK directo ────────────────────────────
// Desde el recableado del 2026-09-17 los dos papeles son distintos y conviene no confundirlos:
//
//  - TEXTO/VISIÓN (`gpt-5.4-nano`): es el RESPALDO. `lib/gemini.ts` llama primero a Gemini y cae
//    acá. Verificado contra la API que acepta `response_format: json_schema strict` y una imagen
//    por `toChatContent`, así que el respaldo de visión no es letra muerta.
//  - IMAGEN (`gpt-image-2.5-sunburst`): es el PRIMARIO de todas las piezas menos la placa de zona
//    de landing.
//
// ⚠️ `gpt-5.4-nano` NO acepta `max_tokens` (400 `unsupported_parameter`; pide
// `max_completion_tokens`). Hoy no se manda ninguno de los dos — si algún día hace falta topear
// la salida, es ese el nombre del campo.
const TEXT_MODEL = 'gpt-5.4-nano'
const IMAGE_MODEL = 'gpt-image-2.5-sunburst'

// ⚠️ EL TIMEOUT NO ES OPCIONAL, aunque el SDK no sea `fetch` pelado: su default son 10 MINUTOS,
// más que el `maxDuration = 300` de las rutas de imagen. Sin esto, UNA llamada colgada se come el
// presupuesto entero de la ruta, el request muere en 504 y `generateImage` NUNCA llega a pedirle
// la imagen al respaldo — que es justo lo que el respaldo existe para cubrir. Es la misma ley que
// el `AbortSignal.timeout` de `fetch` (ver AGENTS.md).
//
// El tope viaja por llamada y no en el cliente porque el texto y la imagen no se parecen en nada:
// medido, el texto responde en 2-3s y la imagen en 13-15s. Cada uno lleva ~4x su peor caso
// medido, que deja lugar a una respuesta lenta y no a un cuelgue.
const TIMEOUT_TEXTO_MS = 30_000
const TIMEOUT_IMAGEN_MS = 90_000

let _client: OpenAI | null = null
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

// ⚠️ El modelo de imagen NO está limitado a 1024x1024 | 1024x1536 | 1536x1024 — ese es el tipado
// (desactualizado) del SDK, no el contrato de la API. Verificado contra la API real: el único
// requisito es que ancho y alto sean **múltiplos de 16** (`1080x1920` → 400 "Width and height
// must both be divisible by 16"; `864x1536`, `1088x1920` y `2160x3840` → OK). Los tres buckets
// viejos aplastaban TODO portrait a 1024x1536, que es 2:3: una referencia 9:16 (0.563) salía
// 0.667 y el ad no calzaba en Reels ni TikTok. Ahora el tamaño se deriva del ratio.
//
// ⚠️ RE-MEDIDO contra `gpt-image-2.5-sunburst` el 2026-09-17, porque esto estaba medido contra
// `gpt-image-2` y un modelo nuevo no hereda el contrato del viejo: pidiendo `864x1536` devuelve
// `864x1536` exacto (0.563), por `images.generate` y por `images.edit`. De paso, sunburst tarda
// 13-15s contra los 40-90s de gpt-image-2 — por eso ya no hace falta el timeout que abandonaba la
// llamada para caber en el presupuesto de Vercel.
//
// Lado largo 1536 (mismo presupuesto de píxeles que antes → misma latencia y costo), lado
// corto proporcional redondeado al múltiplo de 16 más cercano.
export type ImgSize = `${number}x${number}`
const LONG_EDGE = 1536
const mul16 = (n: number) => Math.max(256, Math.round(n / 16) * 16)

export function sizeFor(aspectRatio?: string): ImgSize {
  const [w, h] = (aspectRatio ?? '9:16').split(':').map(Number)
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return '1024x1536'
  return w >= h
    ? `${LONG_EDGE}x${mul16((LONG_EDGE * h) / w)}`
    : `${mul16((LONG_EDGE * w) / h)}x${LONG_EDGE}`
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

// Errores PERMANENTES de OpenAI (billing/cuota/auth): no tiene sentido reintentar N veces (gasta
// tiempo y llamadas) — se lanzan al toque para que `gemini.ts` caiga a Gemini de inmediato. Un 429
// `insufficient_quota` NO es rate-limit transitorio: es la cuenta sin crédito.
// Errores que NO tiene sentido reintentar: el mismo request va a fallar igual las 3 veces. Se
// lanzan de una para que el caller caiga a Gemini sin quemar los reintentos.
//
// ⚠️ `moderation_blocked` es tan determinista como un 401, y se agregó DESPUÉS de medirlo: la placa
// de talento encuadrada en el tren inferior (`body_focus = gluteos_piernas`) dispara el filtro de
// contenido del modelo de imagen (`safety_violations=[sexual]`, `moderation_stage: output`) en el 100% de
// las corridas. Sin esta línea, `openaiGenerateImage` reintentaba tres veces un rechazo que no
// puede cambiar: medido, 22s con maxRetries=1 contra 52s con maxRetries=3, todo tirado antes de
// caer al respaldo — dentro de una ruta que además ya gastó su tiempo en la placa canónica.
export function isPermanentOpenAiError(e: unknown): boolean {
  const err = e as { status?: number; code?: string } | undefined
  return (
    err?.code === 'insufficient_quota' ||
    err?.code === 'moderation_blocked' ||
    err?.status === 401 ||
    err?.status === 403
  )
}

export async function openaiCallStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries: number,
  systemInstruction: string,
): Promise<T> {
  // strict:true OBLIGA al modelo a emitir TODOS los campos requeridos — sin esto el modelo omite
  // headlines en secciones tardías y el zod parse falla. No se usa el helper zodResponseFormat
  // porque tira ante `.optional()` sin `.nullable()` (los schemas de landing usan `.optional()`).
  const response_format = {
    type: 'json_schema' as const,
    json_schema: { name: schemaName, schema: toStrictSchema(z.toJSONSchema(schema)) as Record<string, unknown>, strict: true },
  }
  let lastError: unknown = new Error(`openaiCallStructured(${schemaName}): no attempts`)
  // El reintento NO puede mandar el mismo prompt: ver `stringsEnElTope`.
  let correccion: string | null = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await client().chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: correccion ? [...toChatContent(parts), { type: 'text' as const, text: correccion }] : toChatContent(parts) },
        ],
        response_format,
      }, { timeout: TIMEOUT_TEXTO_MS })
      const choice = res.choices[0]
      // Output truncado por límite de tokens → JSON incompleto; reintenta en vez de parsear a medias.
      if (choice?.finish_reason === 'length') { lastError = new Error(`openaiCallStructured(${schemaName}): respuesta truncada (length)`); continue }
      const parsed = schema.safeParse(stripNulls(JSON.parse(choice?.message?.content ?? '')))
      if (parsed.success) {
        // ⚠️ Un parse exitoso NO significa que el texto esté entero: OpenAI aplica los `maxLength`
        // al decodificar, así que el corte llega DENTRO del tope y zod lo acepta. Se reintenta
        // nombrando los campos; en el último intento se devuelve lo que haya (un muñón se lee
        // mal, un 500 no se lee).
        const enElTope = stringsEnElTope(parsed.data, response_format.json_schema.schema)
        if (!enElTope.length || i === maxRetries - 1) return parsed.data
        console.warn(`[llm] ${schemaName}: campos cortados en su tope (${enElTope.join(', ')}) → reintento`)
        correccion = correccionDeTope(enElTope)
        lastError = new Error(`openaiCallStructured(${schemaName}): texto cortado en el tope`)
        continue
      }
      lastError = parsed.error
    } catch (e) {
      if (isPermanentOpenAiError(e)) throw e // billing/cuota/auth → fail-fast → respaldo Gemini
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
  }, { timeout: TIMEOUT_TEXTO_MS })
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
        const res = await client().images.edit({ model: IMAGE_MODEL, image: files, prompt, size }, { timeout: TIMEOUT_IMAGEN_MS })
        const b64 = res.data?.[0]?.b64_json
        if (b64) return b64
      } else {
        const res = await client().images.generate({ model: IMAGE_MODEL, prompt, size }, { timeout: TIMEOUT_IMAGEN_MS })
        const b64 = res.data?.[0]?.b64_json
        if (b64) return b64
      }
    } catch (e) {
      if (isPermanentOpenAiError(e)) throw e // billing/cuota/auth → fail-fast → respaldo Gemini
      lastError = e
    }
  }
  if (lastError) throw lastError
  return ''
}
