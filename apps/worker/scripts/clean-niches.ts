// Barre ph_niches y marca status='blocked' los typos/genéricos y la anatomía
// sexual/explícita que ensucian la cola (cold-starts de usuarios). La blocklist
// vive en @ph/shared (isBlocked) — compartida con el guard de /search.
//
// A diferencia de 'archived' (deja de scrapearse pero sus productos siguen
// sirviéndose), 'blocked' ADEMÁS los oculta: /search no los sirve ni re-encola.
// Reversible y $0: quitar el término de blocklist.ts y volver status a 'pending'.
//
// Corre cada 12h vía systemd timer (deploy/clean-niches.timer).
//   npx tsx scripts/clean-niches.ts             (aplica)
//   npx tsx scripts/clean-niches.ts --dry-run   (solo reporta, no escribe)
//   npx tsx scripts/clean-niches.ts --self-test (asserts del matcher, no toca DB)
import './bootstrap'
import { getAllNiches, blockNiches, isBlocked } from '@ph/shared'
import { readFromFile } from './seed-niches'

function selfTest() {
  const blocked = ['vulva', 'ano', 'vagina', 'dolor de pene', 'testiculos', 'glande', 'agua', 'peso', 'oidp', 'conductos deferentes']
  const safe = ['mano', 'verano', 'pie plano', 'agua micelar', 'bajar de peso', 'grasa abdominal', 'diabetes', 'abdomen', 'hormonas sexuales', 'rodilla']
  for (const b of blocked) if (!isBlocked(b)) throw new Error(`isBlocked('${b}') debería ser true`)
  for (const s of safe) if (isBlocked(s)) throw new Error(`isBlocked('${s}') debería ser false`)
  console.log(`✓ self-test OK (${blocked.length} bloqueados, ${safe.length} seguros)`)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-test')) return selfTest()
  const dryRun = argv.includes('--dry-run')

  // Red de seguridad: nunca bloquear un nicho de la lista curada, pase lo que
  // pase con la regex (el daemon lo re-sembraría como pending → thrash).
  const seed = new Set(readFromFile('niches.txt').map((n) => n.niche))
  const all = await getAllNiches()
  const toBlock = all
    .filter((n) => n.status !== 'blocked' && !seed.has(n.id) && isBlocked(n.id))
    .map((n) => n.id)

  console.log(`DB: ${all.length} nichos · a bloquear: ${toBlock.length}${dryRun ? ' (dry-run)' : ''}`)
  for (const id of toBlock) console.log(`  · ${id}`)

  if (dryRun) return console.log('\nDry-run: nada escrito.')
  if (!toBlock.length) return console.log('\nNada que bloquear.')

  await blockNiches(toBlock)
  console.log(`\n✓ ${toBlock.length} nichos bloqueados (status='blocked'). Sus productos dejan de servirse.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
