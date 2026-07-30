/**
 * wireframe.ts
 * ---------------------------------------------------------------------------
 * Renderer determinista de wireframes de layout — reutilizable para cualquier
 * `ExtractedLayout`: el de una plantilla de producto (`TEMPLATE_DNA`) o el
 * `layout` EXTRAÍDO de la imagen que sube el usuario en modo upload
 * (`analyzeUploadedStyle` → `extracted.layout`).
 *
 * Mismo algoritmo: de `anatomy`, cada entrada con "(~N%)" es una banda; se
 * apilan de arriba a abajo, normalizadas a que sumen 100. Las entradas SIN
 * "(~N%)" no son banda: si mencionan filete/marco/enmarcando se dibuja un
 * borde rectangular interior; si mencionan "a sangre"/"sin marco" se omite.
 * ---------------------------------------------------------------------------
 */
import type { ExtractedLayout } from './types'

const W = 800
const H = 1000

const BAND_COLORS = ['#CFCFCF', '#BFBFBF']
const BAND_STROKE = '#8A8A8A'
const LABEL_COLOR = '#4A4A4A'
const BG = '#EEEEEE'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Extrae el % de banda de una entrada de anatomy, ej "banda superior (~15%): ..." → 15. null si no es banda. */
function bandPercent(entry: string): number | null {
  const m = entry.match(/\(~(\d+)%\)/)
  return m ? Number(m[1]) : null
}

/**
 * Suma de los "(~N%)" de las entradas bandeadas de `anatomy` — la misma extracción
 * que usa `buildWireframeSvg` para normalizar el wireframe. `layoutToPrompt` (types.ts)
 * NO normaliza: injecta `anatomy` crudo en el prompt real de generación, así que esta
 * suma es la señal de si el layout extraído realmente cubre el panel de arriba a abajo.
 * Usada por el gate del script de seed y por el test de integridad del manifiesto.
 */
export function anatomyBandSum(anatomy: string[]): number {
  return anatomy.reduce((s, entry) => s + (bandPercent(entry) ?? 0), 0)
}

/** 2-4 primeras palabras legibles de la entrada, limpias del "(~N%)" y de puntuación suelta. */
function zoneLabel(entry: string): string {
  const cleaned = entry.replace(/\(~\d+%\)/g, '')
  const words = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^[:,;.]+$/.test(w) && !/%/.test(w))
  return words.slice(0, 4).join(' ').replace(/[:,;.]+$/, '')
}

/** Offset % del borde interior si la anatomy menciona filete/marco/enmarcando (y no "a sangre"/"sin marco"). */
function frameOffsetPercent(anatomy: string[]): number | null {
  for (const entry of anatomy) {
    if (bandPercent(entry) !== null) continue // solo entradas sin banda
    const lower = entry.toLowerCase()
    const mentionsBleed = /a sangre|sin marco/.test(lower)
    const mentionsFrame = /filete|marco|enmarcando/.test(lower)
    if (mentionsBleed) return null
    if (mentionsFrame) {
      const m = entry.match(/~(\d+)%/)
      return m ? Number(m[1]) : 6
    }
  }
  return null
}

/** Construye el SVG determinista del wireframe de un layout. `footerLabel` es el texto al pie (styleId o nombre del producto). */
export function buildWireframeSvg(
  layout: ExtractedLayout,
  footerLabel: string,
): { svg: string; bandCount: number; totalPercent: number } {
  const bands = layout.anatomy
    .map((entry) => ({ entry, pct: bandPercent(entry) }))
    .filter((b): b is { entry: string; pct: number } => b.pct !== null)

  const totalPercent = bands.reduce((s, b) => s + b.pct, 0)
  const scale = totalPercent > 0 ? 100 / totalPercent : 1

  const padding = 20
  let y = 0
  const rects: string[] = []
  const labels: string[] = []

  bands.forEach((band, i) => {
    const heightPx = (band.pct * scale / 100) * H
    const color = BAND_COLORS[i % BAND_COLORS.length]
    rects.push(
      `<rect x="0" y="${y.toFixed(2)}" width="${W}" height="${heightPx.toFixed(2)}" fill="${color}" stroke="${BAND_STROKE}" stroke-width="2"/>`,
    )

    const label = escapeXml(zoneLabel(band.entry))
    const textY = y + heightPx / 2 + 5
    let textX: number
    let anchor: string
    if (layout.alignment === 'left') {
      textX = padding
      anchor = 'start'
    } else if (layout.alignment === 'justified') {
      textX = padding
      anchor = 'start'
    } else {
      textX = W / 2
      anchor = 'middle'
    }
    labels.push(
      `<text x="${textX}" y="${textY.toFixed(2)}" font-family="sans-serif" font-size="18" fill="${LABEL_COLOR}" text-anchor="${anchor}">${label}</text>`,
    )
    y += heightPx
  })

  const frameOffset = frameOffsetPercent(layout.anatomy)
  const frame =
    frameOffset !== null
      ? (() => {
          const ox = (frameOffset / 100) * W
          const oy = (frameOffset / 100) * H
          return `<rect x="${ox.toFixed(2)}" y="${oy.toFixed(2)}" width="${(W - 2 * ox).toFixed(2)}" height="${(H - 2 * oy).toFixed(2)}" fill="none" stroke="${BAND_STROKE}" stroke-width="3"/>`
        })()
      : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0" y="0" width="${W}" height="${H}" fill="${BG}"/>
  ${rects.join('\n  ')}
  ${labels.join('\n  ')}
  ${frame}
  <text x="${W / 2}" y="${H - 12}" font-family="sans-serif" font-size="14" fill="#777777" text-anchor="middle">${escapeXml(footerLabel)} — wireframe determinista</text>
</svg>`

  return { svg, bandCount: bands.length, totalPercent }
}

/** Renderiza el wireframe a PNG (sharp cargado dinámicamente: solo cuando se renderiza de verdad). */
export async function renderWireframePng(layout: ExtractedLayout, footerLabel: string): Promise<Buffer> {
  const { svg } = buildWireframeSvg(layout, footerLabel)
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(svg)).png().toBuffer()
}
