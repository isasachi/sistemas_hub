import './bootstrap'
import { db } from '../src/db/client'

async function main() {
  // Corridas con anuncios descubiertos, cuántos analizados y cuántos rankearon.
  const { data: runs } = await db().from('disc_search_runs')
    .select('id,seed_query,created_at').order('created_at', { ascending: false }).limit(40)

  console.log('corrida · anuncios · analizados · aceptados · en disc_ranked · job de rank')
  for (const r of (runs ?? []) as { id: string; seed_query: string }[]) {
    const { data: qs } = await db().from('disc_search_queries').select('id').eq('run_id', r.id)
    const qids = ((qs ?? []) as { id: string }[]).map((q) => q.id)
    if (!qids.length) continue
    const adIds = new Set<string>()
    for (let i = 0; i < qids.length; i += 100) {
      const { data: d } = await db().from('disc_ad_discoveries')
        .select('ad_id').in('query_id', qids.slice(i, i + 100)).limit(5000)
      for (const x of (d ?? []) as { ad_id: string }[]) adIds.add(x.ad_id)
    }
    if (!adIds.size) continue
    const ids = [...adIds]
    let analizados = 0, aceptados = 0
    for (let i = 0; i < ids.length; i += 200) {
      const trozo = ids.slice(i, i + 200)
      const { count: a } = await db().from('disc_ads')
        .select('*', { count: 'exact', head: true }).in('id', trozo).not('analyzed_at', 'is', null)
      const { count: ok } = await db().from('disc_ads')
        .select('*', { count: 'exact', head: true }).in('id', trozo)
        .eq('physical_product', true).eq('ecommerce', true)
      analizados += a ?? 0; aceptados += ok ?? 0
    }
    const { count: ranked } = await db().from('disc_ranked')
      .select('*', { count: 'exact', head: true }).eq('run_id', r.id)
    const { data: job } = await db().from('disc_jobs')
      .select('status').eq('kind', 'rank').eq('dedup_key', `rank:${r.id}`).maybeSingle()
    const flag = (ranked ?? 0) === 0 && aceptados > 0 ? '  ⚠️ ACEPTADOS SIN RANKEAR' : ''
    console.log(
      `${r.seed_query.slice(0, 24).padEnd(25)} ${String(ids.length).padStart(5)} ` +
      `${String(analizados).padStart(5)} ${String(aceptados).padStart(4)} ` +
      `${String(ranked ?? 0).padStart(4)}  ${(job as { status?: string })?.status ?? '—'}${flag}`,
    )
  }
}
main()
