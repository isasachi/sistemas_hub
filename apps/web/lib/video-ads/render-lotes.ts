import type { Lote } from './lotes'

/**
 * Lógica pura de orquestación del render por lotes (Task 6, fix round 1).
 * ---------------------------------------------------------------------------
 * Separada de la ruta para poder probarla sin red: `generate-lotes/route.ts` pega
 * contra KIE, Supabase y `gen-quota`, pero la aritmética de cuánto cuesta reanudar
 * y qué se guarda cuando algo falla a mitad de camino no necesita nada de eso.
 *
 * Estas tres funciones existen por un mismo motivo: un lote ya creado en KIE está
 * PAGADO. Perder su `taskId` (recreándolo, o simplemente no guardándolo cuando algo
 * más adelante en el loop falla) es dinero gastado en un video que el usuario nunca
 * podrá ver ni recuperar.
 */

/** Suma la duración real de un array de lotes, placeholders incluidos: `duracionSeg`
 *  ya viene calculado por `groupIntoLotes` para TODOS los lotes, hayan arrancado su
 *  render o no, así que sirve igual para un render completo que para un rescate
 *  parcial. */
export function totalDuration(lotes: Lote[]): number {
  return lotes.reduce((n, l) => n + l.duracionSeg, 0)
}

/**
 * Empareja `base` (recién recalculado por `groupIntoLotes`, siempre determinista
 * mientras `adapted.tomas` no cambie) con lo que ya estaba guardado en la sesión,
 * por ÍNDICE: si la posición `i` ya tiene un `taskId`, esa tarea ya está pagada y se
 * conserva tal cual — no se crea una nueva. Si no, se usa el lote fresco de `base`
 * (idle, sin taskId), que sí va a intentar crear tarea.
 *
 * Esto es lo que hace que reanudar un render parcial no vuelva a cobrar por los
 * lotes que ya se pagaron la primera vez.
 */
export function resumeSeed(base: Lote[], existentes: Lote[]): Lote[] {
  return base.map((lote, i) => (existentes[i]?.taskId ? existentes[i] : lote))
}

/**
 * Arma el array a persistir cuando el loop de creación no llega al final: los
 * primeros `completados.length` lotes son los que sí arrancaron (con `taskId` real,
 * ya pagados), y el resto sale de `seed` tal cual — placeholders `idle` sin tocar.
 *
 * Por qué placeholders y no simplemente los lotes que sí completaron: si el array
 * persistido tuviera SOLO los completados, `lote-status` (`done = lotes.every(...)`)
 * vería un array de largo 1 en un guión de 3 lotes y lo reportaría `done: true` con
 * un tercio del video — la sesión se marcaría terminada sin estarlo, y no quedaría
 * ninguna traza de que faltan 2 lotes por render. Con los placeholders (`status:
 * 'idle'`, sin `taskId`) el array sigue teniendo los 3, `done` se mantiene en falso,
 * y `resumeSeed` sabe exactamente qué falta la próxima vez.
 */
export function mergeRescue(seed: Lote[], completados: Lote[]): Lote[] {
  return [...completados, ...seed.slice(completados.length)]
}

/**
 * `null` si la cuota alcanza para los `pendientes` lotes que faltan crear; si no,
 * el mensaje en español que ya arma la ruta (extraído para poder probar el cálculo
 * —el error real está en el signo de la desigualdad o en el redondeo del resto, no
 * en la redacción— sin mockear Supabase).
 */
export function renderQuotaError(pendientes: number, usados: number, limit: number): string | null {
  if (usados + pendientes <= limit) return null
  const restantes = limit - usados
  return `Este guión necesita ${pendientes} ${pendientes === 1 ? 'render' : 'renders'} y te ${restantes === 1 ? 'queda 1' : `quedan ${restantes}`}. Acorta el guión o empieza otra sesión.`
}
