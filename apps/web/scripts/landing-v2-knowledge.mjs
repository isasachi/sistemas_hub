// Pre-procesa los PDFs de conocimiento de landing v2 (fuente en `knowledge/landing/` de la raíz)
// a los recursos que lee el núcleo en runtime (`lib/landing-v2/knowledge/`).
//
//   node scripts/landing-v2-knowledge.mjs      (desde apps/web; requiere poppler-utils)
//
// - wireframes.pdf → copia byte a byte. El director de arte lee el PDF COMPLETO y ORIGINAL, con sus
//   líneas "Ej:" (decisión del dueño, 2026-10-09: es lo que lee su GPT). Ya no se tapan con OCR: los
//   claims sin respaldo los caza `verifyTexts` contra los datos del usuario.
// - cro-checklist.pdf → cro-checklist.md (texto plano, mismas instrucciones que el PDF: verificado
//   página por página el 2026-10-09; solo se pierden negritas y separadores). Se versiona el resultado:
//   el runtime no depende de poppler.
//
// Los recursos viven bajo `apps/web` y no en la raíz porque el Root Directory de Vercel es
// `apps/web`: lo que está afuera no viaja con la función.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), '../../knowledge/landing')
const OUT = path.resolve(process.cwd(), 'lib/landing-v2/knowledge')
fs.mkdirSync(OUT, { recursive: true })

fs.copyFileSync(path.join(SRC, 'wireframes.pdf'), path.join(OUT, 'wireframes.pdf'))

const txt = execFileSync('pdftotext', ['-layout', path.join(SRC, 'cro-checklist.pdf'), '-'], { encoding: 'utf-8' })
// Limpieza mínima: los separadores de ancho cero del PDF y las líneas en blanco repetidas.
const clean = txt.replace(/​/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
fs.writeFileSync(path.join(OUT, 'cro-checklist.md'), clean + '\n')
console.log(`ok: wireframes.pdf + cro-checklist.md → ${OUT}`)
