// Drena la cola (spec §2.6). Toma jobs y los ejecuta.
//
//   npx tsx src/cli/run-jobs.ts                 (hasta --max jobs, o hasta vaciar)
//   npx tsx src/cli/run-jobs.ts --kind discover --max 3
//
// ⚠️ CADA JOB CORRE EN UN PROCESO APARTE (`discover.ts` como hijo), y no es
// pereza: un OOM de Chromium o un `process.exit` del CLI mataría el drenador
// entero si compartieran proceso, dejando el resto de la cola sin tocar. Además
// el CLI conserva su salida tal cual, que es lo que se lee en los logs del
// daemon. El costo es ~2 s de arranque de tsx contra ~4 min de trabajo.
//
// ⚠️ SECUENCIAL A PROPÓSITO. La concurrencia real vive DENTRO de cada job
// (`PH_CONCURRENCY` en el pool del scraper) y la comparte una sola IP: dos jobs
// en paralelo la calientan al doble sin descubrir más rápido.
import '../../scripts/bootstrap'
import { execFile } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostname } from 'node:os'
import { claim, complete, enqueue, fail, type Job, type JobKind } from '../db/jobs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..')
const WORKER = `${hostname()}:${process.pid}`

/** Tope de tiempo por job. Debe ser MENOR que el del reaper (15 min). */
const TIMEOUT_MS = Math.max(60_000, Number(process.env.DISC_JOB_TIMEOUT_MS ?? 12 * 60_000))

interface Salida { code: number; stdout: string }

function correr(script: string, args: string[]): Promise<Salida> {
  return new Promise((resolve, reject) => {
    const hijo = execFile(
      'npx', ['tsx', join(RAIZ, script), ...args],
      { cwd: RAIZ, timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err && typeof err.code === 'number' && err.code !== 0) {
          // Un exit code ≠ 0 NO siempre es un fallo del job: `discover.ts` sale
          // con 2 cuando Meta bloqueó, y eso es información, no un error de
          // programa. Se resuelve igual y decide quien llama.
          resolve({ code: err.code, stdout: stdout ?? '' })
          return
        }
        if (err) { reject(err); return }
        resolve({ code: 0, stdout: stdout ?? '' })
      },
    )
    hijo.stdout?.pipe(process.stdout)
    hijo.stderr?.pipe(process.stderr)
  })
}

async function ejecutar(job: Job): Promise<void> {
  if (job.kind === 'discover') {
    const term = String(job.payload.term ?? '')
    const countries = (job.payload.countries as string[] | undefined) ?? []
    if (!term) throw new Error('job discover sin término')
    const args = ['--query', term]
    if (countries.length) args.push('--countries', countries.join(','))
    const { code, stdout } = await correr('src/cli/discover.ts', args)
    // ⚠️ Un bloqueo persistente de Meta NO se reintenta enseguida: el repo tiene
    // medido que re-sondear una IP caliente escala el soft-block a hard-block.
    // Se lanza para que el job vuelva a la cola con el backoff de `fail`.
    if (stdout.includes('PH_PERSISTENT_BLOCK')) throw new Error('Meta bloqueó: se reintenta con backoff')
    if (code !== 0 && code !== 2) throw new Error(`discover salió con código ${code}`)

    // ⚠️ EL EMBUDO SE CIERRA ACÁ. Sin encolar el ranking, el descubrimiento
    // llena `disc_ads` y no llega nunca un producto a la pantalla. Se encola
    // con la CORRIDA porque la relevancia (BM25 y cobertura de frase) se mide
    // contra la semilla de esa corrida: sobre un backlog de varios nichos
    // mediría los anuncios de uno contra las keywords de otro.
    const runId = /^run_id:\s*([0-9a-f-]{36})/m.exec(stdout)?.[1]
    if (runId) {
      await enqueue([{
        kind: 'rank', payload: { term, run_id: runId }, priority: 2,
        dedupKey: `rank:${runId}`,
      }])
    } else {
      // Sin run_id no hay nada que rankear (dry-run, matriz vacía o corrida sin
      // resultados). Se dice, en vez de dejar el embudo cortado en silencio.
      console.log('  (sin run_id: no se encoló ranking)')
    }
    return
  }

  if (job.kind === 'rank') {
    const term = String(job.payload.term ?? '')
    const runId = String(job.payload.run_id ?? '')
    if (!term || !runId) throw new Error('job rank sin término o sin run_id')
    const { code, stdout } = await correr('src/cli/rank.ts', ['--query', term, '--run', runId])
    if (stdout.includes('PH_PERSISTENT_BLOCK')) throw new Error('Meta bloqueó: se reintenta con backoff')
    // `DISC_RANK_EMPTY` = no había anuncios aceptados de esa corrida. Es un
    // resultado válido del embudo (el nicho no dio nada), no un fallo.
    if (stdout.includes('DISC_RANK_EMPTY')) { console.log('  (nada que rankear)'); return }
    if (code !== 0 && code !== 2) throw new Error(`rank salió con código ${code}`)
    return
  }

  if (job.kind === 'audit') {
    const pageId = String(job.payload.page_id ?? '')
    const country = String(job.payload.country ?? 'CO')
    if (!pageId) throw new Error('job audit sin page_id')
    const { code, stdout } = await correr('src/cli/audit.ts', ['--page-id', pageId, '--country', country])
    if (stdout.includes('PH_PERSISTENT_BLOCK')) throw new Error('Meta bloqueó: se reintenta con backoff')
    // Código 2 = lectura inconclusa. NO es un fallo del job: no se pudo leer el
    // catálogo, no se clasificó a nadie y el anunciante sigue vencido, así que
    // el propio scheduler lo vuelve a encolar. Marcarlo `dead` a los 3 intentos
    // sacaría del recrawl a un anunciante sano por un mal día de la IP.
    if (code === 2) { console.log(`  (inconcluso — vuelve a encolarse solo)`); return }
    if (code !== 0) throw new Error(`audit salió con código ${code}`)
    return
  }

  throw new Error(`kind desconocido: ${job.kind}`)
}

async function main() {
  const args = process.argv.slice(2)
  const val = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined }
  const kind = (val('--kind') ?? 'discover') as JobKind
  const max = Math.max(1, Number(val('--max') ?? 5))

  let hechos = 0, fallados = 0
  for (let i = 0; i < max; i++) {
    const job = await claim(kind, WORKER)
    if (!job) { console.log(`Cola de ${kind} vacía. DISC_QUEUE_EMPTY`); break }
    const etiqueta = `${job.kind}#${job.id} ${JSON.stringify(job.payload)}`
    console.log(`\n▶ ${etiqueta} (intento ${job.attempts}/${job.max_attempts})`)
    try {
      await ejecutar(job)
      await complete(job.id)
      hechos++
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      await fail(job, motivo)
      fallados++
      console.error(`✗ ${etiqueta}: ${motivo}`)
    }
  }
  console.log(`\n${hechos} jobs completados · ${fallados} fallados`)
  if (fallados && !hechos) process.exitCode = 2
}

main().catch((e) => { console.error(e); process.exit(1) })
