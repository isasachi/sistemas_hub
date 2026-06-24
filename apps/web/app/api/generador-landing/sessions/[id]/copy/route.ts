import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { callStructured } from '@/lib/gemini'
import { genQuotaResponse } from '@/lib/gen-quota'
import { LandingCopySchema, SectionType, SECTION_LABELS } from '@/lib/landing/types'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const LANDING_SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/landing-system.md'),
  'utf-8'
)

// Etapa 3 — genera (o regenera) el copy de TODAS las secciones elegidas en una
// llamada estructurada barata (sin imágenes → cabe en el timeout de Vercel). Gate.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const blocked = await genQuotaResponse('landing-copy')
  if (blocked) return blocked

  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { sections?: string[]; feedback?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const sections = (body.sections ?? []).filter((s): s is SectionType => SectionType.safeParse(s).success)
  if (sections.length === 0)
    return NextResponse.json({ error: 'Elige al menos una sección' }, { status: 400 })

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
        body.feedback?.trim() ? `\nAjustes pedidos por el usuario: ${body.feedback.trim()}` : '',
        ``,
        `Secciones a escribir (en este orden), usa exactamente estos "type":`,
        ...sections.map((s, i) => `  ${i + 1}. ${s} — ${SECTION_LABELS[s]}`),
        ``,
        `Una entrada por sección, con su "type" correcto y el copy corto que aplique a ese tipo.`,
      ].join('\n'),
    },
  ]

  const result = await callStructured(
    'landing_copy',
    LandingCopySchema,
    parts,
    3,
    LANDING_SYSTEM_PROMPT
  )

  await updateLandingSession(id, {
    step: Math.max(session.step, 2),
    selected_sections: sections,
    copy: result.sections,
  })

  return NextResponse.json({ copy: result.sections })
}
