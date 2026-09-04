/**
 * NICHOS DEL GENERADOR DE VIDEO ADS.
 * ---------------------------------------------------------------------------
 * No son "varios generadores": es el mismo pipeline con una diferencia que sí es
 * estructural. En suplementos el producto es un OBJETO que el personaje sostiene; en
 * ropa y zapatos el producto es algo que LLEVA PUESTO, y ahí el producto y el vestuario
 * dejan de ser dos cosas.
 *
 * Eso rompe dos sitios concretos del pipeline actual:
 *
 *  1. `bloqueConsistencia` describe el vestuario (copiado del video original) y viaja
 *     ÍNTEGRO a cada lote junto a `productDesc`. Con una blusa el prompt afirma "viste
 *     camiseta rosa" y "el producto es una blusa crema" en el mismo texto.
 *  2. El prompt que genera el avatar pide explícitamente "sin el producto en el
 *     encuadre" — que para ropa es justo al revés.
 *
 * Por eso `wornProduct` es el único eje que hay acá y no una lista de features por
 * nicho: es la diferencia que el código necesita conocer. Lo demás (el tono del
 * análisis, qué mirar de la prenda) son matices de prompt colgados del mismo eje.
 *
 * ponytail: tres nichos, un booleano y un par de strings. Si algún día un nicho pide
 * algo que no se deriva de `wornProduct`, ahí se agranda — no antes.
 */

export const NICHES = ['suplementos', 'ropa', 'zapatos'] as const
export type Niche = (typeof NICHES)[number]

export const NICHE_DEFAULT: Niche = 'suplementos'

/**
 * BLOQUEO TEMPORAL (2026-08-21, a pedido del dueño del repo): solo se ofrece UGC de
 * suplementos. Los specs de ropa y calzado se conservan enteros — lo único que cambia es
 * que no se ofrecen y que `toNiche` los normaliza al default, con lo que TODO el pipeline
 * (`nicheSpec` en character.ts, lotes.ts y la ruta de personaje) los trata como
 * suplementos: una fila guardada con `niche='ropa'` deja de activar el camino de prenda.
 * Para devolverlos, vaciar esta lista. ponytail: una lista, no un feature flag.
 */
export const NICHES_BLOQUEADOS: readonly Niche[] = ['ropa', 'zapatos']

/** Lo que la UI puede ofrecer. */
export const NICHES_ACTIVOS = NICHES.filter((n) => !NICHES_BLOQUEADOS.includes(n))

export function isNiche(v: unknown): v is Niche {
  return typeof v === 'string' && (NICHES as readonly string[]).includes(v)
}

/**
 * Normaliza lo que venga de la base o del cliente. Las filas legadas no tienen nicho, y
 * un nicho bloqueado cae al default igual que un valor desconocido — es lo que desvincula
 * el pipeline sin tocar ninguna fila.
 */
export function toNiche(v: unknown): Niche {
  return isNiche(v) && !NICHES_BLOQUEADOS.includes(v) ? v : NICHE_DEFAULT
}

export interface NicheSpec {
  label: string
  /** El producto se LLEVA PUESTO en vez de sostenerse. Es el eje que cambia el código. */
  wornProduct: boolean
  /** Qué es "el producto" para el usuario, en la UI del paso 2. */
  productHint: string
  /** Se agrega al prompt de identidad cuando el producto se lleva puesto. */
  avatarNote: string
  /** Rótulo del bloque de producto dentro del prompt de cada lote. */
  productBlock: string
}

export const NICHE_SPEC: Record<Niche, NicheSpec> = {
  suplementos: {
    label: 'Suplementos y cuidado personal',
    wornProduct: false,
    productHint: 'Foto del envase sobre fondo limpio',
    avatarNote: '',
    productBlock:
      'PRODUCTO (debe verse idéntico a su imagen de referencia — misma forma, etiqueta,\ncolores y texto; nunca lo rediseñes):',
  },
  ropa: {
    label: 'Ropa',
    wornProduct: true,
    productHint: 'Foto de la prenda: sobre maniquí, de catálogo o extendida',
    avatarNote:
      'EL PRODUCTO ES ROPA Y EL PERSONAJE LO LLEVA PUESTO. La imagen de la prenda es la ' +
      'fuente de verdad de corte, color, tejido, largo, cuello, mangas, puños y todo ' +
      'detalle visible: el avatar debe aparecer vistiéndola, no sosteniéndola. Reproduce ' +
      'la prenda tal cual — no cambies su color ni le agregues estampados, y complétala ' +
      'con prendas neutras y lisas que no compitan con ella. El vestuario del video ' +
      'original NO se copia: la prenda del usuario lo reemplaza.',
    productBlock:
      'PRODUCTO — ES LA PRENDA QUE EL PERSONAJE LLEVA PUESTA, no un objeto que sostiene.\nDebe verse idéntica a su imagen de referencia (mismo corte, color, tejido y detalles):',
  },
  zapatos: {
    label: 'Calzado',
    wornProduct: true,
    productHint: 'Foto del par: de catálogo o sobre fondo limpio',
    avatarNote:
      'EL PRODUCTO ES CALZADO Y EL PERSONAJE LO LLEVA PUESTO. La imagen del par es la ' +
      'fuente de verdad de forma, color, material, suela y altura: el avatar debe ' +
      'aparecer calzándolo, no sosteniéndolo. Reproduce el par tal cual y viste al ' +
      'personaje con prendas neutras que dejen el calzado visible. El calzado del video ' +
      'original NO se copia: el del usuario lo reemplaza.',
    productBlock:
      'PRODUCTO — ES EL CALZADO QUE EL PERSONAJE LLEVA PUESTO, no un objeto que sostiene.\nDebe verse idéntico a su imagen de referencia (misma forma, color, material y suela):',
  },
}

export const nicheSpec = (n: unknown): NicheSpec => NICHE_SPEC[toNiche(n)]
