// Re-encola el ranking de las corridas que tienen anuncios ACEPTADOS y ninguna
// fila en `disc_ranked`.
//
//   npx tsx scripts/reencolar-rankings.ts --dry-run
//   npx tsx scripts/reencolar-rankings.ts
//
// ⚠️ REPARA UN FALLO YA CORREGIDO EN EL CÓDIGO. El job de `rank` se encola en
// cuanto termina el descubrimiento, pero `analyze` drena un backlog GLOBAL de
// miles: la corrida nueva podía llegar entera sin analizar a su propio ranking,
// devolver 0 productos y quedar `done` — el nicho no se rankeaba nunca más.
// Ahora `run-jobs` aplaza el job en ese caso; esto rescata las corridas que ya
// lo sufrieron.
import './bootstrap'
import { db } from '../src/db/client'
import { enqueue } from '../src/db/jobs'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  // ⚠️ SOLO SE RESCATA LO QUE SIGUE VIVO. Una corrida de un nicho ya retirado
  // tiene anuncios aceptados igual, pero rankearla gastaría el deep crawl de sus
  // anunciantes —lo más caro del motor— en algo que se decidió no perseguir. Y
  // el `limpiarHuerfanos` del scheduler los borraría al ciclo siguiente, así que
  // encolarlos sería churn puro.
  const activos = new Set<string>()
  for (let i = 0; ; i += 1000) {
    const { data } = await db().from('disc_keywords')
      .select('term').eq('is_active', true).range(i, i + 999)
    if (!data?.length) break
    for (const r of data as { term: string }[]) activos.add(r.term)
    if (data.length < 1000) break
  }

  const { data: runs } = await db().from('disc_search_runs')
    .select('id,seed_query').order('created_at', { ascending: false }).limit(200)

  const rescatar: { id: string; seed: string; aceptados: number }[] = []
  let retirados = 0
  for (const r of (runs ?? []) as { id: string; seed_query: string }[]) {
    if (!activos.has(r.seed_query)) { retirados++; continue }
    const { count: yaRankeado } = await db().from('disc_ranked')
      .select('*', { count: 'exact', head: true }).eq('run_id', r.id)
    if ((yaRankeado ?? 0) > 0) continue

    const { data: qs } = await db().from('disc_search_queries').select('id').eq('run_id', r.id)
    const qids = ((qs ?? []) as { id: string }[]).map((q) => q.id)
    if (!qids.length) continue
    const ads = new Set<string>()
    for (let i = 0; i < qids.length; i += 100) {
      const { data } = await db().from('disc_ad_discoveries')
        .select('ad_id').in('query_id', qids.slice(i, i + 100)).limit(20_000)
      for (const d of (data ?? []) as { ad_id: string }[]) ads.add(d.ad_id)
    }
    if (!ads.size) continue

    const ids = [...ads]
    let aceptados = 0
    for (let i = 0; i < ids.length; i += 200) {
      const { count } = await db().from('disc_ads')
        .select('*', { count: 'exact', head: true })
        .in('id', ids.slice(i, i + 200)).eq('physical_product', true).eq('ecommerce', true)
      aceptados += count ?? 0
    }
    if (aceptados > 0) rescatar.push({ id: r.id, seed: r.seed_query, aceptados })
  }

  console.log(`${rescatar.length} corridas con anuncios aceptados y sin rankear · ${retirados} saltadas por nicho retirado:`)
  for (const r of rescatar) console.log(`  ${String(r.aceptados).padStart(4)} aceptados · ${r.seed}`)

  if (!dryRun && rescatar.length) {
    // ⚠️ El `dedup_key` es `rank:<run_id>` y el job viejo puede seguir ahí como
    // `done`: se borra primero, si no el upsert lo ignora y no se re-encola nada.
    for (const r of rescatar) {
      await db().from('disc_jobs').delete().eq('dedup_key', `rank:${r.id}`)
    }
    const n = await enqueue(rescatar.map((r) => ({
      kind: 'rank' as const,
      payload: { term: r.seed, run_id: r.id },
      priority: 2,
      dedupKey: `rank:${r.id}`,
    })))
    console.log(`\n${n} rankings re-encolados`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
