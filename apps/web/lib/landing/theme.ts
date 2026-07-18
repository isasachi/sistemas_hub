import type { LandingPalette } from './types'
import { TYPE_PAIRS, type TypePairId } from './typography-catalog'

// Traduce paleta de marca + par tipográfico a tokens planos que consumen los layouts de
// composición. El DORADO se fija ACÁ, una sola vez, y NO es configurable por marca
// (invariante #4: oro exclusivamente para valor / urgencia / confianza).
export type ThemeTokens = {
  accent: string
  accentSoft: string
  surface: string        // relleno del glass simulado (Camino A)
  surfaceBorder: string  // borde superior claro de 1px
  textPrimary: string
  textMuted: string
  gold: string
  goldDark: string
  fonts: { display: string; body: string }
}

// Oro metálico cálido — fijo (invariante #4). Gradiente gold→goldDark en los devices.
const GOLD = '#F1C15A'
const GOLD_DARK = '#A97B2E'

// Elige el accent: la primera entrada de la paleta cuyo usage mencione "accent"/"cta"/
// "primary", o la primera a secas. La paleta viene validada (>=1) por LandingStyleSchema.
function pickAccent(palette: LandingPalette): string {
  const tagged = palette.find((c) => /accent|cta|primary|principal/i.test(c.usage ?? ''))
  return (tagged ?? palette[0]).hex
}

export function buildTheme(palette: LandingPalette, pairId: TypePairId): ThemeTokens {
  const accent = pickAccent(palette)
  const pair = TYPE_PAIRS[pairId]
  return {
    accent,
    accentSoft: `${accent}22`,
    // Glass Camino A: relleno blanco semitransparente + borde superior claro. Sobre la
    // atmósfera etérea que genera Gemini lee como frosted glass sin backdrop-filter.
    surface: 'rgba(255,255,255,0.14)',
    surfaceBorder: 'rgba(255,255,255,0.45)',
    // Atmósfera luminosa del ADN → texto oscuro sobre glass claro.
    textPrimary: '#101828',
    textMuted: '#475467',
    gold: GOLD,
    goldDark: GOLD_DARK,
    fonts: { display: pair.display, body: pair.body },
  }
}
