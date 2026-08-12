/**
 * Índice de paso del wizard — fuente de verdad única.
 *
 * Antes de este módulo, el número de paso vivía repetido (y a veces
 * desincronizado) en las rutas que persisten `video_sessions.step`, en
 * `VideoWizard.tsx` y en los componentes de cada sección. El recableado a una
 * sola línea de entrada corrió el índice de "Producto" (2→1) y "Personaje"
 * (3→2), y `analyze-product/route.ts` se quedó escribiendo el número viejo
 * (`step: 3`, el índice de "Validación" en el wizard nuevo): al reanudar una
 * sesión, el wizard aterrizaba en Validación sin datos de validación y
 * renderizaba una pantalla en blanco (`Section3Validation` hace
 * `if (!validation) return null`).
 *
 * `SECTIONS` en `VideoWizard.tsx` sigue siendo un array posicional (el orden
 * importa para el riel); este objeto es la fuente de verdad de a qué paso
 * corresponde cada posición, para que rutas, wizard y secciones lean del mismo
 * lugar en vez de repetir el número.
 */
export const STEP = {
  REFERENCE: 0,
  PRODUCT: 1,
  CHARACTER: 2,
  VALIDATION: 3,
  TEMPLATE: 4,
} as const
