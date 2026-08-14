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

// ─── Research por URL (feature "pega un anuncio") ─────────────────────────────
// Cola independiente de la de nichos: un producto pegado NO pasa por las reglas
// de oro (queremos devolver su veredicto aunque tenga <40 ads o esté saturado en
// PE). Nunca toca ph_products. El worker (poller dedicado) la drena.

export interface MarketCompetitor {
  name: string
  adCount: number
  country: string
}

export interface UrlResearchResult {
  verdict: {
    productName: string
    whatItIs: string
    problemSolved: string
    attributes: string[]
    adCount: number
    daysRunning: number | null
    foundCountry: string
    pageName: string
    score: number
    priority: 'alta' | 'media' | 'baja'
    reasoning: string
  }
  // null = no se pudo verificar la competencia en PE (probe bloqueado — no
  // fabricamos "sin competencia", regla de oro).
  peScenario: z.infer<typeof PeScenario> | null
  peCompetitors: PeCompetitor[]
  marketCompetitors: MarketCompetitor[]
  adUrl: string
  pageUrl: string
}

export interface UrlResearchRow {
  id: string
  user_id: string | null
  url: string
  page_id: string | null
  ad_id: string | null
  status: 'pending' | 'processing' | 'ready' | 'error' | 'blocked'
  result: UrlResearchResult | null
  error: string | null
  created_at: string
  processed_at: string | null
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

// ─── Buscador SIMPLE (tool de testeo, temporal — tablas ph_raw_*) ─────────────
// Sin reglas de oro, sin análisis LLM: una entrada por anunciante y nicho, con
// lo básico de la card. `ad_count` solo sirve para agrupar por rango; no se
// expone al front (ver RawProductEntry).

export interface RawProductRow {
  niche: string
  page_id: string
  ad_id: string | null
  name: string | null
  ad_count: number
  country: string | null
  raw_data: {
    title?: string | null
    body?: string | null
    keyword?: string | null
    categories?: string[]
  }
  scraped_at: string
  // Veredicto de las tres reglas (pipeline nuevo). 'pendiente' = aún sin verificar.
  status?: 'pendiente' | 'monoproducto' | 'sin_verificar' | 'descartado' | 'inactivo'
  kind?: string | null
  share?: number | null
  product_name?: string | null
  verdict_note?: string | null
  verified_at?: string | null
  // Última vez que se comprobó que el anunciante sigue pautando (script de 48h).
  checked_at?: string | null
}

// Lo que ve el front del buscador.
export interface RawProductEntry {
  id: string            // `${niche}:${page_id}`
  advertiser: string
  productName: string | null   // lo que identificó el verificador
  title: string | null
  body: string | null
  country: string | null
  adCount: number
  adsUrl: string
}

// Respuesta del buscador: UN rango a la vez, 10 productos. `groups` sigue
// siendo lista (llega con un elemento) por si vuelve a servirse más de uno.
export interface RawBucketGroup {
  bucket: string
  label: string
  products: RawProductEntry[]
}

export interface RawSearchResponse {
  niche: string
  status: 'ready' | 'pending' | 'empty'
  queued?: boolean
  groups: RawBucketGroup[]
  total: number
}
