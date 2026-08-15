import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { generateTalent, generateZonePlate } from '@/lib/landing/talent'
import { zoneNeedsOwnPlate } from '@/lib/landing/demographics'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // gen de imagen (retrato); con OpenAI primario (~60-90s) necesita el techo de Fluid (300s).

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
    await updateLandingSession(id, { talent_canonical_url: null, talent_zone_url: null })
    return NextResponse.json({ talentUrl: null, zoneUrl: null })
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

    // Placa de ZONA: solo cuando el producto NO actúa sobre el rostro. Se genera con la canónica
    // recién hecha como referencia (misma persona, otro encuadre) y se persiste aparte.
    //
    // Fail-soft a propósito: si esta segunda gen falla, la sesión se queda con la canónica y las
    // secciones de zona la usan como siempre — peor encuadre, pero landing completa. Tumbar acá
    // perdería también el retrato que YA se generó y se cobró arriba.
    let zoneUrl: string | null = null
    if (zoneNeedsOwnPlate(session.body_focus)) {
      try {
        const zoneB64 = await generateZonePlate(session.landing_dna.model_persona, session.body_focus!, { data: b64, mimeType: 'image/png' })
        if (zoneB64) {
          zoneUrl = await uploadToStorage(id, Buffer.from(zoneB64, 'base64'), 'image/png', 'talent-zone')
          await updateLandingSession(id, { talent_zone_url: zoneUrl })
          await recordGenQuota(id, kind, userId)
        }
      } catch (err) {
        console.warn('[landing-talent] placa de zona no generada, se sigue con la canónica', err)
      }
    } else {
      // La zona es rostro/cabello (o cambió a una que no la necesita): limpia una placa previa.
      await updateLandingSession(id, { talent_zone_url: null })
    }
    return NextResponse.json({ talentUrl: url, zoneUrl })
  } catch (err) {
    console.error('[landing-talent]', err)
    return NextResponse.json({ error: 'No se pudo generar el talento', retryable: true }, { status: 502 })
  }
}
