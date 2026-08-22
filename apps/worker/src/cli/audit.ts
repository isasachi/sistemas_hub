// Fase 7 suelta: auditar UN anunciante (spec §6 y §9).
//
//   npx tsx src/cli/audit.ts --page-id 123456 --country CO
//
// Es la unidad del recrawl. `rank.ts` audita en lote dentro de una corrida; esto
// audita uno solo, que es lo que la cola sabe encolar y lo que el scheduler
// necesita para que los tiers signifiquen algo.
//
// ⚠️ UNA LECTURA INCONCLUSA NO ES UNA AUDITORÍA. `profileAdvertiser` devuelve
// null cuando Meta no dio nodos, y acá eso sale con código 2 SIN tocar el tier
// ni `last_audited_at`. Escribir "auditado hoy, 0 anuncios" sobre un bloqueo
// manda a cuarentena a un anunciante sano y lo saca del inventario — el mismo
// modo de fallo que ya dejó 19 perfiles en ceros.
import '../../scripts/bootstrap'
import {
  launchScraperContext, noteNavResult, isPersistentlyBlocked, PersistentBlockError, rateGateMs,
} from '../../lib/product-hunter/scraper'
import { openSsrSession } from '../../lib/product-hunter/ssr-fetch'
import { profileAdvertiser } from '../advertisers/aggregate'
import { saveAdvertiser, estadoRecrawl, guardarAuditoria } from '../db/advertisers'
import { nextTier } from '../scheduler/tiers'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function main() {
  const args = process.argv.slice(2)
  const val = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined }
  const pageId = (val('--page-id') ?? '').trim()
  const country = (val('--country') ?? 'CO').toUpperCase()
  if (!pageId) { console.error('Falta --page-id'); process.exit(1) }

  if (isPersistentlyBlocked()) { console.log('PH_PERSISTENT_BLOCK'); process.exit(2) }

  const previo = await estadoRecrawl(pageId)
  const { browser, pages } = await launchScraperContext(1)
  try {
    await openSsrSession(pages[0], country).catch(() => {})
    const gate = rateGateMs()
    if (gate > 0) await sleep(gate)

    const prof = await profileAdvertiser(pages[0], pageId, country)
    noteNavResult(prof ? prof.distribution.sample : 0)

    if (!prof) {
      // Inconcluso: ni tier ni fecha. El anunciante vuelve a vencer y se
      // reintenta, que es lo correcto — no sabemos nada nuevo de él.
      console.log(`? ${pageId} inconcluso (no se pudo leer el catálogo) — no se clasifica`)
      process.exitCode = 2
      return
    }

    const t = nextTier(
      {
        tier: previo?.tier ?? 'warm',
        adCountPrevio: previo?.adCount ?? null,
        consecutiveMisses: previo?.consecutiveMisses ?? 0,
      },
      { activeAds: prof.activeAds ?? 0, monoRatio: prof.distribution.share },
    )

    // El producto dominante NO se re-empareja acá: lo resolvió la corrida que
    // leyó las landings, y una FK nueva calculada sin ese contexto sería peor
    // que conservar la que hay.
    await saveAdvertiser(prof, country, previo?.dominantProductId ?? null)
    await guardarAuditoria(pageId, t)

    console.log(
      `✓ ${pageId} · ${prof.activeAds ?? '?'} anuncios · share ` +
      `${Math.round(prof.distribution.share * 100)}% · ${previo?.tier ?? 'warm'} → ${t.tier}` +
      (t.consecutiveMisses ? ` · ${t.consecutiveMisses} pasada(s) sin anuncios` : ''),
    )
  } catch (e) {
    if (e instanceof PersistentBlockError) { console.log('PH_PERSISTENT_BLOCK'); process.exitCode = 2; return }
    throw e
  } finally {
    await browser.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
