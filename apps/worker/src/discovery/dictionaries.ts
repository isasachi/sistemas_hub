// Diccionarios semánticos (spec §5). SIN LLM y sin base de datos: son archivos
// JSON versionados en el repo, así que dos corridas de la misma semilla piden
// exactamente las mismas keywords.
//
// La cascada de fallback es deliberada y es lo que hace que el motor sirva para
// una semilla que nadie escribió a mano todavía:
//   1. data/dictionaries/<clave>.json — el diccionario curado
//   2. seedKeywords() de @ph/shared    — los 5 nichos fundadores del motor viejo
//   3. la semilla a secas              — nunca cero queries
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedKeywords } from '@ph/shared'
import { dictionaryKey, normalizeQuery } from './normalize-query'

export interface KeywordExpansion {
  problem: string[]
  symptom: string[]
  intent: string[]
  commercial: string[]
  product: string[]
}

const EMPTY: KeywordExpansion = { problem: [], symptom: [], intent: [], commercial: [], product: [] }

// Se resuelve desde este archivo y no desde process.cwd(): el CLI se invoca
// tanto desde apps/worker como desde la raíz del monorepo, y con cwd el
// diccionario "desaparece" según desde dónde se corra.
const DICT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/dictionaries')

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/**
 * Diccionario de la semilla, o null si no existe archivo curado.
 * Devolver null (en vez de EMPTY) es lo que le permite a expandKeyword saber
 * que tiene que caer al seed de @ph/shared.
 */
export function loadDictionary(seed: string): KeywordExpansion | null {
  const file = join(DICT_DIR, `${dictionaryKey(seed)}.json`)
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    return {
      problem: asList(raw.problem),
      symptom: asList(raw.symptom),
      intent: asList(raw.intent),
      commercial: asList(raw.commercial),
      product: asList(raw.product),
    }
  } catch {
    // Un JSON roto no puede tumbar la corrida: se cae al fallback, que siempre
    // devuelve al menos la semilla.
    return null
  }
}

/**
 * Diccionario efectivo: el curado, o el seed estático del motor viejo mapeado a
 * `product` (que es lo que esas listas son: soluciones y formatos de producto).
 */
export function resolveDictionary(seed: string): KeywordExpansion {
  const curated = loadDictionary(seed)
  if (curated) return curated
  const fallback = seedKeywords(normalizeQuery(seed).replace(/\s+/g, ''))
    ?? seedKeywords(normalizeQuery(seed))
  return fallback ? { ...EMPTY, product: fallback } : EMPTY
}

/** Semillas con diccionario curado (para el `--list` del CLI). */
export function listDictionaries(): string[] {
  if (!existsSync(DICT_DIR)) return []
  return readdirSync(DICT_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
}

export interface RegionalTerms { [country: string]: { terms: string[] } }

export function loadRegional(): RegionalTerms {
  const file = join(DICT_DIR, '_regional.json')
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as RegionalTerms
  } catch {
    return {}
  }
}
