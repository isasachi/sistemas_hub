// Vocabulario auto-alimentado (spec §10, decisión D8 del CONTEXT).
//
// Reemplaza la generación de keywords por LLM con un ciclo cerrado: de cada
// landing que se auditó y resultó ser un producto físico se extraen los términos
// con los que el propio comerciante nombra lo que vende, y eso alimenta la
// siguiente ronda de búsqueda. Cuesta cero y mejora conforme crece la base.

import { normalizeQuery } from '../discovery/normalize-query'

export type TermSource = 'product_type' | 'tag' | 'product_name'

export interface TerminoExtraido {
  term: string
  source: TermSource
}

export interface LandingParaVocabulario {
  productType?: string | null
  productTags?: string[] | null
  productName?: string | null
  brand?: string | null
}

// ⚠️ RUIDO DE MARCA Y DE PACKAGING. Un término que es la marca no describe el
// producto: buscar "bnatural" en la Ad Library devuelve a ese anunciante y a
// nadie más, o sea gasta una búsqueda para no descubrir nada. Lo mismo con las
// unidades y los adjetivos de oferta, que aparecen en el nombre de medio
// catálogo.
const RUIDO = new Set([
  'ml', 'gr', 'kg', 'mg', 'unidades', 'unidad', 'pack', 'packs', 'set', 'kit',
  'combo', 'oferta', 'promocion', 'descuento', 'gratis', 'envio', 'nuevo',
  'nueva', 'premium', 'original', 'importado', 'talla', 'tallas', 'color',
  'colores', 'default', 'title', 'producto', 'productos', 'articulo',
])

const SOLO_NUMEROS = /^\d+$/

// ⚠️ PALABRAS VACÍAS DEL ESPAÑOL. Sin esto, los n-gramas del nombre del producto
// entran al vocabulario como términos de búsqueda: medido sobre las 137 landings
// reales, se dieron de alta `para`, `con`, `tus`, `obten`, `y adoloridos` y
// `de pies` — y cada término del vocabulario es una búsqueda PAGADA contra Meta.
// `para` como consulta de la Ad Library devuelve todo y no descubre nada.
const VACIAS = new Set([
  'para', 'con', 'sin', 'por', 'los', 'las', 'del', 'una', 'unos', 'unas',
  'que', 'como', 'mas', 'muy', 'tus', 'sus', 'mis', 'este', 'esta', 'estos',
  'estas', 'ese', 'esa', 'eso', 'aqui', 'ahora', 'todo', 'toda', 'todos',
  'todas', 'cada', 'segun', 'entre', 'sobre', 'hasta', 'desde', 'donde',
  'cuando', 'porque', 'pero', 'solo', 'tambien', 'ya', 'yo', 'tu', 'el', 'la',
  'lo', 'de', 'en', 'un', 'al', 'se', 'su', 'es', 'son', 'y', 'o',
  // Verbos de copy publicitario: describen la promesa, no el producto.
  'obten', 'obtene', 'consigue', 'compra', 'lleva', 'mejora', 'descubre',
  'aprovecha', 'ahorra', 'disfruta', 'siente', 'prueba', 'elige',
  // Adjetivos que aparecen en medio catálogo y no discriminan nada.
  'especial', 'mejor', 'mejores', 'ideal', 'perfecto', 'perfecta', 'super',
])

/**
 * ¿El término empieza o termina en una palabra vacía?
 *
 * Un bigrama como "de pies" o "y adoloridos" es un FRAGMENTO de una frase, no el
 * nombre de nada. Se mira solo el borde: "aceite de coco" es un término
 * legítimo con una palabra vacía en el medio.
 */
function bordeVacio(t: string): boolean {
  const p = t.split(' ')
  return VACIAS.has(p[0]) || VACIAS.has(p[p.length - 1])
}

/** Un número suelto dentro del término: "30 capsulas", "1 par", "2 0". */
const LLEVA_NUMERO = /(^|\s)\d+(\s|$)/

/**
 * ¿Este término sirve como consulta de descubrimiento?
 *
 * Largo entre 3 y 40 (el spec), no es puro número, no es ruido y no es la marca
 * del propio anunciante.
 */
export function esTerminoUtil(term: string, brand?: string | null): boolean {
  const t = term.trim()
  if (t.length < 3 || t.length > 40) return false
  if (SOLO_NUMEROS.test(t)) return false
  if (LLEVA_NUMERO.test(t)) return false
  if (RUIDO.has(t)) return false
  if (bordeVacio(t)) return false
  // Una palabra suelta que es ruido dentro de un bigrama está bien; lo que se
  // descarta es el término ENTERO igual al ruido o a la marca.
  const b = brand ? normalizeQuery(brand) : null
  if (b && b.length >= 3 && t === b) return false
  return true
}

/** n-gramas de 1 y 2 palabras, en orden y sin repetir. */
export function ngramas(texto: string): string[] {
  const palabras = normalizeQuery(texto).split(' ').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < palabras.length; i++) {
    out.push(palabras[i])
    if (i + 1 < palabras.length) out.push(`${palabras[i]} ${palabras[i + 1]}`)
  }
  return [...new Set(out)]
}

/**
 * Términos que aporta una landing auditada.
 *
 * ⚠️ SOLO SE LLAMA CON LANDINGS FÍSICAS Y VERIFICADAS. Extraer vocabulario de
 * una landing que resultó no ser un producto es enseñarle al motor a buscar
 * justo lo que después descarta.
 */
export function extraerTerminos(l: LandingParaVocabulario): TerminoExtraido[] {
  const out: TerminoExtraido[] = []
  const push = (raw: string, source: TermSource) => {
    const t = normalizeQuery(raw)
    if (esTerminoUtil(t, l.brand)) out.push({ term: t, source })
  }

  // `product_type` es el término más valioso de los tres: es la categoría que el
  // propio comerciante eligió, ya viene en singular y ya es una consulta.
  if (l.productType) push(l.productType, 'product_type')
  for (const tag of l.productTags ?? []) push(tag, 'tag')
  // Del nombre salen n-gramas, pero SOLO los de dos palabras.
  //
  // ⚠️ UNA PALABRA SUELTA DEL NOMBRE NO DESCUBRE NADA, y medido son casi todo el
  // ruido: de 485 términos auto-extraídos activos, **383 eran de una sola
  // palabra** — `and`, `the`, `pro`, `plus`, `100ml`, `mini`, y nombres de marca
  // sueltos (`kneeflex`, `groundingwell`). Cada uno es una búsqueda pagada, y el
  // daemon llegó a gastar ciclos en `multi` y `termica`.
  //
  // Las palabras sueltas que SÍ son buenas —`faja`, `rodillera`, `masajeador`,
  // `colageno`— resultaron ser las frecuentes, y todas ya viven dentro de una
  // semilla: buscarlas de nuevo no descubre un nicho nuevo, que es para lo que
  // existe este vocabulario (spec §10). Lo que descubre es el nombre específico
  // de dos palabras: `cinturon termico`, `colageno marino`.
  //
  // `product_type` queda exento: ahí la palabra suelta es la CATEGORÍA que el
  // propio comerciante eligió ("Rodilleras"), no un fragmento de un título.
  if (l.productName) {
    for (const ng of ngramas(l.productName)) {
      if (ng.includes(' ')) push(ng, 'product_name')
    }
  }

  // Un término puede salir por dos caminos; gana el más específico (el orden de
  // inserción ya es ese).
  const vistos = new Set<string>()
  return out.filter((t) => (vistos.has(t.term) ? false : (vistos.add(t.term), true)))
}

/**
 * IDF de un término contra el corpus de landings (spec §10).
 *
 * Un término que aparece en el 90% de las landings no discrimina; uno que
 * aparece en el 2% sí. `Math.max(ocurrencias, 1)` evita el infinito del término
 * que todavía no se contó.
 */
export function idf(totalLandings: number, ocurrencias: number): number {
  return Math.log(Math.max(totalLandings, 1) / Math.max(ocurrencias, 1))
}

/**
 * Poda (spec §10): un término que corrió lo suficiente y no rindió en ningún
 * país se apaga.
 *
 * ⚠️ EXIGE `runs >= 5` EN LA COMBINACIÓN, no en total. Apagar un término porque
 * fracasó una vez en un país lo mata para los otros cinco, donde puede ser el
 * producto del año.
 */
export function debePodarse(
  estados: { runs: number; yieldRate: number | null }[],
  minRuns = 5,
  minYield = 0.01,
): boolean {
  if (!estados.length) return false
  return estados.every((e) => e.runs >= minRuns && (e.yieldRate ?? 0) < minYield)
}

/**
 * Segunda vuelta de la poda, sobre `yield_rate` ya refrescado.
 *
 * ⚠️ UN CANDIDATO SIN ESTADO FRESCO NO SE APAGA. Apagar es una puerta de una
 * sola dirección —el término sale del bandit, no vuelve a correr, su yield no
 * se vuelve a calcular— así que el fail-safe es no cruzarla. Sin esto, un
 * término que perdió su fila (o cuya lectura falló) se apagaría por ausencia de
 * datos, que es el peor motivo posible.
 */
export function podaConfirmada(
  candidatos: string[],
  frescos: Map<string, { runs: number; yieldRate: number | null }[]>,
  minRuns = 5,
  minYield = 0.01,
): string[] {
  return candidatos.filter((t) => {
    const es = frescos.get(t)
    return es?.length ? debePodarse(es, minRuns, minYield) : false
  })
}
