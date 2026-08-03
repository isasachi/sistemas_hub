import { isComplete, type Brief, type PartialBrief } from './brief'
import { isPresetId } from './presets'

/**
 * Fila de `branding_sessions` → Brief. La fila es la copia servidor del brief
 * (el original vive en localStorage); si le falta algo, no hay brief y quien
 * llama decide qué hacer.
 */
export function briefFromRow(row: Record<string, unknown>): Brief | null {
  const b: PartialBrief = {
    category: (row.product_category as Brief['category']) ?? undefined,
    productDescription: (row.product_type as string) ?? undefined,
    brandName: (row.brand_name as string) ?? undefined,
    audience: row.target_audience ? String(row.target_audience).split(', ').filter(Boolean) : [],
    presetId: isPresetId(String(row.style_id ?? '')) ? (row.style_id as Brief['presetId']) : undefined,
  }
  return isComplete(b) ? b : null
}
