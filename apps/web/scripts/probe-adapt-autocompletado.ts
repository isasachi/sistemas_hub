// ¿El guión sale AUTOCOMPLETADO o sigue lleno de `[PENDIENTE: …]`?
//
// La FASE 3 se reescribió (2026-08-24) para rellenar todos los huecos deduciendo del
// contexto y, cuando no alcanza, aproximando. Un test unitario no puede responder eso:
// mide el prompt, no lo que el modelo hace con él. Y el modo de fallo de un cambio a
// medias es "no cambió nada" — si `ungrounded` siguiera vetando la reescritura, cada
// toma caería al relleno determinista y volverían los corchetes.
//
// Esto corre la PRIMERA pasada real de la FASE 3 (una llamada de texto a Gemini, cero
// imágenes y cero cuota de imagen) sobre sesiones YA GUARDADAS, y cuenta los pendientes
// antes y después. No escribe nada en la base.
//
//   npx tsx --env-file=.env.local scripts/probe-adapt-autocompletado.ts [idSesión…]
import { createClient } from '@supabase/supabase-js'
import { callVideoAds } from '../lib/video-ads/llm'
import { SlotValuesSchema, buildAdaptInstruction } from '../lib/video-ads/adapt'
import { extractSlots, fillTemplate, rejectBadValues, acceptRewrite } from '../lib/video-ads/fill'
import { extractPending } from '../lib/video-ads/pending'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function sesiones(ids: string[]) {
  const q = db.from('video_sessions').select('*').not('template', 'is', null)
    .not('forensic_analysis', 'is', null)
  const { data, error } = ids.length
    ? await q.in('id', ids)
    : await q.order('created_at', { ascending: false }).limit(3)
  if (error) throw new Error(error.message)
  return data ?? []
}

async function main() {
 for (const s of await sesiones(process.argv.slice(2))) {
  const slots = extractSlots(s.template)
  const inputs = {
    productName: s.product_name ?? '', productDescription: s.what_it_does ?? '',
    angle: s.angle ?? '', targetAudience: s.target_audience ?? '', problem: s.problem ?? '',
    characterDesc: s.character_desc ?? '', characterEthnicity: s.character_ethnicity ?? '',
    accent: s.accent ?? '', voice: s.voice ?? '', constraints: s.constraints ?? '',
  }

  const { valores, locuciones } = await callVideoAds('slot_values', SlotValuesSchema, [
    { text: buildAdaptInstruction(s.template, s.forensic_analysis, inputs, s.product_scan, slots) },
  ])

  const mapa: Record<string, string> = {}
  for (const v of valores) mapa[v.id] = v.valor
  const { valores: limpios, rechazados } = rejectBadValues(s.template, mapa)
  const piso = fillTemplate(s.template, limpios)

  // Igual que la ruta: la reescritura del modelo gana si conserva el andamiaje.
  const porToma = new Map(locuciones.map((l) => [l.n, l.texto]))
  let aceptadas = 0
  const finales = piso.tomas.map((t) => {
    const propuesta = porToma.get(t.n)
    const plantilla = s.template.tomas.find((x: { n: number }) => x.n === t.n)?.locucion
    if (!propuesta || !plantilla) return t.locucion
    const v = acceptRewrite({ plantilla, piso: t.locucion, propuesta })
    if (!v.ok) return t.locucion
    aceptadas++
    return propuesta.trim()
  })

  const antes = extractPending(s.adapted?.guionFinal ?? '')
  const ahora = extractPending(finales.join(' '))
  console.log(`\n── sesión ${s.id} · ${s.product_name ?? 'sin nombre'} · ${slots.length} huecos`)
  console.log(`   pendientes guardados: ${antes.length}  →  esta corrida: ${ahora.length}`)
  console.log(`   reescrituras aceptadas: ${aceptadas}/${piso.tomas.length} · valores rechazados por formato: ${rechazados.length}`)
  if (ahora.length) console.log(`   siguen abiertos: ${ahora.join(' ')}`)
  console.log(`   guión: ${finales.join(' ').slice(0, 400)}…`)
 }
}

main()
