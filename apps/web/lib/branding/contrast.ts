import type { PaletteColor, BrandDna } from './types'

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
export interface TextPair { text: PaletteColor; on: PaletteColor; ratio: number }
// Sólo mira la paleta: aceptar el subconjunto permite validar una paleta suelta
// (ver palette-variants.ts) sin fabricar un ADN completo alrededor.
export function legalTextPairs(p: Pick<BrandDna, 'palette'>, min = 4.5): TextPair[] {
  const bgs = p.palette.filter(c => c.role === 'background' || c.role === 'neutral')
  const fgs = p.palette.filter(c => c.role !== 'background')
  return bgs.flatMap(on => fgs
    .map(text => ({ text, on, ratio: contrastRatio(text.hex, on.hex) }))
    .filter(x => x.ratio >= min))
    .sort((a, b) => b.ratio - a.ratio)
}
export function contrastToPrompt(p: BrandDna): string {
  const pairs = legalTextPairs(p)
  if (!pairs.length) return ''
  const best = pairs[0]
  const legal = pairs.slice(0, 3)
    .map(x => `${x.text.name} (${x.text.hex}) on ${x.on.name} (${x.on.hex})`)
    .join('; ')
  return `Legal text/background pairings: ${legal}. `
    + `The ingredient and net-weight microtext MUST use the highest-contrast pairing available: `
    + `${best.text.name} (${best.text.hex}) on ${best.on.name} (${best.on.hex}). `
    + `Never place text on a gradient, chrome, photographic or high-detail area.`
}
