import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'

// Gate semántico de dedup — decide si un nicho NUEVO es el mismo mercado de
// producto que uno existente (ej. "calvicie"→"alopecia"). Una llamada Haiku por
// nicho nuevo, antes de scrapear; si hay match, el pipeline aliasa (canonical_id)
// y SALTA scrape+análisis. Captura hermanos con y SIN raíz común — el solape de
// productos se descartó porque la rotación de keywords hace que dos nichos del
// mismo mercado caigan en anunciantes casi disjuntos (calibrado: rodilla/dolor
// de rodilla = 0.08 de solape). El juicio por NOMBRE sí discrimina.
//
// ⚠️ COSTO: igual que keyword-expansion.ts, SOLO se importa desde scripts/ del
// worker (VPS). Vercel no declara @anthropic-ai/sdk y no puede importarlo.

const MODEL = process.env.PH_DEDUP_MODEL ?? 'claude-haiku-4-5'

const PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/niche-dedup.md'),
  'utf-8'
)

const Schema = z.object({
  canonical: z.string(), // id de un nicho existente, o "NONE"
})

const TOOL: Anthropic.Tool = {
  name: 'clasificar_mercado',
  description: 'Registra el nicho canónico (mismo mercado) o "NONE".',
  input_schema: z.toJSONSchema(Schema) as Anthropic.Tool.InputSchema,
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Valida la respuesta del LLM: debe ser un id existente (no inventado), distinto
// del propio nicho, o null. Pura → testeable sin red.
export function resolveGateAnswer(
  answer: string,
  niche: string,
  candidateIds: string[],
): string | null {
  const a = norm(answer)
  if (!a || a === 'none') return null
  if (a === norm(niche)) return null // no aliasar a sí mismo
  const hit = candidateIds.find((c) => norm(c) === a)
  return hit ?? null // solo ids reales de la lista
}

// ¿El nicho nuevo es alias de un mercado existente? Devuelve el id canónico o
// null (→ scrapear como nicho nuevo). candidateIds = nichos activos (mercados
// reales ya scrapeados); el gate solo aliasa hacia una raíz, nunca hacia otro
// pending/alias → sin cadenas.
export async function findCanonicalMarket(
  niche: string,
  candidateIds: string[],
): Promise<string | null> {
  if (!candidateIds.length) return null
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 100,
    temperature: 0,
    system: PROMPT,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [
      {
        role: 'user',
        content:
          `NICHO NUEVO: "${niche}"\n\nNICHOS EXISTENTES:\n${candidateIds.join('\n')}\n\n` +
          `¿El nicho nuevo es el mismo mercado de producto que alguno? Llama a clasificar_mercado con su id, o "NONE".`,
      },
    ],
  })
  const toolUse = res.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') return null
  const { canonical } = Schema.parse(toolUse.input)
  return resolveGateAnswer(canonical, niche, candidateIds)
}
