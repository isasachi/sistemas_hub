/**
 * ¿Cuánto presupuesto de prompt libera el cap de 15 s + la unión de tomas continuas, y
 * cuánto queda para el detalle atómico?
 *
 * Lectura pura de la base: cero LLM, cero cuota, no escribe nada. Recorre las sesiones
 * con guión adaptado, re-arma sus lotes con el reparto NUEVO y mide el prompt real.
 *
 *   npx tsx --env-file=.env.local scripts/probe-video-presupuesto.ts
 */
import { createClient } from '@supabase/supabase-js'
import { groupIntoLotes, buildLotePrompt, camaraDeLote, LOTE_MAX_SEC } from '../lib/video-ads/lotes'
import { KIE_PROMPT_MAX } from '../lib/video-ads/kie'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { unirTomasContinuas, type ForensicReport } from '../lib/video-ads/forensic'
import { personajesDe } from '../lib/video-ads/personajes'
import { VOZ_POR_DEFECTO } from '../lib/video-ads/character'

// El detalle atómico tal como lo va a devolver el forense: cinco casillas en telegrama.
// Sirve para PROYECTAR el prompt de una sesión nueva sobre datos viejos — las sesiones
// guardadas no tienen `micro` (el forense es el paso caro) ni la voz fija.
const MICRO_TIPO = {
  cuerpo: 'peso en pierna izquierda, torso gira 10° a cámara, hombro baja al inhalar',
  manos: 'derecha sube al pecho con el frasco, izquierda apoyada en el muslo, dedos relajados',
  rostro: 'cejas altas al enfatizar, parpadeo lento, boca muy articulada, sonrisa entre frases',
  cabello: 'mechón derecho cae sobre la mejilla al girar, resto quieto',
  entorno: 'cortina apenas se mueve al fondo, resto estático',
}

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Cuánto del texto de coreografía sobrevive sin truncar, que es la métrica que AGENTS.md
// viene siguiendo desde que el presupuesto empezó a comerse el movimiento.
function coreografia(prompt: string, tomas: { accionVisual: string }[]): number {
  const pedido = tomas.reduce((n, t) => n + t.accionVisual.length, 0)
  if (!pedido) return 1
  const entregado = tomas.reduce((n, t) => {
    const trunco = prompt.includes(`${t.accionVisual.slice(0, 40)}`)
    if (!trunco) return n
    return n + (prompt.includes(t.accionVisual) ? t.accionVisual.length : t.accionVisual.length * 0.5)
  }, 0)
  return entregado / pedido
}

async function main() {
  const { data, error } = await db.from('video_sessions')
    .select('id, product_name, adapted, forensic_analysis, consistency_block, voice_profile, motion_profile, product_scan, niche, avatar_url, product_url, personajes, accent, character_ethnicity')
    .not('adapted', 'is', null).limit(40)
  if (error) throw error

  let totalLotes = 0, totalSesiones = 0, unidos = 0, cortesAntes = 0, cortesDespues = 0
  const libres: number[] = []
  const proyectados: number[] = []
  const conMicro: number[] = []

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const parsed = AdaptedScriptSchema.safeParse(row.adapted)
    if (!parsed.success) continue
    const forensic = row.forensic_analysis as ForensicReport | null
    const cortes = forensic?.cortes ?? []
    if (!cortes.length) continue

    // Qué haría la unión de tomas continuas sobre ESTA sesión.
    const { report: continuo, fusiones } = unirTomasContinuas(forensic!, LOTE_MAX_SEC, LOTE_MAX_SEC * 20)
    cortesAntes += cortes.length
    cortesDespues += continuo.cortes.length
    unidos += fusiones.length

    const lotes = groupIntoLotes(parsed.data.tomas)
    const gente = personajesDe(row as never)
    const camaraFallback = cortes[0]?.camara?.trim() || 'primer plano'
    const scan = (row.product_scan ?? {}) as { productDescription?: string }

    let sesionLibre = 0
    for (const lote of lotes) {
      let prompt = ''
      try {
        prompt = buildLotePrompt({
          lote,
          consistencyBlock: (row.consistency_block as string) ?? 'Persona',
          productDesc: scan.productDescription ?? 'Producto',
          escenario: forensic!.fondo ?? 'Interior',
          camara: camaraDeLote(lote, cortes, camaraFallback),
          voz: row.voice_profile as never,
          movimiento: row.motion_profile as never,
          images: [{ url: 'https://x/a.png', role: 'character' }, { url: 'https://x/p.png', role: 'product' }],
          cortes,
          niche: row.niche,
          personajes: gente,
        })
      } catch { continue }
      const libre = KIE_PROMPT_MAX - prompt.length
      libres.push(libre)

      // Lo MISMO, pero con la voz fija y el detalle atómico puestos: el estado real de
      // una sesión analizada de acá en adelante.
      try {
        const proy = buildLotePrompt({
          lote,
          consistencyBlock: (row.consistency_block as string) ?? 'Persona',
          productDesc: scan.productDescription ?? 'Producto',
          escenario: forensic!.fondo ?? 'Interior',
          camara: camaraDeLote(lote, cortes, camaraFallback),
          voz: VOZ_POR_DEFECTO.mujer,
          movimiento: row.motion_profile as never,
          images: [{ url: 'https://x/a.png', role: 'character' }, { url: 'https://x/p.png', role: 'product' }],
          cortes: cortes.map((c) => ({ ...c, micro: MICRO_TIPO })),
          niche: row.niche,
          personajes: gente,
        })
        proyectados.push(KIE_PROMPT_MAX - proy.length)
        conMicro.push(proy.includes('Micro-detail') ? (proy.includes(MICRO_TIPO.entorno) ? 1 : 0.5) : 0)
      } catch { proyectados.push(-1); conMicro.push(0) }
      sesionLibre += libre
      totalLotes++
    }
    totalSesiones++
    const cor = lotes.length ? lotes.map((l) => coreografia('', l.tomas)) : []
    void cor
    console.log(
      `${String(row.product_name ?? row.id).slice(0, 32).padEnd(34)} ` +
      `cortes ${String(cortes.length).padStart(3)}→${String(continuo.cortes.length).padEnd(3)} ` +
      `lotes ${String(lotes.length).padStart(3)}  ` +
      `libre medio ${lotes.length ? Math.round(sesionLibre / lotes.length) : 0}`,
    )
  }

  libres.sort((a, b) => a - b)
  const p = (q: number) => libres[Math.floor(libres.length * q)] ?? 0
  console.log(`\n${totalSesiones} sesiones · ${totalLotes} lotes`)
  console.log(`cortes: ${cortesAntes} → ${cortesDespues} al unir tomas continuas (${unidos} uniones)`)
  console.log(`espacio LIBRE en el prompt (de ${KIE_PROMPT_MAX}):`)
  console.log(`  peor caso ${p(0)} · p25 ${p(0.25)} · mediana ${p(0.5)} · p75 ${p(0.75)} · mejor ${libres[libres.length - 1] ?? 0}`)
  proyectados.sort((a, b) => a - b)
  const q = (x: number) => proyectados[Math.floor(proyectados.length * x)] ?? 0
  const enteros = conMicro.filter((x) => x === 1).length
  const parciales = conMicro.filter((x) => x === 0.5).length
  console.log(`\nPROYECTADO (voz fija + detalle atómico puesto), ${proyectados.length} lotes:`)
  console.log(`  libre: peor ${q(0)} · p25 ${q(0.25)} · mediana ${q(0.5)} · p75 ${q(0.75)}`)
  console.log(`  detalle atómico: ${enteros} lotes COMPLETO · ${parciales} recortado · ${conMicro.length - enteros - parciales} sin emitir`)
}

main().catch((e) => { console.error(e); process.exit(1) })
