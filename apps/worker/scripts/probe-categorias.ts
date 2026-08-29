// ¿El clasificador de categorías sigue cubriendo el inventario que se sirve?
//
// El clasificador (`categories.ts`) es por REGLAS sobre el nombre del nicho, no
// un mapa, así que clasifica también los nichos que el daemon descubra mañana.
// Lo que puede envejecer es la COBERTURA: nichos nuevos que ninguna regla toca
// quedan fuera de todos los chips y solo se ven en "Todos".
import './bootstrap'
import { createClient } from '@supabase/supabase-js'
import { categoryOf, CATEGORIES } from '@ph/shared'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  // Se mide sobre los CLUSTERS, que es lo que va a servir el buscador.
  const { data } = await db.rpc('ph_raw_top_niches', { p_limit: 2000 })
  const nichos = ((data ?? []) as { niche: string; productos: number }[])

  const sinCategoria: Array<{ niche: string; productos: number }> = []
  const porCategoria = new Map<string, number>()
  let productosTotal = 0, productosSinCategoria = 0

  for (const n of nichos) {
    productosTotal += Number(n.productos)
    const cat = categoryOf(n.niche)
    if (!cat) {
      sinCategoria.push(n)
      productosSinCategoria += Number(n.productos)
      continue
    }
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + Number(n.productos))
  }

  console.log(`nichos con inventario: ${nichos.length} · productos: ${productosTotal}`)
  console.log(`sin categoría: ${sinCategoria.length} nichos · ${productosSinCategoria} productos ` +
    `(${(100 * productosSinCategoria / Math.max(1, productosTotal)).toFixed(1)}% del inventario)`)

  console.log(`\ncategorías declaradas: ${CATEGORIES.length}`)
  const vacias = CATEGORIES.filter((c) => !porCategoria.has(c.id))
  console.log(`categorías SIN inventario: ${vacias.length}${vacias.length ? ' → ' + vacias.map((c) => c.id).join(', ') : ''}`)

  console.log('\n— nichos sin categoría —')
  for (const n of sinCategoria.sort((a, b) => Number(b.productos) - Number(a.productos))) {
    console.log(`  ${String(n.productos).padStart(5)} · ${n.niche}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
