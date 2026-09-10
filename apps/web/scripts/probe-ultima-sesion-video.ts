/**
 * Audita la última sesión terminada de video (o un prefijo explícito) sin escribir nada:
 * compara el prompt guardado —el que realmente se mandó al render— con el que arma hoy
 * el pipeline, y muestra la cámara y coreografía fuente de cada corte.
 *
 *   npx tsx --env-file=.env.local scripts/probe-ultima-sesion-video.ts [prefijo]
 */
import { createClient } from '@supabase/supabase-js'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { camaraDeCorte } from '../lib/video-ads/forensic'
import { defectosDelForense, manoQueGrabaEnCorte } from '../lib/video-ads/lotes'
import { insumosDeRender, promptDeLote } from '../lib/video-ads/render-lotes'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const prefijo = process.argv[2]

const lineasCriticas = (prompt: string) => prompt.split('\n').filter((linea) =>
  /^(?:Video UGC|Toma |CÁMARA:)|mano izquierda|mano derecha|ambas manos|SELFIE|tel[eé]fono|gesticul|señal|fuera de cuadro/i.test(linea.trim()),
)

async function main() {
  let query = db.from('video_sessions').select('*').not('lotes', 'is', null)
  // Postgres no permite ILIKE sobre UUID. Un UUID completo sí se filtra en SQL; para
  // el prefijo cómodo de terminal traemos el tramo reciente y comparamos como string.
  if (prefijo?.length === 36) query = query.eq('id', prefijo)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(prefijo ? 100 : 20)
  if (error) throw new Error(error.message)
  const filas = (data ?? []) as any[]
  const sesion = prefijo
    ? filas.find((fila) => String(fila.id).startsWith(prefijo))
    : filas.find((fila) => fila.render_done && Array.isArray(fila.lotes) && fila.lotes.length === 3)
  if (!sesion) throw new Error('No encontré una sesión terminada con tres lotes')

  const adapted = AdaptedScriptSchema.parse(sesion.adapted)
  const ins = insumosDeRender(sesion, adapted, sesion.voice_profile)
  console.log(`SESIÓN ${sesion.id} · ${sesion.created_at} · lotes=${sesion.lotes.length}`)
  console.log(`mano global guardada=${sesion.forensic_analysis?.manoQueGraba ?? '(ausente)'}`)
  console.log(`defectos estructurales=${JSON.stringify(defectosDelForense(sesion.forensic_analysis ?? {}))}`)

  console.log('\nFORENSE POR CORTE')
  for (const corte of sesion.forensic_analysis?.cortes ?? []) {
    console.log(`\n[${corte.n}] ${corte.tiempo}`)
    console.log(`  matriz=${camaraDeCorte(corte) || '(indeterminada)'}`)
    console.log(`  soporte=${corte.soporteCamara ?? '(legado)'} · movimiento=${corte.movimientoCamara ?? '(legado)'} · encuadre=${corte.encuadreCamara ?? '(legado)'} · ángulo=${corte.anguloCamara ?? '(legado)'} · mano=${corte.manoQueGraba ?? '(legado)'} · mano resuelta=${manoQueGrabaEnCorte(corte, sesion.forensic_analysis?.manoQueGraba) ?? 'ninguna'}`)
    console.log(`  evidencia=${corte.evidenciaCamara ?? '(legado)'}`)
    for (const hecho of corte.hechos ?? []) console.log(`  ${hecho.desde}–${hecho.hasta}: ${hecho.texto}`)
  }

  console.log('\nPROMPTS POR LOTE')
  ins.agrupados.forEach((lote, i) => {
    const guardado = String(sesion.lotes[i]?.prompt ?? '')
    const actual = promptDeLote(lote, ins.camaras[i], ins).prompt
    console.log(`\n${'='.repeat(72)}\nLOTE ${i + 1} · guardado=${guardado.length} · actual=${actual.length} · iguales=${guardado === actual}\n${'='.repeat(72)}`)
    console.log('GUARDADO — líneas críticas')
    console.log(lineasCriticas(guardado).join('\n') || '(sin líneas críticas)')
    console.log('ACTUAL — líneas críticas')
    console.log(lineasCriticas(actual).join('\n') || '(sin líneas críticas)')
    console.log('ACTUAL — prompt completo')
    console.log(actual)
  })
}

main().catch((error) => {
  console.error('ERR:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
