// Pipeline de nicho: descubre, mide y verifica en una sola corrida.
//
//   npx tsx scripts/scan-nicho.ts --niche acne
//   npx tsx scripts/scan-nicho.ts --niche acne --paises MX,EC,CO,CL,AR --limit 60
//   npx tsx scripts/scan-nicho.ts --niche acne --sin-llm     (mide, no verifica el nicho)
//   npx tsx scripts/scan-nicho.ts --niche acne --dry-run     (no escribe en la base)
//
// ── Reparto del trabajo ──────────────────────────────────────────────────────
// TODO es determinista menos un paso:
//   1. Keywords     — cache de ph_niches → seed estático → el nicho a secas. Sin LLM.
//   2. Descubrimiento — keywords × países por FETCH same-origin (ssr-fetch).
//   3. Medición     — 1 fetch por anunciante: total de anuncios (rango) y share
//                     del producto dominante (product-key). Sin LLM.
//   4. Veredicto    — Haiku, y SOLO para "¿es un producto físico DEL nicho?".
//
// El paso 4 es el único que no se puede escribir en código: medido sobre acné,
// buscar el término del nicho en el copy sube el recall pero mete un curso de
// idiomas y unas plantillas de pádel. El modelo nunca ve números ni puede
// cambiarlos — recibe texto y devuelve un enum.
//
// ── Por qué no reemplaza a scrape-raw + verify-products ──────────────────────
// Convive con ellos. El share determinista de acá NO está medido todavía contra
// `classifyShare` (el del verificador viejo, que lleva adentro varios fallos ya
// corregidos) sobre las mismas filas. Escribe en las MISMAS tablas y con los
// mismos estados, así que los dos motores se pueden comparar con datos reales
// antes de jubilar ninguno.
//
// ⚠️ COSTO: Anthropic solo acá (Haiku), 1 llamada por candidato medido. Vercel
// solo lee. Ver AGENTS.md, reglas de costo.
import './bootstrap'
import Anthropic from '@anthropic-ai/sdk'
import type { Page } from 'playwright'
import {
  launchScraperContext, runPool, searchUrl, noteNavResult, rateGateMs,
  isPersistentlyBlocked, PersistentBlockError, CONCURRENCY,
} from '../lib/product-hunter/scraper'
import { openSsrSession, readConnection, advertiserUrl, type SsrAd } from '../lib/product-hunter/ssr-fetch'
import { shareOf, senalNicho, productKey, type SenalNicho } from '../lib/product-hunter/product-key'
import { juzgarNicho } from '../lib/product-hunter/nicho-verdict'
import { isLikelyService } from '../lib/product-hunter/competitors'
import {
  seedKeywords, getNicheStatus, upsertRawProducts, saveRawVerdict, upsertRawNiche,
  updateRawNicheAfterScrape,
} from '@ph/shared'

// Los 5 mercados del experimento. PE queda fuera a propósito: acá se busca lo
// que AÚN NO está pautado en Perú. COUNTRIES (@ph/shared) no se toca porque el
// resto de los scripts depende de esa lista.
const PAISES_DEFAULT = ['MX', 'EC', 'CO', 'CL', 'AR']
const KEYWORD_LIMIT = Math.max(0, Number(process.env.PH_SCAN_KEYWORDS ?? 12))
// Anunciantes que reciben el fetch de medición, rankeados por presencia en las
// búsquedas. Cada uno cuesta un fetch (~2s) y, si pasa, una llamada Haiku.
const MEDIR_LIMIT = Math.max(1, Number(process.env.PH_SCAN_MEDIR ?? 60))
const JITTER_MS = Math.max(0, Number(process.env.PH_JITTER_MS ?? 500))
const SHARE_MIN = Number(process.env.PH_SCAN_SHARE_MIN ?? 0.5)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Igual que en verify-products: un fallo de la API no es un veredicto sobre el
// producto. Marcar la fila por esto sería mentir y quemar navegaciones al pedo.
function esFalloDeApi(msg: string): boolean {
  return /credit balance|rate_limit|overloaded|429|5\d\d \{|authentication_error|permission_error/i.test(msg)
}

interface Candidato {
  pageId: string
  pageName: string | null
  adId: string | null
  country: string
  keyword: string
  title: string | null
  body: string | null
  categories: string[]
  vistas: number      // presencia en las búsquedas → ranking de la medición
}

// Keywords SIN LLM, mismo criterio que scrape-raw.ts: cache del nicho → seed
// estático → el nicho a secas. resolveKeywords() no se usa: cae a Haiku.
async function keywordsFor(niche: string): Promise<string[]> {
  const row = await getNicheStatus(niche).catch(() => null)
  const all = row?.keywords?.length ? row.keywords : (seedKeywords(niche) ?? [niche])
  return KEYWORD_LIMIT ? all.slice(0, KEYWORD_LIMIT) : all
}

/** Espera lo que pida el rate-control compartido antes de tocar la IP. */
async function esperarTurno(): Promise<void> {
  if (isPersistentlyBlocked()) throw new PersistentBlockError()
  const gate = rateGateMs()
  if (gate > 0) await sleep(gate)
  if (JITTER_MS) await sleep(Math.random() * JITTER_MS)
}

// ── Fase 2: descubrimiento ───────────────────────────────────────────────────
async function descubrir(
  pages: Page[], niche: string, keywords: string[], paises: string[],
): Promise<{ candidatos: Map<string, Candidato>; busquedas: number; fallos: number; servicios: number }> {
  const byPage = new Map<string, Candidato>()
  let busquedas = 0, fallos = 0, servicios = 0

  const tareas = keywords.flatMap((keyword) => paises.map((country) => ({ keyword, country })))
  await runPool(tareas, pages, async ({ keyword, country }, page: Page) => {
    await esperarTurno()
    const res = await readConnection(page, searchUrl(keyword, country))
    busquedas++
    // null = inconcluso (bloqueo o HTML raro), NO "no hay resultados".
    if (!res) { fallos++; noteNavResult(0); return }
    noteNavResult(res.ads.length)

    for (const ad of res.ads) {
      if (isLikelyService(ad.page_name ?? '', ad.page_categories ?? [])) { servicios++; continue }
      const prev = byPage.get(ad.page_id)
      if (prev) { prev.vistas++; continue }
      byPage.set(ad.page_id, {
        pageId: ad.page_id, pageName: ad.page_name, adId: ad.ad_archive_id,
        country, keyword, title: ad.title, body: ad.body,
        categories: ad.page_categories ?? [], vistas: 1,
      })
    }
  })
  return { candidatos: byPage, busquedas, fallos, servicios }
}

// ── Fase 3: medición (determinista) ──────────────────────────────────────────
interface Medicion {
  cand: Candidato
  adCount: number
  share: number
  dominante: string | null
  distintos: number
  muestra: number
  senal: SenalNicho
  textos: string[]
}

async function medir(page: Page, cand: Candidato, terminos: string[]): Promise<Medicion | null> {
  await esperarTurno()
  const res = await readConnection(page, advertiserUrl(cand.pageId))
  // Inconcluso: no se inventa un rango ni un share. La fila queda sin tocar.
  if (!res || typeof res.count !== 'number') { noteNavResult(0); return null }
  noteNavResult(res.ads.length)

  const s = shareOf(res.ads)
  const delDominante = res.ads.filter((a: SsrAd) => productKey(a) === s.dominante)
  const textos = (delDominante.length ? delDominante : res.ads)
    .map((a) => [a.title, a.body].filter(Boolean).join(' — '))
    .filter((t) => t.trim().length > 0)

  return {
    cand, adCount: res.count, share: s.share, dominante: s.dominante,
    distintos: s.distintos, muestra: s.muestra,
    senal: senalNicho(terminos, s.dominante, delDominante.length ? delDominante : res.ads),
    textos,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const val = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined }
  const niche = (val('--niche') ?? '').trim().toLowerCase()
  if (!niche) { console.error('Falta --niche <nombre>'); process.exit(1) }

  const paises = (val('--paises') ?? PAISES_DEFAULT.join(',')).split(',').map((p) => p.trim().toUpperCase()).filter(Boolean)
  const medirLimit = Number(val('--limit') ?? MEDIR_LIMIT)
  const sinLlm = args.includes('--sin-llm')
  const dryRun = args.includes('--dry-run')

  const keywords = await keywordsFor(niche)
  const terminos = [niche, ...keywords]
  console.log(
    `Nicho "${niche}" · ${keywords.length} keywords × ${paises.length} países (${paises.join('/')}) · ` +
    `conc ${CONCURRENCY}${sinLlm ? ' · SIN LLM' : ''}${dryRun ? ' · DRY-RUN' : ''}`,
  )

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  const ai = sinLlm ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const tally = { monoproducto: 0, descartado: 0, sin_verificar: 0, pendiente: 0, inconcluso: 0, errores: 0 }
  let apiCaida = false

  try {
    // Una sola navegación por página; el resto son fetches same-origin.
    await Promise.all(pages.map((p) => openSsrSession(p, paises[0])))

    const { candidatos, busquedas, fallos, servicios } = await descubrir(pages, niche, keywords, paises)
    console.log(
      `\nDescubrimiento: ${busquedas} búsquedas · ${fallos} inconclusas · ` +
      `${servicios} servicios descartados · ${candidatos.size} anunciantes únicos`,
    )
    if (!candidatos.size) { console.log('PH_SCAN_EMPTY'); return }

    const orden = [...candidatos.values()].sort((a, b) => b.vistas - a.vistas).slice(0, medirLimit)
    console.log(`Midiendo ${orden.length} anunciantes (de ${candidatos.size})…\n`)

    // Se guarda el descubrimiento ANTES de verificar: si la corrida se corta, el
    // inventario ya está y la cola de verificación lo retoma como 'pendiente'.
    if (!dryRun) {
      await upsertRawNiche(niche, 'active').catch(() => {})
      await upsertRawProducts([...candidatos.values()].map((c) => ({
        niche, page_id: c.pageId, ad_id: c.adId, name: c.pageName, ad_count: 0,
        country: c.country,
        raw_data: { title: c.title, body: c.body, keyword: c.keyword, categories: c.categories },
      })))
    }

    const settled = await runPool(orden, pages, async (cand, page: Page) => {
      const m = await medir(page, cand, terminos)
      if (!m) return { cand, estado: 'inconcluso' as const }

      // Regla de rango: sale del conteo real, sin modelo.
      // Regla de monoproducto: share determinista sobre la muestra.
      if (m.share < SHARE_MIN) {
        if (!dryRun) await saveRawVerdict({
          niche, page_id: cand.pageId, ad_count: m.adCount, status: 'descartado',
          kind: 'indeterminado', share: m.share, product_name: null,
          verdict_note: `no es monoproducto: ${Math.round(m.share * 100)}% del dominante entre ${m.distintos} productos`,
          senal_nicho: m.senal, product_path: m.dominante,
        })
        return { cand, m, estado: 'descartado' as const, motivo: 'share' }
      }

      // Sin LLM el pipeline llega hasta acá: mide y marca 'sin_verificar'.
      // ⚠️ Esas filas SE SIRVEN igual (el serving solo excluye 'descartado' e
      // 'inactivo') pero sin sello, así que en la vitrina no se distinguen de
      // las 'pendiente'. Es para medir sin gastar Haiku, no el modo por defecto.
      if (!ai) {
        if (!dryRun) await saveRawVerdict({
          niche, page_id: cand.pageId, ad_count: m.adCount, status: 'sin_verificar',
          kind: 'indeterminado', share: m.share, product_name: null,
          verdict_note: 'medido sin verificación de nicho (--sin-llm)',
          senal_nicho: m.senal, product_path: m.dominante,
        })
        return { cand, m, estado: 'sin_verificar' as const }
      }

      const v = await juzgarNicho(ai, {
        niche, advertiser: cand.pageName, productPath: m.dominante, textos: m.textos,
      })
      const fisico = v.kind === 'fisico'
      const status = !fisico ? 'descartado'
        : !v.perteneceAlNicho ? 'descartado'
        // La cita es la verificación en código del veredicto: sin respaldo no se
        // publica, se manda a revisión.
        : !v.citaVerificada ? 'sin_verificar'
        : 'monoproducto'
      const nota = !fisico ? `no es producto físico (${v.kind}): ${v.motivo}`
        : !v.perteneceAlNicho ? `fuera del nicho: ${v.motivo}`
        : !v.citaVerificada ? `sin cita textual que respalde el veredicto: ${v.motivo}`
        : v.motivo

      if (!dryRun) await saveRawVerdict({
        niche, page_id: cand.pageId, ad_count: m.adCount, status,
        kind: v.kind, share: m.share, product_name: v.productName || null,
        verdict_note: nota, senal_nicho: m.senal, product_path: m.dominante,
      })
      return { cand, m, estado: status, motivo: v.motivo }
    })

    for (const s of settled) {
      if (s.status !== 'fulfilled') {
        const raw = s.reason instanceof Error ? s.reason.message : String(s.reason)
        if (esFalloDeApi(raw)) {
          console.error(`\n🛑 fallo de API, no del producto: ${raw.split('\n')[0].slice(0, 160)}`)
          console.error('   Las filas de esta tanda quedan pendientes. Corregí el problema y volvé a correr.')
          apiCaida = true
          break
        }
        tally.errores++
        console.error(`✗ ${raw.split('\n')[0].slice(0, 120)}`)
        continue
      }
      const r = s.value
      if (r.estado === 'inconcluso') { tally.inconcluso++; console.log(`? ${String(r.cand.pageName).slice(0, 30)} — no se pudo leer`); continue }
      tally[r.estado as keyof typeof tally]++
      const icon = { monoproducto: '✓', descartado: '✗', sin_verificar: '?' }[r.estado as 'monoproducto' | 'descartado' | 'sin_verificar']
      console.log(
        `${icon} ${String(r.cand.pageName ?? '').slice(0, 26).padEnd(27)} ` +
        `${String(r.m!.adCount).padStart(5)} ads · ${String(Math.round(r.m!.share * 100)).padStart(3)}% ` +
        `· ${r.m!.senal.padEnd(7)} · ${String(r.m!.dominante ?? '').slice(0, 40)}`,
      )
    }

    if (!dryRun) await updateRawNicheAfterScrape(niche).catch(() => {})
  } finally {
    await browser.close()
  }

  console.log(
    `\n═══ ${tally.monoproducto} aprobados · ${tally.descartado} descartados · ` +
    `${tally.sin_verificar} sin verificar · ${tally.inconcluso} inconclusos · ${tally.errores} errores ═══`,
  )
  if (apiCaida) process.exitCode = 2
  if (isPersistentlyBlocked()) {
    console.error('🛑 block persistente durante la corrida')
    console.log('PH_PERSISTENT_BLOCK')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
