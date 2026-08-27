// Probe del recurso IMAGEN migrado a KIE. Sin mocks, contra la API. Gasta unas pocas imágenes.
//   npx tsx --env-file=.env.local scripts/probe-kie-image.ts
import fs from 'fs'
import { generateImage } from '../lib/gemini'
import type { Part } from '@google/genai'

const REF = `${process.env.SUPABASE_URL}/storage/v1/object/public/ad-uploads/8987eca9-6ddb-41c4-9f77-78ef5a5cd17a/product.jpg`

function medir(b64: string): string {
  const buf = Buffer.from(b64, 'base64')
  // PNG: ancho y alto viven en el IHDR, bytes 16-24.
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  return `${w}x${h} (${(w / h).toFixed(3)}) · ${Math.round(buf.length / 1024)} KB`
}

async function caso(nombre: string, parts: Part[], opts: Parameters<typeof generateImage>[2]) {
  const t = Date.now()
  try {
    const b64 = await generateImage(parts, 1, opts)
    console.log(`${nombre.padEnd(34)} ✅ ${medir(b64)} en ${Math.round((Date.now() - t) / 1000)}s`)
    return b64
  } catch (e) {
    console.log(`${nombre.padEnd(34)} ❌ ${(e as Error).message.slice(0, 90)}`)
    return null
  }
}

async function main() {
  await caso('texto→imagen (gpt-image-2)',
    [{ text: 'A minimal product poster of a teal serum bottle on a marble table, studio light.' }],
    { aspectRatio: '9:16' })

  await caso('con referencia REMOTA (nano-banana-2)',
    [{ fileData: { fileUri: REF, mimeType: 'image/jpeg' } }, { text: 'Place this exact product on a clean beige background, studio light.' }],
    { aspectRatio: '9:16', preferGemini: true })

  const local = fs.readFileSync('/home/isasachi/chamba/sistemas_hub/.playwright-mcp/assets/product.jpg').toString('base64')
  const b64 = await caso('con referencia INLINE (gpt-image-2)',
    [{ inlineData: { mimeType: 'image/jpeg', data: local } }, { text: 'Place this exact product on a clean white background.' }],
    { aspectRatio: '4:5' })
  if (b64) fs.writeFileSync('/home/isasachi/chamba/sistemas_hub/.playwright-mcp/assets/kie-img.png', Buffer.from(b64, 'base64'))
}
main().catch((e) => { console.error(e); process.exit(1) })
