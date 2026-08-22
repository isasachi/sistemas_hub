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
import { enqueue, reap, pendientes } from '../db/jobs'
import { pickNextBatch, podar, refrescarYield, EPSILON } from '../db/keywords'
import { repartoCiclo } from '../scheduler/budget'

/** Jobs que se encolan por ciclo. Es capacidad, no un objetivo de producción. */
const CAPACIDAD = Math.max(1, Number(process.env.DISC_CAPACIDAD ?? 12))

/** `discover:<término>:<país>:<YYYYMMDDHH>` — mismo formato que el del recrawl. */
function dedupKey(term: string, country: string, ahora: Date): string {
  const h = ahora.toISOString().slice(0, 13).replace(/[-T:]/g, '')
  return `discover:${term}:${country}:${h}`
}

async function main() {
  const args = process.argv.slice(2)
  const val = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined }
  const capacidad = Math.max(1, Number(val('--capacidad') ?? CAPACIDAD))
  const dryRun = args.includes('--dry-run')

  // 1. Rescatar lo que quedó tomado por un worker que murió. Va PRIMERO: sin
  //    esto, un job trabado ocupa lugar en la cola para siempre y su semilla no
  //    se vuelve a mirar nunca.
  const rescatados = dryRun ? 0 : await reap(15)

  // 2. Refrescar el rendimiento medido y apagar lo que no rinde. También va
  //    antes de elegir: el bandit tiene que decidir con los números de hoy, no
  //    con los del ciclo pasado.
  const combinaciones = dryRun ? 0 : await refrescarYield()
  const apagados = dryRun ? [] : await podar()

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
  const picks = await pickNextBatch(descubrir)
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
    `${apagados.length} términos apagados\n` +
    `  ${encolados} jobs de descubrimiento (uno por término×país)\n` +
    `  ${recrawls} auditorías de recrawl`,
  )
  if (apagados.length) console.log(`  apagados: ${apagados.slice(0, 10).join(', ')}${apagados.length > 10 ? '…' : ''}`)
  if (!dryRun) {
    console.log(`  en cola: ${await pendientes('discover')} discover · ${await pendientes('audit')} audit`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
