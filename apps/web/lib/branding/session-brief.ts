import { isComplete, DEFAULT_STYLE, type Brief, type PartialBrief, type Style } from './brief'

/**
 * Fila de `branding_sessions` → Brief. La fila es la copia servidor del brief
 * (el original vive en localStorage); si le falta algo, no hay brief y quien
 * llama decide qué hacer.
 *
 * Las casillas del prompt maestro se guardan en columnas legadas que estaban sin
 * uso: `selected_palette` (jsonb), `direction` (jsonb) y `descriptor`/`tagline`
 * (text). Por eso las guardas de shape: `selected_palette` también la escribió un
 * style-picker de 2026-07 que se borró, y leer basura de ahí significa generar una
 * imagen PAGADA con un prompt roto.
 */

/**
 * Nombres de color. Tolera el shape viejo (`{name,hex}[]` del editor de hex, y
 * `{hex,name,role}[]` del style-picker de 2026-07): se queda con el nombre, que
 * es lo único que el prompt necesita.
 */
export function paletteFromRow(row: Record<string, unknown>): string[] | null {
  const p = row.selected_palette
  if (!Array.isArray(p) || !p.length) return null
  const out = p
    .map((c) => (typeof c === 'string' ? c : typeof (c as { name?: unknown })?.name === 'string' ? ((c as { name: string }).name) : ''))
    .filter((n): n is string => !!n.trim())
  return out.length ? out : null
}

export function styleFromRow(row: Record<string, unknown>): Style {
  const d = row.direction as { inspiration?: unknown } | null
  return {
    palette: paletteFromRow(row) ?? DEFAULT_STYLE.palette,
    inspiration: typeof d?.inspiration === 'string' ? d.inspiration : DEFAULT_STYLE.inspiration,
  }
}

export function briefFromRow(row: Record<string, unknown>): Brief | null {
  const b: PartialBrief = {
    category: (row.product_category as Brief['category']) ?? undefined,
    productDescription: (row.product_type as string) ?? undefined,
    brandName: (row.brand_name as string) ?? undefined,
    tagline: (row.tagline as string) || undefined,
    audience: row.target_audience ? String(row.target_audience).split(', ').filter(Boolean) : [],
    // Una sesión anterior al editor no tiene actitud: array vacío, que `isComplete`
    // acepta a propósito para que su kit siga descargándose.
    feel: row.descriptor ? String(row.descriptor).split(', ').filter(Boolean) : [],
    style: styleFromRow(row),
  }
  return isComplete(b) ? b : null
}
