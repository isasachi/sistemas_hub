// Scheduler (spec §9 y §10). Corre cada ciclo del loop y NO scrapea nada: solo
// decide qué se va a mirar y lo deja en la cola.
//
//   npx tsx src/cli/scheduler.ts                 (un ciclo)
//   npx tsx src/cli/scheduler.ts --capacidad 20  (cuántos jobs encolar)
//   npx tsx src/cli/scheduler.ts --dry-run       (dice qué haría)
//
// ⚠️ SEPARADO DEL WORKER A PROPÓSITO. Decidir es barato y falla distinto que
// navegar: si el scheduler revienta, la cola conserva lo que ya había y el
// worker sigue drenando. Mezclarlos hace que un error de decisión pare el
// trabajo.
import '../../scripts/bootstrap'
import { db } from '../db/client'
import { enqueue, reap, pendientes, limpiarHuerfanos, yaEnCola } from '../db/jobs'
import { pickNextBatch, podar, refrescarYield, EPSILON } from '../db/keywords'
import { repartoCiclo } from '../scheduler/budget'

/** Jobs que se encolan por ciclo. Es capacidad, no un objetivo de producción. */
const CAPACIDAD = Math.max(1, Number(process.env.DISC_CAPACIDAD ?? 12))

/** `discover:<término>:<país>:<YYYYMMDDHH>` — mismo formato que el del recrawl. */
function dedupKey(term: string, country: string, ahora: Date): string {
  const h = ahora.toISOString().slice(0, 13).replace(/[-T:]/g, '')
  return `discover:${term}:${country}:${h}`
}

/**
 * Corre un paso de MANTENIMIENTO sin que su fallo pare el ciclo.
 *
 * ⚠️ EL PRINCIPIO: descubrir es el trabajo; rescatar, refrescar el yield, podar
 * y limpiar huérfanos son mantenimiento. Todos corren ANTES de encolar, así que
 * una excepción en cualquiera dejaba el ciclo sin repartir trabajo — la cola se
 * drenaba y nada volvía a llenarla. Pasó tres veces con `refrescarYield` y un
 * `statement_timeout`, y cada arreglo puntual solo movía el umbral: el costo de
 * ese refresco crece con lo que el daemon descubre, que es justo lo que este
 * motor maximiza.
 *
 * El mantenimiento saltado se recupera solo en el ciclo siguiente. Encolar, no.
 * Se loguea fuerte para que un fallo persistente se vea en vez de degradar en
 * silencio.
 */
async function mantenimiento<T>(nombre: string, fn: () => Promise<T>, siFalla: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`⚠️  ${nombre} saltado este ciclo (se sigue encolando): ${msg}`)
    return siFalla
  }
}

async function main() {
  const args = process.argv.slice(2)
  const val = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined }
  const capacidad = Math.max(1, Number(val('--capacidad') ?? CAPACIDAD))
  const dryRun = args.includes('--dry-run')

  // 1. Rescatar lo que quedó tomado por un worker que murió. Va PRIMERO: sin
  //    esto, un job trabado ocupa lugar en la cola para siempre y su semilla no
  //    se vuelve a mirar nunca.
  const rescatados = dryRun ? 0 : await mantenimiento('rescate de jobs', () => reap(15), 0)

  // 2. Refrescar el rendimiento medido y apagar lo que no rinde. También va
  //    antes de elegir: el bandit tiene que decidir con los números de hoy, no
  //    con los del ciclo pasado.
  //
  //
  // ⚠️ La poda va en el MISMO paso que el refresco, no en uno propio: sin
  //    refresco decidiría sobre números viejos, y apagar un término es una
  //    puerta de una sola dirección.
  const { combinaciones, apagados } = dryRun
    ? { combinaciones: 0, apagados: [] as string[] }
    : await mantenimiento(
      'yield/poda',
      async () => ({ combinaciones: await refrescarYield(), apagados: await podar() }),
      { combinaciones: 0, apagados: [] as string[] },
    )

  // 2b. Y se tira lo que la poda (o una consolidación anterior) dejó huérfano en
  //     la cola: un job de un término apagado es trabajo que ya se decidió no
  //     hacer, y si es un `rank` es el paso más caro del motor.
  const huerfanos = dryRun ? 0 : await mantenimiento('limpieza de huérfanos', limpiarHuerfanos, 0)

  // 3. Reparto fijo de capacidad (spec §9).
  const { descubrir, recrawl } = repartoCiclo(capacidad)

  // 4. Descubrimiento: UN JOB POR (término, país), que es la unidad del bandit.
  //
  // ⚠️ NO SE AGRUPAN LOS PAÍSES DE UN MISMO TÉRMINO, y agruparlos fue un bug
  // real: al consolidar los diccionarios, un nicho fusionado como "faja lumbar"
  // pasó de 10 a 86 queries, así que un job con sus 5 países eran 430 búsquedas
  // ≈ 17 min a las 25/min medidas — por encima del tope de 12 min del runner y
  // del plazo de 15 min del reaper. El job moría, volvía a la cola y moría otra
  // vez, para siempre. Con un país por job el peor caso es el tope de queries
  // (100) × 1 país ≈ 4 min.
  const todos = await pickNextBatch(descubrir)
  // ⚠️ Lo que ya espera en la cola NO se vuelve a encolar. El bandit sigue
  // eligiendo una combinación mientras su `last_run_at` sea null, y eso solo se
  // llena cuando la corrida ocurre de verdad: sin este filtro, una combinación
  // que tarda en drenarse se encola otra vez cada hora. Medido: "juguetes
  // educativos"/PE se descubrió dos veces, 158 páginas contra Meta repetidas.
  const enCola = await yaEnCola(todos)
  const picks = todos.filter((p) => !enCola.has(`${p.term}|${p.country}`))
  const ahora = new Date()
  const jobs = picks.map((p) => ({
    kind: 'discover' as const,
    payload: { term: p.term, countries: [p.country] },
    priority: 3,
    dedupKey: dedupKey(p.term, p.country, ahora),
  }))
  const encolados = dryRun ? jobs.length : await enqueue(jobs)

  // 5. Recrawl por tier. Va en SQL (`INSERT … SELECT … ON CONFLICT DO NOTHING`)
  //    para que correr el scheduler dos veces en el mismo ciclo no duplique.
  let recrawls = 0
  if (!dryRun && recrawl > 0) {
    const { data, error } = await db().rpc('disc_enqueue_recrawls', { p_limit: recrawl })
    if (error) throw new Error(`disc_enqueue_recrawls: ${error.message}`)
    recrawls = (data as number) ?? 0
  }

  console.log(
    `${dryRun ? '[DRY-RUN] ' : ''}ciclo · capacidad ${capacidad} ` +
    `(${descubrir} descubrir / ${recrawl} recrawl · ε=${EPSILON})\n` +
    `  ${rescatados} jobs rescatados · ${combinaciones} combinaciones con yield al día · ` +
    `${apagados.length} términos apagados · ${huerfanos} jobs huérfanos borrados\n` +
    `  ${encolados} jobs de descubrimiento (uno por término×país` +
    `${todos.length > picks.length ? `, ${todos.length - picks.length} ya en cola` : ''})\n` +
    `  ${recrawls} auditorías de recrawl`,
  )
  if (apagados.length) console.log(`  apagados: ${apagados.slice(0, 10).join(', ')}${apagados.length > 10 ? '…' : ''}`)
  if (!dryRun) {
    console.log(`  en cola: ${await pendientes('discover')} discover · ${await pendientes('audit')} audit`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
