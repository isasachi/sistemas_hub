import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { generateImage, editWithPrompt } from '@/lib/gemini'
import { buildSectionInstruction } from '@/lib/landing/instructions'
import { extractLandingStyle } from '@/lib/landing/style-extract'
import { extractProductPlate } from '@/lib/landing/product-extract'
import { SectionCopySchema, SectionType, type LandingSection } from '@/lib/landing/types'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // Vercel Hobby: techo permitido. Ver nota de timing abajo.
// UNA imagen por request (~15s) → cabe en el cap de Vercel Hobby (60s). El cliente
// llama esta ruta una vez por sección, secuencialmente, en vez de un SSE que genera
// las 8 en un solo request (que excedería el cap). Sirve para generar Y regenerar.
// Excepción: la PRIMERA sección de una sesión deriva la placa canónica del producto
// inline → dos generaciones (placa ~15s + sección ~15s ≈ 33s), aún holgado en 60s.
// Las demás secciones leen la placa cacheada (product_canonical_url) → una sola imagen.

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
  let body: { copy?: unknown; order?: number; prompt?: string } = {}
  try { body = await req.json() } catch { /* body opcional */ }
  const precision = (body.prompt ?? '').trim()

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
    // Fotos crudas del producto (referencia original → recursos gráficos acompañantes).
    const rawPhotos: { data: string; mimeType: string }[] = []
    for (const url of session.product_photo_urls ?? []) {
      rawPhotos.push(await fetchAsBase64(url))
    }
    const firstPhoto = rawPhotos[0] ?? null

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

    // Placa canónica del producto: extracción quirúrgica una vez por sesión (ancla de
    // identidad idéntica en toda la landing). Derive-once + cache, igual patrón que el
    // estilo. Si falla, canonical queda null y caemos a las fotos crudas (nunca peor).
    let canonical: { data: string; mimeType: string } | null = null
    if (session.product_canonical_url) {
      canonical = await fetchAsBase64(session.product_canonical_url)
    } else if (rawPhotos.length) {
      try {
        const plate = await extractProductPlate(rawPhotos)
        if (plate) {
          const url = await uploadToStorage(id, Buffer.from(plate, 'base64'), 'image/png', 'product-canonical')
          await updateLandingSession(id, { product_canonical_url: url })
          canonical = { data: plate, mimeType: 'image/png' }
        }
      } catch (err) {
        console.error('[landing-canonical]', err) // sin placa: fallback a fotos crudas
      }
    }

    // Imagen 1 = placa canónica (identidad) · Imágenes 2+ = referencias originales
    // (recursos gráficos acompañantes). Sin placa: solo fotos crudas.
    const productParts: Part[] = [
      ...(canonical ? [{ inlineData: { mimeType: canonical.mimeType, data: canonical.data } } as Part] : []),
      ...rawPhotos.map((p) => ({ inlineData: { mimeType: p.mimeType, data: p.data } } as Part)),
    ]
    const productMode = canonical ? 'canonical' : rawPhotos.length ? 'raw' : 'none'
    const parts: Part[] = [
      ...productParts,
      { text: buildSectionInstruction(copy, productMode, palette, typography, session.brand_style) },
    ]
    b64 = await generateImage(parts, 3, { aspectRatio: '9:16' })
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
