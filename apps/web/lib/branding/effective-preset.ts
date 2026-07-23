import { getPreset } from './style-presets'
import type { StylePreset } from './style-presets'
import { REF_MANIFEST } from './ref-manifest'
import type { LabelLayout } from './label-layouts'
import { getLayout } from './label-layouts'
import type { BrandingSessionResponse, ExtractedStyle } from './types'
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
 * Construye un StylePreset ad-hoc desde lo extraído de la imagen del usuario
 * (identidad completa: paleta, tipografía, materiales, composición, lighting,
 * mood, motifs, avoid, styleBlock — todo derivado de la imagen real, no de un
 * preset fijo). `referenceFolder: ''` porque el modo upload no adjunta refs
 * de estilo de ningún preset — adjunta la imagen del usuario (ver `identityRefParts`).
 */
function extractedToPreset(a: ExtractedStyle): StylePreset {
  return {
    id: 'upload',
    index: 0,
    name: 'Tu producto',
    version: 1,
    essence: a.essence,
    keywords: a.keywords,
    palette: a.palette as StylePreset['palette'],
    typography: a.typography as StylePreset['typography'],
    materials: a.materials,
    composition: a.composition,
    lighting: a.lighting,
    mood: a.mood,
    motifs: a.motifs,
    avoid: a.avoid,
    styleBlock: a.styleBlock,
    referenceFolder: '',
  }
}

/**
 * El StylePreset único que alimenta a generation-prompts.ts, en ambos modos.
 * Modo preset: identidad fija, la paleta/tipografía son las del preset curado.
 * Modo upload: EXTRACTOR — la identidad es la extraída de la imagen real del
 * usuario (`extractedToPreset`), no la de ningún preset fijo.
 */
export function resolveEffectivePreset(session: BrandingSessionResponse): StylePreset {
  if (!session.style_id) throw new Error('resolveEffectivePreset: falta style_id')
  // Guard: solo un análisis COMPLETO (con paleta+tipografía) sirve como estilo extraído.
  // Filas legadas de upload (esquema reducido pre-extractor) caen al preset bestFit.
  if (session.source_mode === 'upload' && session.image_analysis?.palette?.length && session.image_analysis?.typography) {
    return extractedToPreset(session.image_analysis)
  }
  return getPreset(session.style_id)
}

/**
 * El LabelLayout efectivo, en ambos modos. Modo upload: el layout extraído de
 * la imagen real (misma forma que `LabelLayout`). Modo preset: el esqueleto
 * fijo de `label-layouts.ts`.
 */
export function resolveEffectiveLayout(session: BrandingSessionResponse): LabelLayout {
  if (!session.style_id) throw new Error('resolveEffectiveLayout: falta style_id')
  if (session.source_mode === 'upload' && session.image_analysis?.layout) {
    return session.image_analysis.layout
  }
  return getLayout(session.style_id)
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
 * Refs de identidad SIN wireframe (para el logo, y como contexto de estilo en
 * el resto de pasos): modo upload → la imagen del usuario; modo preset → las
 * 5 refs del estilo.
 */
export async function identityRefParts(session: BrandingSessionResponse): Promise<Part[]> {
  const urls = session.source_mode === 'upload' && session.uploaded_image_url
    ? [session.uploaded_image_url]
    : session.style_id ? refUrls(session.style_id) : []
  return fetchParts(urls)
}

/** El wireframe (esqueleto de layout): el del preset, o el extraído del upload. */
export async function wireframeRefParts(session: BrandingSessionResponse): Promise<Part[]> {
  const url = session.source_mode === 'upload'
    ? session.uploaded_wireframe_url
    : session.style_id ? wireframeUrl(session.style_id) : null
  return url ? fetchParts([url]) : []
}

/** Una imagen ya generada (logo_url / label_url del paso anterior) como Part. */
export async function imageRefParts(url: string | null): Promise<Part[]> {
  return url ? fetchParts([url]) : []
}

/** FAIL-LOUD: un fetch fallido debe abortar la generación, no seguir con refs a medias. */
async function fetchParts(urls: string[]): Promise<Part[]> {
  const parts: Part[] = []
  for (const url of urls) {
    try {
      const { data, mimeType } = await fetchAsBase64(url)
      parts.push({ inlineData: { mimeType, data } })
    } catch (e) {
      console.error('[fetchParts]', url, e)
      throw new Error(`No se pudo cargar la referencia: ${url}`)
    }
  }
  return parts
}
