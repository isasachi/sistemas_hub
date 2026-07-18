import fs from 'fs'
import path from 'path'
import { TYPE_PAIRS, type TypePairId } from './typography-catalog'

// Cargador de fuentes (fs) — SERVER-ONLY. Separado del catálogo puro para que `types.ts`
// (y por ende el wizard cliente) pueda importar el enum sin arrastrar `fs` al bundle.

// Registro familia → archivos y los pesos bajo los que se registra cada buffer.
// Los display son heavy-only: su único .ttf se registra como 400 Y 700 (alias) para que
// cualquier fontWeight que pida el layout resuelva a un buffer real y no caiga a fallback
// silencioso (el modo #1 de "renderiza pero con otra fuente" en Satori). Los body traen
// pesos reales 400/700.
type FontSpec = { file: string; weights: number[] }
const FONT_FILES: Record<string, FontSpec[]> = {
  Poppins:            [{ file: 'Poppins-700.ttf',        weights: [400, 700] }],
  // Montserrat DR: pesos reales 700/800/900 — el layout usa 800 (headings) y 900 (precios).
  Montserrat:         [{ file: 'Montserrat-700.ttf',     weights: [400, 700] }, { file: 'Montserrat-800.ttf', weights: [800] }, { file: 'Montserrat-900.ttf', weights: [900] }],
  Inter:              [{ file: 'Inter-400.ttf',          weights: [400] }, { file: 'Inter-700.ttf', weights: [700] }],
  Nunito:             [{ file: 'Nunito-700.ttf',         weights: [400, 700] }],
  'Source Sans 3':    [{ file: 'SourceSans3-400.ttf',    weights: [400] }, { file: 'SourceSans3-700.ttf', weights: [700] }],
  'Playfair Display': [{ file: 'PlayfairDisplay-700.ttf', weights: [400, 700] }],
  Lato:               [{ file: 'Lato-400.ttf',           weights: [400] }, { file: 'Lato-700.ttf', weights: [700] }],
  'Archivo Black':    [{ file: 'ArchivoBlack-400.ttf',   weights: [400, 700] }],
  Roboto:             [{ file: 'Roboto-400.ttf',         weights: [400] }, { file: 'Roboto-700.ttf', weights: [700] }],
  'Space Grotesk':    [{ file: 'SpaceGrotesk-700.ttf',   weights: [400, 700] }],
  'Baloo 2':          [{ file: 'Baloo2-700.ttf',         weights: [400, 700] }],
  'Nunito Sans':      [{ file: 'NunitoSans-400.ttf',     weights: [400] }, { file: 'NunitoSans-700.ttf', weights: [700] }],
}

// Buffer cache a nivel de módulo — mismo patrón que el fs.readFileSync de lib/gemini.ts.
const bufCache = new Map<string, Buffer>()
function readFont(file: string): Buffer {
  let buf = bufCache.get(file)
  if (!buf) {
    buf = fs.readFileSync(path.join(process.cwd(), 'lib/landing/fonts', file))
    bufCache.set(file, buf)
  }
  return buf
}

// Fuente en el shape que espera ImageResponse (next/og). weight/style se matchean EXACTO
// contra el JSX; por eso el nombre de familia acá debe ser idéntico al fontFamily del layout.
type SatoriWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
export type SatoriFont = { name: string; data: Buffer; weight: SatoriWeight; style: 'normal' }

// Devuelve las fuentes (display + body) del par, listas para ImageResponse. display y body
// son familias distintas en todo el catálogo, así que no hay doble registro.
export function loadPairFonts(pairId: TypePairId): SatoriFont[] {
  const { display, body } = TYPE_PAIRS[pairId]
  return [display, body].flatMap((family) =>
    FONT_FILES[family].flatMap((spec) => {
      const data = readFont(spec.file)
      return spec.weights.map((weight) => ({ name: family, data, weight: weight as SatoriWeight, style: 'normal' as const }))
    }),
  )
}
