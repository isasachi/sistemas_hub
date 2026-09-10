// Probe del planificador de lote (flujo de plantilla): ¿el planner devuelve N conceptos
// GENUINAMENTE distintos y los escritores llenan los huecos de la plantilla dentro de su tope de
// palabras? Es TEXTO PURO — 1 llamada de plan + N de copy, cero imágenes, cero cuota de imagen y
// cero escrituras en la base. Se corre a mano:
//   npx tsx --env-file=.env.local scripts/probe-plan-lote.ts [plantilla] [n]
//
// ⚠️ IMPRIME ADEMÁS DE PUNTUAR, por el mismo motivo que el probe de tipografía: sus checks son
// aritmética sobre longitudes y similitud, y un ❌ puede estar midiendo el umbral y no el copy.
import { callStructured } from '../lib/gemini'
import { getTemplate, slotsDelModelo, TEMPLATES } from '../lib/anuncios/templates'
import {
  PlanLoteSchema, CopyVarianteSchema, buildPlanPrompt, buildCopyPrompt,
  slotsLargos, correccionDeSlots, conceptosDuplicados, type ContextoLote,
} from '../lib/anuncios/lote'

const id = process.argv[2] || 'antes-despues'
const n = Number(process.argv[3] || 3)
const template = getTemplate(id)
if (!template) {
  console.error(`Plantilla desconocida: ${id}. Hay: ${TEMPLATES.map((t) => t.id).join(', ')}`)
  process.exit(1)
}

// Producto con la forma de una sesión real de anuncios, no un placeholder: lo que se prueba es el
// prompt, así que los insumos tienen que parecerse a los de producción.
const ctx: ContextoLote = {
  template,
  productName: 'Gluteo Gummies',
  whatItIs: 'Gomitas masticables de creatina',
  whatItDoes: 'Ayuda a ganar volumen y firmeza en los glúteos con entrenamiento constante',
  targetAudience: 'Mujeres de 20 a 40 años que entrenan en casa o en gimnasio',
  brandingDescription: 'GLUTEO GUMMIES · CREATINA MONOHIDRATADA · 60 GOMITAS · SABOR FRESA',
  productDescription: 'Frasco cilíndrico rosa con tapa dorada, gomitas rosadas en forma de corazón',
  comments: [
    'llevo 3 meses en el gym y no me crece nada la cola',
    'yo tomo creatina en polvo pero me cae pesada al estomago',
    'alguien ha probado esto? funciona de verdad o es marketing',
    'lo malo es que hay que ser constante, yo dejo a las 2 semanas',
    'a mi lo que me da flojera es el sabor de los polvos, saben horrible',
    'necesito algo que se pueda llevar al trabajo',
    'mi problema es la flacidez despues de bajar de peso',
    'no quiero verme musculosa, solo quiero verme mas firme',
  ].join('\n'),
}

const defs = slotsDelModelo(template)

async function main() {
  console.log(`\n=== ${template!.nombre} (${template!.id}) — ${n} variantes ===`)
  console.log(`Huecos: ${defs.map((d) => `${d.id}(<=${d.maxPalabras}p)`).join(' · ')}\n`)

  const t0 = Date.now()
  const plan = await callStructured('plan_lote', PlanLoteSchema, [{ text: buildPlanPrompt(ctx, n) }], 3, undefined, { preferGemini: true })
  const planeadas = plan.variantes.slice(0, n)
  console.log(`— PLAN (${((Date.now() - t0) / 1000).toFixed(1)}s, ${planeadas.length}/${n} variantes)`)
  planeadas.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.concepto}`)
    console.log(`     angulo:  ${v.angulo}`)
    console.log(`     mensaje: ${v.mensaje}`)
  })

  const escritas = await Promise.all(planeadas.map(async (v) => {
    const pedir = (correccion?: string) =>
      callStructured('copy_variante', CopyVarianteSchema, [{ text: buildCopyPrompt(ctx, v, correccion) }], 3, undefined, { preferGemini: true })
    let copy = await pedir()
    const largos = slotsLargos(copy.slots, defs)
    let reintentado = false
    if (largos.length) {
      reintentado = true
      try { copy = await pedir(correccionDeSlots(largos, defs)) } catch { /* se conserva el primero */ }
    }
    return { v, copy, reintentado }
  }))

  console.log(`\n— COPY`)
  const validos = new Set(defs.map((d) => d.id))
  let vacias = 0, inventados = 0, largosFinal = 0
  escritas.forEach(({ v, copy, reintentado }, i) => {
    const buenos = copy.slots.filter((s) => validos.has(s.slot))
    const otros = copy.slots.filter((s) => !validos.has(s.slot))
    if (buenos.length === 0) vacias++
    inventados += otros.length
    largosFinal += slotsLargos(buenos, defs).length
    console.log(`  ${i + 1}. ${v.concepto}${reintentado ? '  [reintentado por largo]' : ''}`)
    buenos.forEach((s) => {
      const def = defs.find((d) => d.id === s.slot)!
      const p = s.texto.trim().split(/\s+/).length
      console.log(`     ${p > def.maxPalabras * 1.2 ? '!!' : '  '} ${s.slot} (${p}/${def.maxPalabras}p): ${s.texto}`)
    })
    otros.forEach((s) => console.log(`     x hueco inventado: ${s.slot}`))
  })

  const variantes = escritas.map(({ v, copy }, i) => ({
    id: `v${i + 1}`, concepto: v.concepto, angulo: v.angulo,
    slots: copy.slots.filter((s) => validos.has(s.slot)),
    estado: 'planificada' as const, imageUrl: null, error: null,
  }))
  const dup = conceptosDuplicados(variantes)

  console.log(`\n— VEREDICTO`)
  console.log(`  ${planeadas.length === n ? 'OK ' : 'NO '} el plan devolvió ${planeadas.length} de ${n}`)
  console.log(`  ${vacias === 0 ? 'OK ' : 'NO '} variantes sin ningún hueco válido: ${vacias}`)
  console.log(`  ${inventados === 0 ? 'OK ' : '!! '} huecos inventados por el modelo: ${inventados}`)
  console.log(`  ${largosFinal === 0 ? 'OK ' : '!! '} huecos aún largos tras el reintento: ${largosFinal}`)
  console.log(`  ${dup.length === 0 ? 'OK ' : 'NO '} conceptos parecidos entre sí: ${JSON.stringify(dup)}`)
  console.log()
}

main().catch((e) => { console.error(e); process.exit(1) })
