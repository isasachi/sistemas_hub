// Recursos de conocimiento de landing v2, del lado del servidor. Los genera
// `scripts/landing-v2-knowledge.mjs` desde `knowledge/landing/*.pdf` (raíz) y viven bajo `apps/web`
// porque es el Root Directory de Vercel. Se leen con `process.cwd()`, igual que `lib/prompts/`.
import fs from 'fs'
import path from 'path'
import { SECTION_BY_ID, type SectionId } from './catalog'

const DIR = path.join(process.cwd(), 'lib/landing-v2/knowledge')

export const CRO_CHECKLIST = fs.readFileSync(path.join(DIR, 'cro-checklist.md'), 'utf-8')

const wfCache = new Map<SectionId, Buffer>()
/** La página del wireframe de UNA sección (JPEG). Solo para el modelo de RAZONAMIENTO, nunca al de imagen. */
export function wireframeFor(id: SectionId): Buffer {
  let b = wfCache.get(id)
  if (!b) {
    b = fs.readFileSync(path.join(DIR, `wf-${String(SECTION_BY_ID[id].wf).padStart(2, '0')}.jpg`))
    wfCache.set(id, b)
  }
  return b
}
