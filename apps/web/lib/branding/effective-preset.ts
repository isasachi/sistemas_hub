import { getPreset } from './style-presets'
import { REF_MANIFEST } from './ref-manifest'

const STORAGE_BASE = () =>
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!}/storage/v1/object/public/ad-uploads/branding-refs`

/** Las 5 URLs de Storage de las refs del estilo. [0] es el thumbnail del picker. */
export function refUrls(styleId: string): string[] {
  const folder = getPreset(styleId).referenceFolder
  const files = REF_MANIFEST[folder] ?? []
  return files.map((f) => `${STORAGE_BASE()}/${folder}/${f}`)
}
