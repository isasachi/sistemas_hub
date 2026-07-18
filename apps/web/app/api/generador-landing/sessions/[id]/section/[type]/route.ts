import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { generateImage, editWithPrompt } from '@/lib/gemini'
import { buildSectionInstruction, buildSceneInstruction } from '@/lib/landing/instructions'
import { HYBRID_SECTIONS } from '@/lib/landing/engine-registry'
import { extractLandingStyle } from '@/lib/landing/style-extract'
import { extractProductBox, cropProduct } from '@/lib/landing/product-box'
import { generateOfferCopy } from '@/lib/landing/copy'
import { renderComposite, blurToDataUri } from '@/lib/landing/composite'
import { buildTheme } from '@/lib/landing/theme'
import { loadPairFonts, type TypePairId } from '@/lib/landing/typography-catalog'
import { OfertaLayout } from '@/lib/landing/layouts/oferta'
import { SectionCopySchema, OfferCopySchema, SectionType, type LandingSection, type OfferCopy, type LandingPalette, type LandingSessionResponse } from '@/lib/landing/types'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // path source = gen imagen (~15s) + bbox de visión (~2s) + crop; cabe en 60s.
// UNA imagen por request (~15s) → cabe en el cap de Vercel Hobby (60s). El cliente
// llama esta ruta una vez por sección, secuencialmente, en vez de un SSE que genera
// las 8 en un solo request (que excedería el cap). Sirve para generar Y regenerar.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await params

  const parsedType = SectionType.safeParse(type)
  if (!parsedType.success) return NextResponse.json({ error: 'Tipo de sección inválido' }, { status: 400 })

  const kind = `landing-section:${type}`
  const { blocked, regensLeft } = await checkGenQuota(id, kind)
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // El copy puede venir en el body (edición) o tomarse del copy aprobado de la sesión.
  let body: { copy?: unknown; offerCopy?: unknown; order?: number; prompt?: string } = {}
  try { body = await req.json() } catch { /* body opcional */ }
  const precision = (body.prompt ?? '').trim()

  // Bifurcación de motor: las secciones en HYBRID_SECTIONS se producen como escena Gemini
  // (sin texto) + composición Satori. Set vacío ⇒ inalcanzable y las 8 secciones usan el
  // motor viejo de abajo. Va antes del copy SectionCopy: el híbrido usa OfferCopy, no ese.
  if (HYBRID_SECTIONS.has(parsedType.data)) {
    return generateHybridSection(session, id, parsedType.data, body, precision, userId, kind, regensLeft)
  }

  let copy = SectionCopySchema.safeParse(body.copy).success ? SectionCopySchema.parse(body.copy) : null
  if (!copy) {
    const approved = (session.copy ?? []).find((c) => c.type === parsedType.data)
    if (approved) copy = SectionCopySchema.parse(approved)
  }
  if (!copy || copy.type !== parsedType.data)
    return NextResponse.json({ error: 'Falta el copy de la sección' }, { status: 400 })

  // Regen con prompt sobre una sección ya generada = edición exclusiva: solo ese cambio,
  // el resto pixel-idéntico (y nos ahorra fetch de fotos + extracción de estilo). Sin
  // prompt o sin imagen previa, genera la sección desde cero.
  const existing = (session.sections ?? []).find((s) => s.type === parsedType.data)
  let b64: string
  if (precision && existing?.imageUrl) {
    const prev = await fetchAsBase64(existing.imageUrl)
    b64 = await editWithPrompt(prev.data, prev.mimeType, precision, { aspectRatio: '9:16' })
  } else {
    // Fotos del producto como input (fidelidad).
    const photoParts: Part[] = []
    let firstPhoto: { data: string; mimeType: string } | null = null
    for (const url of session.product_photo_urls ?? []) {
      const { data, mimeType } = await fetchAsBase64(url)
      if (!firstPhoto) firstPhoto = { data, mimeType }
      photoParts.push({ inlineData: { mimeType, data } })
    }

    // Estilo de marca: del handoff de branding (ya seteado) o derivado de la foto.
    // ponytail: deriva una vez y cachea en la sesión; el loop de secciones es
    // secuencial (cliente), así que no hay carrera read-modify-write.
    let palette = session.palette
    let typography = session.typography
    if ((!palette || !typography) && firstPhoto) {
      try {
        const style = await extractLandingStyle(firstPhoto.data, firstPhoto.mimeType)
        palette = style.palette
        typography = style.typography
        await updateLandingSession(id, { palette, typography })
      } catch (err) {
        console.error('[landing-style]', err) // sin estilo: el modelo elige paleta cohesiva
      }
    }

    // Ancla de producto para consistencia + fidelidad entre secciones. La PRIMERA sección
    // generada sale de las fotos crudas ('source': reproduce el producto con TODOS sus labels
    // reales) y su render limpio se cachea como ancla. Las demás calcan ese producto
    // ('anchored': Imagen 1 = RECORTE del producto del ancla, Imagen 2+ = fotos reales como
    // ground-truth de labels). El cliente genera secuencialmente Y en orden de prioridad de
    // ancla (Section4Preview: hero/producto-único-grande primero) → la 1ª 'source' es siempre
    // anchor-worthy, sin carrera. ponytail: el ancla se fija una vez; regenerar en fresco la
    // sección-fuente la re-ancla contra su propio recorte viejo (no re-deriva). Si el ancla
    // saliera mala, hoy no hay reset — v1; upgrade: botón "re-anclar" que limpie la columna.
    const parts: Part[] = [...photoParts]
    let mode: 'source' | 'anchored' | 'none' = photoParts.length ? 'source' : 'none'
    if (session.product_canonical_url) {
      const anchor = await fetchAsBase64(session.product_canonical_url)
      parts.unshift({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } })
      mode = 'anchored'
    }
    parts.push({ text: buildSectionInstruction(copy, mode, palette, typography, session.brand_style, session.product_labels) })
    b64 = await generateImage(parts, 3, { aspectRatio: '9:16' })

    // Cachea el ancla desde la primera sección-fuente exitosa, RECORTADA al producto (sin el
    // layout de la sección) para que las demás calquen el producto sin clonar su estructura.
    // Fallback al render completo si el bbox/recorte falla (nunca peor que hoy).
    if (b64 && mode === 'source') {
      const buf = Buffer.from(b64, 'base64')
      const box = await extractProductBox(b64, 'image/png')
      const anchorBuf = box ? await cropProduct(buf, box).catch(() => buf) : buf
      const anchorUrl = await uploadToStorage(id, anchorBuf, 'image/png', 'product-canonical')
      await updateLandingSession(id, { product_canonical_url: anchorUrl })
    }
  }
  if (!b64) return NextResponse.json({ error: 'No se pudo generar la sección', retryable: true }, { status: 502 })

  const imageUrl = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `section-${copy.type}`)

  // Upsert en el array sections (read-modify-write). El `order` viene del cliente
  // (índice en selected_sections); al regenerar se preserva el existente.
  const sections: LandingSection[] = [...(session.sections ?? [])]
  const idx = sections.findIndex((s) => s.type === parsedType.data)
  const order = idx >= 0 ? sections[idx].order : (typeof body.order === 'number' ? body.order : sections.length)
  const section: LandingSection = { type: copy.type, order, copy, imageUrl, status: 'done' }
  if (idx >= 0) sections[idx] = section
  else sections.push(section)

  await updateLandingSession(id, { step: Math.max(session.step, 3), sections })
  await recordGenQuota(id, kind, userId)
  return NextResponse.json({ section, regensLeft })
}

// ─── Motor HÍBRIDO (Fase 1): escena Gemini (sin texto) + composición Satori ───
// F1: par tipográfico fijo. La Fase 3 (derived brand) lo deriva del producto.
const DEFAULT_TYPE_PAIR: TypePairId = 'clinico-geometrico' // ponytail: F3 lo reemplaza
const FALLBACK_PALETTE: LandingPalette = [{ name: 'accent', hex: '#0EA5A4' }]

// Genera la ESCENA cruda (plato de fondo, sin texto) con la misma lógica de fotos/ancla/paleta
// que el motor viejo, pero vía buildSceneInstruction. NO siembra el ancla: la oferta multiplica
// el producto en un pack y sería un ancla mala (el hero la siembra en el motor viejo).
async function generateScenePlate(
  session: LandingSessionResponse,
  id: string,
): Promise<{ sceneB64: string; palette: LandingPalette | null }> {
  const photoParts: Part[] = []
  let firstPhoto: { data: string; mimeType: string } | null = null
  for (const url of session.product_photo_urls ?? []) {
    const { data, mimeType } = await fetchAsBase64(url)
    if (!firstPhoto) firstPhoto = { data, mimeType }
    photoParts.push({ inlineData: { mimeType, data } })
  }
  let palette = session.palette
  let typography = session.typography
  if ((!palette || !typography) && firstPhoto) {
    try {
      const style = await extractLandingStyle(firstPhoto.data, firstPhoto.mimeType)
      palette = style.palette
      typography = style.typography
      await updateLandingSession(id, { palette, typography })
    } catch (err) {
      console.error('[landing-style]', err)
    }
  }
  const parts: Part[] = [...photoParts]
  let mode: 'source' | 'anchored' | 'none' = photoParts.length ? 'source' : 'none'
  if (session.product_canonical_url) {
    const anchor = await fetchAsBase64(session.product_canonical_url)
    parts.unshift({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } })
    mode = 'anchored'
  }
  parts.push({ text: buildSceneInstruction('oferta', mode, palette, session.brand_style, session.product_labels) })
  const sceneB64 = await generateImage(parts, 3, { aspectRatio: '9:16', imageSize: '2K' })
  return { sceneB64, palette }
}

async function generateHybridSection(
  session: LandingSessionResponse,
  id: string,
  type: SectionType,
  body: { offerCopy?: unknown; order?: number; prompt?: string },
  precision: string,
  userId: string | null,
  kind: string,
  regensLeft: number | null,
): Promise<NextResponse> {
  // 1. Copy de oferta: edición del body > persistido en la sesión > generar (y persistir).
  const offerEdited = OfferCopySchema.safeParse(body.offerCopy).success
  let offer: OfferCopy | null = offerEdited
    ? OfferCopySchema.parse(body.offerCopy)
    : OfferCopySchema.safeParse(session.offer_copy).success
      ? OfferCopySchema.parse(session.offer_copy)
      : null
  if (!offer) {
    offer = await generateOfferCopy(session)
    await updateLandingSession(id, { offer_copy: offer })
  } else if (offerEdited) {
    await updateLandingSession(id, { offer_copy: offer })
  }

  // 2. Escena: si solo cambió el copy (sin prompt) y hay escena cacheada → re-componer a $0
  // (criterio de aceptación #6). Regen con prompt = editar SOLO la escena. Si no, generar.
  const existing = (session.sections ?? []).find((s) => s.type === type)
  const copyOnly = offerEdited && !precision
  let sceneB64: string
  let sceneUrl = existing?.sceneUrl ?? null
  let palette = session.palette
  if (copyOnly && sceneUrl) {
    sceneB64 = (await fetchAsBase64(sceneUrl)).data
  } else if (precision && sceneUrl) {
    const prev = await fetchAsBase64(sceneUrl)
    sceneB64 = await editWithPrompt(prev.data, prev.mimeType, precision, { aspectRatio: '9:16' })
    sceneUrl = null
  } else {
    const plate = await generateScenePlate(session, id)
    sceneB64 = plate.sceneB64
    palette = plate.palette
    sceneUrl = null
  }
  if (!sceneB64) return NextResponse.json({ error: 'No se pudo generar la escena', retryable: true }, { status: 502 })
  if (!sceneUrl) sceneUrl = await uploadToStorage(id, Buffer.from(sceneB64, 'base64'), 'image/png', 'scene-oferta')

  // 3. Composición Satori sobre la escena → JPEG final. Glass real (Camino B): la escena
  // pre-desenfocada se embebe en las cards para el frosted glass alineado.
  const theme = buildTheme(palette ?? FALLBACK_PALETTE, DEFAULT_TYPE_PAIR)
  const fonts = loadPairFonts(DEFAULT_TYPE_PAIR)
  const sceneBuf = Buffer.from(sceneB64, 'base64')
  const blurBg = await blurToDataUri(sceneBuf)
  const jpeg = await renderComposite(sceneBuf, OfertaLayout({ copy: offer, theme, blurBg }), { fonts, width: 1080, height: 1920 })
  const imageUrl = await uploadToStorage(id, jpeg, 'image/jpeg', 'section-oferta')

  // 4. Upsert. LandingSection.copy es SectionCopy → sintetizamos una mínima desde la oferta
  // para el preview/historial; los tiers viven en session.offer_copy.
  const sectionCopy = { type: 'oferta' as const, headline: offer.headline, subheadline: offer.subheadline, cta: offer.tiers.find((t) => t.featured)?.cta }
  const sections: LandingSection[] = [...(session.sections ?? [])]
  const idx = sections.findIndex((s) => s.type === type)
  const order = idx >= 0 ? sections[idx].order : (typeof body.order === 'number' ? body.order : sections.length)
  const section: LandingSection = { type, order, copy: sectionCopy, imageUrl, status: 'done', sceneUrl }
  if (idx >= 0) sections[idx] = section
  else sections.push(section)

  await updateLandingSession(id, { step: Math.max(session.step, 3), sections })
  await recordGenQuota(id, kind, userId)
  return NextResponse.json({ section, regensLeft })
}
