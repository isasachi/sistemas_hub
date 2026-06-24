import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { generateImage } from '@/lib/gemini'
import { buildSectionInstruction } from '@/lib/landing/instructions'
import { TEMPLATE_BY_ID } from '@/lib/landing/templates'
import { SectionCopySchema, SectionType, type LandingSection } from '@/lib/landing/types'
import { genQuotaResponse } from '@/lib/gen-quota'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// UNA imagen por request (~15s) → cabe en el cap de Vercel Hobby (60s). El cliente
// llama esta ruta una vez por sección, secuencialmente, en vez de un SSE que genera
// las 8 en un solo request (que excedería el cap). Sirve para generar Y regenerar.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await params

  const parsedType = SectionType.safeParse(type)
  if (!parsedType.success) return NextResponse.json({ error: 'Tipo de sección inválido' }, { status: 400 })

  const blocked = await genQuotaResponse('landing-section')
  if (blocked) return blocked

  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // El copy puede venir en el body (edición) o tomarse del copy aprobado de la sesión.
  let body: { copy?: unknown; order?: number } = {}
  try { body = await req.json() } catch { /* body opcional */ }

  let copy = SectionCopySchema.safeParse(body.copy).success ? SectionCopySchema.parse(body.copy) : null
  if (!copy) {
    const approved = (session.copy ?? []).find((c) => c.type === parsedType.data)
    if (approved) copy = SectionCopySchema.parse(approved)
  }
  if (!copy || copy.type !== parsedType.data)
    return NextResponse.json({ error: 'Falta el copy de la sección' }, { status: 400 })

  // Fotos del producto como input (fidelidad).
  const photoParts: Part[] = []
  for (const url of session.product_photo_urls ?? []) {
    const { data, mimeType } = await fetchAsBase64(url)
    photoParts.push({ inlineData: { mimeType, data } })
  }

  const templateStyle = session.template ? TEMPLATE_BY_ID[session.template]?.style : undefined
  const parts: Part[] = [...photoParts, { text: buildSectionInstruction(copy, photoParts.length > 0, templateStyle) }]
  const b64 = await generateImage(parts, 3, { aspectRatio: '9:16' })
  if (!b64) return NextResponse.json({ error: 'No se pudo generar la sección', retryable: true }, { status: 502 })

  const imageUrl = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `section-${copy.type}`)

  // Upsert en el array sections (read-modify-write). El `order` viene del cliente
  // (índice en selected_sections); al regenerar se preserva el existente.
  const sections: LandingSection[] = [...(session.sections ?? [])]
  const idx = sections.findIndex((s) => s.type === parsedType.data)
  const order = idx >= 0 ? sections[idx].order : (typeof body.order === 'number' ? body.order : sections.length)
  const section: LandingSection = { type: copy.type, order, copy, imageUrl, status: 'done' }
  if (idx >= 0) sections[idx] = section
  else sections.push(section)

  await updateLandingSession(id, { step: Math.max(session.step, 3), sections })

  return NextResponse.json({ section })
}
