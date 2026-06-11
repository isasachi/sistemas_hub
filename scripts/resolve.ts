// Resolución de keywords y países por nicho — compartido por scrape.ts y
// pipeline.ts (módulo sin main; los scripts CLI lo importan).
//
// ⚠️ COSTO: importa keyword-expansion.ts (Haiku, una llamada por nicho nuevo,
// cacheada en DB). Solo se importa desde scripts de CI, nunca desde Vercel.
import {
  getNicheStatus,
  saveNicheKeywords,
  getTopCountriesForNiche,
} from '../lib/product-hunter/db'
import { seedKeywords } from '../lib/product-hunter/keywords'
import { expandNicheKeywords } from '../lib/product-hunter/keyword-expansion'

// Países de descubrimiento cuando el nicho no tiene historial en DB.
// MX y CO son los mercados LATAM más grandes y activos en e-commerce.
const DEFAULT_DISCOVERY = ['MX', 'CO'] as const

// Keywords del nicho (modelo original: ≥15 en 4 direcciones):
//   1. cache en ph_niches.keywords  →  2. seed estático (keywords.ts)
//   →  3. expansión LLM (Haiku, una sola vez, queda cacheada en DB).
export async function resolveKeywords(niche: string): Promise<string[]> {
  const row = await getNicheStatus(niche)
  if (row?.keywords?.length) return row.keywords

  const seed = seedKeywords(niche)
  if (seed) {
    await saveNicheKeywords(niche, seed)
    return seed
  }

  console.log(`[${niche}] sin keywords — expandiendo con LLM (una sola vez)...`)
  const expanded = await expandNicheKeywords(niche)
  await saveNicheKeywords(niche, expanded)
  console.log(`[${niche}] ${expanded.length} keywords generadas: ${expanded.join(', ')}`)
  return expanded
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
