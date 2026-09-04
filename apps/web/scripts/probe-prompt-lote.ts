/**
 * IMPRIME EL PROMPT REAL DE UN LOTE, sin gastar nada.
 *
 * Es la herramienta de control de la vuelta al PROMPT MAESTRO: arma los lotes con los
 * MISMOS insumos que `generate-lotes` y escupe el prompt que le llegaría a grok, para poder
 * leerlo al lado del ejemplo del spec. Cero llamadas a modelos, cero renders, no escribe en
 * la base — solo lee la sesión.
 *
 * ⚠️ Reemplaza a `probe-motion-lock.ts`, que A/Beaba el CANDADO DE MOVIMIENTO: esa máquina
 * se fue con la vuelta a la fuente, así que su probe medía una diferencia que ya no existe.
 *
 *   npx tsx --env-file=.env.local scripts/probe-prompt-lote.ts <sessionId> [nLote]
 */
import { createClient } from '@supabase/supabase-js'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { enProsa, type ForensicReport } from '../lib/video-ads/forensic'
import { tieneMotion } from '../lib/video-ads/motion'
import { personajesDe, hablantesPorTiempo, vozEnOffPorTiempo } from '../lib/video-ads/personajes'
import { KIE_PROMPT_MAX, clampDuration } from '../lib/video-ads/kie'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el sessionId')
  const nLote = process.argv[3] ? Number(process.argv[3]) : null

  const { data: ids } = await db.from('video_sessions').select('id')
  const completo = (ids as { id: string }[] | null)?.find((f) => f.id.startsWith(id))?.id
  if (!completo) throw new Error(`No existe la sesión ${id}`)
  const { data } = await db.from('video_sessions').select('*').eq('id', completo).single()
  const r = data as Record<string, unknown> & { forensic_analysis: ForensicReport }

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const f = r.forensic_analysis
  const cortes = f?.cortes ?? []
  const motionPorTiempo = new Map(cortes.filter(tieneMotion).map((c) => [c.tiempo, c.motion!] as const))
  const lotes = groupIntoLotes(adapted.tomas, motionPorTiempo)
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const gente = personajesDe(r as never)

  console.log(`sesión ${completo.slice(0, 8)} · ${adapted.tomas.length} tomas → ${lotes.length} lotes`)
  console.log(`duraciones: [${lotes.map((l) => l.duracionSeg).join(', ')}]\n`)

  for (const lote of lotes) {
    if (nLote && lote.n !== nLote) continue
    const chars = lote.tomas.reduce((n, t) => n + t.locucion.length, 0)
    const prompt = buildLotePrompt({
      lote,
      consistencyBlock: (r.consistency_block as string) ?? '',
      productDesc: scan.productDescription ?? '',
      camara: camaraDeLote(lote, cortes),
      escenario: enProsa(f?.fondo),
      voz: r.voice_profile as never,
      movimiento: r.motion_profile as never,
      images: [
        { url: (r.avatar_url as string) ?? '', role: 'la persona' },
        { url: (r.product_url as string) ?? '', role: 'el producto' },
      ],
      cortes, niche: r.niche, personajes: gente,
      quien: hablantesPorTiempo(cortes, gente),
      vozEnOff: vozEnOffPorTiempo(cortes),
    })
    const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)
    console.log('═'.repeat(78))
    console.log(`LOTE ${lote.n} · tomas ${lote.tomas.map((t) => t.n).join('+')} · ${lote.duracionSeg}s → duration ${dur}` +
      ` · ${prompt.length}/${KIE_PROMPT_MAX} caracteres${prompt.includes('…') ? ' ⚠️ RECORTADO' : ''}`)
    console.log('═'.repeat(78))
    console.log(prompt)
    console.log()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
