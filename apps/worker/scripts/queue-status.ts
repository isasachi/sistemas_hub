// Estado de la cola y el inventario — lectura rápida de ph_niches / ph_products.
// Lo usa daily-report.sh (sección DB) y sirve standalone:
//   npx tsx scripts/queue-status.ts
// ⚠️ Solo LEE. $0 LLM / $0 scraping.
import './bootstrap'
import { createClient } from '@supabase/supabase-js'

;(async () => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const head = (b: ReturnType<typeof db.from>) => b.select('*', { count: 'exact', head: true })

  const { count: pending }  = await head(db.from('ph_niches')).eq('status', 'pending')
  const { count: active }   = await head(db.from('ph_niches')).eq('status', 'active')
  const { count: archived } = await head(db.from('ph_niches')).eq('status', 'archived')
  const { count: prod }     = await head(db.from('ph_products'))
  const dist: Record<string, number | null> = {}
  for (const p of ['alta', 'media', 'baja']) {
    const { count } = await head(db.from('ph_products')).eq('analysis->>priority', p)
    dist[p] = count
  }

  console.log(`  Nichos pending (cola por drenar): ${pending ?? '?'}`)
  console.log(`  Nichos active:                    ${active ?? '?'}`)
  console.log(`  Nichos archived (fuera de cola):  ${archived ?? '?'}`)
  console.log(`  Productos totales:                ${prod ?? '?'}`)
  console.log(`  Ganadores: ${dist.alta ?? '?'} alta · ${dist.media ?? '?'} media · ${dist.baja ?? '?'} baja`)
})().catch((e) => {
  console.error('  (no se pudo consultar la DB:', e instanceof Error ? e.message : e, ')')
  process.exit(1)
})
