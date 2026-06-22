import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { ProductAnalysisSchema, type ProductAnalysis, type ProductRow } from '@ph/shared'

// ⚠️ COSTO: este módulo SOLO se importa desde los scripts de CI (analyze.ts,
// pipeline.ts) y desde analysis-runner.ts (que a su vez solo importan scripts).
// Ninguna ruta de Next/Vercel debe importarlo — el análisis corre en batch en
// GitHub Actions, nunca en el path de request. Ver lib/prompts/buscador-productos.md.
//
// El análisis usa la Message Batches API (50% de descuento en todos los tokens,
// mismo modelo y params). La latencia no importa: el cron corre cada 12h y
// validate-pe.ts corre después en el mismo workflow.

function getAI() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

// Haiku 4.5 por defecto (calidad suficiente para el scoring y mucho más barato;
// validado en el re-scrape del 2026-06-12: ganadores en los 26 nichos). Para
// subir la calidad puntualmente: PH_ANTHROPIC_MODEL=claude-sonnet-4-6
const MODEL = process.env.PH_ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001'

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

export interface AnalyzeInput {
  candidate: ProductRow
  peMatch: {
    competitors: { name: string; adCount: number }[]
    poolSize: number
    servicesExcluded: number
  }
}

// Params idénticos para el path directo y el de Batches — un solo origen.
export function buildAnalyzeParams({ candidate, peMatch }: AnalyzeInput): Anthropic.Messages.MessageCreateParamsNonStreaming {
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
    `Nicho buscado: ${candidate.niche}`,
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

  return {
    model: MODEL,
    max_tokens: 2000,
    // Scoring reproducible: en casos borderline el muestreo por defecto puede
    // oscilar entre media/descartado con el mismo input (visto en pruebas).
    temperature: 0,
    // Prompt caching: el prefijo fijo (tools + system) es idéntico en TODOS los
    // análisis. Con cache_control en el bloque system, el primer request escribe
    // el cache (1.25x) y los siguientes leen tools+system a 0.1x (orden canónico
    // tools → system → messages). El daemon 24/7 amortiza el cache. El user
    // message (per-producto) queda dinámico fuera del cache. Ver AGENTS.md.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool', name: ANALYSIS_TOOL.name },
    messages: [{ role: 'user', content: userMessage }],
  }
}

export function parseAnalysis(content: Anthropic.Messages.ContentBlock[]): ProductAnalysis {
  const toolUse = content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Anthropic no devolvió tool_use')
  }
  return ProductAnalysisSchema.parse(toolUse.input)
}

// Path directo (sin batch) — para lotes chicos o debug con PH_NO_BATCH=1.
export async function analyzeProduct(input: AnalyzeInput): Promise<ProductAnalysis> {
  const res = await getAI().messages.create(buildAnalyzeParams(input))
  return parseAnalysis(res.content)
}

// ─── MESSAGE BATCHES API (50% descuento) ─────────────────────────────────────

export interface BatchEntry {
  customId: string // id del producto en ph_products
  input: AnalyzeInput
}

export async function submitAnalysisBatch(entries: BatchEntry[]): Promise<string> {
  const batch = await getAI().messages.batches.create({
    requests: entries.map((e) => ({
      custom_id: e.customId,
      params: buildAnalyzeParams(e.input),
    })),
  })
  return batch.id
}

// Batches ya terminados creados en las últimas `windowHours`. Para reconciliar al
// arrancar el pipeline los batches HUÉRFANOS: enviados antes de un kill/timeout
// (worker-loop espera kills a media tanda), terminados server-side, nunca
// cosechados → sus productos quedaron score NULL y el próximo ciclo los re-enviaría
// = DOBLE COBRO. La lista viene newest-first, así que cortamos al pasar la ventana.
export async function listRecentEndedBatches(windowHours = 6): Promise<string[]> {
  const cutoff = Date.now() - windowHours * 3600_000
  const ids: string[] = []
  for await (const b of getAI().messages.batches.list({ limit: 100 })) {
    if (new Date(b.created_at).getTime() < cutoff) break
    if (b.processing_status === 'ended') ids.push(b.id)
  }
  return ids
}

// Check no-bloqueante: ¿terminó el batch? Lo usa el pipeline entrelazado para
// cosechar resultados entre nichos sin detener el scraping.
export async function isBatchDone(batchId: string): Promise<boolean> {
  const b = await getAI().messages.batches.retrieve(batchId)
  return b.processing_status === 'ended'
}

// Espera a que el batch termine. Típico <1h; el timeout protege el workflow
// (que tiene su propio cap de 10h).
export async function waitForBatch(
  batchId: string,
  pollMs = 60_000,
  timeoutMs = 4 * 3600_000
): Promise<void> {
  const ai = getAI()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const b = await ai.messages.batches.retrieve(batchId)
    if (b.processing_status === 'ended') return
    if (Date.now() > deadline) {
      throw new Error(`Batch ${batchId} no terminó en ${Math.round(timeoutMs / 60000)} min`)
    }
    console.log(`  batch ${batchId}: ${b.processing_status} · en proceso: ${b.request_counts.processing}`)
    await new Promise((r) => setTimeout(r, pollMs))
  }
}

export interface BatchOutcome {
  customId: string
  analysis?: ProductAnalysis
  error?: string
}

export async function* batchAnalysisResults(batchId: string): AsyncGenerator<BatchOutcome> {
  for await (const result of await getAI().messages.batches.results(batchId)) {
    if (result.result.type === 'succeeded') {
      try {
        yield { customId: result.custom_id, analysis: parseAnalysis(result.result.message.content) }
      } catch (e) {
        yield { customId: result.custom_id, error: e instanceof Error ? e.message : String(e) }
      }
    } else {
      // errored / expired / canceled — queda con score NULL y se reintenta
      // en la próxima corrida del cron.
      yield { customId: result.custom_id, error: result.result.type }
    }
  }
}
