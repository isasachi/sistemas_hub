// Resolución de keywords y países por nicho — compartido por scrape.ts y
// pipeline.ts (módulo sin main; los scripts CLI lo importan).
//
// ⚠️ COSTO: importa keyword-expansion.ts (Haiku, una llamada por nicho nuevo,
// cacheada en DB). Solo se importa desde scripts de CI, nunca desde Vercel.
import {
  getNicheStatus,
  saveNicheKeywords,
  saveNicheCursor,
  getTopCountriesForNiche,
} from '@ph/shared'
import { seedKeywords } from '@ph/shared'
import { expandNicheKeywords } from '../lib/product-hunter/keyword-expansion'
import { rotateKeywords } from '../lib/product-hunter/keyword-rotation'

// Países de descubrimiento para el nicho (ordenados por volumen de e-commerce
// LATAM). Antes solo MX+CO (2): la concurrencia del scraper quedaba ociosa y se
// perdía terreno. Ahora cubrimos LATAM completo para maximizar productos reales
// y diversidad — el core del producto es "ganador en LATAM aún no saturado en PE".
// Costo: el scrape/enrich es $0; el análisis (Anthropic) escala con los productos
// reales hallados, acotado por PH_ANALYZE_LIMIT (50/nicho/run). PE se añade aparte.
const DEFAULT_DISCOVERY = ['MX', 'CO', 'CL', 'AR', 'EC'] as const
const DISCOVERY_COUNT = DEFAULT_DISCOVERY.length

// Rotación de keywords (plan 13 parte C): opt-in para el cron (PH_KEYWORD_ROTATION=1).
// El seed/re-scrape manual la deja OFF → usa TODAS las keywords (máximo inventario).
const ROTATE = process.env.PH_KEYWORD_ROTATION === '1'
const ROTATE_WINDOW = Math.max(1, Number(process.env.PH_KEYWORD_WINDOW ?? 10))
// Cap del pool de keywords por nicho (PH_KEYWORD_CAP, 0 = sin cap). Acota el nº
// de keywords usadas/run para controlar el volumen de búsqueda (kw × países).
const KEYWORD_CAP = Math.max(0, Number(process.env.PH_KEYWORD_CAP ?? 0))

// Pool completo de keywords del nicho (modelo original: ≥15 en 4 direcciones):
//   1. cache en ph_niches.keywords  →  2. seed estático (keywords.ts)
//   →  3. expansión LLM (Haiku, una sola vez, queda cacheada en DB).
export async function resolveKeywords(niche: string): Promise<string[]> {
  const row = await getNicheStatus(niche)

  let pool = row?.keywords?.length ? row.keywords : null
  if (!pool) {
    const seed = seedKeywords(niche)
    if (seed) {
      await saveNicheKeywords(niche, seed)
      pool = seed
    } else {
      console.log(`[${niche}] sin keywords — expandiendo con LLM (una sola vez)...`)
      pool = await expandNicheKeywords(niche)
      await saveNicheKeywords(niche, pool)
      console.log(`[${niche}] ${pool.length} keywords generadas: ${pool.join(', ')}`)
    }
  }

  // Cap del pool (PH_KEYWORD_CAP): acota cuántas keywords se usan por nicho.
  if (KEYWORD_CAP > 0 && pool.length > KEYWORD_CAP) pool = pool.slice(0, KEYWORD_CAP)

  // Seed/re-scrape (ROTATE off): todas las keywords. Cron (ROTATE on): ventana rotativa.
  if (!ROTATE) return pool
  // Clamp adaptativo: la condición de no-solape entre corridas consecutivas es
  // N ≥ 2·window. Con pools chicos, una ventana fija (15) repetiría las mismas
  // keywords cada vuelta (rotación de mentira). Topamos la ventana a floor(N/2)
  // para garantizar dos mitades disjuntas. Pool 18 → 9; pool 24 → 12; window 15
  // solo toma efecto pleno con pools ≥30.
  const effectiveWindow = Math.min(ROTATE_WINDOW, Math.max(1, Math.floor(pool.length / 2)))
  const { selected, nextCursor } = rotateKeywords(pool, row?.keyword_cursor ?? 0, effectiveWindow)
  await saveNicheCursor(niche, nextCursor)
  console.log(`[${niche}] rotación: ${selected.length}/${pool.length} keywords (ventana ${effectiveWindow}, cursor → ${nextCursor})`)
  return selected
}

// Países de descubrimiento del nicho (LATAM completo) + PE para el pool de
// competidores. Prioriza los países donde el nicho ya tiene más ganadores
// (alta/media previos) y completa con DEFAULT_DISCOVERY hasta DISCOVERY_COUNT.
// PE siempre se añade al final — es el pool de competidores locales, no fuente
// de productos.
export async function resolveCountries(niche: string): Promise<string[]> {
  const top = await getTopCountriesForNiche(niche, DISCOVERY_COUNT)

  // Completar con defaults hasta DISCOVERY_COUNT países de descubrimiento
  const discovery = [...top]
  for (const def of DEFAULT_DISCOVERY) {
    if (discovery.length >= DISCOVERY_COUNT) break
    if (!discovery.includes(def)) discovery.push(def)
  }

  const source = top.length >= DISCOVERY_COUNT ? 'historial DB' : top.length ? 'DB + defaults' : 'defaults'
  console.log(`[${niche}] países: ${[...discovery, 'PE'].join(', ')} (${source})`)
  return [...discovery, 'PE']
}
