import { isComplete, DEFAULT_STYLE, type Brief, type PartialBrief, type Style } from './brief'

/**
 * Fila de `branding_sessions` → Brief. La fila es la copia servidor del brief
 * (el original vive en localStorage); si le falta algo, no hay brief y quien
 * llama decide qué hacer.
 */

/**
 * Las columnas `selected_palette`/`selected_typography` NO están vírgenes: las creó
 * un style-picker de 2026-07 que después se borró, así que hay filas con el shape
 * viejo (`PaletteColor[]` y `{primary,secondary,case,detail}`). Sin estas guardas,
 * `style.palette.primary` sale `undefined` y se genera una imagen PAGADA con basura.
 * Cualquier cosa que no calce cae al default.
 */
export function paletteFromRow(row: Record<string, unknown>): Style['palette'] | null {
  const p = row.selected_palette
  const ok = p && typeof p === 'object' && !Array.isArray(p) && typeof (p as Style['palette']).primary === 'string'
  return ok ? (p as Style['palette']) : null
}

export function typographyFromRow(row: Record<string, unknown>): Style['typography'] | null {
  const t = row.selected_typography as { display?: unknown; body?: unknown } | null
  return typeof t?.display === 'string' && typeof t?.body === 'string' ? (t as Style['typography']) : null
}

export function styleFromRow(row: Record<string, unknown>): Style {
  return {
    palette: paletteFromRow(row) ?? DEFAULT_STYLE.palette,
    typography: typographyFromRow(row) ?? DEFAULT_STYLE.typography,
  }
}

export function briefFromRow(row: Record<string, unknown>): Brief | null {
  const b: PartialBrief = {
    category: (row.product_category as Brief['category']) ?? undefined,
    productDescription: (row.product_type as string) ?? undefined,
    brandName: (row.brand_name as string) ?? undefined,
    audience: row.target_audience ? String(row.target_audience).split(', ').filter(Boolean) : [],
    // Una sesión anterior al editor no tiene actitud: array vacío, que `isComplete`
    // acepta a propósito para que su kit siga descargándose.
    feel: row.descriptor ? String(row.descriptor).split(', ').filter(Boolean) : [],
    style: styleFromRow(row),
    containerType: (row.container_type as string) || undefined,
  }
  return isComplete(b) ? b : null
}
