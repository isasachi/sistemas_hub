// Importa los productos del pipeline ANTERIOR (ph_products) a la tabla del
// buscador actual, como 'pendiente' para que las tres reglas los evalúen.
//   npx tsx scripts/import-legacy-products.ts [--dry-run] [--niche <nombre>]
//
// ph_products tiene una fila por ANUNCIO y la tabla nueva una por (nicho,
// anunciante): se colapsa quedándose con el ad_count más alto de cada par.
//
// El ad_count importado puede tener semanas — es del enrich viejo. No importa:
// la verificación lee el conteo en vivo del mismo payload que ya descarga y lo
// refresca antes de asignar rango.
//
// No pisa nada existente: las filas que ya están en ph_raw_products se saltan
// (conservan su veredicto). ph_products no se modifica ni se borra.
import './bootstrap'
import { createClient } from '@supabase/supabase-js'

interface Legacy {
  niche: string
  page_id: string | null
  id: string
  name: string | null
  scraped_at: string
  raw_data: {
    ad_count?: number
    found_country?: string
    found_keyword?: string
    creatives?: { title?: string | null; body?: string | null }[]
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry-run')
  const ni = args.indexOf('--niche')
  const soloNicho = ni !== -1 ? args[ni + 1] : undefined

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Pares que ya existen en la tabla nueva: no se tocan.
  const existentes = new Set<string>()
  for (let from = 0; ; from += 1000) {
    let q = db.from('ph_raw_products').select('niche,page_id').range(from, from + 999)
    if (soloNicho) q = q.eq('niche', soloNicho)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { niche: string; page_id: string }[]) {
      existentes.add(`${r.niche}:${r.page_id}`)
    }
    if (!data || data.length < 1000) break
  }

  // Colapsar ph_products por (nicho, anunciante), quedándose con el mayor volumen.
  const porPar = new Map<string, Legacy>()
  let leidas = 0, sinPage = 0
  for (let from = 0; ; from += 1000) {
    let q = db.from('ph_products').select('niche,page_id,id,name,scraped_at,raw_data').range(from, from + 999)
    if (soloNicho) q = q.eq('niche', soloNicho)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const page = (data ?? []) as Legacy[]
    for (const r of page) {
      leidas++
      if (!r.page_id) { sinPage++; continue }
      const key = `${r.niche}:${r.page_id}`
      const prev = porPar.get(key)
      if (!prev || (r.raw_data?.ad_count ?? 0) > (prev.raw_data?.ad_count ?? 0)) porPar.set(key, r)
    }
    if (page.length < 1000) break
  }

  const nuevas = [...porPar.entries()].filter(([k]) => !existentes.has(k))
  console.log(
    `ph_products: ${leidas} filas${sinPage ? ` (${sinPage} sin page_id, omitidas)` : ''} → ` +
    `${porPar.size} pares únicos · ${existentes.size} ya estaban · ${nuevas.length} a importar`,
  )
  if (dry) { console.log('Dry-run: no se escribió nada.'); return }

  // Sembrar sus nichos en la cola del scraper. 'active' con el last_scraped
  // original: no fuerza un re-scrape inmediato, pero el nicho queda registrado
  // y vence solo según PH_RAW_REFRESH_DAYS.
  const nichos = new Map<string, string>()
  for (const [, r] of porPar) {
    const prev = nichos.get(r.niche)
    if (!prev || r.scraped_at > prev) nichos.set(r.niche, r.scraped_at)
  }
  const filasNicho = [...nichos].map(([id, last]) => ({ id, status: 'active', last_scraped: last }))
  for (let i = 0; i < filasNicho.length; i += 500) {
    const { error } = await db.from('ph_raw_niches')
      .upsert(filasNicho.slice(i, i + 500), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }

  console.log(`  ${filasNicho.length} nichos registrados en la cola del scraper.`)

  if (!nuevas.length) return

  const filas = nuevas.map(([, r]) => {
    const c = r.raw_data?.creatives?.[0]
    return {
      niche: r.niche,
      page_id: r.page_id!,
      ad_id: r.id,
      name: r.name,
      ad_count: Math.max(1, r.raw_data?.ad_count ?? 1),
      country: r.raw_data?.found_country ?? null,
      status: 'pendiente',
      raw_data: {
        title: c?.title ?? null,
        body: c?.body ?? null,
        keyword: r.raw_data?.found_keyword ?? null,
        origen: 'ph_products',
      },
      scraped_at: r.scraped_at,
    }
  })

  let escritas = 0
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500)
    // ignoreDuplicates: si otro proceso ya la creó, gana la existente.
    const { error } = await db.from('ph_raw_products').upsert(lote, {
      onConflict: 'niche,page_id', ignoreDuplicates: true,
    })
    if (error) throw new Error(error.message)
    escritas += lote.length
    process.stdout.write(`\r  importadas ${escritas}/${filas.length}`)
  }
  console.log(`\n✓ ${escritas} productos importados como 'pendiente'.`)
  console.log('  Verificalos con: npx tsx scripts/verify-products.ts --limit 150   (o --niche <nombre>)')
}

main().catch((e) => { console.error(e); process.exit(1) })
