import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const S = '/tmp/claude-1000/-home-isasachi-chamba-sistemas-hub/8c166911-6450-4c32-a683-e42c1eaad0a9/scratchpad'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const pres: Record<string, number> = JSON.parse(readFileSync(`${S}/presencia.json`, 'utf8'))
  const ids = Object.keys(pres)
  const real = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from('ph_raw_products').select('page_id,ad_count').in('page_id', ids.slice(i, i + 300))
    for (const r of (data ?? []) as any[]) real.set(r.page_id, Math.max(real.get(r.page_id) ?? 0, r.ad_count))
  }
  const con = ids.filter((i) => real.has(i))
  const cal = (i: string) => real.get(i)! >= 40
  const total = con.filter(cal).length
  console.log(`${ids.length} descubiertos · ${con.length} con ad_count en la base · ${total} califican (40+)\n`)

  console.log('presencia │ anunciantes │ 40+ │ % califica')
  for (const [lo, hi] of [[1,1],[2,2],[3,3],[4,5],[6,10],[11,99]] as [number,number][]) {
    const g = con.filter((i) => pres[i] >= lo && pres[i] <= hi)
    if (!g.length) continue
    const ok = g.filter(cal).length
    console.log(`   ${lo}${hi>lo?`-${hi>90?'+':hi}`:'  '}     │ ${String(g.length).padStart(11)} │ ${String(ok).padStart(3)} │ ${(100*ok/g.length).toFixed(0)}%`)
  }
  console.log(`\numbral │ se enriquece │ califica │ recall │ ahorro de enrich`)
  for (const u of [1,2,3,4,5,6]) {
    const sel = con.filter((i) => pres[i] >= u)
    const ok = sel.filter(cal).length
    console.log(`  ≥${u}   │ ${String(sel.length).padStart(12)} │ ${String(ok).padStart(8)} │ ${(100*ok/total).toFixed(0)}%${' '.repeat(4)} │ ${(100-100*sel.length/con.length).toFixed(0)}%`)
  }
}
main()
