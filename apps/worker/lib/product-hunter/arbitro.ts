// Árbitro de la banda dudosa: cuando el coseno no alcanza para decidir si dos
// clusters son el mismo producto, se le pregunta a un modelo barato.
//
// ⚠️⚠️ NO ESTÁ CABLEADO AL PIPELINE, Y ES A PROPÓSITO — MEDIDO, NO INTUIDO.
// Sobre las 198 páginas del corpus: la banda toca 105 pares (1,2% del total),
// el árbitro fusionaría 80 de ellos… y eso mueve el tramo de **1 página de
// 198 (0,5%)**. Para comparar: la fusión por coseno mueve el 2,5% y contar por
// producto —lo que hace `clustersOf`— corrige el 49,5%.
//
// O sea el aporte es real pero marginal, y el precio no es la plata (~$2 por
// el barrido entero) sino meter una dependencia de LLM en el camino caliente de
// un barrido que ya se corta solo por bloqueos de Meta. Queda construido y
// probado para poder re-medirlo barato cuando haya más datos: correr
// `scripts/probe-arbitro-gana.ts`. Si el número sube, se cablea llamándolo
// desde `fusionarClusters` y pasando sus pares como `extra` a
// `fusionarPorEmbedding`.
//
// ⚠️ SOLO PARA LA BANDA [BANDA_MIN, UMBRAL_FUSION). Por encima del umbral la
// precisión medida es 1.00 y no hay nada que arbitrar; por debajo de 0.82 la
// precisión cae a 0.85 y el número de pares se dispara, así que preguntar ahí
// es pagar por ruido. La banda es angosta a propósito.
//
// ⚠️ Y NO ES INFALIBLE: revisando sus etiquetas a mano marcó MISMO a un par de
// BYD Auto cuyo copy es el mismo "final sale" para autos posiblemente distintos.
// Por eso decide solo dentro de la banda, nunca sobre lo que ya resolvió el
// coseno, y su fallo se limita a una fusión de más en un caso ambiguo.
import { cleanJsonText } from '@ph/shared'
import { coseno, UMBRAL_FUSION, textoDeCluster, sinTextoDeProducto } from './cluster-merge'
import type { ClusterInfo } from './product-key'

/** Piso de la banda: por debajo, la precisión del coseno ya cayó a 0.85. */
export const BANDA_MIN = 0.82

export const MODELO_ARBITRO = 'gpt-5.6-luna'

export interface ParDudoso { i: number; j: number; sim: number }

/** Los pares que caen en la banda, de más a menos parecidos. */
export function paresDudosos(cs: ClusterInfo[], vecs: number[][]): ParDudoso[] {
  const mudo = cs.map(sinTextoDeProducto)
  const out: ParDudoso[] = []
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      // Mismo guard que la fusión por coseno, y acá hace MÁS falta: al árbitro
      // se le mandaría el texto de la plantilla y respondería que son el mismo
      // producto porque literalmente lee lo mismo dos veces. Medido: dijo MISMO
      // a dos autos de BYD cuyo copy era `{{product.brand}} — {{product.name}}`.
      if (mudo[i] || mudo[j]) continue
      const sim = coseno(vecs[i], vecs[j])
      if (sim >= BANDA_MIN && sim < UMBRAL_FUSION) out.push({ i, j, sim })
    }
  }
  return out.sort((a, b) => b.sim - a.sim)
}

const INSTRUCCION =
  'Cada item son DOS anuncios del MISMO anunciante. Decide si promocionan el MISMO producto ' +
  '(mismo artículo o servicio concreto) o productos DISTINTOS. Dos anuncios con el mismo reclamo ' +
  'promocional pero distinto artículo son DISTINTOS. Un mismo artículo con copy en otro idioma o ' +
  'en otra landing es el MISMO.\n' +
  'Devuelve JSON {"r":[{"i":0,"same":true}, ...]} con un item por par.\n\n'

/**
 * Pregunta por cada par. Devuelve el subconjunto que el modelo considera el
 * mismo producto.
 *
 * ⚠️ FALLA CERRADO: sin key, con error de API o con una respuesta ilegible
 * devuelve lista vacía, o sea NO fusiona. Es el lado seguro — el sesgo que hay
 * que preservar es subestimar, y una fusión de más publica un catálogo como si
 * fuera un producto.
 *
 * ⚠️ Los textos pasan por `cleanJsonText`: el copy trae emojis y cortarlo puede
 * partir un par de surrogates, con lo que la API rechaza el request entero.
 */
export async function arbitrar(
  cs: ClusterInfo[], pares: ParDudoso[], lote = 10,
): Promise<ParDudoso[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key || key.startsWith('sk-...') || !pares.length) return []
  const iguales: ParDudoso[] = []
  for (let k = 0; k < pares.length; k += lote) {
    const tanda = pares.slice(k, k + lote)
    const prompt = INSTRUCCION + tanda.map((p, n) =>
      `[${n}] A: ${cleanJsonText(textoDeCluster(cs[p.i]).slice(0, 260))}\n` +
      `  B: ${cleanJsonText(textoDeCluster(cs[p.j]).slice(0, 260))}`).join('\n\n')
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODELO_ARBITRO,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(60_000),
      })
      const j = (await res.json()) as { choices?: { message: { content: string } }[]; error?: unknown }
      if (!j.choices?.[0]) continue
      const out = JSON.parse(j.choices[0].message.content) as { r?: { i: number; same: boolean }[] }
      for (const v of out.r ?? []) if (v.same && tanda[v.i]) iguales.push(tanda[v.i])
    } catch {
      // Un lote que falla no arrastra a los demás ni corta el barrido.
      continue
    }
  }
  return iguales
}
