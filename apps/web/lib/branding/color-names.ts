import { hslToHex } from '@/lib/landing/palette-derive'

/**
 * Nombre de color → hex, SOLO para previsualizar en el editor.
 * ---------------------------------------------------------------------------
 * Lo que viaja al prompt es el NOMBRE (ver `generation.ts`): el modelo elige los
 * valores y le salen mejores que los impuestos. Esto es una aproximación para que
 * el usuario no escriba a ciegas — la burbuja del editor, no la verdad.
 *
 * Las bases van en HSL y no en hex a propósito: los modificadores ("intenso",
 * "suave", "oscuro") son ajustes de saturación y luminosidad, que en HSL son una
 * suma y en hex serían una conversión de ida y vuelta.
 */

type HSL = [h: number, s: number, l: number]

const BASE: Record<string, HSL> = {
  // ── neutros ──
  blanco: [0, 0, 100], negro: [0, 0, 8], gris: [220, 4, 55], plata: [220, 6, 78],
  grafito: [220, 8, 26], carbon: [220, 6, 18], antracita: [220, 10, 22],
  marfil: [45, 40, 96], hueso: [40, 25, 93], perla: [40, 18, 92],
  crema: [40, 45, 92], arena: [36, 30, 80], beige: [38, 35, 85], taupe: [30, 10, 60],
  // ── cálidos ──
  rojo: [0, 85, 50], carmesi: [348, 80, 45], escarlata: [8, 88, 48],
  vino: [345, 60, 28], borgona: [345, 55, 25], granate: [350, 55, 32],
  naranja: [24, 95, 52], mandarina: [28, 92, 55], durazno: [22, 85, 78],
  coral: [12, 80, 66], salmon: [10, 70, 72], terracota: [16, 55, 50],
  ladrillo: [12, 50, 42], cobre: [22, 60, 48], oxido: [18, 65, 40],
  amarillo: [50, 95, 58], mostaza: [45, 70, 48], ocre: [40, 60, 48],
  dorado: [45, 75, 52], oro: [45, 75, 52], miel: [38, 78, 55], caramelo: [30, 65, 50],
  trigo: [42, 55, 78], mantequilla: [48, 80, 84],
  // ── verdes ──
  verde: [140, 55, 40], lima: [75, 95, 52], menta: [155, 45, 72],
  esmeralda: [155, 70, 36], jade: [160, 45, 42], oliva: [70, 40, 34],
  musgo: [95, 30, 32], pistacho: [80, 45, 66], bosque: [140, 45, 24],
  // ── fríos ──
  azul: [215, 75, 48], celeste: [200, 80, 70], cielo: [200, 80, 70],
  marino: [220, 65, 26], navy: [220, 65, 26], indigo: [240, 55, 40],
  turquesa: [178, 65, 48], aguamarina: [170, 55, 65], petroleo: [195, 45, 28],
  cian: [185, 80, 52],
  // ── morados y rosas ──
  violeta: [270, 60, 52], morado: [285, 55, 45], purpura: [290, 55, 40],
  lila: [270, 45, 76], lavanda: [265, 40, 80],
  rosa: [340, 75, 70], fucsia: [320, 85, 55], magenta: [318, 80, 50],
  // ── marrones ──
  marron: [25, 45, 32], cafe: [25, 40, 28], chocolate: [20, 45, 24],
  tabaco: [28, 40, 34], nude: [25, 40, 80],
  // ── inglés de uso común ──
  white: [0, 0, 100], black: [0, 0, 8], grey: [220, 4, 55], gray: [220, 4, 55],
  red: [0, 85, 50], orange: [24, 95, 52], yellow: [50, 95, 58], green: [140, 55, 40],
  blue: [215, 75, 48], teal: [178, 55, 40], purple: [285, 55, 45], pink: [340, 75, 70],
  brown: [25, 45, 32], gold: [45, 75, 52], silver: [220, 6, 78], cream: [40, 45, 92],
  ivory: [45, 40, 96], mint: [155, 45, 72], olive: [70, 40, 34], sand: [36, 30, 80],
  charcoal: [220, 6, 18], burgundy: [345, 55, 25],
}

/** Ajustes sobre [s, l]. Se aplican todos los que aparezcan en el nombre.
 *  En español y en inglés: la sugerencia pide nombres en español pero el usuario
 *  escribe lo que quiere, y "soft yellow" tiene que mover la burbuja igual. */
const MODIFIERS: [RegExp, (s: number, l: number) => [number, number]][] = [
  [/\b(neon|electrico|electrica|electric|fluor|fluorescente)\b/, (s, l) => [Math.min(100, s + 35), Math.min(72, l + 8)]],
  [/\b(intenso|intensa|vivo|viva|vibrante|brillante|puro|pura|fuerte|bold|bright|vivid|rich|strong)\b/, (s, l) => [Math.min(100, s + 18), l]],
  [/\b(suave|palido|palida|pastel|claro|clara|tenue|soft|pale|light)\b/, (s, l) => [Math.max(12, s - 22), Math.min(94, l + 18)]],
  [/\b(oscuro|oscura|profundo|profunda|intenso oscuro|dark)\b/, (s, l) => [s, Math.max(8, l - 22)]],
  [/\b(apagado|apagada|mate|grisaceo|grisacea|sucio|sucia|muted)\b/, (s, l) => [Math.max(6, s - 32), l]],
  [/\b(quemado|quemada|tostado|tostada|burnt)\b/, (s, l) => [Math.min(100, s + 6), Math.max(10, l - 14)]],
  [/\b(profundo|deep)\b/, (s, l) => [Math.min(100, s + 8), Math.max(8, l - 16)]],
]

/** minúsculas y sin tildes: "Lima Eléctrico" → "lima electrico". */
function normalize(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * El hex aproximado de un nombre, o `null` si no se reconoce ninguna palabra de
 * color. `null` es información: el editor pinta una burbuja vacía en vez de
 * inventar un color que el modelo no va a usar.
 */
export function colorFromName(name: string): string | null {
  const n = normalize(name)
  if (!n) return null

  // Gana la palabra que aparece MÁS TARDE: en español el matiz va después del
  // color genérico ("verde oliva" es oliva, "azul marino" es marino). Empate de
  // posición → la más larga.
  let base: HSL | null = null
  let bestAt = -1
  let bestLen = 0
  for (const [word, hsl] of Object.entries(BASE)) {
    const at = n.search(new RegExp(`\\b${word}\\b`))
    if (at === -1) continue
    if (at > bestAt || (at === bestAt && word.length > bestLen)) {
      base = hsl
      bestAt = at
      bestLen = word.length
    }
  }
  if (!base) return null

  let [h, s, l] = base
  for (const [re, apply] of MODIFIERS) {
    if (re.test(n)) [s, l] = apply(s, l)
  }
  return hslToHex(h, s, l)
}
