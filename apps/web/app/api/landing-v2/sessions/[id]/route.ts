import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { saveV2Session } from '@/lib/landing-v2/db'
import { InputsDraftSchema, SectionCopyOutSchema, SectionIdSchema } from '@/lib/landing-v2/schemas'
import { changesAnalysis } from '@/lib/landing-v2/flow'
import { errorResponse, load, notFound } from '../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const row = await load((await params).id)
  if (!row) return notFound()
  return NextResponse.json({ session: row.session, messages: row.messages })
}

// Edición del wizard: inputs, selección de secciones y copy editado a mano. Sin LLM.
const Patch = z.object({
  inputs: InputsDraftSchema.optional(),
  selected: z.array(SectionIdSchema).optional(),
  copies: z.partialRecord(SectionIdSchema, SectionCopyOutSchema).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const row = await load((await params).id)
  if (!row) return notFound()
  const body = Patch.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  try {
    const s = row.session
    const { inputs, selected, copies } = body.data
    // Cambiar lo que el análisis mira invalida el sistema visual.
    const reanalizar = !!inputs && changesAnalysis(s.inputs, { ...s.inputs, ...inputs })
    const next = {
      ...s,
      ...(inputs && { inputs: { ...s.inputs, ...inputs } }),
      ...(selected && { selected }),
      ...(copies && { copies: { ...s.copies, ...copies } }),
      ...(reanalizar && { visualSystem: null }),
    }
    await saveV2Session(next)
    return NextResponse.json({ session: next })
  } catch (e) { return errorResponse(e) }
}
