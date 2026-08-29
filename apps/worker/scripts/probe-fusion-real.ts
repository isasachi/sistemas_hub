// Prueba la fusión contra los clusters REALES ya guardados, sobre los dos lados
// que el umbral tiene que respetar a la vez:
//   · debe fusionar  — el mismo producto repartido en varias landings
//   · NO debe fusionar — productos distintos de una tienda de catálogo
//
//   npx tsx scripts/probe-fusion-real.ts <page_id> [page_id...]
import './bootstrap'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import {
  textoDeCluster, fusionarPorEmbedding, embeddings, UMBRAL_FUSION,
} from '../lib/product-hunter/cluster-merge'
import type { ClusterInfo } from '../lib/product-hunter/product-key'

// La OPENAI_API_KEY del worker es un placeholder; la real vive en apps/web.
config({ path: '../web/.env.local', override: true })

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  for (const pageId of ids) {
    const { data } = await db.from('ph_raw_clusters')
      .select('cluster_key,ad_count,muestra_n,titulo,cuerpo,url,name')
      .eq('page_id', pageId).order('muestra_n', { ascending: false }).limit(30)
    const filas = (data ?? []) as Array<Record<string, string | number | null>>
    if (!filas.length) { console.log(`\n${pageId}: sin clusters guardados`); continue }

    const cs: ClusterInfo[] = filas.map((f) => ({
      key: String(f.cluster_key), n: Number(f.muestra_n), estimado: Number(f.ad_count),
      titulo: f.titulo as string | null, cuerpo: f.cuerpo as string | null,
      url: f.url as string | null, publicable: true,
    }))
    const textos = cs.map(textoDeCluster)
    const vecs = await embeddings(textos)
    if (!vecs) { console.log('sin embeddings (¿falta OPENAI_API_KEY?)'); return }

    console.log(`\n═══ ${filas[0].name} (${pageId}) — ${cs.length} clusters`)
    for (const u of [UMBRAL_FUSION, 0.92, 0.9, 0.88, 0.85, 0.82]) {
      const fus = fusionarPorEmbedding(cs, vecs, u)
      const top = fus.slice(0, 3).map((g) => `${g.key.split('/').pop()?.slice(0, 26)}(${g.n})`).join(' · ')
      console.log(`  ${u.toFixed(2)} → ${String(fus.length).padStart(2)} grupos · ${top}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
