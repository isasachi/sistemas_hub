import { GoogleGenAI, Modality, type Part, type Schema } from '@google/genai'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { openaiCallStructured, openaiCallReasoning, openaiGenerateImage } from './llm-openai'

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! })
}

// ─── Motor de IA: OpenAI PRIMARIO, Gemini FALLBACK (2026-07-23) ──────────────
// Antes Gemini era el motor y OpenAI un cableado alternativo tras un flag. Ahora se invierte: el
// motor principal (texto, visión, imagen) es el SDK de OpenAI (gpt-4o-mini + gpt-image-2); si una
// llamada de OpenAI falla (error, vacío o timeout), se cae a Gemini. Escape hatch: `LLM_PROVIDER=
// gemini` fuerza Gemini-only (sin tocar OpenAI) — útil para costo o si OpenAI está caído.
function geminiForced(): boolean {
  return process.env.LLM_PROVIDER === 'gemini'
}

// ⚠️ Latencia de imagen (constraint de despliegue, NO se resuelve solo con este cableado):
// gpt-image-2 tarda ~60-90s por imagen (medido). Las rutas de imagen en Vercel Hobby tienen
// maxDuration 60s → OpenAI como primario de imagen las 504-earía en PROD antes de poder caer a
// Gemini (el timeout de Vercel mata el request). Default aquí = SIN timeout (0): en local/testing
// OpenAI corre completo (honra "OpenAI primario de imagen"). Para PROD, setear `LLM_IMAGE_TIMEOUT_MS`
// (p.ej. 45000) hace que un OpenAI lento se abandone y caiga a Gemini (~15s) dentro del presupuesto
// — a costa de que la imagen la termine haciendo Gemini. Alternativa: `LLM_PROVIDER=gemini` (imagen
// Gemini-primaria en prod) o subir maxDuration en un plan Vercel pago. Texto/visión (gpt-4o-mini)
// responden en segundos y no tienen este problema.
function imageTimeoutMs(): number {
  const n = Number(process.env.LLM_IMAGE_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 0
}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return p
  let t: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => { t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms) })
  return Promise.race([p.finally(() => clearTimeout(t)), timeout])
}

export const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/gemini-system.md'),
  'utf-8'
)

export const STEP5_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/step5.md'),
  'utf-8'
)

export const BRANDING_SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/branding-system.md'),
  'utf-8'
)

// Gemini IGNORA los maxLength del responseSchema y a veces devuelve strings más largos que el
// `.max()` del esquema → el safeParse estricto tiraba ZodError (y 500-eaba /copy tras 3 reintentos).
// Los `.max()` de copy son una defensa contra texto largo, no una validación dura: recortamos los
// strings 'too_big' a su máximo y reintentamos el parse en vez de rechazar. Solo toca strings
// (un array/número 'too_big' no se recorta → se deja fallar como antes). Puro y testeable.
function valueAtPath(obj: unknown, path: readonly (string | number | symbol)[]): unknown {
  return path.reduce<unknown>((o, k) => (o == null ? o : (o as Record<string | number, unknown>)[k as string | number]), obj)
}
// Recorta a `max` pero en LÍMITE DE PALABRA (nunca a mitad de palabra, que dejaba basura visible
// como "Sient." o "absor…"): corta, retrocede al último espacio si no perdés demasiado, y quita
// separadores finales (coma, punto, guiones). Exportada: la reusa el post-trim de copy.ts.
export function sliceToWord(s: string, max: number): string {
  if (s.length <= max) return s
  let cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > max * 0.5) cut = cut.slice(0, lastSpace)
  return cut.replace(/[\s,;:.–—-]+$/, '')
}

export function clampTooBigStrings(obj: unknown, error: z.ZodError): boolean {
  let changed = false
  for (const issue of error.issues) {
    if (issue.code !== 'too_big' || typeof issue.maximum !== 'number' || issue.path.length === 0) continue
    const parent = valueAtPath(obj, issue.path.slice(0, -1))
    const key = issue.path[issue.path.length - 1] as string | number
    const cur = parent == null ? undefined : (parent as Record<string | number, unknown>)[key]
    if (typeof cur === 'string' && cur.length > issue.maximum) {
      ;(parent as Record<string | number, unknown>)[key] = sliceToWord(cur, issue.maximum)
      changed = true
    }
  }
  return changed
}

// Gemini structured (fallback). Contiene la lógica de recuperación de strings 'too_big'.
// Exportada también como entrada directa para el análisis forense de video:
// `callStructured` es OpenAI-primario y gpt-4o-mini no acepta partes de video, así que
// ahí no sirven ni el fallback ni `preferGemini`.
export async function geminiCallStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3,
  systemInstruction: string = SYSTEM_PROMPT,
): Promise<T> {
  let lastError: unknown = new Error(`geminiCallStructured(${schemaName}): no attempts`)
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: z.toJSONSchema(schema) as Schema,
        },
      })
      const obj = JSON.parse(res.text ?? '')
      let parsed = schema.safeParse(obj)
      // Recupera el caso común: strings sobre el límite → recorta y reintenta el parse (no la API).
      if (!parsed.success && clampTooBigStrings(obj, parsed.error)) parsed = schema.safeParse(obj)
      if (parsed.success) return parsed.data
      lastError = parsed.error
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

// Texto+visión estructurado: OpenAI (gpt-4o-mini) primario, Gemini fallback en fallo.
// `preferGemini`: invierte el orden para tareas donde Gemini es netamente mejor — la detección de
// bounding box (`extractProductBox`) usa el formato box_2d [0-1000] en el que Gemini está entrenado;
// gpt-4o-mini devuelve cajas imprecisas (recortes cortados). Gemini primario + OpenAI fallback ahí.
export async function callStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3,
  systemInstruction: string = SYSTEM_PROMPT,
  opts?: { preferGemini?: boolean }
): Promise<T> {
  if (geminiForced()) return geminiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
  if (opts?.preferGemini) {
    try {
      return await geminiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
    } catch (e) {
      console.warn(`[llm] Gemini structured (${schemaName}, preferGemini) falló → fallback a OpenAI`, e)
      return openaiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
    }
  }
  try {
    return await openaiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
  } catch (e) {
    console.warn(`[llm] OpenAI structured (${schemaName}) falló → fallback a Gemini`, e)
    return geminiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
  }
}

// Texto libre (razonamiento): OpenAI primario, Gemini fallback.
async function geminiCallReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: { systemInstruction: systemPrompt },
  })
  return res.text ?? ''
}

export async function callReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  if (geminiForced()) return geminiCallReasoning(systemPrompt, userMessage)
  try {
    return await openaiCallReasoning(systemPrompt, userMessage)
  } catch (e) {
    console.warn('[llm] OpenAI reasoning falló → fallback a Gemini', e)
    return geminiCallReasoning(systemPrompt, userMessage)
  }
}

// Generación de imagen genérica (texto→imagen o imágenes+texto). La usa el
// generador de branding: logo (solo texto), etiqueta (logo + texto), mockup
// (etiqueta + envase + texto). Reintenta ante fallos transitorios de red/empty
// (igual que callStructured) — las llamadas de imagen no son idempotentes pero
// solo reintentamos cuando NO hubo resultado. Devuelve '' si nunca produjo imagen.
// `opts.aspectRatio` (ej '9:16') controla el formato — lo usa el generador de landing
// para secciones portrait; omitido = formato libre del modelo (branding).
// Regla de idioma compartida por TODA generación de imagen (branding, landing,
// anuncios). El texto visible del resultado siempre va en español neutro, traduciendo
// cualquier texto en otro idioma que venga en refs/plantillas. Se inyecta en el choke
// point (las 3 funciones de imagen) para no repetirla en cada builder de prompt.
const SPANISH_RULE =
  'MANDATORY LANGUAGE RULE: every visible word rendered in the output image MUST be in neutral Latin-American Spanish (español neutro). If any reference image, template or input contains text in English or another language, TRANSLATE it into neutral Spanish — never copy, keep or render foreign-language words. This overrides any text seen in the inputs.'

// Generación de imagen con Gemini (fallback). `allParts` ya trae la SPANISH_RULE.
async function geminiGenerateImage(
  allParts: Part[],
  maxRetries: number,
  opts?: { aspectRatio?: string; imageSize?: string }
): Promise<string> {
  let lastError: unknown = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: [{ role: 'user', parts: allParts }],
        config: {
          responseModalities: [Modality.IMAGE],
          ...(opts?.aspectRatio
            ? { imageConfig: { aspectRatio: opts.aspectRatio, imageSize: opts.imageSize ?? '2K' } }
            : {}),
        },
      })
      const imagePart = res.candidates?.[0]?.content?.parts?.find((p: Part) => p.inlineData)
      const data = imagePart?.inlineData?.data
      if (data) return data
    } catch (e) {
      lastError = e
    }
  }
  if (lastError) throw lastError
  return ''
}

export async function generateImage(
  parts: Part[],
  maxRetries = 3,
  opts?: { aspectRatio?: string; imageSize?: string }
): Promise<string> {
  const allParts: Part[] = [...parts, { text: SPANISH_RULE }]
  if (geminiForced()) return geminiGenerateImage(allParts, maxRetries, opts)
  // OpenAI primario (gpt-image-2, edit multi-imagen si hay refs), acotado por timeout para caber en
  // el presupuesto de Vercel; vacío/timeout/error → Gemini. gpt-image-2 no acepta aspectRatio libre,
  // solo tamaños fijos (ver openaiGenerateImage/sizeFor); Gemini sí respeta opts.aspectRatio.
  try {
    const out = await withTimeout(openaiGenerateImage(allParts, maxRetries, opts), imageTimeoutMs())
    if (out) return out
    console.warn('[llm] OpenAI image vacía → fallback a Gemini')
  } catch (e) {
    console.warn('[llm] OpenAI image falló/timeout → fallback a Gemini', e)
  }
  return geminiGenerateImage(allParts, maxRetries, opts)
}

// Edición exclusiva sobre una imagen ya generada (regen con prompt en landing/branding):
// aplica SOLO el cambio pedido y deja el resto pixel-idéntico, igual que el refine de
// anuncios. Reusa generateImage → hereda retry, aspectRatio y la SPANISH_RULE.
export async function editWithPrompt(
  base64: string,
  mime: string,
  prompt: string,
  opts?: { aspectRatio?: string; imageSize?: string }
): Promise<string> {
  const parts: Part[] = [
    { inlineData: { mimeType: mime, data: base64 } },
    {
      text: [
        `Image 1 is the current design. Apply ONLY the change requested below and treat it as`,
        `exclusive: modify exactly what is asked and keep EVERYTHING else — product, logo, text,`,
        `copy, layout, colors, background and composition — pixel-identical to image 1. Do NOT`,
        `redesign, re-render or "improve" anything not asked. Change request: ${prompt}`,
      ].join(' '),
    },
  ]
  return generateImage(parts, 3, opts)
}

// Fidelidad de producto en el ad final (anuncios): el producto real (Image 2) pasa tal
// cual al ad, reemplazando al producto que tuviera la referencia (Image 1); si la
// referencia no muestra producto físico, se inserta de forma natural. Anclado en el
// choke point para garantizarlo aunque el instructivo de razonamiento sea débil.
const PRODUCT_RULE =
  'PRODUCT FIDELITY (mandatory): Image 2 is the REAL product. Render it in the final ad EXACTLY as it appears in Image 2 — identical shape, proportions, colors, finish and label (every text and graphic printed on the label reproduced faithfully; do not simplify, alter or omit any detail). This product MUST REPLACE whatever product appears in Image 1 (the reference ad), taking over its physical position and integration. If Image 1 shows no physical product, insert the product from Image 2 into the scene naturally and believably. Never invent, redraw, restyle or substitute the product.'

export async function editImage(
  refBase64: string, refMime: string,
  productBase64: string, productMime: string,
  logoBase64: string | null, logoMime: string | null,
  instruction: string
): Promise<string> {
  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refBase64 } },
    { inlineData: { mimeType: productMime, data: productBase64 } },
    ...(logoBase64 && logoMime ? [{ inlineData: { mimeType: logoMime, data: logoBase64 } } as Part] : []),
    { text: instruction },
    { text: PRODUCT_RULE },
    { text: SPANISH_RULE },
  ]
  const res = await getAI().models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: [{ role: 'user', parts }],
    config: { responseModalities: [Modality.IMAGE] },
  })
  const imagePart = res.candidates?.[0]?.content?.parts?.find((p: Part) => p.inlineData)
  return imagePart?.inlineData?.data ?? ''
}

export async function refineImage(
  refBase64: string, refMime: string,
  productBase64: string, productMime: string,
  logoBase64: string | null, logoMime: string | null,
  resultBase64: string, resultMime: string,
  feedback: string
): Promise<string> {
  const logoCount = logoBase64 ? 1 : 0
  const resultImageNumber = 3 + logoCount
  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refBase64 } },
    { inlineData: { mimeType: productMime, data: productBase64 } },
    ...(logoBase64 && logoMime ? [{ inlineData: { mimeType: logoMime, data: logoBase64 } } as Part] : []),
    { inlineData: { mimeType: resultMime, data: resultBase64 } },
    {
      // Con feedback el cambio es SAGRADO y EXCLUSIVO: solo eso, el resto pixel-idéntico
      // (no redibujar ni "mejorar" lo no pedido). Sin feedback, una variación fresca
      // (el botón "Regenerar" sin texto debe dar algo distinto, no un eco de la misma).
      text: feedback.trim()
        ? [
            `Image ${resultImageNumber} above is the current ad. Apply ONLY the change requested below`,
            `and treat it as exclusive: modify exactly what is asked and keep EVERYTHING else —`,
            `product, logo, copy, text, layout, colors, background and composition — pixel-identical`,
            `to image ${resultImageNumber}. Do NOT redesign, re-render or "improve" anything not asked.`,
            `Change request: ${feedback.trim()}`,
          ].join(' ')
        : [
            `Image ${resultImageNumber} above is the current ad. Produce a fresh alternative version:`,
            `keep the same product, logo and copy, but vary the composition, background and visual`,
            `treatment so it looks clearly different from the current one.`,
          ].join(' '),
    },
    { text: SPANISH_RULE },
  ]
  const res = await getAI().models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: [{ role: 'user', parts }],
    config: { responseModalities: [Modality.IMAGE] },
  })
  const imagePart = res.candidates?.[0]?.content?.parts?.find((p: Part) => p.inlineData)
  return imagePart?.inlineData?.data ?? ''
}
