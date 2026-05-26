import { GoogleGenAI, Modality, type Part, type Schema } from '@google/genai'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ai: ReturnType<typeof GoogleGenAI> = (GoogleGenAI as any)({ apiKey: process.env.GOOGLE_API_KEY! })

function getAI() {
  return ai
}

export const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/gemini-system.md'),
  'utf-8'
)

export const STEP5_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/step5.md'),
  'utf-8'
)

export async function callStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3
): Promise<T> {
  let lastError: unknown = new Error(`callStructured(${schemaName}): no attempts`)
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
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
  ]
  const res = await getAI().models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
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
      text: [
        `Image ${resultImageNumber} above is the current generated result.`,
        `Apply ONLY the following change. Do NOT alter anything not explicitly mentioned.`,
        `Change request: ${feedback}`,
      ].join(' '),
    },
  ]
  const res = await getAI().models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [{ role: 'user', parts }],
    config: { responseModalities: [Modality.IMAGE] },
  })
  const imagePart = res.candidates?.[0]?.content?.parts?.find((p: Part) => p.inlineData)
  return imagePart?.inlineData?.data ?? ''
}
