import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { generateImage, editWithPrompt } from '@/lib/gemini'
import { buildSectionInstruction, buildSceneInstruction, buildDiffusionInstruction, PAYMENT_SECTIONS, MULTI_UNIT_SECTIONS, type ProductMode } from '@/lib/landing/instructions'
import { PaymentBar } from '@/lib/landing/layouts/payment-bar'
import { BrandLockup, brandLockupText } from '@/lib/landing/layouts/brand-lockup'
import { buildProductPack } from '@/lib/landing/product-box'
import { HYBRID_SECTIONS, NO_TALENT_SECTIONS, NO_PERSON_SECTIONS } from '@/lib/landing/engine-registry'
import { extractLandingStyle } from '@/lib/landing/style-extract'
import { generateOfferCopy } from '@/lib/landing/copy'
import { generateAvatars } from '@/lib/landing/avatars'
import { renderComposite, blurToDataUri } from '@/lib/landing/composite'
import { buildTheme } from '@/lib/landing/theme'
import { loadPairFonts } from '@/lib/landing/fonts'
import { TYPE_PAIRS, type TypePairId } from '@/lib/landing/typography-catalog'
import { OfertaLayout } from '@/lib/landing/layouts/oferta'
import { GarantiaLayout } from '@/lib/landing/layouts/garantia'
import { CtaFinalLayout } from '@/lib/landing/layouts/cta-final'
import { HeroLayout } from '@/lib/landing/layouts/hero'
import { AntesDespuesLayout } from '@/lib/landing/layouts/antes-despues'
import { BeneficiosLayout } from '@/lib/landing/layouts/beneficios'
import { TestimoniosLayout } from '@/lib/landing/layouts/testimonios'
import { FaqLayout } from '@/lib/landing/layouts/faq'
import { SectionCopySchema, OfferCopySchema, SectionType, resolveOffer, type LandingSection, type SectionCopy, type LandingPalette, type LandingTypography, type LandingSessionResponse } from '@/lib/landing/types'
import type { ReactElement } from 'react'
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

  // Motor de DIFUSIÓN: la oferta y la confianza (que F5 sacó del copy) se INYECTAN al prompt.
  let offer = resolveOffer(session)
  const trust = session.trust_block

  let copy = SectionCopySchema.safeParse(body.copy).success ? SectionCopySchema.parse(body.copy) : null
  if (!copy) {
    const approved = (session.copy ?? []).find((c) => c.type === parsedType.data)
    if (approved) copy = SectionCopySchema.parse(approved)
  }
  // Oferta: su texto vive en offer_copy + los tiers en session.offer (F5). Se arma el SectionCopy
  // desde offer_copy (generando ambos si faltan) para que la difusión tenga headline/subheadline.
  if (!copy && parsedType.data === 'oferta') {
    let offerCopy = OfferCopySchema.safeParse(session.offer_copy).success ? OfferCopySchema.parse(session.offer_copy) : null
    if (!offer || !offerCopy) {
      const gen = await generateOfferCopy(session)
      offer = gen.offer; offerCopy = gen.copy
      await updateLandingSession(id, { offer, offer_copy: offerCopy })
    }
    copy = { type: 'oferta', headline: offerCopy.headline, subheadline: offerCopy.subheadline, cta: offer.tiers.find((t) => t.featured)?.cta }
  }
  if (!copy || copy.type !== parsedType.data)
    return NextResponse.json({ error: 'Falta el copy de la sección' }, { status: 400 })

  // Regen con prompt sobre una sección ya generada = edición exclusiva: solo ese cambio,
  // el resto pixel-idéntico (y nos ahorra fetch de fotos + extracción de estilo). Sin
  // prompt o sin imagen previa, genera la sección desde cero.
  const existing = (session.sections ?? []).find((s) => s.type === parsedType.data)
  // Lockup de marca (tarea 4): solo hero/cta-final, si hay un wordmark corto y limpio. Se computa
  // acá para reservar la franja superior en el prompt Y compositarlo después. Null en el path de
  // edición por precisión (el lockup ya está horneado en la imagen previa; no re-compositar).
  let lockup: string | null = null
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

    // Marca: derived_brand (Fase 3) GANA; si no, palette/typography de la sesión; último
    // recurso, derivar de la foto (camino viejo). Del par tipográfico sintetizamos el hint de
    // fuentes (headline/body) para el modelo. ponytail: deriva una vez y cachea; el loop de
    // secciones es secuencial (cliente), sin carrera read-modify-write.
    const brand = session.derived_brand
    let palette: LandingPalette | null = brand?.palette ?? session.palette
    let typography: LandingTypography | null = brand
      ? { headline: TYPE_PAIRS[brand.typePair].display, body: TYPE_PAIRS[brand.typePair].body }
      : session.typography
    if (!brand && (!palette || !typography) && firstPhoto) {
      try {
        const style = await extractLandingStyle(firstPhoto.data, firstPhoto.mimeType)
        palette = style.palette
        typography = style.typography
        await updateLandingSession(id, { palette, typography })
      } catch (err) {
        console.error('[landing-style]', err) // sin estilo: el modelo elige paleta cohesiva
      }
    }

    // Ancla CANÓNICA del producto (Fase 2): la placa se deriva de la FOTO REAL en la etapa 2
    // (photos/route.ts), no del render de la 1ª sección. Image 1 = recorte canónico si existe (o
    // la foto cruda si no se pudo derivar — el prompt 'canonical' ignora su fondo); Image 2+ =
    // fotos reales como ground-truth de labels. La ruta ya NO siembra ni deriva el ancla: queda
    // SIN estado compartido entre secciones → secciones independientes (habilita la Fase 6).
    // Pack multi-unidad (tarea 2): oferta/cta-final muestran un pack; en vez de que la difusión
    // invente 2-3 frascos desde 1 (y garabatee el label distinto en cada uno), le pasamos el pack
    // pre-compuesto (mismo crop ×N) como Image 1 → los N labels salen idénticos.
    const parts: Part[] = []
    let mode: ProductMode = 'none'
    let packUnits: number | null = null
    if (session.product_canonical_url) {
      const anchor = await fetchAsBase64(session.product_canonical_url)
      if (MULTI_UNIT_SECTIONS.has(parsedType.data)) {
        const pack = await buildProductPack(Buffer.from(anchor.data, 'base64'), 3)
        parts.push({ inlineData: { mimeType: 'image/png', data: pack.toString('base64') } }, ...photoParts)
        packUnits = 3
      } else {
        parts.push({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } }, ...photoParts)
      }
      mode = 'canonical'
    } else if (photoParts.length) {
      parts.push(...photoParts)
      mode = 'canonical'
    }
    // Talento canónico (Fase 4): la persona va como ÚLTIMA imagen del parts[] — el contrato de
    // orden (producto canónico → fotos → talento) lo asume talentLine ("FINAL reference image").
    // testimonios se excluye: muestra clientes distintos, no al protagonista canónico.
    // Talento canónico: no va en testimonios/faq/beneficios. Persona del todo suprimida solo en
    // beneficios/faq (testimonios SÍ muestra clientes, caras distintas que la difusión renderiza).
    const noPersonSection = NO_PERSON_SECTIONS.has(parsedType.data)
    const hasTalent = !!(brand?.casting.present && session.talent_canonical_url && !NO_TALENT_SECTIONS.has(parsedType.data))
    if (hasTalent) {
      const talent = await fetchAsBase64(session.talent_canonical_url!)
      parts.push({ inlineData: { mimeType: talent.mimeType, data: talent.data } })
    }
    // Motor de DIFUSIÓN: la IA renderiza toda la sección con su texto; se le inyectan los tiers
    // de la oferta y las filas de confianza (F5 los sacó del copy), y se reserva la banda de logos.
    if (parsedType.data === 'hero' || parsedType.data === 'cta-final') lockup = brandLockupText(session.product_labels, session.product_name)
    parts.push({ text: buildDiffusionInstruction(copy, mode, palette, typography, session.brand_style, session.product_labels, brand, hasTalent, noPersonSection, offer, trust, packUnits, !!lockup) })
    b64 = await generateImage(parts, 3, { aspectRatio: '9:16' })
  }
  if (!b64) return NextResponse.json({ error: 'No se pudo generar la sección', retryable: true }, { status: 502 })

  // Overlay de logos de marca REALES (medios de pago + banderas + sello) sobre la banda que la
  // difusión dejó limpia. Solo las secciones con strip de pagos (oferta/garantía). El resto sube
  // la imagen de difusión tal cual.
  const needsBar = PAYMENT_SECTIONS.has(parsedType.data) && !!trust?.paymentMethods.length
  let outBuf = Buffer.from(b64, 'base64')
  // Overlay de logos/lockup (Satori). Bandas disjuntas: pago en oferta/garantía, lockup en
  // hero/cta-final → a lo sumo un overlay por sección. Ambos usan el mismo theme + fuentes.
  if (needsBar || lockup) {
    const dbrand = session.derived_brand
    const pair = dbrand?.typePair ?? DEFAULT_TYPE_PAIR
    const theme = buildTheme(dbrand?.palette ?? session.palette ?? FALLBACK_PALETTE, pair)
    const overlay = needsBar ? PaymentBar({ trust: trust!, theme }) : BrandLockup({ text: lockup!, theme })
    outBuf = Buffer.from(await renderComposite(outBuf, overlay, { fonts: loadPairFonts(pair), width: 1080, height: 1920 }))
  }
  const imageUrl = await uploadToStorage(id, outBuf, (needsBar || lockup) ? 'image/jpeg' : 'image/png', `section-${copy.type}`)

  // Upsert en el array sections (read-modify-write). El `order` viene del cliente
  // (índice en selected_sections); al regenerar se preserva el existente.
  const sections: LandingSection[] = [...(session.sections ?? [])]
  const idx = sections.findIndex((s) => s.type === parsedType.data)
  const order = idx >= 0 ? sections[idx].order : (typeof body.order === 'number' ? body.order : sections.length)
  const section: LandingSection = { type: copy.type, order, copy, imageUrl, status: 'done' }
  if (idx >= 0) sections[idx] = section
  else sections.push(section)

  await updateLandingSession(id, { step: Math.max(session.step, 5), sections })
  await recordGenQuota(id, kind, userId)
  return NextResponse.json({ section, regensLeft })
}

// ─── Motor HÍBRIDO (Fase 1): escena Gemini (sin texto) + composición Satori ───
// F1: par tipográfico fijo. F3: derived_brand.typePair lo reemplaza; este queda de FALLBACK
// para sesiones sin marca derivada (pre-wizard-F3 o handoff sin derivar).
const DEFAULT_TYPE_PAIR: TypePairId = 'dr-conversion' // Montserrat DR
const FALLBACK_PALETTE: LandingPalette = [{ name: 'accent', hex: '#0EA5A4' }]

// Genera la ESCENA cruda (plato de fondo, sin texto) con la misma lógica de fotos/ancla/paleta
// que el motor viejo, pero vía buildSceneInstruction. NO siembra el ancla: la oferta multiplica
// el producto en un pack y sería un ancla mala (el hero la siembra en el motor viejo).
async function generateScenePlate(
  session: LandingSessionResponse,
  id: string,
  type: SectionType,
): Promise<{ sceneB64: string; palette: LandingPalette | null }> {
  const photoParts: Part[] = []
  let firstPhoto: { data: string; mimeType: string } | null = null
  for (const url of session.product_photo_urls ?? []) {
    const { data, mimeType } = await fetchAsBase64(url)
    if (!firstPhoto) firstPhoto = { data, mimeType }
    photoParts.push({ inlineData: { mimeType, data } })
  }
  // Marca: derived_brand (Fase 3) gana; si no, palette de la sesión; último recurso, derivar
  // de la foto. Cuando hay brand, la escena consume su paleta + mood + casting (buildScene).
  const brand = session.derived_brand
  let palette: LandingPalette | null = brand?.palette ?? session.palette
  if (!brand && (!palette || !session.typography) && firstPhoto) {
    try {
      const style = await extractLandingStyle(firstPhoto.data, firstPhoto.mimeType)
      palette = style.palette
      await updateLandingSession(id, { palette, typography: style.typography })
    } catch (err) {
      console.error('[landing-style]', err)
    }
  }
  // Ancla CANÓNICA (Fase 2): recorte de la foto real desde la etapa 2. Sin siembra ni estado.
  const parts: Part[] = []
  let mode: ProductMode = 'none'
  if (session.product_canonical_url) {
    const anchor = await fetchAsBase64(session.product_canonical_url)
    parts.push({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } }, ...photoParts)
    mode = 'canonical'
  } else if (photoParts.length) {
    parts.push(...photoParts)
    mode = 'canonical'
  }
  // Talento canónico (Fase 4): última imagen del parts[] (contrato producto → fotos → talento).
  // Igual que el motor viejo, respeta NO_TALENT_SECTIONS (testimonios/faq/beneficios no llevan
  // persona). noPersonSection suprime a la persona en la escena AUNQUE la campaña tenga casting.
  const noPersonSection = NO_TALENT_SECTIONS.has(type)
  const hasTalent = !!(brand?.casting.present && session.talent_canonical_url && !noPersonSection)
  if (hasTalent) {
    const talent = await fetchAsBase64(session.talent_canonical_url!)
    parts.push({ inlineData: { mimeType: talent.mimeType, data: talent.data } })
  }
  parts.push({ text: buildSceneInstruction(type, mode, palette, session.brand_style, session.product_labels, brand, hasTalent, noPersonSection) })
  const sceneB64 = await generateImage(parts, 3, { aspectRatio: '9:16', imageSize: '2K' })
  return { sceneB64, palette }
}

async function generateHybridSection(
  session: LandingSessionResponse,
  id: string,
  type: SectionType,
  body: { order?: number; prompt?: string },
  precision: string,
  userId: string | null,
  kind: string,
  regensLeft: number | null,
): Promise<NextResponse> {
  // 1. Datos de composición según el tipo (C5.5 generalizó el dispatch, antes solo oferta):
  //    - oferta:    tiers (nivel de sesión, C5.1) + su copy propio; los genera si faltan.
  //    - cta-final: referencia el tier destacado (offer, no lo re-inventa); su texto sale del SectionCopy aprobado.
  //    - garantia:  el TrustBlock que cargó el usuario + su SectionCopy. Compat pre-F5 vía resolveOffer.
  let offer = resolveOffer(session)
  let offerCopy = OfferCopySchema.safeParse(session.offer_copy).success ? OfferCopySchema.parse(session.offer_copy) : null
  const needsOffer = type === 'oferta' || type === 'cta-final' || type === 'hero'
  if (needsOffer && (!offer || (type === 'oferta' && !offerCopy))) {
    const gen = await generateOfferCopy(session)
    offer = gen.offer
    offerCopy = offerCopy ?? gen.copy
    await updateLandingSession(id, { offer, offer_copy: offerCopy })
  }
  const trust = session.trust_block
  const bodyCopy = (session.copy ?? []).find((c) => c.type === type) ?? null

  // 2. Escena. Reuso $0 (recompose): CUALQUIER regen sin prompt de precisión, con escena
  // cacheada, reutiliza la escena y re-compone con el theme (paleta/tipografía de derived_brand)
  // y el offer copy ACTUALES → editar la paleta o un precio recompone sin regenerar la escena
  // Gemini (criterios #3 y #6). Un prompt de precisión edita la escena; sin escena previa (1ª
  // vez), se genera. ponytail: cambiar el CASTING tras la 1ª generación exige un prompt de
  // precisión — la persona está horneada en la escena, no en la capa de composición.
  const existing = (session.sections ?? []).find((s) => s.type === type)
  let sceneB64: string
  let sceneUrl = existing?.sceneUrl ?? null
  let palette = session.derived_brand?.palette ?? session.palette
  if (!precision && sceneUrl) {
    sceneB64 = (await fetchAsBase64(sceneUrl)).data
  } else if (precision && sceneUrl) {
    const prev = await fetchAsBase64(sceneUrl)
    sceneB64 = await editWithPrompt(prev.data, prev.mimeType, precision, { aspectRatio: '9:16' })
    sceneUrl = null
  } else {
    const plate = await generateScenePlate(session, id, type)
    sceneB64 = plate.sceneB64
    palette = plate.palette
    sceneUrl = null
  }
  if (!sceneB64) return NextResponse.json({ error: 'No se pudo generar la escena', retryable: true }, { status: 502 })
  if (!sceneUrl) sceneUrl = await uploadToStorage(id, Buffer.from(sceneB64, 'base64'), 'image/png', `scene-${type}`)

  // 3. Composición Satori sobre la escena → JPEG final. Glass real (Camino B): la escena
  // pre-desenfocada se embebe en las cards para el frosted glass alineado.
  // Par tipográfico: derived_brand (Fase 3) gana; si no, el default de F1. Reemplaza al fijo.
  const typePair = session.derived_brand?.typePair ?? DEFAULT_TYPE_PAIR
  const theme = buildTheme(palette ?? FALLBACK_PALETTE, typePair)
  const fonts = loadPairFonts(typePair)
  const sceneBuf = Buffer.from(sceneB64, 'base64')
  const blurBg = await blurToDataUri(sceneBuf)

  // Avatares de testimonios (se componen como <img>): cacheados en la sesión, o generados +
  // subidos + persistidos UNA vez. Se re-encodan a JPEG para fijar el mime (Satori es estricto:
  // un JPEG etiquetado png no decodifica). El resto de secciones no los necesita.
  let avatars: string[] = []
  if (type === 'testimonios') {
    const cached = session.testimonial_avatars
    if (cached?.length) {
      avatars = await Promise.all(cached.map(async (u) => { const a = await fetchAsBase64(u); return `data:${a.mimeType};base64,${a.data}` }))
    } else {
      const sharp = (await import('sharp')).default
      const urls: string[] = []
      for (const b of await generateAvatars(session.derived_brand?.casting)) {
        if (!b) continue
        const jpg = await sharp(Buffer.from(b, 'base64')).jpeg({ quality: 88 }).toBuffer()
        urls.push(await uploadToStorage(id, jpg, 'image/jpeg', `avatar-${urls.length}`))
        avatars.push(`data:image/jpeg;base64,${jpg.toString('base64')}`)
      }
      if (urls.length) await updateLandingSession(id, { testimonial_avatars: urls })
    }
  }

  let layout: ReactElement
  switch (type) {
    case 'hero': layout = HeroLayout({ offer, trust, copy: bodyCopy, theme }); break
    case 'antes-despues': layout = AntesDespuesLayout({ copy: bodyCopy, theme, blurBg }); break
    case 'beneficios': layout = BeneficiosLayout({ copy: bodyCopy, theme, blurBg }); break
    case 'testimonios': layout = TestimoniosLayout({ copy: bodyCopy, avatars, theme, blurBg }); break
    case 'faq': layout = FaqLayout({ copy: bodyCopy, theme, blurBg }); break
    case 'garantia': layout = GarantiaLayout({ trust, copy: bodyCopy, theme, blurBg }); break
    case 'cta-final': layout = CtaFinalLayout({ offer, trust, copy: bodyCopy, theme, blurBg }); break
    default: layout = OfertaLayout({ offer: offer!, copy: offerCopy!, theme, blurBg })
  }
  const jpeg = await renderComposite(sceneBuf, layout, { fonts, width: 1080, height: 1920 })
  const imageUrl = await uploadToStorage(id, jpeg, 'image/jpeg', `section-${type}`)

  // 4. Upsert. LandingSection.copy es SectionCopy → para oferta la sintetizamos de su copy + el CTA
  // del tier destacado; garantia/cta-final ya tienen su SectionCopy aprobado.
  const outCopy: SectionCopy =
    type === 'oferta'
      ? { type: 'oferta', headline: offerCopy!.headline, subheadline: offerCopy!.subheadline, cta: offer!.tiers.find((t) => t.featured)?.cta }
      : (bodyCopy ?? { type, headline: '' })
  const sections: LandingSection[] = [...(session.sections ?? [])]
  const idx = sections.findIndex((s) => s.type === type)
  const order = idx >= 0 ? sections[idx].order : (typeof body.order === 'number' ? body.order : sections.length)
  const section: LandingSection = { type, order, copy: outCopy, imageUrl, status: 'done', sceneUrl }
  if (idx >= 0) sections[idx] = section
  else sections.push(section)

  await updateLandingSession(id, { step: Math.max(session.step, 5), sections })
  await recordGenQuota(id, kind, userId)
  return NextResponse.json({ section, regensLeft })
}
