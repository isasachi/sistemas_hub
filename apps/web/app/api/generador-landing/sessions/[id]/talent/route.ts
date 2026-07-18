import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { uploadToStorage } from '@/lib/storage'
import { generateTalent } from '@/lib/landing/talent'
import { DerivedBrandSchema } from '@/lib/landing/types'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // gen de imagen (retrato) ~15-30s; cabe en 60s.

// Talento canónico (Fase 4 C4.4). Genera/regenera la placa de talento desde el casting ACTUAL
// del body (los edits en curso del paso de identidad) y persiste talent_canonical_url. Kind
// 'landing-talent' NO está en IMAGE_KINDS → sin cap per-step (regens generosos: es la decisión
// estética que más importa), solo acotado por el backstop global de 500/día. $0-rule OK (Gemini).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const kind = 'landing-talent'
  const { blocked } = await checkGenQuota(id, kind)
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { brand?: unknown } = {}
  try { body = await req.json() } catch { /* body opcional */ }
  const parsed = DerivedBrandSchema.safeParse(body.brand)
  const brand = parsed.success ? parsed.data : session.derived_brand
  if (!brand) return NextResponse.json({ error: 'Falta la identidad visual' }, { status: 400 })

  // Sin persona: limpia la placa (si había una de un casting anterior) y devuelve null.
  if (!brand.casting.present) {
    await updateLandingSession(id, { talent_canonical_url: null })
    return NextResponse.json({ talentUrl: null })
  }

  try {
    const b64 = await generateTalent(brand.casting, brand)
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
