// Plan 13 parte C: selección rotativa de keywords para el cron.
// Cada corrida toma una ventana de `window` keywords empezando en `cursor` (con
// wrap-around) y avanza el cursor, de modo que crons sucesivos cubren distintas
// keywords del pool → descubren anunciantes nuevos sin re-buscar siempre lo mismo.
// Función pura, testeable. La activa scripts/resolve.ts solo si PH_KEYWORD_ROTATION=1.

export interface Rotation {
  selected: string[]
  nextCursor: number
}

export function rotateKeywords(keywords: string[], cursor: number, window: number): Rotation {
  const n = keywords.length
  // Pool más chico que la ventana → usar todo, sin rotar.
  if (n === 0 || window >= n) return { selected: [...keywords], nextCursor: 0 }

  const start = ((cursor % n) + n) % n // normaliza negativos / fuera de rango
  const selected: string[] = []
  for (let i = 0; i < window; i++) {
    selected.push(keywords[(start + i) % n])
  }
  return { selected, nextCursor: (start + window) % n }
}
