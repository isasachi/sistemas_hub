import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { confirmCopy } from '@/lib/anuncios/core'
import { errorResponse, load, notFound } from '../../../_lib'

const BodySchema = z.object({ version: z.enum(['A', 'B']) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'La versión debe ser A o B' }, { status: 400 })
  try {
    await confirmCopy(row.session, parsed.data.version)
    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}
