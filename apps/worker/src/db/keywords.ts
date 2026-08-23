// Vocabulario y bandit (spec §2.5 y §10).
import { db } from './client'
import { normalizeQuery } from '../discovery/normalize-query'
import { debePodarse, podaConfirmada, type TermSource } from '../vocab/terms'

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
 * Recalcula el estado de las combinaciones término×país desde los datos.
 *
 * ⚠️ SE DERIVA, NO SE ACUMULA. `qualified_pages` no se conoce al terminar el
 * descubrimiento —hace falta analizar landings y perfilar catálogos, horas más
 * tarde—, así que un contador que se incrementa al cerrar la corrida se
 * quedaría en cero y el bandit leería "este nicho no rinde" sobre todos.
 * Derivarlo también lo hace idempotente.
 *
 * ⚠️ PERO RECALCULARLO ENTERO NO ESCALA, Y EL TECHO SON 8 SEGUNDOS: el worker
 * habla por PostgREST con `service_role`, que hereda el `statement_timeout` de
 * `authenticator`. Con 78.000 descubrimientos el recálculo completo tarda 3,4 s
 * y este motor existe para que esa tabla crezca — ya se pasó una vez, y no
 * falla solo este paso: el scheduler lanza ANTES de encolar, así que el motor
 * deja de repartir trabajo. `desde` acota a los términos que cambiaron (corrida
 * o fila rankeada nuevas); el resto conserva su valor, que ya es el correcto.
 *
 * ⚠️ LA VENTANA TIENE QUE CUBRIR EL PEOR CICLO, no el típico: un término cuya
 * corrida cerró fuera de la ventana no se refresca hasta que vuelva a correr.
 * El daemon duerme 10 min entre ciclos, así que 2 h son 12× de margen. Medido:
 * 15 términos y 0,10 s contra 3,4 s del recálculo completo.
 */
export async function refrescarYield(desde: string | null = '2 hours', terminos?: string[]): Promise<number> {
  const { data, error } = await db().rpc('disc_refresh_yield', {
    p_since: desde, p_terms: terminos ?? null,
  })
  if (error) throw new Error(`refrescarYield: ${error.message}`)
  return (data as number) ?? 0
}

/**
 * Poda (spec §10): apaga los términos que corrieron lo suficiente en todos sus
 * países y no rindieron en ninguno. Devuelve cuántos apagó.
 *
 * ⚠️ ESTO NO ES EL BANDIT, Y POR ESO NO PUEDE LEER UN `yield_rate` VIEJO. La
 * ventana de `refrescarYield` se justifica con que el yield es una PRIORIDAD:
 * un número algo atrasado hace que el bandit elija un poco peor y se corrige
 * solo. Acá el mismo número se convierte en `is_active = false`, y un término
 * apagado sale del bandit → no vuelve a correr → no vuelve a entrar en la
 * ventana → su cero viejo no se corrige NUNCA. Puerta de una sola dirección.
 *
 * El camino es la deriva documentada en `refrescarYield`: una página descubierta
 * bajo el término A y rankeada bajo el B refresca a B y no a A. Hoy no hay
 * ninguna instancia observada; lo que sí está medido es que refrescar cambia el
 * veredicto: 41 candidatos → 39, 2 salvados.
 *
 * Por eso los candidatos se refrescan y se vuelven a filtrar antes de escribir.
 * Acotado a esos términos y no al recálculo completo: el completo son 3,4 s de
 * un presupuesto de 8 y crece con la tabla — una válvula que caduca sola.
 */
export async function podar(minRuns = 5, minYield = 0.01): Promise<string[]> {
  // ⚠️ PAGINADO. PostgREST corta en 1000 filas AUNQUE se le pida más: un
  // `.limit(20_000)` devuelve 1000 y no avisa. Con el vocabulario creciendo,
  // eso dejaba de podar todo lo que quedara fuera de esas primeras 1000 —
  // silenciosamente, que es el peor modo de fallo posible para una poda.
  const estados: { term: string; runs: number; yield_rate: number | null }[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db().from('disc_keyword_country_state')
      .select('term,runs,yield_rate').gte('runs', minRuns).range(i, i + 999)
    if (error) throw new Error(`podar: ${error.message}`)
    if (!data?.length) break
    estados.push(...(data as typeof estados))
    if (data.length < 1000) break
  }
  const porTermino = new Map<string, { runs: number; yieldRate: number | null }[]>()
  for (const e of estados) {
    if (!porTermino.has(e.term)) porTermino.set(e.term, [])
    porTermino.get(e.term)!.push({ runs: e.runs, yieldRate: e.yield_rate })
  }
  const candidatos = [...porTermino.entries()]
    .filter(([, es]) => debePodarse(es, minRuns, minYield))
    .map(([t]) => t)

  // Segunda vuelta sobre números frescos. Sin candidatos no se refresca nada:
  // el caso normal de un ciclo es podar cero.
  let apagar = candidatos
  if (candidatos.length) {
    const porTerminoFresco = new Map<string, { runs: number; yieldRate: number | null }[]>()
    // ⚠️ EL LOTE SE MIDE EN TÉRMINOS Y EL TOPE DE POSTGREST EN FILAS, y un
    // término trae UNA FILA POR PAÍS. Con 200 términos y 5 países son 1000
    // filas, o sea justo el corte silencioso contra el que advierte el
    // comentario de la primera vuelta — y muerde precisamente acá, porque un
    // candidato a poda tiene `runs >= 5` en todos los países en los que
    // aparece: son los términos con MÁS filas. A 100 × 6 países quedan 600, con
    // margen para que la cobertura por país siga creciendo (que es lo que el
    // bandit existe para hacer).
    const LOTE = 100
    for (let i = 0; i < candidatos.length; i += LOTE) {
      const lote = candidatos.slice(i, i + LOTE)
      // Se refresca POR LOTE y no todo junto: en un ciclo de poda masiva (acá se
      // apagaron 420 términos de una) refrescarlos todos se acerca al recálculo
      // completo, y esto corre en la misma fase pre-encolado que acaba de morir
      // por pasarse de los 8 s.
      await refrescarYield(null, lote)
      const { data, error } = await db().from('disc_keyword_country_state')
        // El mismo `.gte(runs)` que la primera vuelta: `debePodarse` exige
        // `runs >= minRuns` en CADA fila, así que traer también los países con
        // pocas corridas cambiaría el criterio de contrabando.
        .select('term,runs,yield_rate').gte('runs', minRuns).in('term', lote)
      if (error) throw new Error(`podar: ${error.message}`)
      for (const e of (data ?? []) as typeof estados) {
        if (!porTerminoFresco.has(e.term)) porTerminoFresco.set(e.term, [])
        porTerminoFresco.get(e.term)!.push({ runs: e.runs, yieldRate: e.yield_rate })
      }
    }
    apagar = podaConfirmada(candidatos, porTerminoFresco, minRuns, minYield)
    // Sin condicionar a que haya salvados: un lote truncado no salva a nadie y
    // el ciclo imprimiría `0 términos apagados`, idéntico a "no había nada que
    // podar". Es el mismo no-op silencioso que costó 23 corridas.
    console.log(`  poda · ${candidatos.length} candidatos → ${apagar.length} apagados (${candidatos.length - apagar.length} salvados al refrescar su yield)`)
  }

  for (let i = 0; i < apagar.length; i += 200) {
    await db().from('disc_keywords').update({ is_active: false }).in('term', apagar.slice(i, i + 200))
  }
  return apagar
}

export interface IdfScore { term: string; term_norm: string; source: string; idf: number }

/**
 * Recalcula el IDF de los términos contra el corpus de landings (spec §10).
 *
 * ⚠️ EN LOTES, NO UN UPDATE POR TÉRMINO. La versión anterior mandaba una
 * petición HTTP por término: con 842 en el vocabulario eran 842 round-trips en
 * CADA ciclo del loop, y medido dejaba el paso `vocab` corriendo minutos —
 * creciendo con el vocabulario, que es justo lo que este motor hace crecer. El
 * upsert necesita la fila completa (`term_norm` y `source` son NOT NULL), así
 * que quien llama los trae del mismo SELECT con el que arma la lista.
 */
export async function actualizarIdf(scores: IdfScore[]): Promise<void> {
  for (let i = 0; i < scores.length; i += 500) {
    const filas = scores.slice(i, i + 500).map((s) => ({
      term: s.term,
      term_norm: s.term_norm,
      source: s.source,
      idf_score: Number(s.idf.toFixed(4)),
    }))
    const { error } = await db().from('disc_keywords').upsert(filas, { onConflict: 'term' })
    if (error) throw new Error(`actualizarIdf: ${error.message}`)
  }
}
