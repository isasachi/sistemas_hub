/**
 * QA real de landing v2 (PAGADO: genera imágenes). Dos partes, sobre una sesión real en la base:
 *
 *   npx tsx scripts/qa-landing-v2.ts [outDir]
 *
 *  A. Corrida real de 3 secciones con el flujo del producto: análisis → Hero → aprobar →
 *     Beneficios inmediatos → aprobar → Oferta y precios (11 renders en total con la parte B).
 *  B. Consistencia con y sin ancla (producción va SIN ancla desde 2026-10-13; "con" es el control): con el Hero aprobado, `mechanism` y `expanded_benefits` se
 *     renderizan 2 veces cada una; en cada draw el MISMO diseño del director va con ancla (el Hero
 *     como referencia de estilo) y sin ancla. Así la única variable es la imagen de referencia.
 *     2 draws por brazo: `n = 1` no es una medición (ley del repo).
 *
 * Producto: el "Complejo Linfático" de una sesión real (foto del bucket). La investigación es
 * de prueba, escrita para el QA. Corre con AUTH_DISABLED (el gate de créditos no tiene usuario); las
 * generaciones quedan en `ph_gen_usage` con user_id `qa-landing-v2`.
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
process.env.AUTH_DISABLED = 'true'

const OUT = process.argv[2] ?? path.join(process.cwd(), 'qa-landing-v2-out')
const PHOTO = `${process.env.SUPABASE_URL}/storage/v1/object/public/ad-uploads/f4c30797-59c3-485f-bc24-2d7c360e65db/photo-0.png`

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const { createV2Session, saveV2Session } = await import('../lib/landing-v2/db')
  const { analyzeProduct } = await import('../lib/landing-v2/analyze')
  const { approveSection } = await import('../lib/landing-v2/flow')
  const { generateSection, directSection, renderDirected, modelFromSize } = await import('../lib/landing-v2/section')
  const { latestVersion } = await import('../lib/landing-v2/schemas')
  const sharp = (await import('sharp')).default
  const ctx = { userId: 'qa-landing-v2', owner: null }

  const save = async (name: string, url: string) => {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    fs.writeFileSync(path.join(OUT, name), buf)
  }

  let s = await createV2Session(ctx.userId, 'wizard')
  console.log(`sesión ${s.id}`)
  s = {
    ...s,
    inputs: {
      productName: 'Complejo Linfático Vitella',
      niche: 'health', nicheOther: null, productImageUrl: PHOTO, proofImageUrls: [],
      marketResearch: [
        'Público: mujeres de 28 a 50 años en Lima y provincias que sienten las piernas pesadas e hinchadas al final del día y se notan "infladas" aunque coman bien.',
        'Dolor: retención de líquidos, sensación de pesadez, ropa que aprieta por la tarde, frustración porque las dietas no lo resuelven.',
        'Deseo: sentirse ligeras, desinflamadas y cómodas con su ropa durante todo el día.',
        'Objeciones: "¿es seguro?", "¿cuánto demora?", "¿y si no me funciona?".',
        'Producto: suplemento dietético en cápsulas, 6 en 1: bardana, diente de león, kelp, cleavers, rutina y bromelina. Sin soya, sin gluten, sin OGM. Se toman 2 cápsulas al día con agua, después del desayuno.',
        'Mecanismo: las plantas apoyan el drenaje natural de líquidos del cuerpo; la bromelina apoya la digestión.',
      ].join('\n'),
      pricing: {
        packs: [
          { name: '1 bolsa', quantity: 1, price: 79.9, compareAt: null, label: null },
          { name: 'Pack 2 bolsas', quantity: 2, price: 139.9, compareAt: 159.8, label: 'Más vendido' },
          { name: 'Pack 3 bolsas', quantity: 3, price: 189.9, compareAt: 239.7, label: 'Máximo ahorro' },
        ],
        notes: 'Pago contra entrega en Lima. Envío a provincias por agencia.',
      },
    },
  }

  const t0 = Date.now()
  s = await analyzeProduct(s)
  await saveV2Session(s)
  console.log(`análisis (${((Date.now() - t0) / 1000).toFixed(0)}s): ${JSON.stringify({ ...s.visualSystem, palette: s.visualSystem!.palette.map((c) => `${c.role}:${c.hex}`) })}`)

  // ── A. Corrida real: 3 secciones con aprobación ──────────────────────────────
  for (const [i, id] of (['hero', 'immediate_benefits', 'offer_pricing'] as const).entries()) {
    const t = Date.now()
    s = await generateSection(s, id, ctx)
    await saveV2Session(s)
    const v = latestVersion(s, id)!
    await save(`A${i + 1}-${id}.jpg`, v.imageUrl)
    console.log(`A ${id} (${((Date.now() - t) / 1000).toFixed(0)}s) por ${v.model}: ${JSON.stringify(s.designs[id])}`)
    if (id !== 'offer_pricing') { s = approveSection(s, id); await saveV2Session(s) }
  }

  // ── B. Consistencia con y sin ancla (el Hero aprobado) ──────────────────────
  for (const id of ['mechanism', 'expanded_benefits'] as const) {
    for (let d = 1; d <= 2; d++) {
      const design = await directSection(s, id)
      for (const anchor of [true, false]) {
        const t = Date.now()
        const b64 = await renderDirected(s, id, design, { anchor })
        const raw = Buffer.from(b64, 'base64')
        const meta = await sharp(raw).metadata()
        const name = `B-${id}-d${d}-${anchor ? 'con' : 'sin'}-ancla.jpg`
        await sharp(raw).resize(1080, 1920, { fit: 'cover' }).jpeg({ quality: 88 }).toFile(path.join(OUT, name))
        console.log(`B ${name} (${((Date.now() - t) / 1000).toFixed(0)}s) por ${modelFromSize(meta.width, meta.height)}`)
      }
    }
  }
  console.log(`\nlisto en ${((Date.now() - t0) / 60000).toFixed(1)} min → ${OUT}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
