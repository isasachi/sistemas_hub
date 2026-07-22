import { getPreset } from './style-presets'
import type { StylePreset } from './style-presets'
import { REF_MANIFEST } from './ref-manifest'
import type { BrandingSessionResponse } from './types'
import { fetchAsBase64 } from '@/lib/storage'
import type { BrandBrief } from './generation-prompts'
import type { Part } from '@google/genai'

const STORAGE_BASE = () =>
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!}/storage/v1/object/public/ad-uploads/branding-refs`

/** Las 5 URLs de Storage de las refs del estilo. [0] es el thumbnail del picker. */
export function refUrls(styleId: string): string[] {
  const folder = getPreset(styleId).referenceFolder
  const files = REF_MANIFEST[folder] ?? []
  return files.map((f) => `${STORAGE_BASE()}/${folder}/${f}`)
}

/**
 * El StylePreset único que alimenta a generation-prompts.ts, en ambos modos.
 * Modo B: lo extraído de la imagen pisa el preset asignado (menos su meta).
 * selected_palette/typography (paso 3) pisan por encima de todo.
 */
export function resolveEffectivePreset(session: BrandingSessionResponse): StylePreset {
  if (!session.style_id) throw new Error('resolveEffectivePreset: falta style_id')
  const assigned = getPreset(session.style_id)
  const base: StylePreset =
    session.source_mode === 'upload' && session.image_analysis
      ? { ...assigned, ...session.image_analysis } // lo extraído pisa; id/index/name/referenceFolder quedan del asignado
      : assigned
  return {
    ...base,
    palette: session.selected_palette ?? base.palette,
    typography: session.selected_typography ?? base.typography,
  }
}

/** BrandBrief (input de generation-prompts) desde la sesión. */
export function sessionBrief(session: BrandingSessionResponse): BrandBrief {
  return {
    brandName: session.brand_name ?? 'Marca',
    productType: session.product_type ?? session.product_name ?? 'producto',
    descriptor: session.descriptor ?? undefined,
    tagline: session.tagline ?? undefined,
    containerType: session.container_type ?? session.container_desc ?? undefined,
  }
}

/**
 * Imágenes de referencia a adjuntar en la generación, cargadas UNA vez:
 * - modo upload → solo la imagen del usuario (fidelidad máxima al producto).
 * - modo preset → las 5 refs del estilo.
 */
export async function styleRefParts(session: BrandingSessionResponse): Promise<Part[]> {
  const urls =
    session.source_mode === 'upload' && session.uploaded_image_url
      ? [session.uploaded_image_url]
      : session.style_id ? refUrls(session.style_id) : []
  const parts: Part[] = []
  for (const url of urls) {
    try {
      const { data, mimeType } = await fetchAsBase64(url)
      parts.push({ inlineData: { mimeType, data } })
    } catch (e) { console.error('[styleRefParts] fetch', url, e) }
  }
  return parts
}
