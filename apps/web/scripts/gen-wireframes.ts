/**
 * Genera 1 wireframe DETERMINISTA por estilo (7 total) — la pieza clave de
 * consistencia compositiva de la migración fase 1. NO usa Gemini: dibuja el
 * esqueleto de `LABEL_LAYOUTS[styleId].anatomy` como bandas horizontales en
 * escala de grises con `sharp`, y lo sube a `branding-refs/wireframes/<styleId>.png`.
 *
 * Algoritmo (ver .superpowers/sdd/phase1-assets-brief.md §1.3):
 *  - Lienzo retrato 4:5 (800×1000), fondo #EEEEEE.
 *  - De `anatomy`, cada entrada con un "(~N%)" es una banda; se apilan de
 *    arriba a abajo, normalizadas a que sumen 100 (= alto del lienzo).
 *  - Las entradas SIN "(~N%)" no son banda: si mencionan
 *    filete/marco/enmarcando se dibuja un borde rectangular interior; si
 *    mencionan "a sangre"/"sin marco" se omite (full-bleed, sin marco).
 *  - Cada banda: relleno gris alternado, borde fino, etiqueta con las 2-4
 *    primeras palabras de la entrada (limpias del "(~N%)"), alineada según
 *    `alignment` (left/centered/justified).
 *
 * Uso:  set -a && source .env.local && set +a && npx tsx scripts/gen-wireframes.ts
 */
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { LABEL_LAYOUTS } from '../lib/branding/label-layouts'

const BUCKET = 'ad-uploads'
const PREFIX = 'branding-refs/wireframes'
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

function buildSvg(styleId: string): { svg: string; bandCount: number; totalPercent: number } {
  const layout = LABEL_LAYOUTS[styleId]
  if (!layout) throw new Error(`sin layout para ${styleId}`)

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
  <text x="${W / 2}" y="${H - 12}" font-family="sans-serif" font-size="14" fill="#777777" text-anchor="middle">${escapeXml(styleId)} — wireframe determinista</text>
</svg>`

  return { svg, bandCount: bands.length, totalPercent }
}

async function main() {
  const storage = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ).storage.from(BUCKET)

  console.log('== Wireframes deterministas ==')
  const ids = Object.keys(LABEL_LAYOUTS)
  for (const styleId of ids) {
    const { svg, bandCount, totalPercent } = buildSvg(styleId)
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const path = `${PREFIX}/${styleId}.png`
    const { error } = await storage.upload(path, png, { contentType: 'image/png', upsert: true })
    if (error) throw new Error(`upload ${path}: ${error.message}`)
    console.log(`  OK ${styleId}: ${bandCount} bandas, ${totalPercent}% total (normalizado a 100)`)
  }
  console.log(`\nOK — ${ids.length} wireframes generados y subidos.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
