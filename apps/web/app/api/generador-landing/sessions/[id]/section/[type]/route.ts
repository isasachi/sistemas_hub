import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession, upsertLandingSection } from '@/lib/landing/db'
import { fetchAsBase64, uploadToStorage, storagePublicUrl } from '@/lib/storage'
import { generateImage, editWithPrompt } from '@/lib/gemini'
import { buildDiffusionInstruction, PAYMENT_SECTIONS, MULTI_UNIT_SECTIONS } from '@/lib/landing/instructions'
import { PaymentBar } from '@/lib/landing/layouts/payment-bar'
import { BrandLockup, brandLockupText } from '@/lib/landing/layouts/brand-lockup'
import { buildProductPack } from '@/lib/landing/product-box'
import { NO_TALENT_SUBSTITUTE } from '@/lib/landing/demographics'
import { generateOfferCopy } from '@/lib/landing/copy'
import { renderComposite } from '@/lib/landing/composite'
import { buildTheme } from '@/lib/landing/theme'
import { loadPairFonts } from '@/lib/landing/fonts'
import type { TypePairId } from '@/lib/landing/typography-catalog'
import { SectionCopySchema, OfferCopySchema, SectionType, SECTION_REF, resolveOffer, type LandingSection, type SectionCopy } from '@/lib/landing/types'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // path source = gen imagen (~15s); cabe en 60s (Vercel Hobby).
// UNA imagen por request (~15s) → cabe en el cap de Vercel Hobby (60s). El cliente
// llama esta ruta una vez por sección, secuencialmente, en vez de un SSE que genera
// las 8 en un solo request (que excedería el cap). Sirve para generar Y regenerar.

// Motor de DIFUSIÓN, DNA-driven (spec 2026-07-23): reemplaza al motor viejo (paleta/typography
// sueltas + DerivedBrand) y al motor híbrido (escena Gemini + composición Satori de texto). La
// IA renderiza la sección COMPLETA con su texto a partir del ADN de la sesión (`landing_dna`,
// extraído UNA vez en el step previo del wizard). Lo ÚNICO compuesto aparte son los logos reales
// de marca (medios de pago, banderas, lockup) — la difusión los garabatea si los dibuja ella.

// Par tipográfico fijo para las fuentes de overlay (PaymentBar/BrandLockup). Los overlays ya no
// reciben el `typePair` de un DerivedBrand (retirado): fuente bundleada fija hasta que la Task 10
// la reemplace por Poppins fijo en todo el pipeline.
const DEFAULT_TYPE_PAIR: TypePairId = 'dr-conversion'

// Orientación de la banda de 4 atributos (Z3, spec §3.4): mapa fijo por sección para romper
// monotonía entre secciones del mismo funnel — el contenido de los atributos no cambia, la
// disposición sí.
const ATTR_BAND_ORIENTATION: Record<SectionType, 'horizontal' | 'vertical' | 'grid_2x2'> = {
  hero: 'horizontal',
  beneficios: 'grid_2x2',
  'antes-despues': 'horizontal',
  testimonios: 'vertical',
  faq: 'grid_2x2',
  garantia: 'horizontal',
  oferta: 'horizontal',
  'cta-final': 'horizontal',
}

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

  // Guard de sesión legada (spec 2026-07-23): sin `landing_dna` no hay paleta/partículas/props/
  // persona/poses que inyectar — el wizard debe re-extraer el ADN antes de generar secciones.
  if (!session.landing_dna) return NextResponse.json({ error: 'Regenera la identidad', needsIdentity: true }, { status: 409 })

  // El copy puede venir en el body (edición) o tomarse del copy aprobado de la sesión.
  let body: { copy?: unknown; offerCopy?: unknown; order?: number; prompt?: string } = {}
  try { body = await req.json() } catch { /* body opcional */ }
  const precision = (body.prompt ?? '').trim()

  // Oferta y confianza (session-level, F5) se INYECTAN al prompt — el copy propio de la sección
  // Oferta solo trae headline/subheadline, los tiers viven en session.offer.
  let offer = resolveOffer(session)
  const trust = session.trust_block

  let copy: SectionCopy | null = SectionCopySchema.safeParse(body.copy).success ? SectionCopySchema.parse(body.copy) : null
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
  // el resto pixel-idéntico (y nos ahorra fetch de fotos + ref + talento). Sin prompt o sin
  // imagen previa, genera la sección desde cero.
  const existing = (session.sections ?? []).find((s) => s.type === parsedType.data)
  // Lockup de marca: solo hero/cta-final, si hay un wordmark corto y limpio. Se computa en el
  // path de generación (para reservar la franja superior en el prompt Y compositarlo después).
  // Null en el path de edición por precisión (el lockup ya está horneado en la imagen previa).
  let lockup: string | null = null
  let b64: string
  if (precision && existing?.imageUrl) {
    const prev = await fetchAsBase64(existing.imageUrl)
    b64 = await editWithPrompt(prev.data, prev.mimeType, precision, { aspectRatio: '9:16' })
  } else {
    // ─── Contrato de orden de parts[] (alineado con la nota de composición del prompt) ───
    // 1) producto canónico (o pack multi-unidad) — Imagen 1.
    // 2) fotos reales del producto — ground-truth de labels.
    // 3) retrato del talento, si esta campaña lo tiene — penúltima.
    // 4) referencia de composición de ESTA sección — ÚLTIMA (solo apoyo, mutable).
    const parts: Part[] = []
    let packUnits: number | null = null
    if (session.product_canonical_url) {
      const anchor = await fetchAsBase64(session.product_canonical_url)
      if (MULTI_UNIT_SECTIONS.has(parsedType.data)) {
        const pack = await buildProductPack(Buffer.from(anchor.data, 'base64'), 3)
        parts.push({ inlineData: { mimeType: 'image/png', data: pack.toString('base64') } })
        packUnits = 3
      } else {
        parts.push({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } })
      }
    }
    for (const url of session.product_photo_urls ?? []) {
      const { data, mimeType } = await fetchAsBase64(url)
      parts.push({ inlineData: { mimeType, data } })
    }

    const hasTalent = session.demographic_id !== 'no_talent' && !!session.talent_canonical_url
    if (hasTalent) {
      const talent = await fetchAsBase64(session.talent_canonical_url!)
      parts.push({ inlineData: { mimeType: talent.mimeType, data: talent.data } })
    }

    // Ref de composición (última): SOLO apoyo de zonas/anatomía, mutable — un fallo al traerla
    // NUNCA debe tumbar la generación completa (la instrucción de texto sola ya especifica el
    // layout entero); se loguea y se continúa sin ella.
    try {
      const refUrl = storagePublicUrl(`landing-refs/${SECTION_REF[parsedType.data]}`)
      const ref = await fetchAsBase64(refUrl)
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } })
    } catch (err) {
      console.warn('[landing-section] ref de composición no disponible, se continúa sin ella', err)
    }

    const talentSubstitute = !hasTalent
      ? (session.niche_id ? NO_TALENT_SUBSTITUTE[session.niche_id] : 'Producto en contexto, a escala humana')
      : undefined
    if (parsedType.data === 'hero' || parsedType.data === 'cta-final') lockup = brandLockupText(session.product_labels, session.product_name)

    parts.push({
      text: buildDiffusionInstruction({
        section: parsedType.data,
        copy,
        dna: session.landing_dna,
        productLabels: session.product_labels,
        offer,
        trust,
        packUnits,
        hasTalent,
        talentSubstitute,
        reserveLockup: !!lockup,
        attrBandOrientation: ATTR_BAND_ORIENTATION[parsedType.data],
      }),
    })
    b64 = await generateImage(parts, 3, { aspectRatio: '9:16' })
  }
  if (!b64) return NextResponse.json({ error: 'No se pudo generar la sección', retryable: true }, { status: 502 })

  // Overlay de logos de marca REALES (medios de pago + banderas + sello, o el lockup) sobre la
  // banda que la difusión dejó limpia. Bandas disjuntas (pago en oferta/garantía, lockup en
  // hero/cta-final) → a lo sumo un overlay por sección. El resto sube la imagen de difusión tal cual.
  const needsBar = PAYMENT_SECTIONS.has(parsedType.data) && !!trust?.paymentMethods.length
  let outBuf = Buffer.from(b64, 'base64')
  if (needsBar || lockup) {
    const theme = buildTheme([{ name: 'accent', hex: session.landing_dna.palette.color_accent }], DEFAULT_TYPE_PAIR)
    const overlay = needsBar ? PaymentBar({ trust: trust!, theme }) : BrandLockup({ text: lockup!, theme })
    outBuf = Buffer.from(await renderComposite(outBuf, overlay, { fonts: loadPairFonts(DEFAULT_TYPE_PAIR), width: 1080, height: 1920 }))
  }
  const imageUrl = await uploadToStorage(id, outBuf, (needsBar || lockup) ? 'image/jpeg' : 'image/png', `section-${copy.type}`)

  // Upsert ATÓMICO de la sección: el `order` lo manda el cliente (índice en selected_sections);
  // al regenerar se preserva el existente. Se persiste vía RPC atómica (no read-modify-write del
  // array) para que las secciones concurrentes no se pisen.
  const existingSection = (session.sections ?? []).find((s) => s.type === parsedType.data)
  const order = existingSection ? existingSection.order : (typeof body.order === 'number' ? body.order : (session.sections?.length ?? 0))
  const section: LandingSection = { type: copy.type, order, copy, imageUrl, status: 'done' }
  await upsertLandingSection(id, section)
  await recordGenQuota(id, kind, userId)
  return NextResponse.json({ section, regensLeft })
}
