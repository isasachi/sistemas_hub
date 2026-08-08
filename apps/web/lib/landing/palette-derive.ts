import { contrastRatio } from '@/lib/branding/contrast'
import type { BrandSystem } from '@/lib/branding/brand-system'
import type { PaletteTokens, Polarity } from './types'
export type { Polarity }

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

// #RRGGBB → HSL. Inversa de `hslToHex`: la necesita el camino de MARCA, que recibe hex literales
// y tiene que moverles la luminosidad (degradado, ajuste de contraste) conservando tono y saturación.
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return { h: 0, s: 0, l: l * 100 }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// Ajusta la LUMINOSIDAD del titular hasta llegar a 7:1 sobre el fondo (QA#8), conservando tono y
// saturación.
//
// ⚠️ EL SIGNO DEPENDE DE LA POLARIDAD. La versión vieja siempre RESTABA (arrancaba en L=20 y bajaba
// de 3 en 3), lo cual solo funciona sobre fondo claro. Sobre fondo oscuro cada iteración empeoraba
// el contraste, el loop se agotaba contra su guard y devolvía un titular a ~1.5:1 SIN error — la
// garantía se evaporaba en silencio justo en el caso que la decisión #9 existe para servir.
function fitHeadline(h: number, s: number, startL: number, bg: string, polarity: Polarity): string {
  const step = polarity === 'dark' ? 3 : -3
  let l = startL
  let hex = hslToHex(h, s, l)
  // El guard corta en ambos extremos: sobre fondos de contraste imposible (un gris medio) devuelve
  // lo mejor alcanzable en vez de colgarse.
  while (l > 2 && l < 98 && contrastRatio(hex, bg) < 7) {
    l += step
    hex = hslToHex(h, s, l)
  }
  return hex
}

// Los 4 iconos son el tono base rotado: siempre distinguibles entre sí y siempre de la familia.
const ICON_OFFSETS = [0, 40, 130, 220]

// Separación mínima de L entre los dos extremos del degradado. Menos que esto se lee como fondo
// plano, que el DESIGN_SYSTEM prohíbe explícitamente.
const GRADIENT_DELTA = 8

// ─── Camino SIN marca (producto suelto) ──────────────────────────────────────
// Un solo hue extraído del envase por visión; todo lo demás se sintetiza. Es la ruta de las
// sesiones sin branding (decisión #7).
//
// La POLARIDAD también sale de la visión (2026-08-07, ampliación): el hue solo no la implica —
// un envase negro mate da un hue oscuro, pero además cae al fallback del nicho por baja saturación
// (s<12), así que sin un campo aparte la señal "esta marca es oscura" se perdía dos veces. Por eso
// viaja separada del color y sobrevive a ese fallback. Default 'light' = comportamiento histórico.
//
// Los extremos son SIMÉTRICOS (claro L90→L98, oscuro L12→L4): 8 puntos de separación en ambos,
// y el L12 del arranque oscuro deja lugar para bajar sin chocar contra el piso.
export function derivePalette(
  base: { h: number; s: number; l: number },
  polarity: Polarity = 'light',
): PaletteTokens {
  const H = base.h
  const dark = polarity === 'dark'
  const bg_start = hslToHex(H, clamp(base.s, 25, 45), dark ? 12 : 90)
  const color_headline = fitHeadline(H, clamp(base.s, 45, 70), dark ? 80 : 20, bg_start, polarity)
  return {
    color_headline,
    color_accent: hslToHex(H, clamp(base.s, 70, 95), 50),
    color_body: hexToRgba(color_headline, 0.7),
    bg_start,
    bg_end: hslToHex(H, 15, dark ? 4 : 98),
    // Misma razón que en el camino de marca: sobre fondo oscuro el titular es CLARO, y una
    // superficie blanca al 80% dejaría texto claro sobre blanco.
    color_surface: dark ? hslToHex(H, 20, 14) : '#FFFFFF',
    color_icon: ICON_OFFSETS.map((o) => hslToHex(H + o, 58, 80)),
    polarity,
  }
}

// ─── Camino CON marca (decisión #2 opción A: mapeo por roles) ────────────────
// Los hex de la marca se usan LITERALES donde se notan (fondo, acento) y solo se les mueve la
// luminosidad donde hay una garantía que respetar (titular ≥7:1) o donde hace falta un compañero de
// degradado. El tono de marca nunca se reemplaza.
function roleHex(brand: BrandSystem, role: string): string | undefined {
  return brand.palette.find((c) => c.role === role)?.hex
}

export function paletteFromBrand(brand: BrandSystem): PaletteTokens {
  const polarity = brand.polarity
  // `background` está garantizado por el schema (refine); los demás caen en cascada.
  const bg_start = roleHex(brand, 'background')!
  const primary = roleHex(brand, 'primary') ?? roleHex(brand, 'accent') ?? bg_start
  // Sin rol `accent` (el schema admite una paleta de 2) no se puede caer al primary: el titular
  // sale del primary, así que la palabra-acento quedaría del MISMO color que el resto del titular
  // y el énfasis desaparecería sin que nada avise. Se sintetiza rotando el tono y saturando.
  const accent = roleHex(brand, 'accent') ?? (() => {
    const p = hexToHsl(primary)
    return hslToHex(p.h + 30, Math.max(p.s, 70), 50)
  })()

  const bgHsl = hexToHsl(bg_start)
  // El compañero del degradado se separa 8 puntos de L y baja la saturación — misma RELACIÓN que
  // tenía el camino sintético (L90→L98 en claro), ahora anclada al color real de la marca.
  //
  // ⚠️ Se aleja del centro SI HAY LUGAR, y si no se acerca. Un `Math.max(4, l-8)` colapsaba: una
  // marca casi negra (#0B0B0F, L≈5) daba L5→L4, un punto de diferencia = el "negro plano de
  // estudio" que el propio prompt prohíbe. Con el rebote, esa marca da L5→L13: profundidad
  // atmosférica en vez de una plancha.
  const away = polarity === 'dark' ? bgHsl.l - GRADIENT_DELTA : bgHsl.l + GRADIENT_DELTA
  const endL = away >= 4 && away <= 98 ? away : polarity === 'dark' ? bgHsl.l + GRADIENT_DELTA : bgHsl.l - GRADIENT_DELTA
  const bg_end = hslToHex(bgHsl.h, Math.min(bgHsl.s, 15), clamp(endL, 4, 98))

  // El titular arranca del PRIMARY de la marca y solo se le mueve L hasta cumplir 7:1.
  const pHsl = hexToHsl(primary)
  const startL = polarity === 'dark' ? Math.max(pHsl.l, 80) : Math.min(pHsl.l, 20)
  const color_headline = fitHeadline(pHsl.h, pHsl.s, startL, bg_start, polarity)

  return {
    color_headline,
    color_accent: accent,
    color_body: hexToRgba(color_headline, 0.7),
    bg_start,
    bg_end,
    // Sobre marca oscura el titular es CLARO, así que una superficie blanca al 80% dejaría texto
    // claro sobre blanco. La superficie sigue a la polaridad para que la card siga siendo legible.
    color_surface: polarity === 'dark' ? hslToHex(bgHsl.h, 20, 14) : '#FFFFFF',
    color_icon: ICON_OFFSETS.map((o) => hslToHex(hexToHsl(accent).h + o, 58, 80)),
    polarity,
  }
}

// ─── Oro (decisión #6) ───────────────────────────────────────────────────────
// El oro es invariante SALVO que la marca sea dorada: ahí marca y oro se confundirían y se pierde
// la regla de significado (marca = confianza, oro = dinero/urgencia). La distinción ya cabalga sobre
// el TRATAMIENTO (degradado metálico + corona/cinta/sello), no solo sobre el tono, así que en ese
// caso la rampa se corre a cobre/bronce profundo y el tratamiento metálico se mantiene.
export const GOLD = { dark: '#B8860B', light: '#F5D372', name: 'dorado' }
export const COPPER = { dark: '#7A3B12', light: '#C87137', name: 'cobre' }

// Mira TODA la identidad, no solo el acento: la marca real "Protin" (probe 2026-08-07) tiene
// primary dorado #BD9E4D y accent rojo — con el acento solo, el oro no se corría y quedaba
// indistinguible del color dominante de la marca, que es exactamente lo que la regla evita.
// El umbral de saturación es 40 (no 50) porque ese dorado real da s≈46; un beige apagado
// (s<15) sigue sin disparar.
const isGolden = (hex: string) => {
  const { h, s } = hexToHsl(hex)
  return h >= 35 && h <= 55 && s > 40
}

export function moneyRamp(p: Pick<PaletteTokens, 'color_accent' | 'color_headline'>): { dark: string; light: string; name: string } {
  return isGolden(p.color_accent) || isGolden(p.color_headline) ? COPPER : GOLD
}
