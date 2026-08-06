/**
 * brief.ts — el modelo de las 4 decisiones del usuario y su persistencia.
 * ---------------------------------------------------------------------------
 * Vive en localStorage y se guarda en CADA paso: el botón atrás del navegador
 * y un F5 a mitad del brief no pueden perder lo respondido. No hay sesión en
 * DB hasta que se genera — el brief es del browser.
 * ---------------------------------------------------------------------------
 */

export type Category = 'suplementos' | 'skincare' | 'cabello' | 'mascotas' | 'bebida' | 'otro'

export interface Brief {
  category: Category
  productDescription: string
  brandName: string
  /** Eslogan. Opcional: vacío = lo inventa el modelo, como en el board de referencia. */
  tagline?: string
  audience: string[]
  /** Actitud de la marca (paso 4): chips + lo que escriba el usuario. */
  feel: string[]
  /** Las 4 casillas del prompt maestro que propone el LLM y edita el usuario (paso 5). */
  style: Style
  /** Con qué actitud se pidió la sugerencia. Evita re-llamar al LLM al volver al editor. */
  suggestedFor?: string
}

export const BRIEF_KEY = 'branding_brief'
/** Última marca generada. Sobrevive a "crear otra": es el historial de la tool. */
export const LAST_SESSION_KEY = 'branding_last_session'

export const BRAND_NAME_MIN = 2
export const BRAND_NAME_MAX = 30
export const DESCRIPTION_MIN = 10

/** Las 5 pantallas del brief, en orden. `STEPS[n].path` es la ruta del paso n+1. */
export const STEPS = [
  { path: '/tools/generador-branding/nuevo/que-vendes', title: '¿Qué vendes?' },
  { path: '/tools/generador-branding/nuevo/nombre', title: '¿Cómo se llama?' },
  { path: '/tools/generador-branding/nuevo/publico', title: '¿Para quién es?' },
  { path: '/tools/generador-branding/nuevo/vibra', title: '¿Qué debe transmitir?' },
  { path: '/tools/generador-branding/nuevo/estilo', title: 'Tu estilo' },
] as const

/** Chips de 1.1: el chip fija `category` y siembra un ejemplo CONCRETO y editable. */
export const CATEGORY_CHIPS: { category: Category; label: string; example: string }[] = [
  { category: 'suplementos', label: 'Suplementos', example: 'Cápsulas de magnesio para dormir mejor' },
  { category: 'skincare', label: 'Skincare', example: 'Sérum facial con vitamina C para piel grasa' },
  { category: 'cabello', label: 'Cuidado del cabello', example: 'Aceite de romero para la caída del cabello' },
  { category: 'mascotas', label: 'Mascotas', example: 'Snacks blandos de pollo para perros pequeños' },
  { category: 'bebida', label: 'Bienestar y bebidas funcionales', example: 'Bebida de cacao con adaptógenos para la tarde' },
  { category: 'otro', label: 'Otro', example: '' },
]

/** Opciones de 1.3 (hasta 3). Lista corta a propósito: es una decisión, no un formulario. */
export const AUDIENCE_TAGS = [
  'Mujeres de 25 a 40',
  'Hombres de 25 a 45',
  'Adultos mayores',
  'Deportistas',
  'Mamás primerizas',
  'Dueños de perros',
  'Dueños de gatos',
  'Piel sensible',
  'Vida de oficina',
  'Veganos y naturales',
]
export const AUDIENCE_MAX = 3

/* -------------------------------------------------------------------------
 * El estilo — las casillas del prompt maestro que no son preguntas del wizard.
 * ---------------------------------------------------------------------- */

/**
 * Las 2 casillas del prompt que el usuario no responde en el wizard. Es todo lo
 * que queda del "editor de estilo": el prompt maestro tiene 6 casillas y 4 salen
 * de las preguntas.
 */
export interface Style {
  /**
   * NOMBRES de color, no hex. El prompt que produjo los mejores boards decía
   * "bold orange, soft yellow, pure white, electric lime" y el modelo eligió los
   * valores; forzarle los hex lo obliga a acomodarlos y sale peor. Verificado
   * contra el probe del 2026-08-06.
   */
  palette: string[]
  /** "Inspired from". Corto y en español: lo lee y lo edita el usuario, y el modelo
   *  de imagen ya recibe el resto del brief en español sin problema. */
  inspiration: string
}

export const PALETTE_MIN = 3
export const PALETTE_MAX = 6

/** Punto de partida mientras llega la sugerencia. Vacío = el modelo decide todo. */
export const DEFAULT_STYLE: Style = { palette: [], inspiration: '' }

/**
 * Actitud (paso 4) — la casilla "Brand feel" del prompt maestro.
 *
 * UN adjetivo por chip, a propósito. Antes eran frases de 2-3 palabras porque la
 * actitud era la única dirección de arte que recibía el modelo; ahora el prompt
 * tiene casillas propias para inspiración y estilo gráfico, y esta pide
 * personalidad de marca. Tres chips daban siete tokens comprimidos que se leían
 * como una lista de keywords, no como el carácter de una marca.
 */
export const FEEL_CHIPS: { label: string; prompt: string }[] = [
  { label: 'Clínico', prompt: 'clinical' },
  { label: 'Lujoso', prompt: 'luxurious' },
  { label: 'Artesanal', prompt: 'handcrafted' },
  { label: 'Cálido', prompt: 'warm' },
  { label: 'Potente', prompt: 'bold' },
  { label: 'Sereno', prompt: 'calm' },
  { label: 'Juguetón', prompt: 'playful' },
  { label: 'Técnico', prompt: 'technical' },
  { label: 'Natural', prompt: 'natural' },
  { label: 'Nostálgico', prompt: 'nostalgic' },
  { label: 'Minimalista', prompt: 'minimal' },
  { label: 'Juvenil', prompt: 'youthful' },
  { label: 'Elegante', prompt: 'elegant' },
  { label: 'Honesto', prompt: 'honest' },
]
export const FEEL_TAGS = FEEL_CHIPS.map((c) => c.label)
export const FEEL_MAX = 3

/**
 * Las actitudes elegidas, en inglés, listas para un prompt. Lo que no es un chip
 * conocido es texto del usuario y pasa tal cual (el modelo entiende español).
 */
export function feelWords(feel: string[]): string {
  return feel
    .map((f) => FEEL_CHIPS.find((c) => c.label === f)?.prompt ?? f)
    .filter(Boolean)
    .join(', ')
}

export type PartialBrief = Partial<Brief>

/** Lee el brief guardado. Nunca lanza: un localStorage corrupto vale lo mismo que vacío. */
export function loadBrief(): PartialBrief {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(BRIEF_KEY)
    if (!raw) return {}
    const b = JSON.parse(raw) as PartialBrief
    return b && typeof b === 'object' ? b : {}
  } catch {
    return {}
  }
}

export function saveBrief(patch: PartialBrief): PartialBrief {
  const next = { ...loadBrief(), ...patch }
  try { window.localStorage.setItem(BRIEF_KEY, JSON.stringify(next)) } catch { /* modo privado */ }
  return next
}

export function saveLastSession(id: string): void {
  try { window.localStorage.setItem(LAST_SESSION_KEY, id) } catch { /* modo privado */ }
}

export function loadLastSession(): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(LAST_SESSION_KEY) } catch { return null }
}

export function clearBrief(): void {
  try { window.localStorage.removeItem(BRIEF_KEY) } catch { /* modo privado */ }
}

/* -------------------------------------------------------------------------
 * Validación — la misma para la UI y para el pipeline.
 * ---------------------------------------------------------------------- */

export function brandNameError(v: string): string | null {
  const n = v.trim().length
  if (n < BRAND_NAME_MIN) return `El nombre necesita al menos ${BRAND_NAME_MIN} caracteres.`
  if (n > BRAND_NAME_MAX) return `El nombre no puede pasar de ${BRAND_NAME_MAX} caracteres.`
  return null
}

export function descriptionError(v: string): string | null {
  return v.trim().length < DESCRIPTION_MIN ? `Descríbelo con al menos ${DESCRIPTION_MIN} caracteres.` : null
}

/**
 * Índice del primer paso incompleto (0..4), o 5 si el brief está entero.
 *
 * `!b.feel` y no `!b.feel?.length` a propósito: un array VACÍO cuenta como
 * respondido. Es lo que deja pasar a las sesiones anteriores al editor, que no
 * tienen actitud guardada — si no, su kit tiraría 400 al releerlas. El wizard
 * igual exige al menos un chip para dejar avanzar el paso 4.
 */
export function firstIncompleteStep(b: PartialBrief): number {
  if (!b.category || !b.productDescription || descriptionError(b.productDescription)) return 0
  if (!b.brandName || brandNameError(b.brandName)) return 1
  if (!b.audience?.length) return 2
  if (!b.feel) return 3
  if (!b.style) return 4
  return 5
}

export function isComplete(b: PartialBrief): b is Brief {
  return firstIncompleteStep(b) === 5
}

/** Hay algo respondido pero falta terminar → 6.0 ofrece retomar. */
export function isResumable(b: PartialBrief): boolean {
  return !isComplete(b) && Boolean(b.category || b.productDescription || b.brandName || b.audience?.length)
}

/** Dónde continuar: el primer paso incompleto, o el editor si ya está todo. */
export function resumePath(b: PartialBrief): string {
  return STEPS[Math.min(firstIncompleteStep(b), STEPS.length - 1)].path
}

/** Nombre de archivo seguro para el zip. Tildes y ñ se transliteran, no se pierden. */
export function brandSlug(brandName: string): string {
  const flat = brandName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return flat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marca'
}
