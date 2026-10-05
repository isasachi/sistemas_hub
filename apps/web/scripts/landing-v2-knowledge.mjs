// Pre-procesa los PDFs de conocimiento de landing v2 (fuente en `knowledge/landing/` de la raíz)
// a los recursos que lee el núcleo en runtime (`lib/landing-v2/knowledge/`).
//
//   node scripts/landing-v2-knowledge.mjs        (desde apps/web; requiere poppler-utils)
//
// - wireframes.pdf → wf-01..14.jpg. Cada página del PDF ES una imagen embebida de 1024x1536, así
//   que se extrae tal cual con `pdfimages` (sin re-renderizar) y se baja a JPEG 768x1152: viaja
//   inline en base64 en cada llamada de copy/brief, y el texto del wireframe se sigue leyendo.
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
const pages = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort()
if (pages.length !== 14) throw new Error(`wireframes.pdf: esperaba 14 páginas, hay ${pages.length}`)
for (const [i, f] of pages.entries()) {
  const out = path.join(OUT, `wf-${String(i + 1).padStart(2, '0')}.jpg`)
  await sharp(path.join(tmp, f)).resize(768, 1152, { fit: 'inside' }).jpeg({ quality: 82 }).toFile(out)
}
fs.rmSync(tmp, { recursive: true })

const txt = execFileSync('pdftotext', ['-layout', path.join(SRC, 'cro-checklist.pdf'), '-'], { encoding: 'utf-8' })
// Limpieza mínima: los separadores de ancho cero del PDF y las líneas en blanco repetidas.
const clean = txt.replace(/​/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
fs.writeFileSync(path.join(OUT, 'cro-checklist.md'), clean + '\n')
console.log(`ok: ${pages.length} wireframes + cro-checklist.md → ${OUT}`)
