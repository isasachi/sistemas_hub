import type { Lote } from './lotes'

/**
 * Predicados puros sobre un `Lote` — extraídos de `Section6Lotes.tsx` (fix round 1
 * de Task 7) para poder testearlos sin montar React: Vitest corre este workspace en
 * `environment: 'node'`, sin jsdom, así que un componente no se puede montar, pero
 * una función pura sobre un objeto sí.
 *
 * Acá vivía el bug del fix round 1: `isStuck` exige NO tener `taskId`, así que un
 * lote que SÍ tiene una tarea en curso pero todavía no tiene video no cae en "a
 * medias" — hace falta `isInFlight` para saber que sigue vivo. Confundir los dos (o,
 * como pasaba antes, dejar que el estado "terminado" de la UI dependiera solo de si
 * el polling seguía corriendo) es lo que hacía que un render que se cayó por un
 * error de red se viera como terminado sin estarlo.
 */

/** Un lote con `taskId` y sin `videoUrl` (y sin `status: 'fail'`) todavía puede
 *  cambiar de estado en el próximo sondeo — es el único caso que justifica seguir
 *  llamando a `lote-status`. */
export function isInFlight(l: Lote): boolean {
  return !!l.taskId && !l.videoUrl && l.status !== 'fail'
}

/** Un lote SIN `taskId` nunca arrancó una tarea en el proveedor: quedó así porque el
 *  loop de `generate-lotes` se cortó a mitad de camino (prompt que no entró en el
 *  tope, o un fallo de red/API) — ver el rescate parcial documentado en esa ruta. No
 *  tiene identificador que consultar, así que jamás se va a resolver por sí solo con
 *  `lote-status`; `done` tampoco lo cuenta como terminado. Es el único caso que un
 *  reintento explícito (`resume: true`) puede arreglar.
 *
 *  Un lote `fail` SIEMPRE tiene `taskId` (el estado sale de consultarle al
 *  proveedor una tarea que existe), así que nunca cae acá — no es "a medias", es un
 *  resultado final que la tarjeta ya muestra con su `failMsg`. */
export function isStuck(l: Lote): boolean {
  return !l.taskId && !l.videoUrl
}
