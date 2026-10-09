/**
 * Probe PAGADO (4 renders): ¿el director de arte saca a las secciones de la plantilla de casillas?
 *
 *   npx tsx scripts/probe-landing-v2-director.ts [sessionId] [section] [outDir]
 *
 * Sobre una sesión real (default: la de Fluya), la MISMA sección se pinta 2 veces por camino:
 *  - "director": `directSection` → `renderDirected` (system prompt del dueño, textos libres).
 *  - "casillas" (control): `generateSectionCopy` → `buildRenderBrief` → `renderSection`, el camino
 *    que había hasta 2026-10-09. 2 draws por brazo: `n = 1` no es una medición (ley del repo).
 * No guarda nada en la sesión ni cobra créditos: escribe imágenes y diseños en `outDir`.
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const SESSION = process.argv[2] ?? 'a26e3d81-eb68-4581-9694-d1e1a45bdeff'
// Dueño de la sesión de Fluya (`getV2Session` filtra por dueño). Otra sesión: PROBE_OWNER=<user_id>.
const OWNER = process.env.PROBE_OWNER ?? '2d3eb545-e1d8-4d42-afe2-768c589b2161'
const SECTION = (process.argv[3] ?? 'hero') as import('../lib/landing-v2/catalog').SectionId
const OUT = process.argv[4] ?? path.join(process.cwd(), 'probe-landing-v2-director-out')

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const { getV2Session } = await import('../lib/landing-v2/db')
  const sec = await import('../lib/landing-v2/section')
  const sharp = (await import('sharp')).default
  const got = await getV2Session(SESSION, OWNER)
  if (!got) throw new Error(`sesión ${SESSION} no existe`)
  // Sin aprobadas: la sección se pinta como en una landing nueva, sin ancla de estilo en ningún brazo.
  let s = { ...got.session, sections: {}, designs: {} }
  // Una sesión guardada con el sistema visual viejo llega sin él: se re-analiza, como en la app.
  if (!s.visualSystem) s = await (await import('../lib/landing-v2/analyze')).analyzeProduct(s)
  console.log(`sesión ${s.id} · ${s.inputs.productName} · sección ${SECTION}`)

  const save = async (name: string, b64: string, meta: object) => {
    const raw = Buffer.from(b64, 'base64')
    const { width, height } = await sharp(raw).metadata()
    fs.writeFileSync(path.join(OUT, `${name}.jpg`), await sharp(raw).jpeg({ quality: 88 }).toBuffer())
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ model: sec.modelFromSize(width, height), ...meta }, null, 2))
    console.log(`${name}: ${sec.modelFromSize(width, height)}`)
  }

  for (const draw of [1, 2]) {
    let t = Date.now()
    const design = await sec.directSection(s, SECTION)
    console.log(`director ${draw}: ${design.texts.length} textos (${((Date.now() - t) / 1000).toFixed(0)}s)`)
    await save(`director-${draw}`, await sec.renderDirected(s, SECTION, design), { design })

    t = Date.now()
    const copy = await sec.generateSectionCopy(s, SECTION)
    const brief = await sec.buildRenderBrief({ ...s, copies: { ...s.copies, [SECTION]: copy } }, SECTION, copy)
    console.log(`casillas ${draw}: ${copy.items.length} items (${((Date.now() - t) / 1000).toFixed(0)}s)`)
    await save(`casillas-${draw}`, await sec.renderSection(s, SECTION, copy, brief), { copy, brief })
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
