import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureUserId } from '@/lib/product-hunter/session'
import { createV2Session } from '@/lib/landing-v2/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Crea una sesión v2 para la vista dada (wizard o chat).
export async function POST(req: NextRequest) {
  const body = z.object({ view: z.enum(['wizard', 'chat']) }).safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Vista inválida' }, { status: 400 })
  const { uid, setCookie } = await ensureUserId()
  const session = await createV2Session(uid, body.data.view)
  const res = NextResponse.json({ session })
  if (setCookie) res.headers.append('Set-Cookie', setCookie)
  return res
}
