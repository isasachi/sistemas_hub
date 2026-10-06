/**
 * ¿El agente del chat de landing v2 sigue el loop? Solo TEXTO: la base, el análisis y el render van
 * stubeados por el seam `deps` de `createLandingAgent`, así que no se genera ninguna imagen.
 *
 *   npx tsx scripts/probe-landing-v2-agent.ts      # 2 draws × 3 turnos, modelo real (Gemini → nano)
 *
 * Lo que mide, por turno (igual que la ruta: un agente nuevo por request con la sesión vigente):
 *  1. "Hola…" sin datos       → pide lo que falta y NO genera (prepareStep deja solo las tools de juntar).
 *  2. todos los inputs juntos → update_inputs y luego generate_section (el Hero) + frase de validación.
 *  3. "dale"                  → approve_section y generate_section de la siguiente, sin preguntar cuál.
 * También prueba que las tool schemas (PackSchema: `.positive()`, `.int().min(1)`) pasen por Gemini.
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const DRAWS = 2

async function main() {
  const { createLandingAgent } = await import('../lib/landing-v2/agent')
  const { emptySession } = await import('../lib/landing-v2/schemas')
  const { VALIDATION_PHRASE } = await import('../lib/landing-v2/system-prompt')
  type S = ReturnType<typeof emptySession>
  type Msg = Parameters<ReturnType<typeof createLandingAgent>['generate']>[0] extends infer P ? P extends { messages?: infer M } ? NonNullable<M> : never : never

  const img = `${process.env.SUPABASE_URL}/storage/v1/object/public/ad-uploads/probe/producto.png`
  const turnos = [
    'Hola, quiero hacer una landing para mi producto.',
    [
      'Se llama "Colágeno Hidrolizado Vital+". Nicho salud.',
      'Investigación: público de 35 a 60 años en Lima con molestias en rodillas al subir escaleras; rigidez en las mañanas; quieren volver a caminar sin molestias. Se toma una cucharada en agua cada mañana. Ingredientes: colágeno tipo I y II, vitamina C, ácido hialurónico.',
      'Precios: 1 frasco a S/ 89.90; pack de 3 frascos a S/ 199.90 (antes S/ 269.70), es el más vendido. Pago contra entrega en Lima.',
      `[Adjunto imagen: producto.png — ${img}]`,
    ].join('\n'),
    'dale',
  ]

  for (let d = 0; d < DRAWS; d++) {
    console.log(`\n######## draw ${d + 1}`)
    let session: S = emptySession('00000000-0000-0000-0000-000000000000', 'chat')
    const deps = {
      save: async (s: S) => { session = s },
      analyze: async (s: S) => ({
        ...s, visualSystem: { niche: 'health' as const, productForm: 'frasco', palette: [], typography: 't', photography: 'p', graphicResources: [], artDirection: 'a', usesPeople: false, peopleDirection: null },
      }),
      generate: async (s: S, id: S['current'] & string) => ({
        ...s, current: id,
        sections: { ...s.sections, [id]: { approved: false, versions: [{ imageUrl: `https://img/${id}.jpg`, model: 'stub', feedback: null, createdAt: '' }] } },
      }),
      revise: async (s: S) => s,
    }
    let history: Msg = []
    for (const [t, text] of turnos.entries()) {
      const agent = createLandingAgent(session, { userId: 'probe', owner: null }, deps as never)
      history = [...history, { role: 'user', content: text }] as Msg
      const t0 = Date.now()
      try {
        const r = await agent.generate({ messages: history })
        history = [...history, ...r.response.messages] as Msg
        const calls = r.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName))
        console.log(`\n-- turno ${t + 1} (${((Date.now() - t0) / 1000).toFixed(1)}s) tools: [${calls.join(', ')}]`)
        console.log(`   respuesta: ${r.text.replace(/\s+/g, ' ').slice(0, 400)}`)
        console.log(`   frase de validación: ${r.text.includes(VALIDATION_PHRASE) ? 'SÍ' : 'no'} · aprobadas: ${Object.entries(session.sections).filter(([, v]) => v?.approved).map(([k]) => k).join(',') || '—'} · actual: ${session.current}`)
        if (t === 1) console.log(`   inputs: ${JSON.stringify(session.inputs.pricing)} niche=${session.inputs.niche} img=${!!session.inputs.productImageUrl}`)
      } catch (e) {
        console.log(`\n-- turno ${t + 1}: FALLÓ — ${(e as Error).message.slice(0, 400)}`)
        break
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
