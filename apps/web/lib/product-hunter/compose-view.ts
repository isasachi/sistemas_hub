import type { ProductCard } from '@ph/shared'

// Vista de ganadores: exactamente 10 productos con el esquema 1 alta / 7 media /
// 2 baja. Web-only (serving), no toca la DB.
export const VIEW_SIZE = 10
export const VIEW_SCHEMA = { alta: 1, media: 7, baja: 2 } as const

/**
 * Compone la vista de ganadores a partir del pool de cards no-vistas.
 *
 * - **Siempre 10** (o menos solo si el pool tiene <10).
 * - **Esquema 1/7/2:** 1 alta, 7 media, 2 baja.
 * - **Flexibilidad:** si un tier no alcanza su cupo, completa hasta 10 con los
 *   mejores restantes por score (de cualquier tier). Así un nicho sin baja
 *   muestra 1 alta + 9 media en vez de 8 productos.
 * - **Best-effort (acotado):** si NINGÚN producto califica como alta, promueve el
 *   mejor del pool (mayor score) a la slot de alta — y NADA más. El resto sigue
 *   7 media + 2 baja. `bestEffort` solo marca ese caso.
 *
 * Dentro de cada tier se prioriza por score (mejor primero). El pool entra ya
 * rankeado por la economía del visto (lo no-visto-en-7d arriba); el orden por
 * score acá es el desempate de calidad dentro de lo que el usuario aún no vio.
 */
export function composeWinnersView(
  cards: ProductCard[]
): { products: ProductCard[]; bestEffort: boolean } {
  const byScore = (a: ProductCard, b: ProductCard) => b.score - a.score
  const pool = [...cards].sort(byScore)
  const altas = pool.filter((c) => c.priority === 'alta')
  const medias = pool.filter((c) => c.priority === 'media')
  const bajas = pool.filter((c) => c.priority === 'baja')

  const out: ProductCard[] = []
  const used = new Set<string>()
  const take = (arr: ProductCard[], n: number) => {
    for (const c of arr) {
      if (out.length >= VIEW_SIZE || n <= 0) break
      if (used.has(c.id)) continue
      out.push(c)
      used.add(c.id)
      n--
    }
  }

  // Slot alta: real, o best-effort (el mejor del pool promovido a alta).
  let bestEffort = false
  if (altas.length > 0) {
    take(altas, VIEW_SCHEMA.alta)
  } else {
    const best = pool.find((c) => !used.has(c.id))
    if (best) {
      out.push({ ...best, priority: 'alta' })
      used.add(best.id)
      bestEffort = true
    }
  }

  take(medias, VIEW_SCHEMA.media)
  take(bajas, VIEW_SCHEMA.baja)
  // Flex: completar hasta 10 con los mejores restantes (cualquier tier).
  take(pool, VIEW_SIZE - out.length)

  return { products: out, bestEffort }
}
