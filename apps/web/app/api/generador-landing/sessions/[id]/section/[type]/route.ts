import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession, upsertLandingSection } from '@/lib/landing/db'
import { fetchAsBase64, uploadToStorage, storagePublicUrl } from '@/lib/storage'
import { generateImage, editWithPrompt } from '@/lib/gemini'
import { buildDiffusionInstruction, MULTI_UNIT_SECTIONS, NO_TALENT_SECTIONS, OFFER_SECTIONS } from '@/lib/landing/instructions'
import { buildProductPack } from '@/lib/landing/product-box'
import { NO_TALENT_SUBSTITUTE, DEMOGRAPHIC_LABELS, zoneNeedsOwnPlate } from '@/lib/landing/demographics'
import { generateOfferCopy } from '@/lib/landing/copy'
import { SectionCopySchema, OfferCopySchema, SectionType, SECTION_REF, resolveOffer, type LandingSection, type SectionCopy } from '@/lib/landing/types'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// UNA imagen por request. Con OpenAI primario (gpt-image-2 ~60-90s) el viejo cap de 60s no
// alcanzaba → 504. Fluid Compute (vercel.json fluid:true) sube el techo a 300s incluso en Hobby;
// 300 cubre 1 imagen + los reintentos de generateImage. El cliente llama esta ruta una vez por
// sección, secuencialmente. Sirve para generar Y regenerar. (Opcional prod: LLM_IMAGE_TIMEOUT_MS
// hace caer a Gemini antes del cap si OpenAI se cuelga.)
export const maxDuration = 300

// Motor de DIFUSIÓN, DNA-driven (spec 2026-07-23): reemplaza al motor viejo (paleta/typography
// sueltas + marca derivada) y al motor híbrido (escena Gemini + composición Satori de texto,
// borrado en Task 10). La IA renderiza la sección COMPLETA con su texto a partir del ADN de la
// sesión (`landing_dna`, extraído UNA vez en el step previo del wizard). Lo ÚNICO compuesto
// aparte son los logos reales de marca (medios de pago, banderas, lockup) — la difusión los
// garabatea si los dibuja ella.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await params

  const parsedType = SectionType.safeParse(type)
  if (!parsedType.success) return NextResponse.json({ error: 'Tipo de sección inválido' }, { status: 400 })

  const kind = `landing-section:${type}`
  const { blocked, regensLeft } = await checkGenQuota(id, kind)
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getLandingSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

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
  // ⚠️ LOS TIERS SE GENERAN SI FALTAN, PASE LO QUE PASE CON EL COPY — y no era así.
  // La guarda vieja era `if (!copy && type === 'oferta')`, pero `generateLandingCopy` YA emite un
  // SectionCopy de tipo "oferta" (headline/kicker, ver SECTION_DNA.oferta), así que `copy` siempre
  // llegaba lleno y `generateOfferCopy` NUNCA corría: medido, `offer` está en NULL en las 25
  // sesiones de la base. Sin `offer` no se inyectan `offerText`/`featuredPriceText`, y la difusión
  // INVENTA el precio — el mismo de sus priors en cada sesión, que es el bug reportado
  // ("genera el mismo precio para todos siempre"). Alcanza a hero y cta-final por la misma vía:
  // los dos consumen `featuredPriceText`/`urgencyText`, y una sesión puede llevarlos SIN sección de
  // oferta (medido: la sesión 74edef72 es hero+cta-final a secas). Es una llamada de texto por
  // sesión, cacheada en la fila: la alternativa es que el hero invente el precio.
  let offerCopy = OfferCopySchema.safeParse(session.offer_copy).success ? OfferCopySchema.parse(session.offer_copy) : null
  if (OFFER_SECTIONS.has(parsedType.data) && (!offer || (parsedType.data === 'oferta' && !offerCopy))) {
    const gen = await generateOfferCopy(session)
    offer = gen.offer; offerCopy = gen.copy
    await updateLandingSession(id, { offer, offer_copy: offerCopy })
  }
  // La sección Oferta arma su SectionCopy desde offer_copy si el copy general no la trajo.
  if (!copy && parsedType.data === 'oferta' && offer && offerCopy)
    copy = { type: 'oferta', headline: offerCopy.headline, subheadline: offerCopy.subheadline, cta: offer.tiers.find((t) => t.featured)?.cta }
  if (!copy || copy.type !== parsedType.data)
    return NextResponse.json({ error: 'Falta el copy de la sección' }, { status: 400 })

  // Regen con prompt sobre una sección ya generada = edición exclusiva: solo ese cambio,
  // el resto pixel-idéntico (y nos ahorra fetch de fotos + ref + talento). Sin prompt o sin
  // imagen previa, genera la sección desde cero.
  const existing = (session.sections ?? []).find((s) => s.type === parsedType.data)
  let b64: string
  if (precision && existing?.imageUrl) {
    const prev = await fetchAsBase64(existing.imageUrl)
    b64 = await editWithPrompt(prev.data, prev.mimeType, precision, { aspectRatio: '9:16' })
  } else {
    // ─── Contrato de orden de parts[] (alineado con la nota de composición del prompt) ───
    // 1) producto canónico (o pack multi-unidad) — Imagen 1.
    // 2) fotos reales del producto — ground-truth de labels.
    // 3) retrato del talento, si esta campaña lo tiene — penúltima.
    // 4) plantilla curada de composición de ESTA sección — ÚLTIMA (fuente de verdad de
    //    estructura; fetch fail-safe, ver comentario junto al try/catch más abajo).
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
    // faq/testimonios/garantia/cta-final NUNCA llevan al protagonista (NO_TALENT_SECTIONS,
    // ampliado en Task 3 con el motor plantilla-como-scaffold): no se adjunta su retrato.
    const showProtagonist = hasTalent && !NO_TALENT_SECTIONS.has(parsedType.data)
    // QUÉ PLACA VA: el HERO lleva el retrato (la cara es lo que construye confianza al abrir la
    // landing); el resto de las secciones con protagonista llevan la placa de ZONA, encuadrada en
    // la parte del cuerpo sobre la que actúa el producto. Sin placa de zona (producto de rostro, o
    // la segunda gen falló) se cae a la canónica, que es el comportamiento de siempre.
    //
    // ⚠️ La placa es el lever REAL del encuadre, no el texto: es la imagen que la difusión copia.
    // Pedir el recorte por prompt contra una plantilla que muestra un retrato es la misma pelea que
    // ya se perdió con la luz.
    const usaZona = showProtagonist && parsedType.data !== 'hero' && !!session.talent_zone_url
    if (showProtagonist) {
      const plate = await fetchAsBase64(usaZona ? session.talent_zone_url! : session.talent_canonical_url!)
      parts.push({ inlineData: { mimeType: plate.mimeType, data: plate.data } })
    }

    // Plantilla curada de composición (última, Task 4: prefijo landing-templates/, reemplaza
    // a las viejas landing-refs/ del motor DNA) — AHORA es la fuente de verdad de estructura
    // (zonas, anatomía de cards, encuadre), ver templateNote() en instructions.ts. Igual se
    // trata como fetch fail-safe: un fallo al traerla NUNCA debe tumbar la generación completa
    // (se loguea y se continúa sin ella, con peor fidelidad de layout pero sin 502).
    try {
      const refUrl = storagePublicUrl(`landing-templates/${SECTION_REF[parsedType.data]}`)
      const ref = await fetchAsBase64(refUrl)
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } })
    } catch (err) {
      console.warn('[landing-section] plantilla de composición no disponible, se continúa sin ella', err)
    }

    const talentSubstitute = !hasTalent
      ? (session.niche_id ? NO_TALENT_SUBSTITUTE[session.niche_id] : 'Producto en contexto, a escala humana')
      : undefined

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
        nicheId: session.niche_id ?? undefined,
        bodyFocus: session.body_focus ?? undefined,
        zonePlate: usaZona,
        // no_talent no aplica a las caras de clientes de testimonios ("coherentes con la demografía
        // objetivo (Sin persona / solo producto)" no tiene sentido) → undefined = clientes genéricos.
        demographicLabel: session.demographic_id && session.demographic_id !== 'no_talent' ? DEMOGRAPHIC_LABELS[session.demographic_id] : undefined,
      }),
    })
    b64 = await generateImage(parts, 3, { aspectRatio: '9:16' })
  }
  if (!b64) return NextResponse.json({ error: 'No se pudo generar la sección', retryable: true }, { status: 502 })

  // La imagen de difusión se sube tal cual.
  //
  // ⚠️ El `aspectRatio: '9:16'` de arriba NO se cumplía: `sizeFor` mapeaba todo portrait a
  // 1024x1536 (2:3) y las secciones salían así — medido sobre las sesiones de prod del 08, 12
  // y 15 de agosto, todas 1024x1536, mientras la UI las mostraba en contenedores `aspect-[9/16]`.
  // Se arregló en `sizeFor` (deriva el tamaño del ratio); acá no había nada que cambiar, esta
  // ruta siempre pidió 9:16. Verificado por el mismo camino: 864x1536 (0.563).
  //
  // (El overlay del lockup de marca en cta-final se retiró porque forzaba 9:16 sobre la imagen
  // 2:3 de OpenAI → la recortaba. Ese motivo ya no aplica: la imagen ES 9:16. No se reinstala
  // igual — era un adorno menor y la difusión ya renderiza la marca por el label del producto.
  // reserveLockup/BrandLockup siguen sin uso.)
  const imageUrl = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `section-${copy.type}`)

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
