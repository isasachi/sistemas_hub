/**
 * El agente del chat de anuncios: ¿llama las tools correctas, en el orden correcto, y gasta un
 * crédito de imagen SOLO cuando el usuario ya eligió el copy?
 *
 *   npx tsx scripts/probe-anuncios-agent.ts        # 2 draws × 7 turnos
 *   npx tsx scripts/probe-anuncios-agent.ts 3      # N draws
 *
 * El MODELO del chat es el real (el par del hub). Todo lo demás va stubeado por `deps`: no toca la
 * base, no analiza imágenes y no genera ninguna — cero cuota. Lo que se mide es la conducción.
 *
 * Los checks son sobre las TOOL CALLS (un hecho), no sobre el texto. El texto se imprime para leerlo.
 */
import fs from 'fs'
import path from 'path'
import type { ModelMessage } from 'ai'
import type { SessionResponse } from '../lib/types'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const BUCKET = `${process.env.SUPABASE_URL}/storage/v1/object/public/ad-uploads/probe`

// `creditos`: cuántos créditos de imagen DEBE gastar el turno. Es el check que importa: una tool
// pedida que el servidor rechazó no gastó nada, y una que no se pidió tampoco hizo lo que dijo.
const TURNOS: { user: string; debe: string[]; noDebe: string[]; creditos: number }[] = [
  { user: 'Hola, quiero hacer un anuncio para mi producto', debe: [], noDebe: ['set_reference', 'set_product', 'write_copy'], creditos: 0 },
  { user: `Este es el anuncio que me gusta\n[Adjunto imagen: ref.jpg — ${BUCKET}/ref.jpg]`, debe: ['set_reference'], noDebe: [], creditos: 0 },
  { user: `Se llama Lumina, es un sérum facial que aclara las manchas, para mujeres de 25 a 40\n[Adjunto imagen: producto.jpg — ${BUCKET}/producto.jpg]`, debe: ['set_product', 'write_copy'], noDebe: ['choose_copy'], creditos: 0 },
  // Trampa: una pregunta no es una elección. Con el primer paso obligado a llamar una tool, la
  // salida correcta es `get_state`, no elegir por el usuario y gastarle un crédito.
  { user: '¿Cuál de las dos me recomiendas?', debe: [], noDebe: ['write_copy'], creditos: 0 },
  { user: 'Me quedo con la versión B', debe: ['choose_copy', 'generate_ad'], noDebe: [], creditos: 1 },
  { user: 'Ponle el fondo un poco más claro', debe: ['adjust_ad'], noDebe: ['set_reference', 'set_product'], creditos: 1 },
  // Trampa: un agradecimiento no es un pedido de cambio.
  { user: 'Gracias, me encanta cómo quedó', debe: [], noDebe: ['set_reference', 'set_product', 'write_copy'], creditos: 0 },
]

const analysis = {
  format: { ratio: '9:16', platform: 'instagram' }, style: 'ugc', composition: ['producto al centro'], replacements: [],
  physicalPosition: 'Está apoyado. No está flotando.', colorimetry: 'crema', typography: 'sans bold', persuasiveLogic: 'problema→solución',
  layoutDescription: 'titular arriba, producto al centro', sceneElements: { people: [], props: [], brandElements: [], setting: 'estudio' },
  creativeConcept: 'problema→solución', bodyFocus: null, attentionMarkers: null, summaryForUser: 'Anuncio vertical con titular arriba y el producto al centro.',
}
const scan = { productDescription: 'frasco gotero', brandingDescription: 'LUMINA', brandColors: null, styleCompatibilityNote: null, summaryForUser: 'Frasco gotero con etiqueta Lumina.' }
const research = { niche: 'cuidado facial para manchas', keywords: ['quitar manchas de la cara'], pains: ['las manchas no se van'], desires: ['tono parejo'] }
const copy = {
  versionA: [{ element: 'headline', text: 'Tu piel, con el tono parejo', template: null, source: null }],
  versionB: [{ element: 'headline', text: 'Manchas que no se van', template: '[problema] que no se van', source: 'Grasa que no se va' }],
}

async function draw(n: number) {
  const { createAnunciosAgent } = await import('../lib/anuncios/agent')
  let s: SessionResponse = {
    id: 'probe', created_at: '', step: 0, reference_url: null, reference_analysis: null, product_url: null, logo_url: null,
    product_scan: null, product_name: null, what_it_is: null, what_it_does: null, target_audience: null, market_research: null,
    copy_versions: null, confirmed_copy: null, edit_instruction: null, image_url: null, messages: null,
  }
  let creditos = 0
  // Un agente POR TURNO, igual que la ruta: nace con el estado de la sesión y el texto del mensaje.
  const nuevoAgente = (userText: string) => createAnunciosAgent(s, { userId: 'probe', owner: null }, userText, {
    reload: async () => s,
    fetchImage: async () => ({ data: 'eA==', mimeType: 'image/jpeg' }),
    analyzeReference: async () => { s = { ...s, step: 1, reference_url: `${BUCKET}/ref.jpg`, reference_analysis: analysis, copy_versions: null, confirmed_copy: null }; return { analysis, referenceUrl: s.reference_url! } },
    analyzeProduct: async (_s, i) => {
      s = { ...s, step: 2, product_url: `${BUCKET}/producto.jpg`, product_scan: scan, product_name: i.productName, what_it_is: i.whatItIs, what_it_does: i.whatItDoes, target_audience: i.targetAudience, market_research: research, copy_versions: null, confirmed_copy: null }
      console.log(`      set_product ← ${JSON.stringify({ productName: i.productName, whatItIs: i.whatItIs, whatItDoes: i.whatItDoes, targetAudience: i.targetAudience })}`)
      return { scan, productUrl: s.product_url!, logoUrl: null, research }
    },
    generateCopy: async () => { s = { ...s, step: 3, copy_versions: copy, confirmed_copy: null }; return { copyVersions: copy, research } },
    confirmCopy: async (_s, version) => { const c = { version, breakdown: version === 'A' ? copy.versionA : copy.versionB }; s = { ...s, step: 4, confirmed_copy: c }; return c },
    generateAd: async () => { creditos++; s = { ...s, step: 5, image_url: `${BUCKET}/result.png` }; return { imageUrl: s.image_url!, regensLeft: 3 } },
    refineAd: async () => { creditos++; s = { ...s, image_url: `${BUCKET}/result-2.png` }; return { imageUrl: s.image_url!, regensLeft: 2 } },
  })

  const messages: ModelMessage[] = []
  let fallos = 0
  console.log(`\n━━ draw ${n} ━━`)
  for (const [k, t] of TURNOS.entries()) {
    messages.push({ role: 'user', content: t.user })
    const t0 = Date.now()
    const antes = creditos
    const agent = nuevoAgente(t.user)
    const res = await agent.generate({ messages })
    messages.push(...res.response.messages)
    const calls = res.steps.flatMap((st) => st.toolCalls.map((c) => c.toolName))
    const faltan = t.debe.filter((x) => !calls.includes(x))
    const sobran = t.noDebe.filter((x) => calls.includes(x))
    const gastados = creditos - antes
    const ok = !faltan.length && !sobran.length && gastados === t.creditos
    if (!ok) fallos++
    console.log(`  ${ok ? '✅' : '❌'} turno ${k + 1} (${Date.now() - t0} ms) tools: [${calls.join(', ')}] créditos: ${gastados}/${t.creditos}${faltan.length ? ` · FALTA ${faltan}` : ''}${sobran.length ? ` · SOBRA ${sobran}` : ''}`)
    console.log(`      → ${res.text.replace(/\n+/g, ' ⏎ ').slice(0, 260)}`)
    // Un turno que falla se imprime entero: qué pidió cada paso y qué le devolvió la tool.
    if (!ok) for (const [j, st] of res.steps.entries())
      console.log(`      paso ${j}: calls=${JSON.stringify(st.toolCalls.map((c) => [c.toolName, c.input]))} results=${JSON.stringify(st.toolResults.map((r) => r.output)).slice(0, 300)} finish=${st.finishReason}`)
  }
  return fallos
}

async function main() {
  const draws = Number(process.argv[2] ?? 2)
  let fallos = 0
  for (let n = 1; n <= draws; n++) fallos += await draw(n)
  console.log(`\n${fallos ? `❌ ${fallos} check(s) fallaron` : '✅ todos los checks pasaron'} en ${draws} draws`)
}

main().catch((e) => { console.error(e); process.exit(1) })
