/**
 * Probe SOLO DE TEXTO del director de arte (sin renders: centavos por draw).
 *
 *   npx tsx scripts/probe-landing-v2-director-texto.ts <vsCache.json> [variantes] [draws] [sessionId] [section]
 *
 * ¿La `composition` arranca de un CONCEPTO visual o describe un layout? Se imprime CRUDA, antes de
 * `sinComillas`/`sinConfianzaInventada` (que borran oraciones enteras). El sistema visual se analiza
 * UNA vez y se congela en `vsCache.json`: si no, cada corrida usa uno distinto y no hay control.
 * Variantes: `director` (el par de producción: gpt-5.5 → gemini, lo que corre la app), `base` (el par de
 * texto del hub, gemini-3.6-flash: el director antes del 2026-10-13) y `high` (thinkingLevel high de Gemini).
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const [CACHE, VARIANTES = 'director,base', DRAWS = '2', SESSION = 'a26e3d81-eb68-4581-9694-d1e1a45bdeff', SECTION = 'hero'] = process.argv.slice(2)
const OWNER = process.env.PROBE_OWNER ?? '2d3eb545-e1d8-4d42-afe2-768c589b2161'

type Opts = Pick<Parameters<typeof import('../lib/landing-v2/models').structured>[0], 'providerOptions' | 'timeoutMs'>
const OPCIONES: Record<string, Opts> = {
  base: {},
  high: { providerOptions: { google: { thinkingConfig: { thinkingLevel: 'high' } } }, timeoutMs: 120_000 },
}
// Otro modelo como director, con el MISMO pedido (system, content, schema). Sin respaldo ni validate:
// mide solo si el modelo produce un concepto visual. `oa:` = OpenAI (chat.completions), `g:` = Google.
const MODELOS: Record<string, string> = {
  'gpt-5.5': 'oa:gpt-5.5',
  'gemini-pro': 'g:gemini-pro-latest',
  'gemini-3.1-pro': 'g:gemini-3.1-pro-preview',
}

async function main() {
  if (!CACHE) throw new Error('falta la ruta del vsCache.json')
  const { getV2Session } = await import('../lib/landing-v2/db')
  const { analyzeProduct } = await import('../lib/landing-v2/analyze')
  const { designRequest } = await import('../lib/landing-v2/section')
  const { structured, DIRECTOR, DIRECTOR_TIMEOUT_MS } = await import('../lib/landing-v2/models')
  type S = import('../lib/landing-v2/schemas').LandingSession
  const got = await getV2Session(SESSION, OWNER)
  if (!got) throw new Error(`sesión ${SESSION} no existe`)
  let s: S = { ...got.session, sections: {}, designs: {} }
  if (fs.existsSync(CACHE)) s = { ...s, ...JSON.parse(fs.readFileSync(CACHE, 'utf-8')) }
  else {
    s = await analyzeProduct(s)
    fs.writeFileSync(CACHE, JSON.stringify({ visualSystem: s.visualSystem, testimonials: s.testimonials }, null, 2))
  }
  const id = SECTION as import('../lib/landing-v2/catalog').SectionId
  for (const v of VARIANTES.split(',')) {
    for (let d = 1; d <= Number(DRAWS); d++) {
      const { request, source } = await designRequest(s, id)
      const t = Date.now()
      const { output, model } = MODELOS[v] ? await otroModelo(MODELOS[v], request)
        : v === 'director' ? await structured({ ...request, models: DIRECTOR, timeoutMs: DIRECTOR_TIMEOUT_MS })
          : await structured({ ...request, ...OPCIONES[v] })
      console.log(`\n===== ${v} #${d} · ${model} · ${((Date.now() - t) / 1000).toFixed(0)}s · persona=${output.usesPerson}`)
      console.log(`CONCEPT: ${output.visualConcept}`)
      console.log(`COMPOSITION: ${output.composition}`)
      for (const x of output.texts) console.log(`  [${x.role}] ${x.text}`)
      // PROBE_RENDER=<dir>: pinta el diseño (PAGADO) con la misma limpieza y el mismo render que la app.
      if (process.env.PROBE_RENDER) {
        const { cleanDesign, renderDirected, modelFromSize } = await import('../lib/landing-v2/section')
        const sharp = (await import('sharp')).default
        const design = cleanDesign(output, source)
        const raw = Buffer.from(await renderDirected(s, id, design), 'base64')
        const { width, height } = await sharp(raw).metadata()
        fs.mkdirSync(process.env.PROBE_RENDER, { recursive: true })
        fs.writeFileSync(path.join(process.env.PROBE_RENDER, `${v}-${d}.jpg`), await sharp(raw).jpeg({ quality: 88 }).toBuffer())
        fs.writeFileSync(path.join(process.env.PROBE_RENDER, `${v}-${d}.json`), JSON.stringify({ director: model, image: modelFromSize(width, height), design }, null, 2))
        console.log(`  render ${v}-${d}: ${modelFromSize(width, height)}`)
      }
    }
  }
}

async function otroModelo(spec: string, request: Awaited<ReturnType<typeof import('../lib/landing-v2/section').designRequest>>['request']) {
  const { generateText, Output } = await import('ai')
  const { createOpenAI } = await import('@ai-sdk/openai')
  const { createGoogle } = await import('@ai-sdk/google')
  const [prov, id] = spec.split(':')
  const model = prov === 'oa' ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat(id) : createGoogle({ apiKey: process.env.GOOGLE_API_KEY })(id)
  const { output } = await generateText({
    model, system: request.system,
    messages: [{ role: 'user', content: request.content }],
    output: Output.object({ schema: request.schema, name: request.name }),
    abortSignal: AbortSignal.timeout(180_000),
  })
  return { output, model: id }
}

main().catch((e) => { console.error(e); process.exit(1) })
