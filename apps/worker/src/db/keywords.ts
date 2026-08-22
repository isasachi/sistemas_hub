// Vocabulario y bandit (spec §2.5 y §10).
import { db } from './client'
import { normalizeQuery } from '../discovery/normalize-query'
import { debePodarse, type TermSource } from '../vocab/terms'

export interface Combinacion { term: string; country: string }

/** Alta de términos. Idempotente: un término que ya existe no se pisa. */
export async function upsertKeywords(
  terms: { term: string; source: TermSource | 'seed' }[],
): Promise<number> {
  if (!terms.length) return 0
  const filas = terms.map((t) => ({
    term: t.term,
    term_norm: normalizeQuery(t.term),
    source: t.source,
  }))
  const { data, error } = await db().from('disc_keywords')
    .upsert(filas, { onConflict: 'term', ignoreDuplicates: true })
    .select('term')
  if (error) throw new Error(`upsertKeywords: ${error.message}`)
  return data?.length ?? 0
}

/**
 * El batch del bandit: explotación + exploración (spec §10).
 *
 * ⚠️ EPSILON NO PUEDE SER 0 NI 1. Con 0 el motor no mira nunca un nicho nuevo y
 * se encierra en lo que ya conoce; con 1 nunca aprovecha lo que ya midió. 0,10
 * es el número del spec.
 */
export const EPSILON = Math.min(0.9, Math.max(0.01, Number(process.env.DISC_EPSILON ?? 0.10)))

export async function pickNextBatch(n: number): Promise<Combinacion[]> {
  if (n <= 0) return []
  const explorar = Math.max(1, Math.round(n * EPSILON))
  const explotar = Math.max(0, n - explorar)

  const ex = explotar > 0
    ? await db().rpc('disc_bandit_exploit', { p_limit: explotar, p_dias: 7 })
    : { data: [], error: null }
  if (ex.error) throw new Error(`bandit exploit: ${ex.error.message}`)
  const explotadas = (ex.data ?? []) as Combinacion[]

  // ⚠️ LO QUE LA EXPLOTACIÓN NO LLENA LO LLENA LA EXPLORACIÓN, y sin esto el
  // motor arranca al 10% de su capacidad. En frío `disc_keyword_country_state`
  // está VACÍA —ninguna combinación corrió todavía—, así que la rama de
  // explotación no devuelve nada y ε capa el ciclo entero a un job. Medido: con
  // capacidad 6 el scheduler encolaba 1. Pedir el faltante a exploración es la
  // lectura correcta de ε: es el piso de exploración, no su techo.
  const falta = n - explotadas.length
  const ep = await db().rpc('disc_bandit_explore', { p_limit: Math.max(explorar, falta) })
  if (ep.error) throw new Error(`bandit explore: ${ep.error.message}`)

  const out = [...explotadas, ...((ep.data ?? []) as Combinacion[])].slice(0, n)
  // Las dos ramas pueden traer la misma combinación (explore solo mira las que
  // nunca corrieron, así que no debería, pero un empate no puede duplicar un job).
  const vistas = new Set<string>()
  return out.filter((c) => {
    const k = `${c.term}|${c.country}`
    return vistas.has(k) ? false : (vistas.add(k), true)
  })
}

/**
 * Recalcula el estado de TODAS las combinaciones término×país desde los datos.
 *
 * ⚠️ SE DERIVA, NO SE ACUMULA. `qualified_pages` no se conoce al terminar el
 * descubrimiento —hace falta analizar landings y perfilar catálogos, horas más
 * tarde—, así que un contador que se incrementa al cerrar la corrida se
 * quedaría en cero y el bandit leería "este nicho no rinde" sobre todos.
 * Derivarlo también lo hace idempotente.
 */
export async function refrescarYield(): Promise<number> {
  const { data, error } = await db().rpc('disc_refresh_yield')
  if (error) throw new Error(`refrescarYield: ${error.message}`)
  return (data as number) ?? 0
}

/**
 * Poda (spec §10): apaga los términos que corrieron lo suficiente en todos sus
 * países y no rindieron en ninguno. Devuelve cuántos apagó.
 */
export async function podar(minRuns = 5, minYield = 0.01): Promise<string[]> {
  const { data: estados, error } = await db().from('disc_keyword_country_state')
    .select('term,runs,yield_rate').gte('runs', minRuns).limit(20_000)
  if (error) throw new Error(`podar: ${error.message}`)
  const porTermino = new Map<string, { runs: number; yieldRate: number | null }[]>()
  for (const e of (estados ?? []) as { term: string; runs: number; yield_rate: number | null }[]) {
    if (!porTermino.has(e.term)) porTermino.set(e.term, [])
    porTermino.get(e.term)!.push({ runs: e.runs, yieldRate: e.yield_rate })
  }
  const apagar = [...porTermino.entries()]
    .filter(([, es]) => debePodarse(es, minRuns, minYield))
    .map(([t]) => t)
  for (let i = 0; i < apagar.length; i += 200) {
    await db().from('disc_keywords').update({ is_active: false }).in('term', apagar.slice(i, i + 200))
  }
  return apagar
}

/** Recalcula el IDF de los términos contra el corpus de landings (spec §10). */
export async function actualizarIdf(scores: { term: string; idf: number }[]): Promise<void> {
  for (let i = 0; i < scores.length; i += 100) {
    await Promise.all(scores.slice(i, i + 100).map(async (s) => {
      await db().from('disc_keywords')
        .update({ idf_score: Number(s.idf.toFixed(4)) }).eq('term', s.term)
    }))
  }
}
