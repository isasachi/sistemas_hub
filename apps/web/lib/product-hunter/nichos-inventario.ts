/**
 * La lista de nichos con inventario, cacheada por instancia.
 *
 * ⚠️ `getNichesWithInventory` es un `GROUP BY niche` sobre TODA
 * `ph_raw_products` (~190k filas) y se llamaba en CADA búsqueda por categoría.
 * Medido en prod 2026-09-27: 3,1 s y 5,5 s con todo en caché (68k buffers), y
 * con la instancia cargada se pasa del `statement_timeout` de 8 s — el 500 de
 * 01:04Z buscando "Fitness y deporte" murió acá, antes de tocar un producto.
 *
 * La lista es la misma para todos los usuarios y cambia lento (un nicho nuevo
 * del daemon), así que tarda como mucho `TTL_MS` en entrar a su chip. Un nicho
 * que se inactive mientras está cacheado no hace daño: el serving vuelve a
 * filtrar `NO_SERVIBLES`.
 *
 * Vive en apps/web y no en `@ph/shared` porque esa capa la consume también el
 * worker, que tiene que ver la lista real.
 *
 * Se cachea la PROMESA (dos búsquedas simultáneas comparten un solo RPC). Si el
 * refresco falla se sirve la última lista buena — el fallo llega justo cuando
 * la base está cargada, que es cuando menos conviene otro 500 —; sin lista
 * buena, se descarta la promesa y el error sube.
 *
 * ponytail: caché en memoria por instancia de Fluid Compute; cada instancia
 * nueva paga un RPC. Pasar a una caché compartida si eso llega a doler.
 */
import { getNichesWithInventory } from '@ph/shared'

const TTL_MS = 10 * 60_000

let cache: { hasta: number; lista: Promise<string[]> } | null = null
let ultimaBuena: string[] | null = null

export function nichosConInventario(): Promise<string[]> {
  if (cache && Date.now() < cache.hasta) return cache.lista
  const lista = getNichesWithInventory().then(
    (l) => (ultimaBuena = l),
    (err) => {
      if (!ultimaBuena) { cache = null; throw err }
      console.error('[nichos-inventario] sirviendo la lista anterior:', err)
      return ultimaBuena
    },
  )
  cache = { hasta: Date.now() + TTL_MS, lista }
  return lista
}

/** Solo para tests: el estado del módulo sobrevive entre casos. */
export function _resetNichosCache() {
  cache = null
  ultimaBuena = null
}
