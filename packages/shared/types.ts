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
  // Ads que mostraba la card del anunciante en búsqueda (collationCount).
  // Numerador del filtro anti-catálogo: main_product_ad_count / ad_count ≥ 0.6.
  // null si el payload no trajo el campo.
  main_product_ad_count: z.number().nullable().optional(),
  // Origen de los datos cuando no vienen del enrich estándar:
  //   'dom-fallback'  — GraphQL dio 0 nodos, extraído del DOM
  //   'search-card'   — construido desde la card de búsqueda sin visitar la
  //                     página (pool PE; counts aproximados, validate-pe da
  //                     los números en vivo después)
  source: z.enum(['dom-fallback', 'search-card']).optional(),
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
  priority: z.enum(['alta', 'media', 'baja']),
  reasoning: z.string(),         // por qué este score/prioridad
  // true SOLO si el producto no pertenece al nicho buscado (fuera_categoria).
  // El serving (toCard) lo oculta: un off-topic no debe mostrarse ni como relleno.
  // Ausente/false = pertenece al nicho (incluye baja por saturación, que SÍ se muestra).
  offTopic: z.boolean().optional().describe('true si el producto NO tiene relación con el nicho buscado (fuera_categoria). Omitir o false en cualquier otro caso, incluso si se descarta por saturación o por no ser físico.'),
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

// ─── Fila de ph_pe_pool (competidores PE — NO son productos) ──────────────────
// Alimenta el matching de competencia del análisis. Nunca se analiza con LLM
// ni se sirve en la UI: las reglas de oro (≥40 ads · ≥10 días · no-PE) hacen
// que un anunciante PE jamás califique como producto.

export interface PePoolRow {
  id: string
  niche: string
  page_id: string | null
  name: string | null
  raw_data: ProductRawData
  scraped_at: string
}

// ─── Fila de ph_watchlist (casi-ganadores — plan 13 parte E) ──────────────────
// Productos descartados por reglas de oro pero con tracción; el cron los
// re-chequea y promueve a ph_products cuando maduran.
export interface WatchlistRow {
  id: string
  niche: string
  page_id: string | null
  name: string | null
  raw_data: ProductRawData
  reason: string
  first_seen: string
  last_checked: string
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
  priority: 'alta' | 'media' | 'baja'
  score: number
  // Links a Meta Ads Library
  adUrl: string
  pageUrl: string
}

export interface SearchResponse {
  niche: string
  status: 'ready' | 'pending' | 'empty'
  products: ProductCard[]
  // Ganadores frescos para el usuario (no vistos en los últimos 7 días).
  totalUnseen: number
  // true cuando no hay ganadores (alta/media) y se muestran los mejores
  // candidatos disponibles por score — la UI lo etiqueta como tal.
  bestEffort?: boolean
  // pending + queued: nicho NUEVO recién encolado al scraper (cold start).
  // pending sin queued: nicho existe pero aún sin productos analizados.
  queued?: boolean
  // ready + allSeen: el usuario ya vio todos los ganadores frescos; se le
  // re-muestran los mejores (el pool no se vacía) mientras llegan nuevos.
  allSeen?: boolean
}

// ─── Nodo de anuncio capturado por el scraper ─────────────────────────────────
// Definido aquí (no en scraper.ts) para que dom-fallback.ts pueda importarlo
// sin crear una dependencia circular.

export interface AdNode {
  adArchiveID: string
  pageID: string
  pageName: string
  startDate: number | null
  // Count de ads de la card del anunciante (Etapa 1 del agente original).
  // null cuando el payload GraphQL no incluye el campo (comportamiento conservador:
  // el candidato pasa al enrich sin descarte por volumen).
  collationCount: number | null
  // Datos ricos del snapshot (Fase 1)
  bodyText: string | null
  title: string | null
  ctaText: string | null
  linkUrl: string | null
  pageCategories: string[]
}

// ─── Niche ────────────────────────────────────────────────────────────────────

export interface NicheRow {
  id: string
  // 'archived' = fuera de la cola de scrapeo (no está en la lista curada). Sus
  // productos se conservan/sirven; getNichesToRefresh/getActiveNiches lo excluyen.
  // 'blocked' = typo/genérico o anatomía sexual/explícita (ver blocklist.ts). Como
  // 'archived' sale de la cola, pero ADEMÁS /search no lo sirve ni lo re-encola.
  status: 'pending' | 'active' | 'archived' | 'blocked'
  last_scraped: string | null
  product_count: number
  // Keywords expandidas (≥15, modelo original) — seed estático o LLM en CI.
  keywords: string[] | null
  // true si ya corrió la pasada ampliada US/ES (garantía de output).
  expanded: boolean
  // Cursor de rotación de keywords por cron (plan 13 parte C). Default 0.
  keyword_cursor: number
  // Prioridad de scrapeo: mayor = entra antes al drain. Default 0. Las partes
  // del cuerpo se siembran con priority>0 vía `# @priority N` en niches.txt.
  priority: number
  // Dedup semántico: si está seteado, este nicho es un ALIAS de otro (mismo
  // mercado, ej. "calvicie"→"alopecia"). No se scrapea ni se sirve solo; el
  // route `search` resuelve el canónico y muestra su pool. null = es canónico.
  canonical_id: string | null
}
