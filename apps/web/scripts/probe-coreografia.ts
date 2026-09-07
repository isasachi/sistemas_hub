/**
 * ¿Sobrevive el INSTRUMENTO a la FASE 3, y desapareció la escenografía de foto?
 *
 * Corre la primera pasada de la adaptación por el camino real (`buildAdaptInstruction` +
 * `callVideoAds`) sobre una sesión YA guardada y compara, corte por corte, el instrumento
 * que vio el forense contra el que devuelve la adaptación. Una llamada de TEXTO por
 * corrida, cero imágenes, cero cuota de imagen, y no escribe nada en la base.
 *
 *   npx tsx --env-file=.env.local scripts/probe-coreografia.ts <sesion> [corridas]
 */
import { createClient } from '@supabase/supabase-js'
import { callVideoAds } from '@/lib/video-ads/llm'
import { SlotValuesSchema, buildAdaptInstruction } from '@/lib/video-ads/adapt'
import { extractSlots } from '@/lib/video-ads/fill'
import { sinEscenaDeFoto } from '@/lib/video-ads/lotes'

// Los objetos que son COREOGRAFÍA y no datos del producto viejo: si el forense nombró uno
// y la adaptación no lo trae, el render se queda sin con qué aplicar el producto.
const INSTRUMENTOS = /cuentagotas|gotero|pipeta|cuchara|aplicador|espátula|brocha|tapa|tapón|dosificador/gi

const del = (s: string) => [...new Set((s.match(INSTRUMENTOS) ?? []).map((x) => x.toLowerCase()))]

async function main() {
  const [sesion, n = '1'] = process.argv.slice(2)
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('video_sessions').select('*').eq('id', sesion).single()
  if (error || !data) throw new Error(`sesión ilegible: ${error?.message}`)
  const s = data as any
  if (!s.template || !s.forensic_analysis) throw new Error('la sesión no tiene plantilla o forense')

  const slots = extractSlots(s.template)
  const instruccion = buildAdaptInstruction(
    s.template, s.forensic_analysis,
    {
      productName: s.product_name ?? '', productDescription: s.what_it_does ?? '',
      angle: s.angle ?? '', targetAudience: s.target_audience ?? '', problem: s.problem ?? '',
      characterDesc: '', characterEthnicity: '', accent: '', voice: '',
      constraints: s.constraints ?? '',
    },
    s.product_scan, slots,
    s.voice_profile?.acento || 'Español latino neutro',
    s.consistency_block ?? '',
  )

  const cortes: any[] = s.forensic_analysis.cortes ?? []
  console.log('FORENSE (lo que hay que conservar):')
  for (const c of cortes) console.log(`  [${c.n}] ${del(c.accion).join(', ') || '—'}`)

  for (let i = 1; i <= Number(n); i++) {
    const { acciones } = await callVideoAds('slot_values', SlotValuesSchema, [{ text: instruccion }])
    const porN = new Map(acciones.map((a: any) => [a.n, a.accionVisual as string]))
    let ok = 0, perdidos = 0, escena = 0
    console.log(`\n── corrida ${i} ──`)
    for (const c of cortes) {
      const av = porN.get(c.n) ?? ''
      const esperados = del(c.accion)
      const faltan = esperados.filter((x) => !av.toLowerCase().includes(x))
      if (esperados.length) { ok += esperados.length - faltan.length; perdidos += faltan.length }
      if (av !== sinEscenaDeFoto(av)) escena++
      const marca = faltan.length ? `✘ pierde ${faltan.join(', ')}` : esperados.length ? '✔' : '·'
      console.log(`  [${c.n}] ${marca}  ${av.slice(0, 150)}`)
    }
    console.log(`  instrumentos conservados ${ok}/${ok + perdidos} · tomas con escenografía de foto ${escena}/${cortes.length}`)
  }
}
main()
