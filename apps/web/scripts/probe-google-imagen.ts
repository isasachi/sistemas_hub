/**
 * Dos preguntas que el review del PR #115 dejó abiertas y que solo contesta la API.
 *
 *   npx tsx scripts/probe-google-imagen.ts     # CUESTA: hasta 5 imágenes
 *
 * 1. ¿El SDK NATIVO de Google acepta `4:5` + `2K`? El clamp `imageResolution` vivía en
 *    `kie-image.ts` (borrado en este PR) y decía "`auto` y los ratios 5:4/4:5 solo existen en 1K".
 *    Si eso también vale acá, el respaldo del MOCKUP de branding (`aspectFor('mockup')` = 4:5) y
 *    el de un anuncio con referencia 4:5 tiran en vez de generar — o sea el respaldo que este PR
 *    vino a agregar no produce imagen nunca.
 *
 * 2. ¿La clave puede FACTURAR `gemini-3.1-flash-image`? El 2026-08-27 el SDK de Google devolvía
 *    `429 prepayment credits are depleted`. La clave se recargó, y `gemini-3-pro-image` ya generó
 *    de verdad — pero nano-banana-2 nunca se probó, y es el ÚNICO camino de la placa de zona.
 */
import fs from 'fs'
import path from 'path'
import { GoogleGenAI, Modality } from '@google/genai'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const NANO_2 = 'gemini-3.1-flash-image'
const NANO_PRO = 'gemini-3-pro-image'
const salida = path.join(process.cwd(), 'scripts/.probe-out')
fs.mkdirSync(salida, { recursive: true })

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })

async function generar(modelo: string, aspectRatio: string, imageSize: string) {
  const etiqueta = `${modelo} · ${aspectRatio} · ${imageSize}`
  const t = Date.now()
  try {
    const res = await ai.models.generateContent({
      model: modelo,
      contents: [{ role: 'user', parts: [{ text: 'A clear glass serum bottle on a marble surface, soft studio light. No text.' }] }],
      config: { responseModalities: [Modality.IMAGE], imageConfig: { aspectRatio, imageSize } },
    })
    const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data
    if (!data) throw new Error('sin inlineData')
    const buf = Buffer.from(data, 'base64')
    const nombre = `${modelo}-${aspectRatio.replace(':', 'x')}-${imageSize}.png`
    fs.writeFileSync(path.join(salida, nombre), buf)
    const { default: sharp } = await import('sharp')
    const meta = await sharp(buf).metadata()
    const ratio = ((meta.width ?? 0) / (meta.height ?? 1)).toFixed(3)
    console.log(`  ✅ ${etiqueta} → ${meta.width}x${meta.height} (${ratio}) · ${((Date.now() - t) / 1000).toFixed(1)}s`)
    return true
  } catch (e) {
    const err = e as { status?: number; message?: string }
    console.log(`  ❌ ${etiqueta} → ${err?.status ?? ''} ${err?.message ?? String(e)}`.slice(0, 300))
    return false
  }
}

async function main() {
  console.log('\n=== 1. ¿4:5 existe fuera de 1K por el SDK nativo? ===')
  await generar(NANO_PRO, '4:5', '2K')
  await generar(NANO_PRO, '4:5', '1K')

  console.log('\n=== 2. ¿La clave factura nano-banana-2? (único camino de la placa de zona) ===')
  await generar(NANO_2, '3:4', '2K')
  await generar(NANO_2, '4:5', '2K')

  console.log(`\n  salida en scripts/.probe-out/`)
}

main()
