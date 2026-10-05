import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { saveV2Session } from '@/lib/landing-v2/db'
import { approveSection } from '@/lib/landing-v2/flow'
import { SectionIdSchema } from '@/lib/landing-v2/schemas'
import { generateSection, reviseSection } from '@/lib/landing-v2/section'
import { errorResponse, load, notFound } from '../../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// UNA imagen por request: copy (si falta) + brief + render 9:16 + reescalado, con respaldo.
export const maxDuration = 300

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('generate') }),
  z.object({ action: z.literal('revise'), feedback: z.string().trim().min(3) }),
  z.object({ action: z.literal('approve') }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = await params
  const sid = SectionIdSchema.safeParse(section)
  if (!sid.success) return NextResponse.json({ error: 'Sección inválida' }, { status: 400 })
  const body = Body.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const row = await load(id)
  if (!row) return notFound()
  try {
    const s = row.session
    const next = body.data.action === 'generate' ? await generateSection(s, sid.data, row.ctx)
      : body.data.action === 'revise' ? await reviseSection(s, sid.data, body.data.feedback, row.ctx)
        : approveSection(s, sid.data)
    await saveV2Session(next)
    return NextResponse.json({ session: next })
  } catch (e) { return errorResponse(e) }
}
