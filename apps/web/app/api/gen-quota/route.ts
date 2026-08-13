import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { regensLeftFor, isImageKind } from '@/lib/gen-quota'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Solo LEE Supabase (regla de costo): conteos por kind para una sesión → regensLeft.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({})

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await db.from('ph_gen_usage').select('kind').eq('session_id', sessionId)
  if (error) return NextResponse.json({})

  const counts: Record<string, number> = {}
  for (const r of data ?? []) counts[r.kind] = (counts[r.kind] ?? 0) + 1

  const out: Record<string, number> = {}
  for (const [kind, c] of Object.entries(counts)) if (isImageKind(kind)) out[kind] = regensLeftFor(c, kind)
  return NextResponse.json(out)
}
