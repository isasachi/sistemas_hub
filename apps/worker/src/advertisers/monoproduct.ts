// Distribución de productos del anunciante (spec §28) y monoproducto (§30).
//
// El cálculo es aritmética pura sobre lo que devolvió el deep crawl: se agrupan
// sus anuncios por producto y se mide qué parte de su pauta es el dominante.
import { MONOPRODUCT } from '../config/scoring'
import { jaccard } from '../products/similarity'

export interface ProductTally {
  key: string
  name: string | null
  count: number
}

export interface Distribution {
  /** Muestra sobre la que se midió: los anuncios que se pudieron leer. */
  sample: number
  distinct: number
  dominant: ProductTally | null
  /** dominante / muestra. Se guarda el NÚMERO, no solo el booleano (§30). */
  share: number
  monoproduct: boolean
  strong: boolean
  top: ProductTally[]
}

/**
 * Agrupa claves de producto que son el mismo producto escrito distinto.
 *
 * ⚠️ Esto es lo que separa este cálculo del `shareOf` del motor viejo, que
 * agrupa por clave EXACTA. Ese sesgo está documentado en `product-key.ts`:
 * VivaCuerpo reparte un solo legging entre tres landings y su share sale 0,57
 * cuando el real ronda 0,97. Acá dos claves se funden si sus nombres se parecen
 * por encima del umbral, que es la regla de similitud del §27.
 *
 * El umbral es alto (0,85) a propósito: fundir de más une productos DISTINTOS
 * de una tienda de catálogo, que es exactamente lo que este cálculo existe para
 * separar.
 *
 * ⚠️ Se compara con JACCARD y no con `similarity`. `similarity` toma el máximo
 * entre Jaccard y Levenshtein, y Levenshtein es altísimo entre dos nombres que
 * difieren en un carácter ("Serum A" vs "Serum B" da 0,9): serviría para
 * BUSCAR el mismo producto, pero acá la decisión es FUNDIR, y fundir de más
 * infla el share hasta inventar un monoproducto. Con solapamiento de tokens dos
 * nombres se funden solo si comparten casi todas sus palabras.
 */
export function mergeSimilar(tallies: ProductTally[], threshold = 0.85): ProductTally[] {
  const out: ProductTally[] = []
  for (const t of [...tallies].sort((a, b) => b.count - a.count)) {
    const hit = out.find((o) => o.name && t.name && jaccard(o.name, t.name) >= threshold)
    if (hit) hit.count += t.count
    else out.push({ ...t })
  }
  return out.sort((a, b) => b.count - a.count)
}

export function distribution(tallies: ProductTally[]): Distribution {
  const merged = mergeSimilar(tallies)
  const sample = merged.reduce((n, t) => n + t.count, 0)
  const dominant = merged[0] ?? null
  const share = sample && dominant ? dominant.count / sample : 0
  return {
    sample,
    distinct: merged.length,
    dominant,
    share: Number(share.toFixed(4)),
    monoproduct: share >= MONOPRODUCT.threshold,
    strong: share >= MONOPRODUCT.strongThreshold,
    top: merged.slice(0, 3),
  }
}
