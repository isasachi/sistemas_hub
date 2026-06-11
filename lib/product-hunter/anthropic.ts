import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { ProductAnalysisSchema, type ProductAnalysis, type ProductRow } from './types'

// ⚠️ COSTO: este módulo SOLO se importa desde scripts/analyze.ts (GitHub Actions).
// Ninguna ruta de Next/Vercel debe importarlo — el análisis corre en batch en CI,
// nunca en el path de request del usuario. Ver lib/prompts/buscador-productos.md.

function getAI() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

// Sonnet 4.6 por defecto (lo que se estimó en costos). Para abaratar:
// PH_ANTHROPIC_MODEL=claude-haiku-4-5-20251001
const MODEL = process.env.PH_ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

export const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/buscador-productos.md'),
  'utf-8'
)

// Forzamos salida estructurada con tool_choice (patrón estándar de Anthropic).
const ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'registrar_analisis',
  description: 'Registra el análisis estructurado del producto candidato.',
  input_schema: z.toJSONSchema(ProductAnalysisSchema) as Anthropic.Tool.InputSchema,
}

interface AnalyzeInput {
  candidate: ProductRow
  peMatch: {
    competitors: { name: string; adCount: number }[]
    poolSize: number
    servicesExcluded: number
  }
}

export async function analyzeProduct({ candidate, peMatch }: AnalyzeInput): Promise<ProductAnalysis> {
  const raw = candidate.raw_data

  // Creativos reales del anuncio — la señal principal para identificar el producto
  const creativeLines = (raw.creatives ?? []).flatMap((c, i) => {
    const lines = [`Creativo ${i + 1}:`]
    if (c.title) lines.push(`  Título: ${c.title}`)
    if (c.body) lines.push(`  Texto: ${c.body}`)
    if (c.cta) lines.push(`  CTA: ${c.cta}`)
    if (c.link) lines.push(`  Link destino: ${c.link}`)
    return lines
  })

  const userMessage = [
    'Evalúa este candidato de Meta Ads Library para dropshipping en Perú.',
    '',
    `Anunciante: ${candidate.name}`,
    `Categorías de la página en Meta: ${raw.page_categories?.length ? raw.page_categories.join(', ') : 'desconocidas'}`,
    `Keyword que lo encontró: ${raw.found_keyword}`,
    `País del anuncio: ${raw.found_country}`,
    `Anuncios activos: ${raw.ad_count}`,
    `Días corriendo el más antiguo: ${raw.days_running ?? 'desconocido'}`,
    '',
    creativeLines.length ? creativeLines.join('\n') : '(sin creativos capturados — infiere el producto del nombre y la keyword)',
    '',
    `Competencia en Perú para ESTE producto (pre-filtrada: de ${peMatch.poolSize} anunciantes PE del nicho, ` +
      `se excluyeron ${peMatch.servicesExcluded} servicios y se matchearon por producto):`,
    peMatch.competitors.length
      ? peMatch.competitors.map((c) => `- ${c.name}: ${c.adCount} ads`).join('\n')
      : '- (ningún competidor del mismo producto en el pool PE)',
    '',
    'Devuelve el análisis llamando a la tool registrar_analisis.',
  ].join('\n')

  const res = await getAI().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool', name: ANALYSIS_TOOL.name },
    messages: [{ role: 'user', content: userMessage }],
  })

  const toolUse = res.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Anthropic no devolvió tool_use')
  }
  return ProductAnalysisSchema.parse(toolUse.input)
}
