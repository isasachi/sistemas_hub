import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { generateLandingCopy } from '@/lib/landing/copy'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { SectionType } from '@/lib/landing/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// La generación es PER-SECCIÓN en paralelo (~8 llamadas) + retries del enforcement .length() +
// posible fallback a Gemini → el peor caso se pasaba de 60s (timeout en prod). Fluid Compute
// (vercel.json) permite hasta 300s incluso en Hobby: se alinea con las rutas de imagen (300).
export const maxDuration = 300

// Etapa 3 — genera (o regenera) el copy de TODAS las secciones elegidas, per-sección en paralelo
// (sin imágenes → texto rápido; el timeout cubre el fan-out + retry). Gate de costo.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'landing-copy')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getLandingSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let body: { sections?: string[]; feedback?: string; prompt?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const sections = (body.sections ?? []).filter((s): s is SectionType => SectionType.safeParse(s).success)
  if (sections.length === 0)
    return NextResponse.json({ error: 'Elige al menos una sección' }, { status: 400 })

  const precision = (body.prompt ?? '').trim()
  const feedbackText = [body.feedback, precision].filter(Boolean).join('\n') || undefined

  try {
    const copy = await generateLandingCopy(session, sections, feedbackText)

    await updateLandingSession(id, {
      step: Math.max(session.step, 3), // F3: secciones = step 3 (identidad se insertó en step 2)
      selected_sections: sections,
      copy,
    })

    await recordGenQuota(id, 'landing-copy', userId)
    return NextResponse.json({ copy })
  } catch (err) {
    console.error('[landing-copy]', err)
    return NextResponse.json({ error: 'No se pudo generar el copy. Inténtalo de nuevo.' }, { status: 500 })
  }
}
