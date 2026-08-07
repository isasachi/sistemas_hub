/** Item uniforme que devuelven todos los GET /api/<tool>/sessions. */
export interface HistoryItem {
  id: string
  created_at: string
  step: number
  title: string
  thumb: string | null
  done: boolean
}

/**
 * Qué avisos muestra la vista inicial de una tool. `items` llega de
 * GET /api/<tool>/sessions con la más reciente primero.
 *
 * Retomar se ofrece SOLO si la última sesión pasó del paso 1 sin terminarse:
 * una sesión recién creada (step 0) no es "algo a medias", y si lo último que
 * hizo el usuario fue terminar, no hay nada que retomar. La última terminada se
 * busca aparte, así sigue apareciendo aunque encima haya una sesión en curso.
 */
export function pickIntroState(items: HistoryItem[] | null): {
  last: HistoryItem | null
  resume: HistoryItem | null
} {
  const ultima = items?.[0] ?? null
  return {
    last: items?.find((s) => s.done) ?? null,
    resume: ultima && !ultima.done && ultima.step > 0 ? ultima : null,
  }
}
