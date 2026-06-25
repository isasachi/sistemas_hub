import type { SearchResponse } from '@ph/shared'

// Resuelve el status de búsqueda cuando NO se está en cold-start. toCard descarta
// los productos sin analizar (score=null), así que 0 cards no basta para 'empty':
// hay que saber si el análisis sigue en curso (pendingAnalysis > 0).
//   ready   → hay ganadores que mostrar
//   pending → nunca scrapeado / en cola, o scrapeado pero aún analizando
//   empty   → ya analizado por completo y ningún producto cumple las reglas
export function resolveSearchStatus(
  productCount: number,
  nicheStatus: string,
  pendingAnalysis: number,
): SearchResponse['status'] {
  if (productCount > 0) return 'ready'
  if (nicheStatus !== 'active') return 'pending'
  return pendingAnalysis > 0 ? 'pending' : 'empty'
}
