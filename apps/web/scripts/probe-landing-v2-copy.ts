/**
 * ¿El copy de landing v2 sale bien por el AI SDK, con CADA modelo del par?
 *
 *   npx tsx scripts/probe-landing-v2-copy.ts        # texto, barato: 2 modelos × 3 secciones × 2 draws
 *
 * Lo que NO se puede decidir leyendo el código (alcance (b) del plan, 2026-10-05):
 *  1. que `Output.object` con el schema strict-compatible pase por Gemini (plano) y por OpenAI
 *     (strict, default del AI SDK) sin 400;
 *  2. que el verificador cace lo que el modelo copia de los wireframes ("+10,000 clientes",
 *     "Garantía X días") — se imprime lo que el modelo escribió ANTES del verificador.
 * Cada modelo se llama por separado (sin el respaldo de `structured`): si uno falla, se ve.
 * Dos draws por brazo: `n = 1` no es una medición (ley del repo).
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const DRAWS = 2
const SECCIONES = ['hero', 'offer_pricing', 'authority'] as const

async function main() {
  const { generateText, Output } = await import('ai')
  const { primario, respaldo } = await import('../lib/landing-v2/models')
  const { copyRequest } = await import('../lib/landing-v2/section')
  const { SectionCopyOutSchema, emptySession } = await import('../lib/landing-v2/schemas')
  const { sourceText, verifyCopy } = await import('../lib/landing-v2/verify-copy')

  const inputs = {
    productName: 'Colágeno Hidrolizado Vital+',
    marketResearch: [
      'Público: mujeres y hombres de 35 a 60 años en Lima y provincias, con molestias en rodillas al subir escaleras.',
      'Dolor principal: rigidez por las mañanas y miedo a depender de pastillas. Deseo: volver a caminar y bailar sin molestias.',
      'Objeciones: "¿y si no funciona?", "¿cuánto demora?". Se toma una cucharada disuelta en agua cada mañana.',
      'Ingredientes: colágeno hidrolizado tipo I y II, vitamina C y ácido hialurónico.',
    ].join('\n'),
    pricing: {
      packs: [
        { name: '1 frasco', quantity: 1, price: 89.9, compareAt: null, label: null },
        { name: 'Pack x3', quantity: 3, price: 199.9, compareAt: 269.7, label: 'Más vendido' },
      ],
      notes: 'Pago contra entrega en Lima.',
    },
    niche: 'health' as const, nicheOther: null, productImageUrl: 'https://x/y.png', proofImageUrls: [],
  }
  const s = {
    ...emptySession('probe', 'wizard'), inputs,
    visualSystem: {
      niche: 'health' as const, productForm: 'frasco de polvo', palette: [],
      typography: 't', photography: 'p', graphicResources: [], artDirection: 'a', usesPeople: false, peopleDirection: null,
    },
  }
  const src = sourceText(inputs)

  for (const model of [primario, respaldo]) {
    console.log(`\n##### ${model.modelId}`)
    for (const id of SECCIONES) {
      for (let i = 0; i < DRAWS; i++) {
        const t = Date.now()
        try {
          const req = copyRequest(s, id)
          const { output } = await generateText({
            model, system: req.system,
            messages: [{ role: 'user', content: req.content }],
            output: Output.object({ schema: SectionCopyOutSchema, name: 'landing_v2_section_copy' }),
            abortSignal: AbortSignal.timeout(60_000),
          })
          const v = verifyCopy(output, src)
          console.log(`  ${id} draw ${i + 1} (${((Date.now() - t) / 1000).toFixed(1)}s): "${output.headline}" · items=${output.items.length}`)
          console.log(`    sin respaldo en los datos: ${v.length ? v.map((x) => `${x.field}→${x.token}`).join(', ') : 'ninguno'}`)
        } catch (e) {
          console.log(`  ${id} draw ${i + 1}: FALLÓ — ${(e as Error).message.slice(0, 300)}`)
        }
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
