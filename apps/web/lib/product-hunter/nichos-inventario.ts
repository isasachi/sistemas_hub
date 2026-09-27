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
 * Cómo se comporta:
 * - VENCIDA pero con lista: se sirve la vieja YA y se refresca en segundo plano.
 *   Esperar el refresco le comía 3-8 s al presupuesto de la consulta de
 *   productos, justo cuando la base está cargada.
 * - Un solo refresco en vuelo por instancia (`enCurso`): las búsquedas
 *   simultáneas lo comparten, y un fallo tardío no pisa nada porque no hay
 *   dos promesas compitiendo por la caché.
 * - Si el refresco falla, se reintenta en `REINTENTO_MS`, no en la request
 *   siguiente: reintentar al toque es martillar una base ya cargada.
 * - Una lista VACÍA no reemplaza a una buena: todos los chips saldrían vacíos.
 * - Sin lista buena todavía, se espera el RPC y su error sube.
 *
 * ponytail: caché en memoria por instancia de Fluid Compute; cada instancia
 * nueva paga un RPC. Pasar a la caché de Next (compartida) si eso llega a doler.
 */
import { getNichesWithInventory } from '@ph/shared'

const TTL_MS = 10 * 60_000
const REINTENTO_MS = 60_000

let lista: string[] | null = null
let vence = 0
let enCurso: Promise<string[]> | null = null

/** Cómo mantener vivo un refresco que corre después de responder. */
type Programar = (tarea: () => Promise<unknown>) => void

function refrescar(): Promise<string[]> {
  if (enCurso) return enCurso
  const p = getNichesWithInventory()
    .then((nueva) => {
      if (!nueva.length && lista?.length) throw new Error('el RPC devolvió 0 nichos')
      lista = nueva
      vence = Date.now() + TTL_MS
      return nueva
    })
    .catch((err) => {
      vence = Date.now() + REINTENTO_MS
      throw err
    })
    .finally(() => { enCurso = null })
  enCurso = p
  return p
}

/**
 * @param programar en la ruta, `after` de `next/server`: sin él, Vercel puede
 * congelar la instancia al responder con el refresco a medias.
 */
export function nichosConInventario(programar: Programar = (t) => { void t() }): Promise<string[]> {
  if (lista && Date.now() < vence) return Promise.resolve(lista)
  if (lista) {
    const vieja = lista
    programar(() => refrescar().catch((err) =>
      console.error('[nichos-inventario] refresco fallido, sigue la lista anterior:', err)))
    return Promise.resolve(vieja)
  }
  // Primera vez (o nunca hubo una buena): no hay qué servir mientras tanto.
  // Si falla, `vence` no importa: sin `lista` la request siguiente reintenta,
  // pero comparte el `enCurso` que haya.
  return refrescar()
}

/** Solo para tests: el estado del módulo sobrevive entre casos. */
export function _resetNichosCache() {
  lista = null
  vence = 0
  enCurso = null
}
