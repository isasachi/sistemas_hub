// Resetea score/analysis de un nicho para re-analizarlo (ej. tras cambiar el
// prompt o el pipeline). NO borra los productos ni el raw_data scrapeado.
//   npx tsx scripts/reset-analysis.ts --niche rodilla
import './bootstrap'
import { resetNicheAnalysis } from '../lib/product-hunter/db'

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')
  const niche = nicheIdx !== -1 ? args[nicheIdx + 1] : null
  if (!niche) {
    console.error('Uso: npx tsx scripts/reset-analysis.ts --niche <nombre>')
    process.exit(1)
  }
  const count = await resetNicheAnalysis(niche)
  console.log(`[${niche}] ${count} productos reseteados (score/analysis → null)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
