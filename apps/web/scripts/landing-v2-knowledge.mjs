// Pre-procesa los PDFs de conocimiento de landing v2 (fuente en `knowledge/landing/` de la raíz)
// a los recursos que lee el núcleo en runtime (`lib/landing-v2/knowledge/`).
//
//   node scripts/landing-v2-knowledge.mjs      (desde apps/web; requiere poppler-utils y tesseract-ocr + tesseract-ocr-spa)
//
// - wireframes.pdf → wf-01..14.jpg. Cada página del PDF ES una imagen embebida de 1024x1536, así
//   que se extrae tal cual con `pdfimages` (sin re-renderizar) y se baja a JPEG 768x1152: viaja
//   inline en base64 en cada llamada de copy/brief, y el texto del wireframe se sigue leyendo.
// - Las líneas "Ej: …" se TAPAN (decisión del dueño del repo, 2026-10-05): son ejemplos con forma de
//   valor ("+10,000 clientes satisfechos", "Garantía X días") y la ley del repo es que el modelo los
//   devuelve como contenido. Se ubican con OCR (tesseract, determinista y local): desde la palabra
//   "Ej:" hasta el final de su párrafo, para cubrir los ejemplos que siguen en la línea de abajo.
// - cro-checklist.pdf → cro-checklist.md (texto plano). Se versiona el resultado: el runtime no
//   depende de poppler.
//
// Los recursos viven bajo `apps/web` y no en la raíz porque el Root Directory de Vercel es
// `apps/web`: lo que está afuera no viaja con la función.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const SRC = path.resolve(process.cwd(), '../../knowledge/landing')
const OUT = path.resolve(process.cwd(), 'lib/landing-v2/knowledge')
fs.mkdirSync(OUT, { recursive: true })

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lv2-'))
execFileSync('pdfimages', ['-png', path.join(SRC, 'wireframes.pdf'), path.join(tmp, 'p')])
const pages = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(tmp, f))
if (pages.length !== 14) throw new Error(`wireframes.pdf: esperaba 14 páginas, hay ${pages.length}`)

let tapadas = 0
for (const [i, file] of pages.entries()) {
  const { width: W, height: H } = await sharp(file).metadata()
  const overlays = []
  for (const b of ejBoxes(file)) {
    tapadas++
    // Un poco de aire alrededor del texto; el relleno es el color dominante de la propia caja
    // (el fondo de la tarjeta), así el wireframe no gana un bloque nuevo que el modelo interprete.
    const left = Math.max(0, b.left - 6)
    const top = Math.max(0, b.top - 5)
    const width = Math.min(W - left, b.right - b.left + 12)
    const height = Math.min(H - top, b.bottom - b.top + 16) // el OCR corta los descendentes
    // El relleno es el color de la tarjeta: la media de una franja justo encima del texto.
    const strip = await sharp(file).extract({ left, top: Math.max(0, top - 4), width, height: 3 }).stats()
    const [r, g, bl] = strip.channels.map((c) => Math.round(c.mean))
    overlays.push({ input: { create: { width, height, channels: 3, background: { r, g, b: bl } } }, left, top })
  }
  const out = path.join(OUT, `wf-${String(i + 1).padStart(2, '0')}.jpg`)
  await sharp(await sharp(file).composite(overlays).toBuffer())
    .resize(768, 1152, { fit: 'inside' }).jpeg({ quality: 82 }).toFile(out)
}
fs.rmSync(tmp, { recursive: true })

const txt = execFileSync('pdftotext', ['-layout', path.join(SRC, 'cro-checklist.pdf'), '-'], { encoding: 'utf-8' })
// Limpieza mínima: los separadores de ancho cero del PDF y las líneas en blanco repetidas.
const clean = txt.replace(/​/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
fs.writeFileSync(path.join(OUT, 'cro-checklist.md'), clean + '\n')
// El director de arte lee el PDF de wireframes COMPLETO y ORIGINAL (decisión del dueño, 2026-10-09):
// copia byte a byte, sin tapar los "Ej:". Los wf-XX.jpg tapados quedan solo para el camino viejo.
fs.copyFileSync(path.join(SRC, 'wireframes.pdf'), path.join(OUT, 'wireframes.pdf'))
console.log(`ok: ${pages.length} wireframes (${tapadas} ejemplos "Ej:" tapados) + cro-checklist.md → ${OUT}`)

/**
 * Cajas en píxeles de cada ejemplo "Ej:" de la página (OCR). Desde esa palabra, el texto CONTIGUO de
 * su línea, más las líneas de abajo que caen en la misma columna. Tomar el párrafo entero de
 * tesseract no sirve: en las filas de tarjetas (packs, envío/pago/garantía) junta las tres columnas
 * en un solo párrafo y se comía la estructura de la sección.
 */
function ejBoxes(file) {
  const tsv = execFileSync('tesseract', [file, '-', '-l', 'spa', 'tsv'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
  const words = tsv.trim().split('\n').slice(1).map((l) => l.split('\t'))
    .filter((c) => c[0] === '5' && c[11]?.trim())
    .map((c) => ({ par: `${c[2]}.${c[3]}`, key: `${c[2]}.${c[3]}.${c[4]}`, word: Number(c[5]), left: +c[6], top: +c[7], right: +c[6] + +c[8], bottom: +c[7] + +c[9], text: c[11] }))
  const GAP = 28 // px entre palabras de la misma frase; más que eso es otra columna
  const run = (line, from) => {
    const out = [from]
    for (const w of line.filter((x) => x.left > from.left).sort((a, b) => a.left - b.left)) {
      if (w.left - out.at(-1).right > GAP) break
      out.push(w)
    }
    return out
  }
  const box = (ws) => ({ left: Math.min(...ws.map((w) => w.left)), top: Math.min(...ws.map((w) => w.top)), right: Math.max(...ws.map((w) => w.right)), bottom: Math.max(...ws.map((w) => w.bottom)) })
  const lines = Object.values(Object.groupBy(words, (w) => w.key))
  const out = []
  for (const ej of words.filter((w) => /^Ej[:.;]?$/i.test(w.text))) {
    const b = box(run(lines.find((l) => l.includes(ej)), ej))
    // Continuación: la línea siguiente del MISMO párrafo de OCR, pegada abajo y en la misma columna.
    // Las tres condiciones: sin el párrafo se comía las viñetas de abajo (estructura del wireframe);
    // sin la columna, las tarjetas vecinas. Una línea entre comillas sigue siendo el ejemplo aunque el
    // OCR la parta en otro párrafo (el segundo CTA de ejemplo del Hero: "Comprar ahora").
    for (;;) {
      const h = b.bottom - b.top
      const next = words
        .filter((w) => (w.par === ej.par || /^["“«]/.test(w.text)) && w.top > b.bottom - 2 && w.top - b.bottom < h * 0.6 && w.left >= b.left - 30 && w.left <= b.right)
        .sort((a, c) => a.left - c.left)[0]
      if (!next || /^Ej[:.;]?$/i.test(next.text)) break
      const r = box(run(lines.find((l) => l.includes(next)), next))
      if (r.right > b.right + 80 || r.bottom <= b.bottom) break // otro bloque, o no avanza
      Object.assign(b, { left: Math.min(b.left, r.left), right: Math.max(b.right, r.right), bottom: r.bottom })
    }
    out.push(b)
  }
  return out
}
