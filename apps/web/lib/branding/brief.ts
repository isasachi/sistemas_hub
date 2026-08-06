/**
 * brief.ts — el modelo de las 4 decisiones del usuario y su persistencia.
 * ---------------------------------------------------------------------------
 * Vive en localStorage y se guarda en CADA paso: el botón atrás del navegador
 * y un F5 a mitad del brief no pueden perder lo respondido. No hay sesión en
 * DB hasta que se genera — el brief es del browser.
 * ---------------------------------------------------------------------------
 */

import type { Category, PresetId } from './presets'
import { isPresetId } from './presets'

export interface Brief {
  category: Category
  productDescription: string
  brandName: string
  audience: string[]
  presetId: PresetId
  /** Envase del mockup. Opcional a propósito: NO es una quinta pregunta — se
   *  ajusta en la confirmación y, si queda vacío, lo decide el estilo. */
  containerType?: string
}

export const BRIEF_KEY = 'branding_brief'
/** Última marca generada. Sobrevive a "crear otra": es el historial de la tool. */
export const LAST_SESSION_KEY = 'branding_last_session'

export const BRAND_NAME_MIN = 2
export const BRAND_NAME_MAX = 30
export const DESCRIPTION_MIN = 10

/** Las 4 pantallas del brief, en orden. `STEPS[n].path` es la ruta de la pregunta n+1. */
export const STEPS = [
  { path: '/tools/generador-branding/nuevo/que-vendes', title: '¿Qué vendes?' },
  { path: '/tools/generador-branding/nuevo/nombre', title: '¿Cómo se llama?' },
  { path: '/tools/generador-branding/nuevo/publico', title: '¿Para quién es?' },
  { path: '/tools/generador-branding/nuevo/estilo', title: 'Elige el estilo' },
] as const

export const CONFIRM_PATH = '/tools/generador-branding/nuevo/confirmar'

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

/** Envases de la confirmación. Vacío = el que sugiera el estilo. */
export const CONTAINERS = [
  'Frasco con gotero',
  'Pote',
  'Doypack',
  'Lata',
  'Tubo',
  'Botella',
  'Caja',
  'Sobre / sachet',
]

/* -------------------------------------------------------------------------
 * El estilo — ya no se elige de una lista, se compone por marca.
 * ---------------------------------------------------------------------- */

/** Los 5 roles son fijos: el PDF del brandboard y el .txt del kit cuentan con ellos. */
export interface Style {
  palette: { primary: string; secondary: string; accent: string; dark: string; light: string }
  typography: { display: string; body: string }
}

export interface FontGroup { label: string; fonts: readonly string[] }

/**
 * Catálogo CERRADO de tipografías. Cerrado por dos motivos: el editor tiene que
 * poder cargarlas para previsualizarlas, y el schema de la sugerencia las usa como
 * enum — una familia inventada por el modelo es una familia que no existe.
 * Todas son Google Fonts; el editor inyecta el <link> con las que hagan falta.
 */
export const DISPLAY_GROUPS: readonly FontGroup[] = [
  { label: 'Serif de alto contraste', fonts: ['Playfair Display', 'Cormorant Garamond', 'Prata', 'DM Serif Display', 'Abril Fatface'] },
  { label: 'Serif con carácter', fonts: ['Fraunces', 'Bitter', 'Libre Baskerville', 'Lora', 'Crimson Pro'] },
  { label: 'Sans geométrica', fonts: ['Poppins', 'Montserrat', 'Outfit', 'Sora', 'Jost'] },
  { label: 'Sans técnica', fonts: ['Space Grotesk', 'Archivo', 'Manrope', 'Inter'] },
  { label: 'Condensada e impacto', fonts: ['Oswald', 'Anton', 'Bebas Neue', 'Archivo Black'] },
  { label: 'Redondeada', fonts: ['Nunito', 'Quicksand', 'Baloo 2'] },
]

/** Corto a propósito: una condensada o una serif de alto contraste a 13px no se lee. */
export const BODY_GROUPS: readonly FontGroup[] = [
  { label: 'Sans legible', fonts: ['Inter', 'Lato', 'Source Sans 3', 'Work Sans', 'Karla', 'Rubik', 'IBM Plex Sans', 'Nunito Sans', 'Mulish', 'Poppins'] },
  { label: 'Serif legible', fonts: ['Lora', 'Crimson Pro', 'Libre Baskerville'] },
]

export const DISPLAY_FONTS: string[] = DISPLAY_GROUPS.flatMap((g) => [...g.fonts])
export const BODY_FONTS: string[] = BODY_GROUPS.flatMap((g) => [...g.fonts])
/** Sin repetir: es la lista que va al <link> de Google Fonts del editor. */
export const ALL_FONTS: string[] = [...new Set([...DISPLAY_FONTS, ...BODY_FONTS])]

/**
 * La hoja de Google Fonts del catálogo. `wght@400;700` es seguro incluso para las
 * 6 familias de un solo peso (Prata, DM Serif Display, Abril Fatface, Anton, Bebas
 * Neue, Archivo Black): la API sirve los pesos que existan e ignora los que no, en
 * vez de rechazar la hoja entera — verificado contra la API el 2026-08-05. NO
 * "arreglar" esto quitando el 700 ni armando una tabla de pesos por familia.
 */
export function fontsHref(families: string[] = ALL_FONTS): string {
  return 'https://fonts.googleapis.com/css2?'
    + families.map((f) => `family=${encodeURIComponent(f)}:wght@400;700`).join('&')
    + '&display=swap'
}

/**
 * Punto de partida neutro. NO es un preset: es lo más aburrido posible, a propósito.
 * Se usa mientras llega la sugerencia, si la sugerencia falla, y al releer sesiones
 * anteriores al editor (que no tienen paleta guardada).
 */
export const DEFAULT_STYLE: Style = {
  palette: { primary: '#F4F1EC', secondary: '#D6CFC4', accent: '#B4643C', dark: '#1C1917', light: '#FFFFFF' },
  typography: { display: 'Fraunces', body: 'Inter' },
}

/**
 * Actitud (paso 4). Es TODA la dirección de arte que recibe el modelo de imagen —
 * reemplaza a los bloques de estilo fijos que hacían que todas las marcas salieran
 * iguales. Las palabras en inglés son deliberadamente pocas: material, luz y
 * composición quedan sin especificar para que el modelo los varíe por marca.
 */
export const FEEL_CHIPS: { label: string; prompt: string }[] = [
  { label: 'Clínico', prompt: 'clinical, precise' },
  { label: 'Lujoso', prompt: 'luxurious, refined' },
  { label: 'Artesanal', prompt: 'handcrafted, artisanal' },
  { label: 'Cálido', prompt: 'warm, inviting' },
  { label: 'Potente', prompt: 'bold, high-impact' },
  { label: 'Sereno', prompt: 'calm, quiet' },
  { label: 'Juguetón', prompt: 'playful, cheerful' },
  { label: 'Técnico', prompt: 'technical, engineered' },
  { label: 'Natural', prompt: 'natural, botanical' },
  { label: 'Nostálgico', prompt: 'nostalgic, vintage' },
  { label: 'Minimalista', prompt: 'minimal, stripped back' },
  { label: 'Juvenil', prompt: 'youthful, energetic' },
  { label: 'Elegante', prompt: 'elegant, understated' },
  { label: 'Honesto', prompt: 'honest, no-nonsense' },
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

/** Índice del primer paso incompleto (0..3), o 4 si el brief está entero. */
export function firstIncompleteStep(b: PartialBrief): number {
  if (!b.category || !b.productDescription || descriptionError(b.productDescription)) return 0
  if (!b.brandName || brandNameError(b.brandName)) return 1
  if (!b.audience?.length) return 2
  if (!b.presetId || !isPresetId(b.presetId)) return 3
  return 4
}

export function isComplete(b: PartialBrief): b is Brief {
  return firstIncompleteStep(b) === 4
}

/** Hay algo respondido pero falta terminar → 6.0 ofrece retomar. */
export function isResumable(b: PartialBrief): boolean {
  return !isComplete(b) && Boolean(b.category || b.productDescription || b.brandName || b.audience?.length)
}

/** Dónde continuar: el primer paso incompleto, o la confirmación si ya está todo. */
export function resumePath(b: PartialBrief): string {
  const n = firstIncompleteStep(b)
  return n === 4 ? CONFIRM_PATH : STEPS[n].path
}

/** Nombre de archivo seguro para el zip. Tildes y ñ se transliteran, no se pierden. */
export function brandSlug(brandName: string): string {
  const flat = brandName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return flat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marca'
}
