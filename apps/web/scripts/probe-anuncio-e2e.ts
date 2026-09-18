/**
 * ¿El anuncio final COPIA la tipografía de la referencia, o la inventa?
 *
 *   npx tsx scripts/probe-anuncio-e2e.ts          # análisis + instructivo, 0 imágenes
 *   npx tsx scripts/probe-anuncio-e2e.ts --render # + 1 imagen (CUESTA)
 *
 * Reproduce la cadena real de `generate-image` sobre la sesión `e50be4f7` (referencia con titular
 * blanco sans bold en Title Case y subtítulo script/cursiva gris translúcido):
 *   analyze-reference → callReasoning(STEP5) → editImage
 *
 * POR QUÉ EXISTE: en esa sesión el `typography` guardado decía "Caso: mayúsculas" y el anuncio
 * salió en ALL CAPS. Pero `probe-analisis-tipografia.ts` midió 6/6 draws leyendo el caso BIEN
 * (3 con gemini-3.6-flash, 3 con el 2.5-flash viejo), así que ese análisis no se reproduce y la
 * pregunta se corre un paso: con un análisis CORRECTO, ¿el render respeta la tipografía?
 *
 * ⚠️ El instructivo es texto puro (`callReasoning` no ve ninguna imagen), así que la tipografía
 * viaja como PALABRAS. El render sí recibe la referencia como Image 1 — esto mide si eso alcanza.
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const BASE = 'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/e50be4f7-ff38-4f02-a101-cb6d0c825638'
const salida = path.join(process.cwd(), 'scripts/.probe-out')

// Lo que la sesión real tenía guardado en los pasos previos (no se re-generan: no es lo medido).
const PRODUCT_SCAN = {
  productDescription: 'Frasco cuentagotas de vidrio translúcido de color violeta morado que contiene sérum con pequeñas burbujas visibles, coronado por una tapa y tetina de cuentagotas blanca. En la parte central frontal tiene una etiqueta rectangular blanca con texto impreso en negro, morado y azul celeste.',
  brandingDescription: "Texto impreso en la etiqueta frontal: 'LA ROCHE-POSAY LABORATOIRE DERMATOLOGIQUE' en negro; 'PURE NIACINAMIDE 10 SERUM' en negro y morado; 'CONCENTRADO ANTIMANCHAS REPARA. ILUMINA NIACINAMIDA PURA. PHE-RESORCINOL' en negro; 'CON AGUA TERMAL DE LA ROCHE-POSAY' en azul celeste.",
  brandColors: ['#60216B me10'],
}
const COPY = {
  version: 'B',
  breakdown: [
    { element: 'headline', text: '¿Quieres eliminar las manchas de acné? ¡Aquí está la mejor solución!' },
    { element: 'subhead', text: '¡Dile adiós a las marcas rojas! La mejor solución para una piel uniforme' },
  ],
}

async function bajar(nombre: string) {
  const res = await fetch(`${BASE}/${nombre}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`${nombre}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return { data: buf.toString('base64'), mimeType: nombre.endsWith('.png') ? 'image/png' : 'image/jpeg', buf }
}

async function main() {
  const render = process.argv.includes('--render')
  fs.mkdirSync(salida, { recursive: true })

  const { callStructured, callReasoning, editImage, STEP5_PROMPT } = await import('../lib/gemini')
  const { ReferenceAnalysisSchema } = await import('../lib/types')
  const { aspectRatioOf } = await import('../lib/aspect')

  const [ref, product] = await Promise.all([bajar('reference.jpg'), bajar('product.jpg')])
  const aspectRatio = await aspectRatioOf(ref.buf)

  // 1. El análisis, con el MISMO bloque de prompt que manda la ruta.
  const prompt = [
    'Analyze this reference ad. Return the complete structured analysis including all sceneElements.',
    'typography: describe the type so it can be REPRODUCED, block by block: typeface character',
    '(geometric sans, grotesque, high-contrast serif, condensed, script…), weight, case,',
    'letter-spacing, alignment, the size hierarchy between blocks, and any effect on the letters',
    '(outline, drop shadow, highlight box, angled or curved baseline, italics, underline).',
    'A one-word label like "modern" or "clean" is useless here — name what is actually on screen.',
    'creativeConcept: name the creative concept the ad IS and describe how it is built.',
    'One or two sentences. Never a bare one-word label.',
    "bodyFocus + attentionMarkers: if the ad directs the viewer's attention to a specific body",
    'zone, set bodyFocus to that zone and list every such marker. If the ad points at no body',
    'zone, bodyFocus is null and attentionMarkers is null. Never guess a zone.',
  ].join('\n')

  const a = await callStructured('reference_analysis', ReferenceAnalysisSchema, [
    { inlineData: { mimeType: ref.mimeType, data: ref.data } },
    { text: prompt },
  ], 3)
  console.log(`\n=== 1. ANÁLISIS · typography ===\n${a.typography}\n`)

  // 2. El instructivo, con el mismo contexto que arma `generate-image`.
  const ctx = [
    `=== REFERENCE ANALYSIS ===`,
    `Format: ${aspectRatio ?? a.format.ratio} — ${a.format.platform}`,
    `Physical position: ${a.physicalPosition}`,
    `Layout: ${a.layoutDescription}`,
    `Composition: ${a.composition.join(' | ')}`,
    `Style: ${a.style}`,
    `Colorimetry: ${a.colorimetry}`,
    `Typography: ${a.typography}`,
    `Creative concept: ${a.creativeConcept ?? 'not identified'}`,
    `Persuasive logic: ${a.persuasiveLogic}`,
    `Scene elements:`,
    `  People: ${JSON.stringify(a.sceneElements.people)}`,
    `  Props: ${JSON.stringify(a.sceneElements.props)}`,
    `  Brand elements: ${JSON.stringify(a.sceneElements.brandElements)}`,
    `  Setting: ${a.sceneElements.setting}`,
    `Body zone the reference points at: ${a.bodyFocus ?? 'none — the ad points at no body zone'}`,
    `Attention markers: ${a.attentionMarkers?.length ? a.attentionMarkers.join(' | ') : 'none'}`,
    ``,
    `=== PRODUCT INFO ===`,
    `Product name: Pure Niacinamide 10`,
    `What it is: Suero de niacinamida para manchas de acné`,
    `What it does: Elimina las manchas de acné en 3 semanas`,
    `Target audience: Mujeres de 20-30`,
    `Product description: ${PRODUCT_SCAN.productDescription}`,
    `Branding: ${PRODUCT_SCAN.brandingDescription}`,
    `Brand colors: ${PRODUCT_SCAN.brandColors.join(', ')}`,
    `Logo provided: NO`,
    ``,
    `=== APPROVED COPY ===`,
    `Version ${COPY.version}:`,
    ...COPY.breakdown.map((e) => `  ${e.element}: "${e.text}"`),
  ].join('\n')

  const instr = await callReasoning(STEP5_PROMPT, ctx)
  const seis = instr.match(/^\**6\.[\s\S]*?(?=^\**7\.)/m)?.[0] ?? '(no se encontró la §6)'
  console.log(`=== 2. INSTRUCTIVO · §6 ===\n${seis}\n`)
  fs.writeFileSync(path.join(salida, 'e2e-instruccion.txt'), instr)

  if (!render) {
    console.log('(sin --render: no se generó imagen)')
    return
  }

  // 3. El render. `ratio` sale de los bytes, igual que la ruta.
  const t = Date.now()
  const b64 = await editImage(ref.data, ref.mimeType, product.data, product.mimeType, null, null, instr, aspectRatio)
  if (!b64) { console.log('=== 3. RENDER: vacío'); return }
  const destino = path.join(salida, `e2e-anuncio-${Date.now()}.png`)
  fs.writeFileSync(destino, Buffer.from(b64, 'base64'))
  const { default: sharp } = await import('sharp')
  const meta = await sharp(Buffer.from(b64, 'base64')).metadata()
  // La huella de QUÉ modelo respondió es el tamaño: 864x1536 = OpenAI, ≥1152 = Google.
  console.log(`=== 3. RENDER · ${meta.width}x${meta.height} en ${((Date.now() - t) / 1000).toFixed(1)}s → ${destino}`)
}

main()
