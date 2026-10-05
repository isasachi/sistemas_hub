import { NextRequest, NextResponse } from 'next/server'
import { analyzeProduct } from '@/lib/landing-v2/analyze'
import { saveV2Session } from '@/lib/landing-v2/db'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Análisis (~5-10 s) + placa de talento si la dirección de arte lleva persona (13-22 s + respaldo).
export const maxDuration = 300

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const row = await load((await params).id)
  if (!row) return notFound()
  try {
    const session = await analyzeProduct(row.session, row.ctx)
    await saveV2Session(session)
    return NextResponse.json({ session })
  } catch (e) { return errorResponse(e) }
}
