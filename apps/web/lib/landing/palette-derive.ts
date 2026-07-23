import { contrastRatio } from '@/lib/branding/contrast'
import type { PaletteTokens } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// HSL (H 0-360, S/L 0-100) → #RRGGBB.
export function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100, L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = L - c / 2
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r1)}${to(g1)}${to(b1)}`.toUpperCase()
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function derivePalette(base: { h: number; s: number; l: number }): PaletteTokens {
  const H = base.h
  const bg_start = hslToHex(H, clamp(base.s, 25, 45), 90)
  // headline: arranca en L=20, baja de 3 en 3 hasta contraste ≥7:1 sobre bg_start (QA#8).
  let hl = 20
  let color_headline = hslToHex(H, clamp(base.s, 45, 70), hl)
  while (hl > 2 && contrastRatio(color_headline, bg_start) < 7) {
    hl -= 3
    color_headline = hslToHex(H, clamp(base.s, 45, 70), hl)
  }
  const iconOffsets = [0, 40, 130, 220]
  return {
    color_headline,
    color_accent: hslToHex(H, clamp(base.s, 70, 95), 50),
    color_body: hexToRgba(color_headline, 0.7),
    bg_start,
    bg_end: hslToHex(H, 15, 98),
    color_surface: '#FFFFFF',
    color_icon: iconOffsets.map((o) => hslToHex(H + o, 58, 80)),
  }
}
