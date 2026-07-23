import { getPreset } from './style-presets'
import type { StylePreset } from './style-presets'
import { REF_MANIFEST } from './ref-manifest'
import type { BrandingSessionResponse } from './types'
import { fetchAsBase64 } from '@/lib/storage'
import type { BrandBrief } from './generation-prompts'
import type { Part } from '@google/genai'

const STORAGE_BASE = () =>
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!}/storage/v1/object/public/ad-uploads/branding-refs`

/** Las 5 URLs de Storage de las refs del estilo (siguen adjuntándose a Gemini como style refs). */
export function refUrls(styleId: string): string[] {
  const folder = getPreset(styleId).referenceFolder
  const files = REF_MANIFEST[folder] ?? []
  return files.map((f) => `${STORAGE_BASE()}/${folder}/${f}`)
}

/** Thumbnail generado (original, sin riesgo de copyright) para el picker. */
export function thumbUrl(styleId: string): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!}/storage/v1/object/public/ad-uploads/branding-refs/thumbnails/${styleId}.png`
}

/**
 * El StylePreset único que alimenta a generation-prompts.ts, en ambos modos.
 * Identidad fija: la paleta/tipografía SIEMPRE son las del preset (7 estilos
 * curados), sin overrides. Modo B (upload) es un clasificador: solo decide a
 * cuál de los 7 estilos se parece más la imagen del usuario (bestFitStyleId);
 * lo demás extraído de la imagen se descarta.
 */
export function resolveEffectivePreset(session: BrandingSessionResponse): StylePreset {
  if (!session.style_id) throw new Error('resolveEffectivePreset: falta style_id')
  if (session.source_mode === 'upload' && session.image_analysis) {
    return getPreset(session.image_analysis.bestFitStyleId)
  }
  return getPreset(session.style_id)
}

/** URL de Storage del wireframe (esqueleto de layout) del estilo. */
export function wireframeUrl(styleId: string): string {
  return `${STORAGE_BASE()}/wireframes/${styleId}.png`
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
      : session.style_id ? [...refUrls(session.style_id), wireframeUrl(session.style_id)] : []
  const parts: Part[] = []
  for (const url of urls) {
    try {
      const { data, mimeType } = await fetchAsBase64(url)
      parts.push({ inlineData: { mimeType, data } })
    } catch (e) {
      console.error('[styleRefParts] fetch', url, e)
      throw new Error(`No se pudo cargar la referencia: ${url}`)
    }
  }
  return parts
}
