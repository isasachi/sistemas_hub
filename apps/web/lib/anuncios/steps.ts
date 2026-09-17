/**
 * Los índices de paso del flujo de PLANTILLA, en un solo lugar.
 *
 * ⚠️ NACE DE UN BUG YA PAGADO EN ESTE REPO. En video-ads un recableado corrió "Producto" del
 * índice 2 al 1 y una ruta se quedó escribiendo el viejo: al reanudar, el wizard aterrizaba en
 * una sección cuyo dato era null y esa sección devolvía null — pantalla en blanco, sin error.
 * Por eso allá existe `lib/video-ads/steps.ts` y por eso existe esto.
 *
 * El orden tiene que coincidir con el array `SECTIONS` de `TemplateWizard`: el índice ES la
 * posición en ese array. Hay un test que lo fija.
 *
 * El flujo CLÁSICO no usa esto: sus índices están escritos a mano en sus rutas desde antes, y
 * cambiarlos ahora sería tocar el camino que funciona para ordenar el que acaba de nacer.
 */
export const STEP = {
  /** Elegir plantilla. */
  PLANTILLA: 0,
  /** Describir el producto (lo escribe `analyze-product`, compartido con el flujo clásico). */
  PRODUCTO: 1,
  /** Comentarios + cuántos anuncios. */
  LOTE: 2,
  /** Revisar los conceptos planificados. */
  CONCEPTOS: 3,
  /** El lote renderizado. */
  ANUNCIOS: 4,
} as const

export const PASOS_PLANTILLA = 5
