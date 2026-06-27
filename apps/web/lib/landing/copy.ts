import fs from 'fs'
import path from 'path'
import { callStructured } from '@/lib/gemini'
import { LandingCopySchema, SECTION_LABELS, type SectionCopy, type SectionType, type LandingSessionResponse } from './types'
import type { Part } from '@google/genai'

// Generación de copy compartida entre la ruta /copy (regenera con feedback) y el
// handoff from-branding (genera el copy inicial). Una llamada estructurada barata.

const LANDING_SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/landing-system.md'),
  'utf-8'
)

export async function generateLandingCopy(
  session: LandingSessionResponse,
  sections: SectionType[],
  feedback?: string
): Promise<SectionCopy[]> {
  const parts: Part[] = [
    {
      text: [
        `Escribe el copy de una landing page para este producto. Devuelve JSON (esquema LandingCopy).`,
        ``,
        `Producto: ${session.product_name ?? 'no especificado'}`,
        `Precio / oferta: ${session.price || 'no especificado'}`,
        `Beneficios clave: ${session.benefits || 'no especificados'}`,
        `Público objetivo: ${session.audience || 'no especificado'}`,
        `Tono deseado: ${(session.tone ?? []).join(', ') || 'no especificado'}`,
        feedback?.trim() ? `\nAjustes pedidos por el usuario: ${feedback.trim()}` : '',
        ``,
        `Secciones a escribir (en este orden), usa exactamente estos "type":`,
        ...sections.map((s, i) => `  ${i + 1}. ${s} — ${SECTION_LABELS[s]}`),
        ``,
        `Una entrada por sección, con su "type" correcto y el copy corto que aplique a ese tipo.`,
      ].join('\n'),
    },
  ]

  const result = await callStructured('landing_copy', LandingCopySchema, parts, 3, LANDING_SYSTEM_PROMPT)
  return result.sections
}
