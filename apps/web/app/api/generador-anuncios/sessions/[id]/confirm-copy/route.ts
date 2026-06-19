import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, updateSession } from '@/lib/db'
import { CopyVersionsSchema, ConfirmedCopySchema } from '@/lib/types'

const BodySchema = z.object({ version: z.enum(['A', 'B']) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.step < 3 || !session.copy_versions)
    return NextResponse.json({ error: 'Complete steps 1–3 first' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'version must be "A" or "B"' }, { status: 400 })

  const { version } = parsed.data
  const copyVersions = CopyVersionsSchema.parse(session.copy_versions)
  const breakdown = version === 'A' ? copyVersions.versionA : copyVersions.versionB
  const confirmedCopy = ConfirmedCopySchema.parse({ version, breakdown })

  await updateSession(id, { step: 4, confirmed_copy: confirmedCopy })
  return NextResponse.json({ ok: true })
}
