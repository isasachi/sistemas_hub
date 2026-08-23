// La cola (spec §2.6). Postgres, sin Redis.
import { db } from './client'

// 'rank' se encola solo, cuando termina el descubrimiento que lo alimenta: la
// relevancia se mide contra la semilla de ESA corrida, así que no puede correr
// sobre un backlog mezclado de nichos.
export type JobKind = 'discover' | 'audit' | 'rank'

export interface Job {
  id: number
  kind: JobKind
  payload: Record<string, unknown>
  priority: number
  attempts: number
  max_attempts: number
}

/**
 * Encola en lote, ignorando lo que ya estaba encolado.
 *
 * ⚠️ `dedup_key` es UNIQUE y el upsert lo IGNORA (no lo pisa): re-encolar el
 * mismo trabajo no puede resetear los intentos de uno que ya está corriendo.
 */
export async function enqueue(
  rows: { kind: JobKind; payload: Record<string, unknown>; priority?: number; dedupKey: string }[],
): Promise<number> {
  if (!rows.length) return 0
  const { data, error } = await db().from('disc_jobs')
    .upsert(
      rows.map((r) => ({
        kind: r.kind, payload: r.payload, priority: r.priority ?? 5, dedup_key: r.dedupKey,
      })),
      { onConflict: 'dedup_key', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw new Error(`enqueue: ${error.message}`)
  return data?.length ?? 0
}

/**
 * Toma UN job de la cola, atómicamente.
 *
 * ⚠️ Va por RPC porque PostgREST no sabe `FOR UPDATE SKIP LOCKED`. Sin eso dos
 * workers se llevan el mismo job y se paga dos veces la misma navegación.
 */
export async function claim(kind: JobKind, worker: string): Promise<Job | null> {
  const { data, error } = await db().rpc('disc_claim_job', { p_kind: kind, p_worker: worker })
  if (error) throw new Error(`claim: ${error.message}`)
  const rows = (data ?? []) as Job[]
  return rows[0] ?? null
}

export async function complete(id: number): Promise<void> {
  const { error } = await db().from('disc_jobs')
    .update({ status: 'done', finished_at: new Date().toISOString(), locked_at: null, locked_by: null })
    .eq('id', id)
  if (error) throw new Error(`complete: ${error.message}`)
}

/**
 * Devuelve el job a la cola, o lo mata si ya agotó los intentos.
 *
 * ⚠️ El reintento sale con `run_after` en el futuro (backoff). Reintentar al
 * instante contra Meta es cómo un soft-block transitorio se vuelve permanente:
 * el repo ya tiene medido que re-sondear una IP caliente escala el bloqueo.
 */
export async function fail(job: Job, motivo: string): Promise<void> {
  const muerto = job.attempts >= job.max_attempts
  const backoffMin = Math.min(60, 5 * 2 ** (job.attempts - 1))
  const { error } = await db().from('disc_jobs').update({
    status: muerto ? 'dead' : 'pending',
    last_error: motivo.slice(0, 500),
    locked_at: null,
    locked_by: null,
    run_after: muerto ? undefined : new Date(Date.now() + backoffMin * 60_000).toISOString(),
    finished_at: muerto ? new Date().toISOString() : null,
  }).eq('id', job.id)
  if (error) throw new Error(`fail: ${error.message}`)
}

/** Jobs cuyo worker murió con el job tomado. Devuelve cuántos rescató. */
export async function reap(minutos = 15): Promise<number> {
  const { data, error } = await db().rpc('disc_reap_jobs', { p_minutes: minutos })
  if (error) throw new Error(`reap: ${error.message}`)
  return (data as number) ?? 0
}

/**
 * Devuelve el job a la cola SIN gastarle un intento.
 *
 * ⚠️ NO ES `fail`. Un job que todavía no puede correr —su corrida espera el
 * análisis— no falló: si se le contara el intento, a los 3 aplazamientos
 * quedaría `dead` y su nicho no se rankearía jamás.
 */
export async function aplazar(job: Job, minutos: number, motivo: string): Promise<void> {
  const { error } = await db().from('disc_jobs').update({
    status: 'pending',
    attempts: Math.max(0, job.attempts - 1),
    locked_at: null,
    locked_by: null,
    last_error: motivo.slice(0, 500),
    run_after: new Date(Date.now() + minutos * 60_000).toISOString(),
  }).eq('id', job.id)
  if (error) throw new Error(`aplazar: ${error.message}`)
}

/**
 * ¿Cuántos anuncios de esta corrida siguen SIN analizar?
 *
 * ⚠️ ES LO QUE EVITA RANKEAR DE MÁS TEMPRANO. El job de `rank` se encola en
 * cuanto termina el descubrimiento, pero `analyze` drena un backlog GLOBAL de
 * miles: la corrida nueva puede seguir entera sin analizar cuando su ranking
 * llega a la cola. Medido, con esto roto: "monitor de bebe" descubrió 416
 * anuncios, rankeó 0 y el job quedó `done` — el nicho entero se perdía en
 * silencio, y con él "callos" (158 aceptados) y "cepillo para perro" (162).
 */
export async function sinAnalizarDeLaCorrida(runId: string): Promise<number> {
  const { data: qs } = await db().from('disc_search_queries').select('id').eq('run_id', runId)
  const qids = ((qs ?? []) as { id: string }[]).map((q) => q.id)
  if (!qids.length) return 0

  const ads = new Set<string>()
  for (let i = 0; i < qids.length; i += 100) {
    const { data } = await db().from('disc_ad_discoveries')
      .select('ad_id').in('query_id', qids.slice(i, i + 100)).limit(20_000)
    for (const d of (data ?? []) as { ad_id: string }[]) ads.add(d.ad_id)
  }
  if (!ads.size) return 0

  const ids = [...ads]
  let sinAnalizar = 0
  for (let i = 0; i < ids.length; i += 200) {
    const { count } = await db().from('disc_ads')
      .select('*', { count: 'exact', head: true })
      .in('id', ids.slice(i, i + 200)).is('analyzed_at', null)
    sinAnalizar += count ?? 0
  }
  return sinAnalizar
}

/**
 * De una lista de (término, país), los que YA tienen un job de descubrimiento
 * esperando o corriendo.
 *
 * ⚠️ MISMO FALLO QUE TENÍA EL RECRAWL, en la otra cola. El `dedup_key` lleva la
 * hora dentro para que la corrida de mañana no choque con la de hoy — pero eso
 * deja que una combinación todavía sin drenar se encole otra vez a la hora
 * siguiente, porque el bandit la sigue viendo pendiente (su `last_run_at` sigue
 * null hasta que la corrida ocurre). Medido: "juguetes educativos"/PE se
 * descubrió DOS veces —1.883 anuncios y 158 páginas contra Meta repetidas— y
 * "cojin ortopedico"/AR tenía dos jobs en cola.
 */
export async function yaEnCola(
  picks: { term: string; country: string }[],
): Promise<Set<string>> {
  const out = new Set<string>()
  if (!picks.length) return out
  const { data } = await db().from('disc_jobs')
    .select('payload').eq('kind', 'discover').in('status', ['pending', 'running']).limit(5000)
  for (const j of (data ?? []) as { payload: { term?: string; countries?: string[] } }[]) {
    const t = j.payload?.term
    if (!t) continue
    for (const c of j.payload?.countries ?? []) out.add(`${t}|${c}`)
  }
  return out
}

export async function pendientes(kind: JobKind): Promise<number> {
  const { count } = await db().from('disc_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind).eq('status', 'pending')
  return count ?? 0
}

/**
 * Borra los jobs pendientes cuyo término ya no está activo en el vocabulario.
 *
 * ⚠️ VA EN EL SCHEDULER, NO EN CADA SCRIPT QUE DESACTIVA. Un término se apaga
 * por tres caminos —la consolidación, la purga de vocabulario y la `podar()` del
 * bandit, que corre CADA CICLO— y los tres dejarían jobs huérfanos. Uno de
 * `discover` correría con el fallback de semilla pelada y parecería una búsqueda
 * que funciona; uno de `rank` haría el deep crawl de sus anunciantes, que es el
 * paso más caro contra Meta. Medido: 5 rankings pendientes de nichos ya
 * jubilados (`multi`, `termica`, `cancer`, `camara de seguridad`, `callos`).
 */
export async function limpiarHuerfanos(): Promise<number> {
  const activos = new Set<string>()
  for (let i = 0; ; i += 1000) {
    const { data } = await db().from('disc_keywords')
      .select('term').eq('is_active', true).range(i, i + 999)
    if (!data?.length) break
    for (const r of data as { term: string }[]) activos.add(r.term)
    if (data.length < 1000) break
  }
  // Sin vocabulario activo NO se borra nada: sería tomar un fallo de lectura por
  // "todos los términos están apagados" y vaciar la cola entera.
  if (!activos.size) return 0

  const { data: jobs } = await db().from('disc_jobs')
    .select('id,payload').in('kind', ['discover', 'rank']).eq('status', 'pending').limit(5000)
  const muertos = ((jobs ?? []) as { id: number; payload: { term?: string } }[])
    .filter((j) => j.payload?.term && !activos.has(j.payload.term))
    .map((j) => j.id)
  for (let i = 0; i < muertos.length; i += 200) {
    await db().from('disc_jobs').delete().in('id', muertos.slice(i, i + 200))
  }
  return muertos.length
}
