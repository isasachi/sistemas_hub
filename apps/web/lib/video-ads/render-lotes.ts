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
 * `true` solo si `resume` es una reanudación REAL y SEGURA de reanudar por índice.
 * Dos condiciones, ninguna opcional:
 *
 * 1. Que ya exista al menos un `taskId` pagado en la sesión (fix round 2). Sin esto,
 *    un cliente que mande `{ resume: true }` sobre una sesión que nunca llegó a
 *    gastar un centavo (la primera llamada falló armando el prompt del lote 1 y
 *    nunca tocó KIE) se trataría como "ya pagó su generación" y se saltaría el cobro
 *    de `video-generation` — un hueco para no pagar nunca. El flag del cliente es
 *    una intención, no un hecho: el hecho es si `existentes` tiene algo pagado.
 *
 * 2. Que `base` (el guión recalculado por `groupIntoLotes` EN ESTA llamada) tenga el
 *    mismo número de lotes que `existentes` (fix round 3). `resumeSeed` empareja por
 *    ÍNDICE: si el guión se re-adaptó (`video-adapt` no tiene tope per-step, así que
 *    nada impide re-adaptarlo a más o menos tomas y volver a llamar acá con
 *    `resume: true`), ese emparejamiento deja de tener sentido y el hueco es doble —
 *    de costo (`reanuda` seguía dando `true`, así que el gate de `video-generation`
 *    se saltaba entero: tareas nuevas gratis, repetible cada vez que se re-adapta) y
 *    de correctitud, peor: si el guión CRECIÓ, `resumeSeed` mezcla en el mismo array
 *    lotes ya renderizados del guión VIEJO con lotes nuevos del guión ACTUAL (video
 *    incoherente); si el guión se ENCOGIÓ, `base.map(...)` devuelve menos entradas y
 *    los lotes pagados que quedaban más allá del nuevo final se descartan EN
 *    SILENCIO — el mismo dinero huérfano que el rescate del round 1 existe para
 *    evitar, ahora por la puerta de reanudar.
 *
 * Por qué la longitud alcanza y no hace falta comparar contenido: el bug que este
 * chequeo cierra es de EMPAREJAMIENTO POR ÍNDICE, no de contenido — `resumeSeed` no
 * lee qué dice `base[i]` para decidir si reusar `existentes[i]`, solo compara
 * posiciones. Un guión editado que conserva el mismo número de lotes no rompe ese
 * emparejamiento: los índices ya pagados se conservan intactos (`resumeSeed` los
 * prefiere sin mirar `base` ahí) y los pendientes simplemente renderizan el texto
 * editado — que es el comportamiento correcto de "edité una línea que todavía no se
 * pagó y reanudo". Exigir además contenido idéntico bloquearía ese flujo legítimo
 * (cualquier corrección de typo en un lote sin pagar forzaría a re-pagar toda la
 * generación). Queda un hueco angosto sin cerrar, documentado y no arreglado acá:
 * editar repetidamente el contenido de los lotes pendientes SIN cambiar la cantidad
 * de lotes, forzando un fallo parcial en cada ronda para mantener siempre algo
 * "pendiente" gratis — mucho más estrecho que el exploit que este chequeo cierra,
 * porque un `resume` exitoso llena TODOS los pendientes de una sola vez y no deja
 * nada gratis para la siguiente ronda.
 */
export function isPaidResume(resume: boolean, existentes: Lote[], base: Lote[]): boolean {
  return resume && existentes.some((l) => l.taskId != null) && base.length === existentes.length
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
