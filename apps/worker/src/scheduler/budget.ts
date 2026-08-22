// Presupuesto de descubrimiento vs mantenimiento (spec §9).
//
// ⚠️ ES UN REPARTO FIJO Y NO UNA PRIORIDAD. Sin la separación, el recrawl acaba
// consumiendo toda la capacidad conforme crece el inventario —cada anunciante
// nuevo suma una auditoría periódica— y el motor deja de descubrir sin que nada
// lo reporte: la cola sigue llena, los workers siguen ocupados y el inventario
// deja de crecer.

/** 60% descubrimiento, 40% recrawl. El número es del spec. */
export const FRACCION_DESCUBRIMIENTO = 0.6

export interface Reparto { descubrir: number; recrawl: number }

/**
 * Cómo se reparte la capacidad de UN ciclo.
 *
 * ⚠️ El descubrimiento redondea hacia ARRIBA. Con capacidad 1, un redondeo hacia
 * abajo daría `descubrir: 0` y el motor pasaría el ciclo entero manteniendo lo
 * que ya tiene — que es exactamente el fallo que este reparto existe para
 * evitar, reproducido en chiquito.
 */
export function repartoCiclo(capacidad: number): Reparto {
  const cap = Math.max(0, Math.floor(capacidad))
  if (cap === 0) return { descubrir: 0, recrawl: 0 }
  const descubrir = Math.min(cap, Math.ceil(cap * FRACCION_DESCUBRIMIENTO))
  return { descubrir, recrawl: cap - descubrir }
}
