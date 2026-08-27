// Probe del PRIMER recurso migrado: el texto/visión de Gemini por KIE. Sin mocks, contra la API.
//   npx tsx --env-file=.env.local scripts/probe-kie-gemini.ts
import { z } from 'zod'
import { callStructured, callReasoning } from '../lib/gemini'

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC'

async function main() {
  const t0 = Date.now()

  const visto = await callStructured(
    'probe_vision',
    z.object({ color: z.string(), nota: z.string().optional() }),  // con opcional: ejercita el anyOf
    [{ inlineData: { mimeType: 'image/png', data: PIXEL } }, { text: '¿De qué color es la imagen? Una palabra. Deja `nota` vacía.' }],
    2,
    'Responde en español.',
    { preferGemini: true },
  )
  console.log('visión + opcional :', visto)

  const texto = await callReasoning(
    'Eres redactor publicitario peruano.',
    'Un titular de 6 palabras para un sérum de niacinamida.',
    { preferGemini: true },
  )
  console.log('razonamiento     :', texto.trim().slice(0, 90))
  console.log(`total ${Math.round((Date.now() - t0) / 1000)} s`)
}
main().catch((e) => { console.error('FALLÓ:', e instanceof Error ? e.message : e); process.exit(1) })
