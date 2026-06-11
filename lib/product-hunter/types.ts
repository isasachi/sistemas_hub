import { z } from 'zod'

// ─── Datos crudos del scraper (lo que va en ph_products.raw_data) ─────────────

// Snippet de creativo capturado por el scraper (Fase 1 — datos ricos)
export const CreativeSnippetSchema = z.object({
  body: z.string().nullable(),
  title: z.string().nullable(),
  cta: z.string().nullable(),
  link: z.string().nullable(),
})
export type CreativeSnippet = z.infer<typeof CreativeSnippetSchema>

export const ProductRawDataSchema = z.object({
  page_id: z.string(),
  ad_id: z.string(),
  advertiser_name: z.string(),
  ad_count: z.number(),
  days_running: z.number().nullable(),
  oldest_date: z.string().nullable(),
  found_keyword: z.string(),
  found_country: z.string(),
  // Opcionales: solo existen en filas scrapeadas con el scraper enriquecido
  page_categories: z.array(z.string()).optional(),
  creatives: z.array(CreativeSnippetSchema).optional(),
})
export type ProductRawData = z.infer<typeof ProductRawDataSchema>

// ─── Análisis de Anthropic (lo que va en ph_products.analysis) ────────────────
// Escenarios de competencia en Perú:
//   A = 0 competidores · B = 2-3 con pocos ads · C = varios activos · D = saturado
export const PeScenario = z.enum(['A', 'B', 'C', 'D'])

export const PeCompetitorSchema = z.object({
  name: z.string(),
  adCount: z.number(),
})
export type PeCompetitor = z.infer<typeof PeCompetitorSchema>

export const ProductAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  productName: z.string(),       // producto concreto inferido (no el nombre de la página)
  whatItIs: z.string(),          // una línea simple
  problemSolved: z.string(),
  attributes: z.array(z.string()),          // cuáles de los 7 atributos cumple
  peScenario: PeScenario,
  peCompetitors: z.array(PeCompetitorSchema),
  priority: z.enum(['alta', 'media', 'descartado']),
  reasoning: z.string(),         // por qué este score/prioridad
  // Términos cortos (≤3 palabras) para validar competencia en PE en vivo (Fase 4).
  // Vacío en candidatos descartados.
  peSearchTerms: z.array(z.string()).default([]),
})
export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>

// Resultado de la validación PE en vivo (Fase 4) — se agrega a analysis.peValidation
export const PeValidationSchema = z.object({
  validated_at: z.string(),
  terms: z.array(z.object({
    term: z.string(),
    competitors: z.array(PeCompetitorSchema),
  })),
  scenario: PeScenario,          // escenario recalculado con datos en vivo
})
export type PeValidation = z.infer<typeof PeValidationSchema>

// Lo que realmente vive en ph_products.analysis (análisis LLM + validación opcional)
export type StoredAnalysis = ProductAnalysis & { peValidation?: PeValidation }

// ─── Fila de ph_products tal como vuelve de Supabase ──────────────────────────

export interface ProductRow {
  id: string
  niche: string
  page_id: string | null
  name: string | null
  raw_data: ProductRawData
  score: number | null
  analysis: StoredAnalysis | null
  scraped_at: string
  analyzed_at: string | null
}

// ─── Lo que la ruta /search devuelve al frontend ──────────────────────────────
// Solo metadatos — sin slides HTML.

export interface ProductCard {
  id: string
  advertiserName: string
  productName: string
  whatIs: string
  problemSolved: string
  adCount: number
  daysRunning: number | null
  foundCountry: string
  attributes: string[]
  peScenario: z.infer<typeof PeScenario>
  peCompetitors: PeCompetitor[]
  priority: 'alta' | 'media' | 'descartado'
  score: number
  // Links a Meta Ads Library
  adUrl: string
  pageUrl: string
}

export interface SearchResponse {
  niche: string
  status: 'ready' | 'pending' | 'empty'
  products: ProductCard[]
  totalUnseen: number
}

// ─── Niche ────────────────────────────────────────────────────────────────────

export interface NicheRow {
  id: string
  status: 'pending' | 'active'
  last_scraped: string | null
  product_count: number
}
