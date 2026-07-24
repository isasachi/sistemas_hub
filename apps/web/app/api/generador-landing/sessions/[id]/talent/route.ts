import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { uploadToStorage } from '@/lib/storage'
import { generateTalent } from '@/lib/landing/talent'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // gen de imagen (retrato) ~15-30s; cabe en 60s.

// Talento canónico (Fase 4 C4.4 → paso 0.b, spec 2026-07-23). Genera/regenera la placa de
// talento desde `landing_dna.model_persona` (ya resuelto por extract-dna.ts) y persiste
// talent_canonical_url. Kind 'landing-talent' NO está en IMAGE_KINDS → sin cap per-step (regens
// generosos: es la decisión estética que más importa), solo acotado por el backstop global de
// 500/día. $0-rule OK (Gemini).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const kind = 'landing-talent'
  const { blocked } = await checkGenQuota(id, kind)
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.landing_dna) {
    return NextResponse.json({ error: 'Genera la identidad primero', needsIdentity: true }, { status: 400 })
  }

  // no_talent: el carril lo llena el sustituto por nicho (model_persona), no un retrato humano.
  // Limpia la placa (si había una de una demografía anterior) y devuelve null.
  if (session.demographic_id === 'no_talent') {
    await updateLandingSession(id, { talent_canonical_url: null })
    return NextResponse.json({ talentUrl: null })
  }

  try {
    const b64 = await generateTalent(
      session.landing_dna.model_persona,
      session.demographic_id ?? 'no_talent',
      session.landing_dna.palette,
    )
    if (!b64) return NextResponse.json({ error: 'No se pudo generar el talento', retryable: true }, { status: 502 })
    const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'talent-canonical')
    await updateLandingSession(id, { talent_canonical_url: url })
    await recordGenQuota(id, kind, userId)
    return NextResponse.json({ talentUrl: url })
  } catch (err) {
    console.error('[landing-talent]', err)
    return NextResponse.json({ error: 'No se pudo generar el talento', retryable: true }, { status: 502 })
  }
}
