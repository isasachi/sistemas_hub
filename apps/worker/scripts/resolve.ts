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

// Países de descubrimiento cuando el nicho no tiene historial en DB.
// MX y CO son los mercados LATAM más grandes y activos en e-commerce.
const DEFAULT_DISCOVERY = ['MX', 'CO'] as const

// Rotación de keywords (plan 13 parte C): opt-in para el cron (PH_KEYWORD_ROTATION=1).
// El seed/re-scrape manual la deja OFF → usa TODAS las keywords (máximo inventario).
const ROTATE = process.env.PH_KEYWORD_ROTATION === '1'
const ROTATE_WINDOW = Math.max(1, Number(process.env.PH_KEYWORD_WINDOW ?? 10))

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

  // Seed/re-scrape (ROTATE off): todas las keywords. Cron (ROTATE on): ventana rotativa.
  if (!ROTATE) return pool
  const { selected, nextCursor } = rotateKeywords(pool, row?.keyword_cursor ?? 0, ROTATE_WINDOW)
  await saveNicheCursor(niche, nextCursor)
  console.log(`[${niche}] rotación: ${selected.length}/${pool.length} keywords (cursor → ${nextCursor})`)
  return selected
}

// Selecciona los 2 países de descubrimiento óptimos para el nicho más PE.
//
// Lógica: usa los 2 países donde el nicho ya tiene más productos ganadores
// (alta/media en el análisis previo). Para nichos nuevos sin historial, usa
// MX + CO (los mercados LATAM con mayor volumen de e-commerce).
// PE siempre se añade al final — es el pool de competidores locales.
export async function resolveCountries(niche: string): Promise<string[]> {
  const top = await getTopCountriesForNiche(niche, 2)

  // Completar con defaults si el historial no alcanza 2 países
  const discovery = [...top]
  for (const def of DEFAULT_DISCOVERY) {
    if (discovery.length >= 2) break
    if (!discovery.includes(def)) discovery.push(def)
  }

  const source = top.length >= 2 ? 'historial DB' : top.length === 1 ? 'DB + default' : 'defaults'
  console.log(`[${niche}] países: ${[...discovery, 'PE'].join(', ')} (${source})`)
  return [...discovery, 'PE']
}
