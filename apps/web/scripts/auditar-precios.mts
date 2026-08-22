/**
 * Auditoría de la aritmética de las ofertas guardadas, contra el precio base que cargó el usuario.
 *
 * Verifica, sobre TODAS las sesiones con oferta, las seis invariantes que hacen que una card de
 * precios cierre: el tier de 1 unidad cuesta lo que el usuario pidió; el precio por unidad es el
 * precio dividido por la cantidad del label; el % de ahorro sale de precio vs ancla; el ancla está
 * por encima del precio; comprar más sale más barato por unidad; y hay exactamente un destacado.
 *
 * Es lectura pura de la base: cero LLM, cero cuota. Corre cuando toques `pinUserPrice`,
 * `recomputeSavings` o el prompt de la oferta.
 *
 *   npx tsx --env-file=.env.local scripts/auditar-precios.mts
 *
 * ⚠️ Audita lo CALCULADO, no lo IMPRESO — eso solo se ve mirando la imagen. Al comparar un render
 * contra estos tiers, hacelo contra la sesión que produjo ESA imagen: la oferta se regenera cuando
 * cambia el precio, así que una comparación tardía mide un estado que ya no existe. Verificado así
 * sobre la sesión fbe218f3, el render coincide en las 12 cifras.
 */
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const num = (s?: string | null): number | null => {
  const m = s?.replace(/\s/g, '').match(/(\d[\d.,]*)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
// Cantidad declarada en el label ("2 Unidades", "3 Frascos", "1 unidad").
const qty = (label?: string | null): number | null => {
  const m = label?.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

const { data, error } = await db
  .from('landing_sessions')
  .select('id, created_at, product_name, price, offer')
  .not('offer', 'is', null)
  .order('created_at', { ascending: false })
if (error) throw error

let conPrecio = 0
const fallos: Record<string, number> = {}
const anota = (k: string) => { fallos[k] = (fallos[k] ?? 0) + 1 }

for (const r of data as any[]) {
  const tiers = r.offer?.tiers ?? []
  if (!tiers.length) continue
  const base = num(r.price)
  const lineas: string[] = []

  // 1) el tier de 1 unidad tiene que costar EXACTAMENTE el precio base del usuario
  if (base) {
    conPrecio++
    const unitario = tiers.find((t: any) => qty(t.label) === 1) ?? tiers[0]
    const p = num(unitario.price)
    if (p !== base) { lineas.push(`base: usuario S/${base} vs tier 1u S/${p}`); anota('base ≠ tier de 1 unidad') }
  }

  let prevPerUnit = Infinity
  for (const t of tiers) {
    const p = num(t.price), before = num(t.priceBefore), pu = num(t.perUnit), q = qty(t.label)
    // 2) perUnit = price / cantidad
    if (p && q && pu) {
      const esperado = p / q
      if (Math.abs(pu - esperado) > 0.01) { lineas.push(`perUnit "${t.label}": dice S/${pu}, debería S/${esperado.toFixed(2)}`); anota('perUnit ≠ precio/cantidad') }
    }
    // 3) savingsPct = 1 - price/priceBefore
    if (p && before && before > p) {
      const esperado = Math.round((1 - p / before) * 100)
      if (t.savingsPct !== esperado) { lineas.push(`ahorro "${t.label}": dice ${t.savingsPct}%, debería ${esperado}%`); anota('savingsPct mal calculado') }
    }
    // 4) el ancla tiene que estar por encima del precio
    if (p && before && before <= p) { lineas.push(`ancla "${t.label}": S/${before} no supera S/${p}`); anota('ancla ≤ precio') }
    if (p && !before) { lineas.push(`ancla "${t.label}": falta`); anota('tier sin ancla') }
    // 5) comprar más tiene que salir más barato por unidad
    if (pu) {
      if (pu > prevPerUnit + 0.01) { lineas.push(`volumen "${t.label}": S/${pu} c/u es MÁS caro que el tier anterior (S/${prevPerUnit} c/u)`); anota('el volumen no descuenta') }
      prevPerUnit = pu
    }
  }
  // 6) exactamente un destacado
  const dest = tiers.filter((t: any) => t.featured).length
  if (dest !== 1) { lineas.push(`destacados: ${dest} (debe ser 1)`); anota('destacados ≠ 1') }

  if (lineas.length) {
    console.log(`\n${r.id.slice(0, 8)} · ${String(r.created_at).slice(0, 10)} · ${JSON.stringify(r.product_name)} · precio="${r.price ?? ''}"`)
    console.log('  ' + tiers.map((t: any) => `${t.label}: ${t.price} (antes ${t.priceBefore ?? '—'}, ${t.savingsPct ?? '—'}%, ${t.perUnit ?? '—'})`).join('\n  '))
    for (const l of lineas) console.log(`  ✗ ${l}`)
  }
}

console.log(`\n===== ${data!.length} sesiones con oferta · ${conPrecio} con precio base cargado =====`)
for (const [k, v] of Object.entries(fallos).sort((a, b) => b[1] - a[1])) console.log(`  ${v}× ${k}`)
if (!Object.keys(fallos).length) console.log('  sin fallos')
