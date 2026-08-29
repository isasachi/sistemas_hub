// Fusión de clusters que son el MISMO producto repartido en varias landings.
//
// `productKey` agrupa por la URL, así que un producto promocionado desde tres
// páginas cuenta como tres — el sesgo que `product-key.ts` documenta con
// VivaCuerpo (share 0.57 cuando el real ronda 0.97). Acá se corrige con
// embeddings, pero con una advertencia que manda sobre todo lo demás:
//
// ⚠️ ESTO INVIERTE EL SESGO HACIA EL LADO PELIGROSO. Hoy el pipeline SUBESTIMA:
// descarta monoproductos legítimos en vez de publicar un catálogo como si fuera
// un producto. Fusionar de más hace lo contrario. Por eso el umbral es 0.95 —
// el único punto sin fusiones erróneas en la medición — y no se baja sin volver
// a medir contra los dos lados: que CLIP STUDIO (/en, /pt = un producto)
// fusione Y que Ofertas Colombia (kitdecuadernos, rollo-para-colorear = tres
// productos) no.
//
// ⚠️ El efecto es CHICO y conviene saberlo antes de invertir acá: medido sobre
// 198 páginas, fusionar a 0.95 mueve 5 de tramo (2,5%). Contar por producto
// —lo que hace `clustersOf`— corrige el 49,5%. Esto es pulido, no el producto.
import { CHAT, type ClusterInfo } from './product-key'

/**
 * Precisión 1.00 con 31 fusiones sobre 140 pares etiquetados por `gpt-5.6-luna`,
 * muestreados por banda de similitud.
 *
 * ⚠️ ERA 0.95 Y SE BAJÓ CON MEDICIÓN, no por intuición: 0.92 tiene la MISMA
 * precisión perfecta y 24% más fusiones (31 contra 25). La curva se re-midió
 * porque cambió lo que se embebe — al agregar el copy del anuncio, los pares
 * se reordenan y el umbral viejo dejó de ser el óptimo.
 *
 *     0.95 → precisión 1.00 · 25 fusiones · 0 erróneas
 *     0.92 → precisión 1.00 · 31 fusiones · 0 erróneas   ← acá
 *     0.90 → precisión 0.97 · 34 fusiones · 1 errónea
 *     0.82 → precisión 0.85 · 55 fusiones · 10 erróneas
 *
 * ⚠️ NO LO BAJES A 0.82 aunque un caso suelto lo pida. Sobre dos anunciantes
 * reales 0.82 parecía correcto (fusionaba el mismo producto en cuatro idiomas
 * sin pegar los siete productos de un catálogo), y sobre los 140 pares mete 10
 * fusiones erróneas. Dos ejemplos no fijan un umbral.
 */
export const UMBRAL_FUSION = 0.92

export const MODELO_EMBEDDING = 'text-embedding-3-small'

/**
 * Lo que se embebe: el copy del anuncio + el título + el slug de la landing en
 * palabras.
 *
 * ⚠️ EL CUERPO VA PRIMERO Y NO ES UN DETALLE DE ORDEN. Sin él —solo título y
 * URL— el MISMO producto de CLIP STUDIO en dos idiomas daba 0.714 y quedaba
 * por DEBAJO de `collections/collares` vs `collections/anillos` (0.939, dos
 * productos distintos con el mismo título plantilla): el orden se invertía
 * justo en el caso que la fusión existe para resolver. Con el copy sube a 0.822.
 *
 * ⚠️ EL SLUG DE UN LINK DE CHAT NO ENTRA — misma regla que `productKey`, y
 * reusando su `CHAT` en vez de copiarla. Sin eso, `api.whatsapp.com/send`
 * aporta "send" a todos los clusters del anunciante: medido, 983 pares en la
 * banda 0.9+ y ocho con similitud EXACTA 1.000 entre productos distintos.
 */
export function textoDeCluster(c: ClusterInfo): string {
  let slug = ''
  try {
    const u = new URL(c.url ?? '')
    if (!CHAT.test(u.hostname.replace(/^www\./, ''))) {
      slug = decodeURIComponent(u.pathname).replace(/[-_/]+/g, ' ').trim()
    }
  } catch {
    // Sin url legible: la clave ya es el título.
  }
  return [c.cuerpo ?? '', c.titulo ?? '', slug || c.key].filter(Boolean).join(' — ').slice(0, 600)
}

// ⚠️ ACÁ VIVÍA `sinBoilerplate` Y SE ELIMINÓ CON MEDICIÓN — no lo reintroduzcas
// sin volver a medir. Quitaba las palabras presentes en ≥60% de los clusters
// del anunciante, para que el embedding no midiera el parecido de la plantilla
// ("Paga al Recibir 🏠") en vez del producto. Con solo título+URL ayudaba
// (collares vs anillos bajaban de 0.939 a 0.859).
//
// Con el COPY del anuncio adentro **invierte su propósito**: si un anunciante
// promociona un solo producto desde varias landings, las palabras de ESE
// producto aparecen en casi todos sus clusters y las borra como si fueran
// plantilla, dejando solo el ruido específico de cada landing. Medido sobre
// Julia's Blog (28 clusters del mismo suplemento en cuatro idiomas): con la
// limpieza no fusiona nada en NINGÚN umbral entre 0.82 y 0.95; sin ella y a
// 0.82 fusiona los cuatro idiomas correctamente. Y la curva completa sobre los
// 140 pares etiquetados da precisión 1.00 a 0.92 SIN limpiar, así que tampoco
// hace falta para el caso que la motivó.

/**
 * Un cluster cuyo texto NO identifica ningún producto: los anuncios dinámicos
 * de catálogo llegan con los placeholders sin resolver (`{{product.name}}`,
 * `{{product.brand}}`) y lo único que queda es andamiaje.
 *
 * ⚠️ ESTOS NUNCA SE FUSIONAN, y no es una precaución teórica. Dos clusters así
 * tienen textos casi idénticos —la MISMA plantilla— y el coseno los da por el
 * mismo producto: medido, `{{product.brand}} — {{product.name}} — A6zfR6Vm…` y
 * `… — P26z8sDR…` de BYD Auto salían a 0.864, o sea dos autos DISTINTOS
 * fusionados por parecerse en lo que no dice nada. Son el **13,1% de los
 * clusters** del corpus, así que sin este guard la fusión de más es sistemática.
 *
 * El slug queda fuera de la cuenta a propósito: en estos casos es un id opaco
 * (`A6zfR6VmfcRd91eT8`) que no aporta identidad de producto.
 */
export function sinTextoDeProducto(c: ClusterInfo): boolean {
  const t = [c.cuerpo ?? '', c.titulo ?? '']
    .join(' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length < 4
}

export function coseno(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na && nb ? d / Math.sqrt(na * nb) : 0
}

/**
 * Enlace simple sobre el umbral: dos clusters caen en el mismo grupo si algún
 * par entre ellos lo supera.
 *
 * Son 15 líneas a propósito. HDBSCAN —lo que pedía el plan original— no tiene
 * implementación usable en JS, el worker es TypeScript, y con 6 puntos por
 * página el clustering por densidad es inestable: en el ejemplo del propio plan
 * mandaba 16 anuncios a "ruido". Acá ya hay un umbral medido, que es
 * justamente lo que el enlace simple necesita.
 *
 * El grupo conserva la clave, el título y la URL del cluster MÁS GRANDE, y suma
 * la muestra y el estimado de todos: si no se sumara el estimado, la card
 * mostraría un producto con la muestra de dos y el conteo de uno.
 */
export function fusionarPorEmbedding(
  cs: ClusterInfo[], vecs: number[][], umbral = UMBRAL_FUSION,
  /** Pares que el árbitro resolvió como el mismo producto, además del coseno. */
  extra: Array<[number, number]> = [],
): ClusterInfo[] {
  if (cs.length < 2) return cs
  const mudo = cs.map(sinTextoDeProducto)
  const padre = cs.map((_, i) => i)
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])))
  for (const [i, j] of extra) if (!mudo[i] && !mudo[j]) padre[raiz(i)] = raiz(j)
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      // Sin texto que los identifique no hay fusión: el parecido sería el de la
      // plantilla, no el del producto. Ver `sinTextoDeProducto`.
      if (mudo[i] || mudo[j]) continue
      if (coseno(vecs[i], vecs[j]) >= umbral) padre[raiz(i)] = raiz(j)
    }
  }
  const grupos = new Map<number, number[]>()
  cs.forEach((_, i) => {
    const r = raiz(i)
    grupos.set(r, [...(grupos.get(r) ?? []), i])
  })
  return [...grupos.values()]
    .map((ids) => {
      const miembros = ids.map((i) => cs[i]).sort((a, b) => b.n - a.n)
      const jefe = miembros[0]
      return {
        ...jefe,
        n: miembros.reduce((a, m) => a + m.n, 0),
        estimado: miembros.reduce((a, m) => a + m.estimado, 0),
      }
    })
    .sort((a, b) => b.n - a.n)
}

/**
 * Embebe los textos con `text-embedding-3-small`. Devuelve null si no hay key o
 * si la API falla: quien llama debe seguir SIN fusionar, no romper el barrido.
 * Fusionar es un refinamiento — perderlo cuesta 2,5% de tramos, y abortar la
 * corrida cuesta la corrida.
 */
let avisado = false
/** Avisa UNA vez por proceso: fallar en silencio en cada anunciante deja la
 *  fusión como no-op invisible, que es el modo de fallo que este repo ya pagó
 *  varias veces. ⚠️ La OPENAI_API_KEY del worker es un PLACEHOLDER (`sk-....`);
 *  la real vive en la env de apps/web. Sin ponerla en el worker, la fusión no
 *  corre nunca y los clusters se guardan sin unir. */
function avisarUnaVez(motivo: string): null {
  if (!avisado) {
    avisado = true
    console.warn(`⚠ fusión de clusters DESACTIVADA (${motivo}) — los productos repartidos en varias landings se guardan separados`)
  }
  return null
}

export async function embeddings(textos: string[]): Promise<number[][] | null> {
  const key = process.env.OPENAI_API_KEY
  if (!textos.length) return null
  if (!key || key.startsWith('sk-...')) return avisarUnaVez('sin OPENAI_API_KEY real en el worker')
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODELO_EMBEDDING, input: textos }),
      // En Node el fetch no tiene timeout por defecto y esto corre dentro del
      // barrido: la lección que ya dejó `fetchKie` en el generador de video.
      signal: AbortSignal.timeout(30_000),
    })
    const j = (await r.json()) as { data?: { embedding: number[] }[]; error?: { message: string } }
    if (j.error || !j.data) return avisarUnaVez(j.error?.message?.slice(0, 80) ?? 'respuesta sin datos')
    return j.data.map((d) => d.embedding)
  } catch (e) {
    return avisarUnaVez((e as Error).message.slice(0, 80))
  }
}
