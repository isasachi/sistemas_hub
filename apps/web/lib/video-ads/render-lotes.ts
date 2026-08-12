import type { Lote } from './lotes'

/**
 * Lógica pura de orquestación del render por lotes (Task 6, fix rounds 1 y 2).
 * ---------------------------------------------------------------------------
 * Separada de la ruta para poder probarla sin red: `generate-lotes/route.ts` pega
 * contra KIE, Supabase y `gen-quota`, pero la aritmética de qué se guarda cuando
 * algo falla a mitad de camino, quién puede reanudar y si eso cuenta como una
 * generación nueva no necesita nada de eso.
 *
 * Estas funciones existen por un mismo motivo: un lote ya creado en KIE está
 * PAGADO. Perder su `taskId` (recreándolo, o simplemente no guardándolo cuando algo
 * más adelante en el loop falla) es dinero gastado en un video que el usuario nunca
 * podrá ver ni recuperar. `isPaidResume` cubre el caso simétrico: dejar de cobrar
 * una generación que SÍ se pagó, o cobrarla de más porque un cliente pidió
 * "reanudar" sin que hubiera nada real que reanudar.
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
 * `true` solo si `resume` es una reanudación REAL — es decir, si ya existe al menos
 * un `taskId` pagado en la sesión (fix round 2). Sin esta verificación, un cliente
 * que mande `{ resume: true }` sobre una sesión que nunca llegó a gastar un centavo
 * (por ejemplo, la primera llamada falló armando el prompt del lote 1 y nunca tocó
 * KIE) se trataría como "ya pagó su generación" y se saltaría el cobro de
 * `video-generation` — un hueco para no pagar nunca por la generación. El flag del
 * cliente es una intención, no un hecho: el hecho es si `existentes` tiene algo
 * pagado.
 */
export function isPaidResume(resume: boolean, existentes: Lote[]): boolean {
  return resume && existentes.some((l) => l.taskId != null)
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
