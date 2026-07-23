import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { classifyNiche } from '@/lib/landing/classify'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30 // classifyNiche = 1 llamada gemini-flash con visión (foto); cabe en 30s.

// Paso 0.a (spec 2026-07-23): clasifica niche_id/demographic_id como SUGERENCIA — el usuario los
// edita/confirma en el paso de Identidad. $0-rule OK: Gemini flash (no Anthropic), no path de imagen.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { blocked } = await checkGenQuota(id, 'landing-classify')
  if (blocked) return blocked
  const userId = await readUserId()
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const result = await classifyNiche(session)
  await updateLandingSession(id, { niche_id: result.niche_id, demographic_id: result.demographic_id })
  await recordGenQuota(id, 'landing-classify', userId)
  return NextResponse.json(result)
}
