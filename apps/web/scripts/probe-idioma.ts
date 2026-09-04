/**
 * ¿EL MODELO RESPETA EL CONTRATO DE IDIOMA, O LO DECLARA Y LO IGNORA?
 *
 * El contrato (§35) parte la salida del forense en dos: lo que se DICE va en español
 * porque es una transcripción y se pronuncia; lo TÉCNICO va en inglés porque se emite
 * íntegro en el prompt del render, que va en inglés. Escribir la regla en el prompt no
 * es garantía —este repo tiene medido seis veces que una instrucción sin nada que la
 * haga cumplir es una sugerencia—, y acá no hay guard que la fuerce: el schema acepta
 * cualquier string.
 *
 * El oráculo es mecánico, no un juicio: se vota con palabras funcionales, que son las
 * que ninguna de las dos lenguas puede evitar. Un campo mezclado se reporta como MIXTO
 * en vez de forzarlo a un lado.
 *
 * ⚠️ IMPRIME ADEMÁS DE PUNTUAR. Varias reglas de este repo son heurísticas y ya dieron
 * falsos positivos: un ❌ acá puede estar midiendo el voto y no el campo. El valor real
 * va debajo de cada veredicto para poder juzgarlo a ojo.
 *
 * Cuesta UN análisis forense (video → Gemini, lo paga el hub). No escribe en la base.
 *
 *   npx tsx --env-file=.env.local scripts/probe-idioma.ts [sessionId]
 */
import { createClient } from '@supabase/supabase-js'
import { callVideoAds } from '../lib/video-ads/llm'
import { ForensicReportSchema, buildForensicInstruction } from '../lib/video-ads/forensic'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const ID = process.argv[2] ?? '7e4ccbcf-eeac-42cd-8e22-7a56f1836e09'

/** Palabras funcionales: las que ninguna de las dos lenguas puede evitar al describir. */
const ES = /\b(el|la|los|las|un|una|de|del|con|sobre|hacia|mientras|hasta|sin|para|su|sus|y|en|que|se|le|lo)\b/gi
const EN = /\b(the|a|an|of|with|toward|towards|while|until|without|for|her|his|its|and|in|that|to|on|at|as)\b/gi

type Veredicto = 'ES' | 'EN' | 'MIXTO' | '—'

function idioma(v: unknown): Veredicto {
  const t = String(v ?? '').trim()
  if (t.length < 12) return '—'
  const es = (t.match(ES) ?? []).length
  const en = (t.match(EN) ?? []).length
  if (es === 0 && en === 0) return '—'
  const total = es + en
  if (es / total >= 0.8) return 'ES'
  if (en / total >= 0.8) return 'EN'
  return 'MIXTO'
}

const ok = (v: Veredicto, esperado: Veredicto) => (v === esperado ? '✅' : v === '—' ? '·' : '❌')

async function main() {
  const { data } = await db.from('video_sessions')
    .select('reference_video_url, product_name').eq('id', ID).single()
  const url = (data as { reference_video_url: string } | null)?.reference_video_url
  if (!url) throw new Error(`La sesión ${ID} no tiene video de referencia`)
  console.log(`sesión ${ID.slice(0, 8)} — ${(data as { product_name: string }).product_name}\n`)

  const r = await callVideoAds('forensic_report', ForensicReportSchema, [
    { fileData: { fileUri: url, mimeType: 'video/mp4' } },
    { text: buildForensicInstruction() },
  ])

  // ── lo que se DICE: español
  console.log('── DEBE IR EN ESPAÑOL (se pronuncia o lo lee una persona) ──')
  for (const [campo, valor] of [
    ['guionOriginal', r.guionOriginal],
    ['resumenParaUsuario', r.resumenParaUsuario],
    ['cortes[0].dialogo', r.cortes[0]?.dialogo],
  ] as const) {
    const v = idioma(valor)
    console.log(`${ok(v, 'ES')} ${campo.padEnd(22)} ${v}`)
    console.log(`    ${String(valor ?? '').slice(0, 110)}`)
  }

  // ── lo TÉCNICO: inglés
  console.log('\n── DEBE IR EN INGLÉS (va al prompt del render) ──')
  const tecnicos: [string, unknown][] = [
    ['sujeto', r.sujeto], ['vestuario', r.vestuario], ['producto', r.producto], ['fondo', r.fondo],
    ['cortes[0].accion', r.cortes[0]?.accion],
    ['cortes[0].camara', r.cortes[0]?.camara],
    ['cortes[0].transicion', r.cortes[0]?.transicion],
    ['micro.cuerpo', r.cortes[0]?.micro?.cuerpo],
    ['micro.manos', r.cortes[0]?.micro?.manos],
    ['micro.rostro', r.cortes[0]?.micro?.rostro],
    ['micro.entorno', r.cortes[0]?.micro?.entorno],
    ['objetoEnMano.inicio', r.cortes[0]?.objetoEnMano?.inicio],
  ]
  let bien = 0
  let mide = 0
  for (const [campo, valor] of tecnicos) {
    const v = idioma(valor)
    if (v !== '—') { mide++; if (v === 'EN') bien++ }
    console.log(`${ok(v, 'EN')} ${campo.padEnd(22)} ${v}`)
    console.log(`    ${String(valor ?? '').slice(0, 110)}`)
  }

  // ── el centinela que el CÓDIGO compara de forma exacta
  const sinPersona = r.cortes.filter((c) => {
    const m = c.micro
    return m && [m.cuerpo, m.rostro, m.cabello].some((x) => /not visible|no aparece/i.test(String(x)))
  })
  console.log(`\n── CENTINELA DE AUSENCIA ──`)
  console.log(`cortes con alguna casilla marcada ausente: ${sinPersona.length} de ${r.cortes.length}`)
  for (const c of sinPersona.slice(0, 3)) {
    console.log(`  [${c.tiempo}] cuerpo="${c.micro?.cuerpo}" rostro="${c.micro?.rostro}"`)
  }

  console.log(`\n──────── ${bien}/${mide} campos técnicos medibles salieron en inglés ────────`)
}

main().catch((e) => { console.error(e); process.exit(1) })
