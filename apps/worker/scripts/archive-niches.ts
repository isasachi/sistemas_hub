// Archiva los nichos de la DB que ya NO están en la lista curada (niches.txt).
//   npx tsx scripts/archive-niches.ts            (archiva, contra niches.txt)
//   npx tsx scripts/archive-niches.ts --from otra-lista.txt
//   npx tsx scripts/archive-niches.ts --dry-run  (solo reporta, no escribe)
//
// POR QUÉ: el daemon drena getNichesToRefresh() desde la tabla ph_niches, NO
// desde niches.txt. Recortar el archivo no reduce el pool que se scrapea; los
// nichos viejos siguen en la DB y re-entran a la cola al vencer. Este script
// cierra esa brecha: marca status='archived' los que no están en la lista →
// getNichesToRefresh/getActiveNiches los excluyen y el daemon deja de scrapearlos.
// Reversible y NO destructivo: los productos de esos nichos se conservan y
// siguen sirviéndose; si un usuario busca uno archivado, el cold-start lo revive.
// $0 — no llama LLM ni scrapea.
import './bootstrap'
import { getAllNiches, archiveNiches } from '@ph/shared'
import { readFromFile } from './seed-niches'

function parseArgs(argv: string[]): { list: string; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run')
  const fromIdx = argv.indexOf('--from')
  const list = fromIdx !== -1 && argv[fromIdx + 1] ? argv[fromIdx + 1] : 'niches.txt'
  return { list, dryRun }
}

async function main() {
  const { list, dryRun } = parseArgs(process.argv.slice(2))

  // Set curado (readFromFile normaliza igual que el seed: trim + minúsculas).
  const keep = new Set(readFromFile(list).map((n) => n.niche))
  const all = await getAllNiches()

  // Candidatos: en la DB, NO archivados ya, y ausentes de la lista curada.
  const toArchive = all
    .filter((n) => n.status !== 'archived' && !keep.has(n.id))
    .map((n) => n.id)

  const alreadyArchived = all.filter((n) => n.status === 'archived').length
  console.log(
    `Lista curada: ${keep.size} nichos · DB: ${all.length} (${alreadyArchived} ya archivados)\n` +
    `A archivar: ${toArchive.length}${dryRun ? ' (dry-run, sin escribir)' : ''}`
  )
  for (const id of toArchive) console.log(`  · ${id}`)

  if (dryRun) {
    console.log('\nDry-run: no se escribió nada.')
    return
  }
  if (!toArchive.length) {
    console.log('\nNada que archivar — la DB ya coincide con la lista curada.')
    return
  }

  await archiveNiches(toArchive)
  const remaining = all.length - alreadyArchived - toArchive.length
  console.log(
    `\n✓ ${toArchive.length} nichos archivados. Pool activo de scrapeo: ~${remaining} ` +
    `(pending+active en la lista curada). Sus productos se conservan.`
  )
}

main().catch((e) => { console.error(e); process.exit(1) })
