import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'

// ⚠️ COSTO: igual que anthropic.ts, este módulo SOLO se importa desde scripts/
// (GitHub Actions). Ninguna ruta de Next/Vercel debe importarlo. Es UNA llamada
// barata (Haiku) por nicho nuevo; el resultado queda cacheado en
// ph_niches.keywords y nunca se repite. Ver lib/prompts/expansion-keywords.md.

// Haiku alcanza de sobra para generar keywords; override con PH_KEYWORD_MODEL.
const MODEL = process.env.PH_KEYWORD_MODEL ?? 'claude-haiku-4-5'

// El modelo original exige ≥15 keywords en 4 direcciones antes de buscar.
export const MIN_KEYWORDS = 15

const EXPANSION_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/expansion-keywords.md'),
  'utf-8'
)

const ExpansionSchema = z.object({
  keywords: z.array(z.string()).min(MIN_KEYWORDS),
})

const EXPANSION_TOOL: Anthropic.Tool = {
  name: 'registrar_keywords',
  description: 'Registra las keywords expandidas del nicho.',
  input_schema: z.toJSONSchema(ExpansionSchema) as Anthropic.Tool.InputSchema,
}

// Normaliza la salida del LLM: minúsculas, espacios colapsados, sin duplicados,
// máximo 4 palabras por keyword (búsquedas largas devuelven 0 resultados en
// Ads Library). El nicho original siempre va primero — es una búsqueda válida.
export function sanitizeKeywords(raw: string[], niche: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of [niche, ...raw]) {
    const clean = k.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!clean || clean.split(' ').length > 4) continue
    if (seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
  }
  return out
}

export async function expandNicheKeywords(niche: string): Promise<string[]> {
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 1000,
    temperature: 0, // reproducible: mismo nicho → mismas keywords
    system: EXPANSION_PROMPT,
    tools: [EXPANSION_TOOL],
    tool_choice: { type: 'tool', name: EXPANSION_TOOL.name },
    messages: [
      {
        role: 'user',
        content: `Nicho del usuario: "${niche}". Genera las keywords expandidas llamando a la tool registrar_keywords.`,
      },
    ],
  })

  const toolUse = res.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Anthropic no devolvió tool_use en la expansión de keywords')
  }
  const { keywords } = ExpansionSchema.parse(toolUse.input)
  const clean = sanitizeKeywords(keywords, niche)
  if (clean.length < MIN_KEYWORDS) {
    throw new Error(`Expansión insuficiente para "${niche}": solo ${clean.length} keywords tras sanitizar`)
  }
  return clean
}
