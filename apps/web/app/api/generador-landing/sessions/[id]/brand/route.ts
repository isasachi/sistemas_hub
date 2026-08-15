import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { extractDna } from '@/lib/landing/extract-dna'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { LandingDnaSchema, NicheId, DemographicId, BodyFocus, SectionType, type LandingSessionResponse } from '@/lib/landing/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30 // extractDna = 1 llamada gemini-flash con visión; cabe en 30s.

// ADN visual del producto (paso 0.b, spec 2026-07-23: color→paleta, partículas, props,
// tipografía, halo, persona y poses). $0-rule OK: Gemini flash (no Anthropic) y NO corre en el
// path de imagen — se resuelve una vez, antes de generar nada, en el paso de identidad.

// POST: extrae el ADN si aún no existe (idempotente) y lo devuelve. Requiere niche_id/
// demographic_id ya confirmados (paso 0.a — ver classify/route.ts). La llama el paso de
// identidad al montar; si ya está resuelto, devuelve el cacheado sin re-gastar tokens/quota.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const kind = 'landing-dna'
  const { blocked } = await checkGenQuota(id, kind)
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  if (!session.niche_id || !session.demographic_id) {
    return NextResponse.json({ error: 'Clasifica el nicho primero', needsClassify: true }, { status: 400 })
  }
  if (session.landing_dna) return NextResponse.json({ landing_dna: session.landing_dna })

  try {
    const order = session.selected_sections ?? [...SectionType.options]
    const dna = await extractDna(session, session.niche_id, session.demographic_id, order, session.body_focus)
    await updateLandingSession(id, { landing_dna: dna })
    await recordGenQuota(id, kind, userId) // SOLO tras persistir con éxito (regla de costo).
    return NextResponse.json({ landing_dna: dna })
  } catch (err) {
    console.error('[landing-extract-dna]', err)
    return NextResponse.json({ error: 'No se pudo extraer la identidad visual', retryable: true }, { status: 502 })
  }
}

// PUT: guarda ediciones del usuario al ADN / niche_id / demographic_id y sube step≥3. Si cambia
// niche_id O demographic_id, invalida landing_dna — niche_id porque paleta/tipografía/
// partículas/props ya no aplican; demographic_id porque model_persona/poses se derivan de la
// demografía y quedarían obsoletos. El POST siguiente re-extrae; devuelve nicheChanged/
// demographicChanged para que la UI avise antes de aplicar (spec 0.a, solo para niche_id).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let body: { landing_dna?: unknown; niche_id?: unknown; demographic_id?: unknown; body_focus?: unknown } = {}
  try { body = await req.json() } catch { /* body opcional */ }

  const patch: Partial<Omit<LandingSessionResponse, 'id' | 'created_at'>> = { step: Math.max(session.step, 3) }
  let nicheChanged = false
  let demographicChanged = false
  let focusChanged = false

  if (body.niche_id !== undefined) {
    const parsedNiche = NicheId.safeParse(body.niche_id)
    if (!parsedNiche.success) return NextResponse.json({ error: 'niche_id inválido' }, { status: 400 })
    patch.niche_id = parsedNiche.data
    nicheChanged = !!session.niche_id && parsedNiche.data !== session.niche_id
  }

  if (body.demographic_id !== undefined) {
    const parsedDemo = DemographicId.safeParse(body.demographic_id)
    if (!parsedDemo.success) return NextResponse.json({ error: 'demographic_id inválido' }, { status: 400 })
    patch.demographic_id = parsedDemo.data
    demographicChanged = !!session.demographic_id && parsedDemo.data !== session.demographic_id
  }

  if (body.body_focus !== undefined) {
    const parsedFocus = BodyFocus.safeParse(body.body_focus)
    if (!parsedFocus.success) return NextResponse.json({ error: 'body_focus inválido' }, { status: 400 })
    patch.body_focus = parsedFocus.data
    focusChanged = !!session.body_focus && parsedFocus.data !== session.body_focus
  }

  if (body.landing_dna !== undefined) {
    const parsedDna = LandingDnaSchema.safeParse(body.landing_dna)
    if (!parsedDna.success) return NextResponse.json({ error: 'ADN visual inválido' }, { status: 400 })
    patch.landing_dna = parsedDna.data
  }

  // El cambio de niche_id o demographic_id SIEMPRE invalida el ADN cacheado, aunque el body
  // también trajera un landing_dna editado a mano — ya no es coherente con el nuevo nicho/demografía.
  // La zona decide el banco de poses Y si hace falta la placa de zona, así que cambiarla invalida
  // el ADN igual que el nicho o la demografía. Además limpia la placa de zona vieja: encuadraba
  // otra parte del cuerpo y reusarla sería peor que no tenerla.
  if (nicheChanged || demographicChanged || focusChanged) patch.landing_dna = null
  if (focusChanged) patch.talent_zone_url = null

  await updateLandingSession(id, patch)
  return NextResponse.json({
    landing_dna: patch.landing_dna !== undefined ? patch.landing_dna : session.landing_dna,
    nicheChanged,
    demographicChanged,
    focusChanged,
  })
}
