// Verifica lo que YA está en la base, del más pautado al menos.
//
//   npx tsx scripts/scan-base.ts --todo                   (TODA la base, por volumen)
//   npx tsx scripts/scan-base.ts --min-ads 100            (solo el tramo de más volumen)
//   npx tsx scripts/scan-base.ts --min-ads 50 --max-ads 100
//   npx tsx scripts/scan-base.ts --total 500 --lote 60
//   npx tsx scripts/scan-base.ts --sin-llm                (mide, no verifica nicho)
//
// `--todo` barre la base entera —no solo `status='pendiente'`— incluyendo lo que
// dejó el motor viejo y las filas 'inactivo'. La cola son las filas sin
// `senal_nicho`, que solo escribe este camino: por eso es reanudable sin
// columna extra y no re-procesa lo ya hecho.
//
// A diferencia de scan-nicho.ts NO descubre nada: la cola sale de
// ph_raw_products (status='pendiente') y cruza todos los nichos, ordenada por
// ad_count desc. Comparte con él la medición y el veredicto (scan-verify.ts).
//
// ⚠️ EL ORDEN POR VOLUMEN NO ES COSMÉTICO. El grueso del pendiente vive en el
// tramo de 1-49 anuncios, donde la muestra es tan chica que el share casi no
// informa: 5 anuncios del mismo producto dan 1.00 y no prueban gran cosa.
// Medido 2026-08-16 sobre 66.025 pendientes: 19.794 tienen ≥100 anuncios,
// 14.624 entre 50 y 99, y 31.397 por debajo de 50. Empezar por arriba pone
// primero lo que sí se puede medir, y deja el tramo flojo para el final —
// donde cortar cuesta poco.
//
// ⚠️ ES REANUDABLE Y HAY QUE APROVECHARLO: una fila verificada deja de estar
// 'pendiente', así que volver a correr el script sigue donde quedó. Por eso
// ante un bloqueo persistente o un fallo de API se sale LIMPIO informando el
// avance, en vez de morir a mitad de lote sin dejar rastro.
//
// ⚠️ COSTO: 1 llamada Haiku por fila que pase el filtro de share (determinista).
// Las que no lo pasan no cuestan LLM. Solo en el worker, nunca en Vercel.
import './bootstrap'
import Anthropic from '@anthropic-ai/sdk'
import type { Page } from 'playwright'
import {
  launchScraperContext, runPool, isPersistentlyBlocked, PersistentBlockError,
  rateGateMs, CONCURRENCY,
} from '../lib/product-hunter/scraper'
import { openSsrSession } from '../lib/product-hunter/ssr-fetch'
import {
  leerAnunciante, medicionDe, juzgarAnunciante, esFalloDeApi, type Lectura,
} from '../lib/product-hunter/scan-verify'
import {
  getRawProductsByVolume, saveRawVerdict, countRawPending, seedKeywords,
  type RawProductRow,
} from '@ph/shared'

const JITTER_MS = Math.max(0, Number(process.env.PH_JITTER_MS ?? 500))
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function esperarTurno(): Promise<void> {
  if (isPersistentlyBlocked()) throw new PersistentBlockError()
  const gate = rateGateMs()
  if (gate > 0) await sleep(gate)
  if (JITTER_MS) await sleep(Math.random() * JITTER_MS)
}

// Los términos con los que se decide `senal_nicho` salen del seed del nicho.
// Se cachean por nicho: la cola cruza cientos y recalcularlo por fila es al pedo.
const cacheTerminos = new Map<string, string[]>()
function terminosDe(niche: string): string[] {
  let t = cacheTerminos.get(niche)
  if (!t) { t = [niche, ...(seedKeywords(niche) ?? [])]; cacheTerminos.set(niche, t) }
  return t
}

// ⚠️ UN ANUNCIANTE SE LEE UNA SOLA VEZ, aunque esté en 40 nichos.
// Medido 2026-08-16: 66.005 filas pendientes son 26.743 anunciantes (2,47 filas
// cada uno), y el caso extremo es real — Shoptemu tiene 50.001 anuncios y
// aparece en decenas de nichos. Como `advertiserUrl` va con country=ALL, su
// lectura es idéntica en todos: cachearla saca ~60% de los fetches. Se guarda la
// PROMESA, no el resultado, porque runPool corre en paralelo y dos filas del
// mismo anunciante llegarían juntas a pedir el mismo fetch.
const cacheLectura = new Map<string, Promise<Lectura | null>>()

// Que algo NO sea un producto físico tampoco depende del nicho: un marketplace
// lo es en todos. Cachear ese veredicto evita repetir la llamada a Haiku por
// cada nicho donde aparece — el smoke test gastó 20 llamadas para juzgar 20
// veces al mismo Shoptemu.
const cacheNoFisico = new Map<string, { kind: string; nota: string }>()

async function main() {
  const args = process.argv.slice(2)
  const val = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined }
  const minAds = Number(val('--min-ads') ?? 0)
  const maxAdsRaw = val('--max-ads')
  const maxAds = maxAdsRaw !== undefined ? Number(maxAdsRaw) : undefined
  const lote = Math.max(1, Number(val('--lote') ?? 60))
  const total = Number(val('--total') ?? Infinity)
  const niche = val('--niche')
  const sinLlm = args.includes('--sin-llm')
  // --todo: TODA la base, no solo la cola de pendientes. Incluye lo que verificó
  // el motor viejo y lo marcado 'inactivo' (que revive si volvió a pautar: el
  // conteo se relee en vivo).
  const todo = args.includes('--todo')

  const pendientes = await countRawPending()
  console.log(
    `Cola por volumen · ${todo ? 'TODA la base' : `${pendientes} pendientes`} · ` +
    `tramo ${minAds}${maxAds ? `-${maxAds}` : '+'} anuncios · ` +
    `lote ${lote} · conc ${CONCURRENCY}${sinLlm ? ' · SIN LLM' : ''}`,
  )

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  const ai = sinLlm ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const tally = { monoproducto: 0, descartado: 0, sin_verificar: 0, inconcluso: 0, errores: 0 }
  let procesados = 0
  let motivoCorte: string | null = null
  const t0 = Date.now()

  try {
    await Promise.all(pages.map((p) => openSsrSession(p)))

    while (procesados < total && !motivoCorte) {
      const cuantos = Math.min(lote, total - procesados)
      const filas = await getRawProductsByVolume(cuantos, minAds, maxAds, niche, todo)
      if (!filas.length) { motivoCorte = 'cola vacía'; break }

      const settled = await runPool(filas, pages, async (row: RawProductRow, page: Page) => {
        let pendiente = cacheLectura.get(row.page_id)
        if (!pendiente) {
          pendiente = (async () => { await esperarTurno(); return leerAnunciante(page, row.page_id) })()
          cacheLectura.set(row.page_id, pendiente)
        }
        const l = await pendiente
        // Inconcluso: la fila queda 'pendiente' y vuelve a salir en otra corrida.
        // Se saca del cache para que un fallo transitorio no se propague al
        // resto de los nichos del mismo anunciante.
        if (!l) { cacheLectura.delete(row.page_id); return { row, estado: 'inconcluso' as const } }

        const m = medicionDe(l, terminosDe(row.niche))
        // Ya se sabe que este anunciante no vende un objeto: se descarta sin
        // volver a preguntarle a Haiku por cada nicho donde aparece.
        const yaSabido = cacheNoFisico.get(row.page_id)
        const v = yaSabido
          ? { status: 'descartado' as const, kind: yaSabido.kind, nota: yaSabido.nota, productName: null, medicion: m }
          : await juzgarAnunciante(ai, row.niche, row.name, m)
        if (!yaSabido && v.status === 'descartado' && v.nota.startsWith('no es producto físico')) {
          cacheNoFisico.set(row.page_id, { kind: v.kind, nota: v.nota })
        }

        await saveRawVerdict({
          niche: row.niche, page_id: row.page_id, ad_count: m.adCount, status: v.status,
          kind: v.kind, share: m.share, product_name: v.productName,
          verdict_note: v.nota, senal_nicho: m.senal, product_path: m.dominante,
        })
        return { row, estado: v.status, m }
      })

      for (const s of settled) {
        procesados++
        if (s.status !== 'fulfilled') {
          const raw = s.reason instanceof Error ? s.reason.message : String(s.reason)
          if (esFalloDeApi(raw)) { motivoCorte = `fallo de API: ${raw.split('\n')[0].slice(0, 140)}`; break }
          if (s.reason instanceof PersistentBlockError) { motivoCorte = 'block persistente de Meta'; break }
          tally.errores++
          continue
        }
        const r = s.value
        if (r.estado === 'inconcluso') { tally.inconcluso++; continue }
        tally[r.estado as 'monoproducto' | 'descartado' | 'sin_verificar']++
        if (r.estado === 'monoproducto') {
          console.log(
            `✓ ${r.row.niche.slice(0, 16).padEnd(17)} ${String(r.row.name ?? '').slice(0, 24).padEnd(25)} ` +
            `${String(r.m!.adCount).padStart(5)} ads · ${String(Math.round(r.m!.share * 100)).padStart(3)}% · ${r.m!.senal}`,
          )
        }
      }

      if (isPersistentlyBlocked()) motivoCorte = 'block persistente de Meta'
      const min = ((Date.now() - t0) / 60000).toFixed(1)
      console.log(
        `— ${procesados} procesados en ${min} min · ${tally.monoproducto} aprobados · ` +
        `${tally.descartado} descartados · ${tally.sin_verificar} sin verificar · ${tally.inconcluso} inconclusos`,
      )
    }
  } catch (e) {
    // Se informa y se sale limpio: lo hecho ya está guardado fila por fila y la
    // próxima corrida retoma la cola donde quedó.
    motivoCorte = e instanceof PersistentBlockError ? 'block persistente de Meta' : `error: ${(e as Error).message}`
  } finally {
    await browser.close()
  }

  const min = ((Date.now() - t0) / 60000).toFixed(1)
  console.log(
    `\n═══ ${procesados} procesados en ${min} min · ${tally.monoproducto} aprobados · ` +
    `${tally.descartado} descartados · ${tally.sin_verificar} sin verificar · ` +
    `${tally.inconcluso} inconclusos · ${tally.errores} errores ═══`,
  )
  // Centinela para el runner de shell: distingue "no queda nada por verificar"
  // de "me cortaron a mitad". Sin esto el loop no sabe cuándo parar.
  if (motivoCorte === 'cola vacía') console.log('PH_SCAN_QUEUE_EMPTY')
  if (motivoCorte && motivoCorte !== 'cola vacía') {
    console.log(`CORTE: ${motivoCorte}`)
    console.log('Volvé a correr el mismo comando: la cola retoma donde quedó.')
    process.exitCode = 2
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
