import { GoogleGenAI, Modality, type Part, type Schema } from '@google/genai'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! })
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

export async function callStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3,
  systemInstruction: string = SYSTEM_PROMPT
): Promise<T> {
  let lastError: unknown = new Error(`callStructured(${schemaName}): no attempts`)
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
      const text = res.text ?? ''
      const parsed = schema.safeParse(JSON.parse(text))
      if (parsed.success) return parsed.data
      lastError = parsed.error
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

export async function callReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: { systemInstruction: systemPrompt },
  })
  return res.text ?? ''
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

export async function generateImage(
  parts: Part[],
  maxRetries = 3,
  opts?: { aspectRatio?: string; imageSize?: string }
): Promise<string> {
  const allParts: Part[] = [...parts, { text: SPANISH_RULE }]
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
