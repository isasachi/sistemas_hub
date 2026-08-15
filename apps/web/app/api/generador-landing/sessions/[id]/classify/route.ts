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
//
// Idempotente (mismo patrón que brand POST): si la sesión ya tiene niche_id Y demographic_id
// (re-entrada — el usuario volvió al paso de Identidad, o un remount duplicó la llamada),
// devuelve los valores cacheados SIN llamar a classifyNiche ni checkGenQuota/recordGenQuota —
// cero gasto de LLM/quota por un no-op. Solo clasifica de cero cuando falta alguno de los dos.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // `body_focus` entra en la condición: una sesión clasificada ANTES de que el campo existiera lo
  // tiene en null, y salir por acá la dejaría sin zona para siempre — con el hero y las tres
  // secciones de zona apuntando todas al rostro, que es justo el bug. Re-clasificar cuesta una
  // llamada de flash y solo pasa una vez por sesión legada.
  if (session.niche_id && session.demographic_id && session.body_focus) {
    return NextResponse.json({
      niche_id: session.niche_id,
      demographic_id: session.demographic_id,
      body_focus: session.body_focus,
      confidence: 1,
      reasoning: 'ya clasificado',
    })
  }

  const { blocked } = await checkGenQuota(id, 'landing-classify')
  if (blocked) return blocked
  const userId = await readUserId()
  const result = await classifyNiche(session)
  await updateLandingSession(id, { niche_id: result.niche_id, demographic_id: result.demographic_id, body_focus: result.body_focus })
  await recordGenQuota(id, 'landing-classify', userId)
  return NextResponse.json(result)
}
