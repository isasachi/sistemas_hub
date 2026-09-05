// Genera las imágenes MAESTRAS de las 8 plantillas y las sube al bucket.
//
// ⚠️ SE CORRE A MANO Y CASI NUNCA: son assets del hub, iguales para todos los usuarios, y una
// vez generados viven en `ad-uploads/plantillas/<id>.png`. NO corre en ninguna request.
//
//   npx tsx --env-file=.env.local scripts/generar-plantillas.ts            # las 8
//   npx tsx --env-file=.env.local scripts/generar-plantillas.ts antes-despues ugc-testimonio
//   DRY=1 npx tsx --env-file=.env.local scripts/generar-plantillas.ts      # imprime, no gasta
//
// Cuesta una imagen por plantilla, pagada por el HUB. Regenerar una pisa sus bytes conservando
// la ruta, así que la URL de `templateImageUrl` no cambia.
//
// ⚠️ MÍRALAS ANTES DE DARLAS POR BUENAS. Una maestra torcida no falla ruidoso: se convierte en
// la Imagen 1 de todos los anuncios que salgan de esa plantilla, y el defecto aparece recién en
// el anuncio del usuario. Las que se generan quedan también en `~/plantillas-maestras/` para
// poder abrirlas.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { generateImage } from '../lib/gemini'
import { uploadToStorage } from '../lib/storage'
import { TEMPLATES } from '../lib/anuncios/templates'

const SALIDA = path.join(os.homedir(), 'plantillas-maestras')

function medir(b64: string): string {
  const buf = Buffer.from(b64, 'base64')
  // PNG: ancho y alto viven en el IHDR, bytes 16-24.
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  return `${w}x${h} (${(w / h).toFixed(3)}) · ${Math.round(buf.length / 1024)} KB`
}

async function main() {
  const pedidas = process.argv.slice(2)
  const objetivo = pedidas.length ? TEMPLATES.filter((t) => pedidas.includes(t.id)) : TEMPLATES

  if (objetivo.length === 0) {
    console.error(`Ninguna plantilla coincide. Disponibles: ${TEMPLATES.map((t) => t.id).join(', ')}`)
    process.exit(1)
  }

  if (process.env.DRY) {
    for (const t of objetivo) console.log(`\n─── ${t.id} ───\n${t.promptMaestro}\n`)
    console.log(`\n${objetivo.length} prompts. Sin DRY se generan y se suben.`)
    return
  }

  fs.mkdirSync(SALIDA, { recursive: true })
  let ok = 0

  // De a una y no en paralelo a propósito: son 8 imágenes que se generan una vez en la vida, y
  // en serie el log se lee y un fallo se ve enseguida. La prisa acá no compra nada.
  for (const t of objetivo) {
    const inicio = Date.now()
    try {
      const b64 = await generateImage([{ text: t.promptMaestro }], 2, { aspectRatio: '4:5' })
      const buf = Buffer.from(b64, 'base64')
      fs.writeFileSync(path.join(SALIDA, `${t.id}.png`), buf)
      // `sessionId` = "plantillas" para que el path quede `plantillas/<id>.png`, que es
      // exactamente lo que arma `templateImageUrl`.
      await uploadToStorage('plantillas', buf, 'image/png', t.id)
      console.log(`${t.id.padEnd(22)} ✅ ${medir(b64)} en ${Math.round((Date.now() - inicio) / 1000)}s`)
      ok++
    } catch (e) {
      console.log(`${t.id.padEnd(22)} ❌ ${(e as Error).message.slice(0, 120)}`)
    }
  }

  console.log(`\n${ok}/${objetivo.length} subidas. Copias locales en ${SALIDA}`)
  if (ok < objetivo.length) process.exitCode = 1
}

main()
