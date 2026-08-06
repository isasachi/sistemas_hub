import { isComplete, DEFAULT_STYLE, type Brief, type PartialBrief, type Style, type Swatch } from './brief'

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

export function paletteFromRow(row: Record<string, unknown>): Swatch[] | null {
  const p = row.selected_palette
  if (!Array.isArray(p) || !p.length) return null
  const out = p
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .filter((c) => typeof c.hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.hex as string))
    .map((c) => ({ name: typeof c.name === 'string' && c.name ? (c.name as string) : (c.hex as string), hex: c.hex as string }))
  return out.length ? out : null
}

function directionFromRow(row: Record<string, unknown>): Pick<Style, 'inspiration' | 'graphicStyle' | 'products'> | null {
  const d = row.direction as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out = { inspiration: str(d.inspiration), graphicStyle: str(d.graphicStyle), products: str(d.products) }
  return out.inspiration || out.graphicStyle || out.products ? out : null
}

export function styleFromRow(row: Record<string, unknown>): Style {
  return {
    palette: paletteFromRow(row) ?? DEFAULT_STYLE.palette,
    ...(directionFromRow(row) ?? {
      inspiration: DEFAULT_STYLE.inspiration,
      graphicStyle: DEFAULT_STYLE.graphicStyle,
      products: DEFAULT_STYLE.products,
    }),
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
