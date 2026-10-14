// Recursos de conocimiento de landing v2, del lado del servidor. Los genera
// `scripts/landing-v2-knowledge.mjs` desde `knowledge/landing/*.pdf` (raíz) y viven bajo `apps/web`
// porque es el Root Directory de Vercel. Se leen con `process.cwd()`, igual que `lib/prompts/`.
import fs from 'fs'
import path from 'path'

const DIR = path.join(process.cwd(), 'lib/landing-v2/knowledge')

export const CRO_CHECKLIST = fs.readFileSync(path.join(DIR, 'cro-checklist.md'), 'utf-8')

let pdf: Buffer | null = null
/**
 * El PDF de wireframes COMPLETO y ORIGINAL (14 páginas, con sus líneas "Ej:"), como lo tiene el GPT del
 * dueño (decisión suya, 2026-10-09). Copia byte a byte de `knowledge/landing/wireframes.pdf`. Lo lee el
 * director de arte; nunca va al modelo de imagen.
 */
export function wireframesPdf(): Buffer {
  return (pdf ??= fs.readFileSync(path.join(DIR, 'wireframes.pdf')))
}

