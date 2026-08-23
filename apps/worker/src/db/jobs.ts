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
