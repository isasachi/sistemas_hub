import { getPreset } from './style-presets'
import type { StylePreset } from './style-presets'
import { REF_MANIFEST } from './ref-manifest'
import type { BrandingSessionResponse } from './types'

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
