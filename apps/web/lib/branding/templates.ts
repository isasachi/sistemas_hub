/**
 * templates.ts
 * ---------------------------------------------------------------------------
 * Catálogo de las 30 plantillas de producto (5 categorías × 6) y el matching
 * determinista que usa la galería. Este archivo se escribe A MANO: `id`,
 * `productType` y `keywords` salen del nombre del producto, no de la imagen.
 *
 * Lo que SÍ sale de la imagen (el ADN, el layout, la paleta y el containerType)
 * vive en `template-dna.ts`, que genera `scripts/seed-branding-templates.ts`.
 *
 * El matching es a propósito determinista y sin LLM: contra 6 candidatos por
 * categoría una llamada sería costo sin ganancia. Si el resaltado queda pobre
 * en uso real, la mejora es agregar keywords acá, no cambiar de mecanismo.
 * ---------------------------------------------------------------------------
 */
import type { ExtractedStyle, PaletteColor } from './types'

export const CATEGORIES = [
  { id: 'belleza', name: 'Belleza y cuidado personal' },
  { id: 'salud', name: 'Salud y bienestar' },
  { id: 'mascotas', name: 'Mascotas' },
  { id: 'cocina', name: 'Cocina' },
  { id: 'celulares', name: 'Accesorios para celulares' },
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export interface TemplateMeta {
  /** id estable, `<categoryId>/<producto>` */
  id: string
  categoryId: CategoryId
  /** el producto que ES la plantilla — base de la detección clonar/traspasar */
  productType: string
  /** sinónimos y términos con los que un usuario describiría este producto */
  keywords: string[]
  /** Sinónimos del SUSTANTIVO NÚCLEO — sólo los que nombran el mismo producto.
   *  `keywords` es ancho a propósito (atributos, síntomas) para el resaltado;
   *  esto es angosto a propósito, porque decide clonar vs traspasar. */
  synonyms?: string[]
  /** nombre del archivo original, tal cual vino de `branding_final/` */
  file: string
}

/** El ADN extraído de la foto de una plantilla. Lo puebla `template-dna.ts`. */
export interface TemplateDna {
  /** identidad + layout extraídos de la imagen */
  dna: ExtractedStyle
  /** envase/soporte leído de la imagen — alimenta el prompt de mockup */
  containerType: string
  /** exactamente 3; la [0] es la paleta de la foto original */
  palettes: PaletteColor[][]
}

export const TEMPLATES: TemplateMeta[] = [
  // ── 1. Belleza y cuidado personal ──────────────────────────────────────────
  { id: 'belleza/aceite-capilar', categoryId: 'belleza', productType: 'aceite capilar',
    keywords: ['aceite', 'capilar', 'cabello', 'pelo', 'puntas', 'crecimiento', 'argan'],
    file: '1_belleza_y_cuidado_personal/aceite_capilar.png' },
  { id: 'belleza/crema-hidratante', categoryId: 'belleza', productType: 'crema hidratante',
    keywords: ['crema', 'hidratante', 'humectante', 'nutritiva', 'facial', 'corporal'],
    file: '1_belleza_y_cuidado_personal/crema_hidratante.png' },
  { id: 'belleza/mascarilla-facial', categoryId: 'belleza', productType: 'mascarilla facial',
    keywords: ['mascarilla', 'mask', 'facial', 'arcilla', 'exfoliante', 'puntos negros'],
    file: '1_belleza_y_cuidado_personal/mascarilla_facial.png' },
  { id: 'belleza/protector-solar', categoryId: 'belleza', productType: 'protector solar',
    keywords: ['protector', 'solar', 'bloqueador', 'spf', 'sunscreen', 'uv'],
    synonyms: ['bloqueador'],
    file: '1_belleza_y_cuidado_personal/protector_solar.png' },
  { id: 'belleza/serum-facial', categoryId: 'belleza', productType: 'serum facial',
    keywords: ['serum', 'suero', 'facial', 'antiedad', 'vitamina', 'ampolla', 'arrugas'],
    synonyms: ['suero'],
    file: '1_belleza_y_cuidado_personal/serum_facial.png' },
  { id: 'belleza/shampoo', categoryId: 'belleza', productType: 'shampoo',
    keywords: ['shampoo', 'champu', 'cabello', 'pelo', 'anticaspa', 'acondicionador'],
    synonyms: ['champu'],
    file: '1_belleza_y_cuidado_personal/shampoo.png' },

  // ── 2. Salud y bienestar ───────────────────────────────────────────────────
  { id: 'salud/almohada-ergonomica', categoryId: 'salud', productType: 'almohada ergonómica',
    keywords: ['almohada', 'cojin', 'cervical', 'ergonomica', 'viscoelastica', 'cuello'],
    file: '2_salud_y_bienestar/almohada_ergonomica.png' },
  { id: 'salud/bandas-elasticas', categoryId: 'salud', productType: 'bandas elásticas',
    keywords: ['banda', 'elastica', 'resistencia', 'liga', 'ejercicio', 'fitness', 'gimnasio'],
    file: '2_salud_y_bienestar/bandas_elasticas.png' },
  { id: 'salud/compresa-termica', categoryId: 'salud', productType: 'compresa térmica',
    keywords: ['compresa', 'termica', 'gel', 'frio', 'calor', 'dolor'],
    file: '2_salud_y_bienestar/compresa_termica.png' },
  { id: 'salud/corrector-de-postura', categoryId: 'salud', productType: 'corrector de postura',
    keywords: ['corrector', 'postura', 'espalda', 'faja', 'soporte', 'columna'],
    file: '2_salud_y_bienestar/corrector_de_postura.png' },
  { id: 'salud/rodillera', categoryId: 'salud', productType: 'rodillera',
    keywords: ['rodillera', 'rodilla', 'ortopedica', 'compresion', 'tobillera', 'codera'],
    file: '2_salud_y_bienestar/rodillera.png' },
  { id: 'salud/rodillo-de-masaje', categoryId: 'salud', productType: 'rodillo de masaje',
    keywords: ['rodillo', 'masaje', 'foam', 'roller', 'muscular', 'relajante'],
    file: '2_salud_y_bienestar/rodillo_de_masaje.png' },

  // ── 3. Mascotas ────────────────────────────────────────────────────────────
  { id: 'mascotas/bebedero-portatil', categoryId: 'mascotas', productType: 'bebedero portátil',
    keywords: ['bebedero', 'botella', 'agua', 'portatil', 'paseo', 'perro', 'gato'],
    file: '3_mascotas/bebedero_portatil.png' },
  { id: 'mascotas/cama-para-mascotas', categoryId: 'mascotas', productType: 'cama para mascotas',
    keywords: ['cama', 'colchon', 'canasta', 'descanso', 'perro', 'gato'],
    file: '3_mascotas/cama_para_mascotas.png' },
  { id: 'mascotas/cepillo-removedor-de-pelo', categoryId: 'mascotas', productType: 'cepillo removedor de pelo',
    keywords: ['cepillo', 'removedor', 'pelo', 'peine', 'cardador', 'deslanador'],
    file: '3_mascotas/cepillo_removedor_de_pelo.png' },
  { id: 'mascotas/juguete-interactivo', categoryId: 'mascotas', productType: 'juguete interactivo',
    keywords: ['juguete', 'interactivo', 'pelota', 'mordedor', 'dispensador', 'perro', 'gato'],
    file: '3_mascotas/juguete_interactivo.png' },
  { id: 'mascotas/shampoo-para-mascotas', categoryId: 'mascotas', productType: 'shampoo para mascotas',
    keywords: ['shampoo', 'champu', 'mascota', 'perro', 'gato', 'antipulgas', 'bano'],
    synonyms: ['champu'],
    file: '3_mascotas/shampoo_para_mascotas.png' },
  { id: 'mascotas/snacks-para-perros', categoryId: 'mascotas', productType: 'snacks para perros',
    keywords: ['snack', 'premio', 'galleta', 'treat', 'hueso', 'alimento', 'perro'],
    file: '3_mascotas/snacks_para_perros.png' },

  // ── 4. Cocina ──────────────────────────────────────────────────────────────
  { id: 'cocina/atomizador-de-aceite', categoryId: 'cocina', productType: 'atomizador de aceite',
    keywords: ['atomizador', 'aceite', 'spray', 'rociador', 'dispensador', 'oliva'],
    file: '4_cocina/atomizador_de_aceite.png' },
  { id: 'cocina/balanza-digital', categoryId: 'cocina', productType: 'balanza digital',
    keywords: ['balanza', 'bascula', 'peso', 'digital', 'gramos', 'reposteria'],
    synonyms: ['bascula'],
    file: '4_cocina/balanza_digital.png' },
  { id: 'cocina/freidora-de-aire', categoryId: 'cocina', productType: 'freidora de aire',
    keywords: ['freidora', 'aire', 'fryer', 'horno', 'sin aceite'],
    synonyms: ['fryer'],
    file: '4_cocina/freidora_de_aire.png' },
  { id: 'cocina/licuadora-portatil', categoryId: 'cocina', productType: 'licuadora portátil',
    keywords: ['licuadora', 'batidora', 'portatil', 'blender', 'smoothie', 'vaso'],
    synonyms: ['batidora', 'blender'],
    file: '4_cocina/licuadora_portatil.png' },
  { id: 'cocina/picador-electrico', categoryId: 'cocina', productType: 'picador eléctrico',
    keywords: ['picador', 'procesador', 'electrico', 'chopper', 'triturador', 'verduras'],
    synonyms: ['procesador', 'chopper'],
    file: '4_cocina/picador_electrico.png' },
  { id: 'cocina/sellador-al-vacio', categoryId: 'cocina', productType: 'sellador al vacío',
    keywords: ['sellador', 'vacio', 'empacadora', 'conservacion', 'bolsas'],
    file: '4_cocina/sellador_al_vacio.png' },

  // ── 5. Accesorios para celulares ───────────────────────────────────────────
  { id: 'celulares/audifonos-bluetooth', categoryId: 'celulares', productType: 'audífonos bluetooth',
    keywords: ['audifono', 'auricular', 'bluetooth', 'inalambrico', 'earbuds', 'headphone'],
    synonyms: ['auricular', 'earbuds'],
    file: '5_accesorios_para_celulares/audifonos_bluetooth.png' },
  { id: 'celulares/billetera-magnetica', categoryId: 'celulares', productType: 'billetera magnética',
    keywords: ['billetera', 'cartera', 'magnetica', 'magsafe', 'tarjetero', 'funda'],
    file: '5_accesorios_para_celulares/billetera_magnetica.png' },
  { id: 'celulares/cable-usb-c', categoryId: 'celulares', productType: 'cable USB-C',
    keywords: ['cable', 'usb', 'lightning', 'carga', 'datos', 'trenzado'],
    file: '5_accesorios_para_celulares/cable_usb_c.png' },
  { id: 'celulares/cargador-inalambrico', categoryId: 'celulares', productType: 'cargador inalámbrico',
    keywords: ['cargador', 'inalambrico', 'wireless', 'induccion', 'base'],
    file: '5_accesorios_para_celulares/cargador_inalambrico.png' },
  { id: 'celulares/power-bank', categoryId: 'celulares', productType: 'power bank',
    keywords: ['powerbank', 'bateria', 'portatil', 'externa', 'mah', 'respaldo'],
    synonyms: ['powerbank', 'bateria'],
    file: '5_accesorios_para_celulares/power_bank.png' },
  { id: 'celulares/tripode-para-celular', categoryId: 'celulares', productType: 'trípode para celular',
    keywords: ['tripode', 'soporte', 'selfie', 'stick', 'aro', 'celular'],
    file: '5_accesorios_para_celulares/tripode_para_celular.png' },
]

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]))

export function getTemplate(id: string): TemplateMeta {
  const t = BY_ID.get(id)
  if (!t) throw new Error(`Plantilla desconocida: "${id}". Válidas: ${TEMPLATES.map((x) => x.id).join(', ')}`)
  return t
}

/* ── Matching determinista ─────────────────────────────────────────────────── */

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'por',
  'una', 'uno', 'que', 'mi', 'tu', 'su', 'and', 'the',
])

/**
 * Produce una CLAVE DE MATCHING, no un singular. No existe una regla de
 * superficie que recupere el singular real de un plural en "-es": "colores"
 * (singular en consonante, "color") y "aceites" (singular en "-e", "aceite")
 * tienen exactamente la misma forma y piden el recorte contrario — no hay
 * letra que se pueda mirar para distinguirlos, así que ni lo intentamos.
 *
 * En cambio, converge ambos lados (el texto del usuario y las `keywords` del
 * catálogo) al mismo string recortando primero una "s" final y luego una "e"
 * final: "aceites"→"aceite"→"aceit" y la keyword "aceite"→"aceit" caen en la
 * misma clave; "colores"→"colore"→"color" y la keyword "color"→"color"
 * también. El resultado no es una palabra real ("aceit"), pero eso no
 * importa: sólo tiene que ser igual en ambos lados, y como `stem()` se aplica
 * simétricamente a texto libre y a keywords, lo es.
 *
 * Guard: ningún recorte deja el token por debajo de 3 caracteres (protege
 * préstamos cortos como "uv"/"usb", que además no terminan en s/e).
 */
function stem(t: string): string {
  let s = t
  if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1)
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1)
  return s
}

/** Minúsculas, sin acentos, sin puntuación, sin stopwords, desplurarizado. */
export function normalizeTokens(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem)
}

function keywordSet(t: TemplateMeta): Set<string> {
  return new Set(t.keywords.flatMap(normalizeTokens))
}

/**
 * Plantillas cuyo vocabulario se solapa con lo que el usuario describe,
 * ordenadas por solapamiento descendente. Las de score 0 NO se devuelven:
 * la galería las muestra igual, sólo que sin resaltar.
 */
export function matchTemplates(
  productType: string,
  categoryId?: CategoryId,
): { template: TemplateMeta; score: number }[] {
  const tokens = new Set(normalizeTokens(productType))
  return TEMPLATES
    .filter((t) => !categoryId || t.categoryId === categoryId)
    .map((template) => {
      const vocab = new Set([...keywordSet(template), ...normalizeTokens(template.productType)])
      let score = 0
      for (const tok of tokens) if (vocab.has(tok)) score++
      return { template, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
}

/**
 * ¿El producto del usuario es EL MISMO que el de la plantilla? Decide entre
 * clonar y traspasar el ADN (ver generation-prompts.ts).
 *
 * No alcanza con compartir un token cualquiera: "crema facial" y "serum facial"
 * comparten "facial" y son productos distintos. Se exige que coincida el
 * SUSTANTIVO NÚCLEO — en cualquiera de los tokens del usuario (un token
 * inicial como "10" o "unidades" no debe tapar un núcleo más adelante) — en
 * alguna de las dos direcciones. Del lado del catálogo, ese núcleo sólo puede
 * venir de `productType` o de `synonyms` — nunca de `keywords`, que mezcla a
 * propósito atributos/síntomas ("vitamina", "facial") con sinónimos del
 * sustantivo, y esta función es precision-first (un falso positivo clona el
 * producto equivocado).
 */
export function isSameProduct(t: TemplateMeta, userProductType: string): boolean {
  const userTokens = normalizeTokens(userProductType)
  if (!userTokens.length) return false
  const tplHead = normalizeTokens(t.productType)[0]
  if (tplHead && userTokens.includes(tplHead)) return true
  const synonymTokens = new Set((t.synonyms ?? []).flatMap(normalizeTokens))
  return userTokens.some((tok) => synonymTokens.has(tok))
}

/* ── Storage ───────────────────────────────────────────────────────────────── */

const STORAGE_BASE = () =>
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!}/storage/v1/object/public/ad-uploads/branding-templates`

/** La foto original de la plantilla — se muestra en la galería y se adjunta a Gemini. */
export function templateImageUrl(id: string): string {
  return `${STORAGE_BASE()}/${id}.png`
}

/** El wireframe determinista del layout de la plantilla (generado por el seed). */
export function templateWireframeUrl(id: string): string {
  return `${STORAGE_BASE()}/wireframes/${id.replace('/', '__')}.png`
}
