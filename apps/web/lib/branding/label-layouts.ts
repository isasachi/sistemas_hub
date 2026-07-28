/**
 * label-layouts.ts
 * ---------------------------------------------------------------------------
 * ESQUELETO COMPOSITIVO por estilo — el complemento estructural de styleBlock.
 *
 * `styleBlock` dice CÓMO se ve (color, material, mood). Esto dice DÓNDE va cada
 * cosa. Se separó de `StylePreset.composition`, que mezclaba dirección
 * fotográfica ("objeto centrado sobre plinto") con layout de etiqueta
 * ("jerarquía de 1 palabra grande") y contaminaba el prompt de arte plano.
 *
 * Los porcentajes son de la ALTURA del panel frontal y suman ~100. Le dan a
 * Gemini una escala relativa que sobrevive a cualquier resolución de salida.
 *
 * Derivado de referencias reales observadas por estilo (jul 2026). Las
 * anatomías son convenciones de layout de su categoría, no copias de ningún
 * diseño concreto.
 * ---------------------------------------------------------------------------
 */

import type { LabelLayout } from './types'
export type { LabelLayout }
export { layoutToPrompt } from './types'

export const LABEL_LAYOUTS: Record<string, LabelLayout> = {
  /* Ref: plantillas de etiqueta apotecario/vintage. La constante es el MARCO:
     un filete rectangular que encierra todo, con reglas horizontales que
     separan las zonas. La simetría es total y el emblema ancla el eje.
     OJO: la keyword "apothecary" arrastra mucho contenido de Halloween/pociones;
     la anatomía aquí se quedó con lo estructural (marco, reglas, simetría) y se
     descartó el envejecido/manchado, que es tratamiento y ya vive en styleBlock. */
  'neo-apotecario': {
    anatomy: [
      'filete rectangular fino enmarcando el panel completo, a ~6% del borde',
      'banda superior (~15%): emblema o sello circular pequeño, centrado, sobre regla horizontal',
      'banda de marca (~22%): nombre en serif de alto contraste, centrado, la pieza mayor del panel',
      'regla divisoria + descriptor (~10%): una línea en versalitas con tracking amplio',
      'zona central (~28%): ilustración a línea o campo de color liso, centrada y simétrica',
      'regla divisoria inferior + datos (~19%): microtexto centrado en dos columnas estrechas',
    ],
    logoPlacement:
      'emblema centrado en la banda superior, ~18% del ancho del panel; el wordmark NO se repite, el nombre de marca de la banda 2 hace de wordmark',
    dataBlock:
      'ingredientes y peso neto bajo la regla inferior, centrados, en dos columnas estrechas simétricas; nunca fuera del marco',
    margins: 'margen exterior del 6% y el filete a esa distancia; ningún elemento cruza el filete',
    alignment: 'centered',
    avoidLayout: [
      'elementos alineados a la izquierda que rompan la simetría',
      'texto que cruce o toque el filete del marco',
      'más de una regla horizontal por división de zona',
    ],
  },

  /* Ref: packaging cítrico maximalista. Color a sangre completa, sin marco. La
     fruta ocupa la mitad inferior y se recorta contra el borde; el nombre pisa
     por encima. El bloque de datos es residual, comprimido al pie. */
  'citrico-max': {
    anatomy: [
      'color a sangre completa, sin marco ni margen de color: el fondo llega a los cuatro bordes',
      'banda superior (~18%): wordmark, alineado a la izquierda',
      'banda de producto (~30%): nombre en display enorme, puede sangrar por los laterales',
      'descriptor incrustado (~8%): pastilla o cinta de color contrastante sobre la banda anterior',
      'zona gráfica (~32%): fruta o ingrediente a gran escala, recortado por el borde inferior, superponiéndose parcialmente al texto',
      'pie de datos (~12%): franja comprimida contra el borde inferior',
    ],
    logoPlacement:
      'wordmark arriba a la izquierda, ~22% del ancho; puede solaparse ligeramente con la zona gráfica pero nunca quedar tapado por ella',
    dataBlock:
      'ingredientes y peso neto en una sola franja horizontal al pie, sobre fondo plano de color contrastante para garantizar legibilidad; nunca sobre la fruta',
    margins: 'margen tipográfico del 5%; el color y la gráfica SÍ sangran, el texto no',
    alignment: 'left',
    avoidLayout: [
      'espacio en blanco vacío alrededor del panel',
      'texto de datos colocado sobre imagen o gradiente',
      'composición centrada y simétrica',
    ],
  },

  /* Ref: etiquetas de nutrición deportiva. La constante es el bloque de datos
     PROMOVIDO a elemento de diseño: dosis, activos y claims aparecen como
     ficha técnica visible al frente, no como letra pequeña legal. */
  'clinical-performance': {
    anatomy: [
      'banda superior (~14%): wordmark alineado a la izquierda, con regla fina debajo a todo el ancho',
      'banda de producto (~24%): nombre en grotesca, alineado a la izquierda',
      'fila de claims (~10%): 2 o 3 pastillas o cápsulas de datos en línea horizontal',
      'zona de dato heroico (~22%): la cifra clave (dosis o activo) a gran escala, tratada como gráfica',
      'ficha técnica (~18%): tabla de activos en dos columnas, con filetes finos entre filas',
      'pie legal (~12%): microtexto e ingredientes, alineado a la izquierda',
    ],
    logoPlacement:
      'wordmark arriba a la izquierda, ~20% del ancho, alineado a la misma columna que todo el texto del panel',
    dataBlock:
      'DOS niveles separados: la ficha técnica de activos es elemento de diseño visible en dos columnas; ingredientes y legal van aparte, en el pie, en microtexto',
    margins: 'margen del 8% en los cuatro lados, respetado estrictamente; el layout es de rejilla',
    alignment: 'left',
    avoidLayout: [
      'ilustración decorativa que compita con los datos',
      'texto centrado',
      'ficha técnica relegada al panel trasero',
    ],
  },

  /* Ref: packaging wellness beige/mate (Lumity, ASYSTEM y afines). Corrección
     sobre la v1: el vacío NO es un tercio superior desnudo — el panel impreso
     es una FAJA estrecha centrada en el cuerpo del envase, y el vacío es el
     material del envase por encima y por debajo de ella. Todo el contenido vive
     dentro de esa faja, muy compacto. */
  'rich-not-snobby': {
    anatomy: [
      'el panel impreso es una faja horizontal estrecha centrada en el cuerpo del envase; por encima y por debajo solo hay material sin imprimir',
      'zona superior del envase (~28%): sin imprimir, solo acabado soft-touch',
      'banda de marca (~14%): wordmark pequeño y centrado, en foil o tinta de contraste, con tracking muy amplio',
      'descriptor (~8%): una línea bajo el wordmark, tamaño claramente menor, mismo eje centrado',
      'banda de datos (~12%): peso neto y microtexto, centrados, inmediatamente bajo el descriptor — NO al pie del envase',
      'zona inferior del envase (~38%): sin imprimir; el vacío inferior es mayor que el superior',
    ],
    logoPlacement:
      'wordmark centrado dentro de la faja, ~25% del ancho del envase; es el único elemento prominente y nada compite con él',
    dataBlock:
      'peso neto e ingredientes centrados dentro de la faja, pegados al descriptor formando un solo bloque compacto; nunca dispersos ni al pie del envase',
    margins:
      'la faja impresa no supera el 34% de la altura del envase; el vacío inferior es mayor que el superior (proporción ~38/28)',
    alignment: 'centered',
    avoidLayout: [
      'texto distribuido a lo largo de todo el alto del envase',
      'rellenar las zonas sin imprimir',
      'más de tres elementos tipográficos en la faja',
      'bloque de datos separado del bloque de marca',
    ],
  },

  /* Ref: doypacks kraft botánicos. La constante es la VENTANA o su equivalente
     gráfico ocupando el centro, con la botánica enmarcando el nombre por los
     laterales, y sellos circulares de certificación al pie. */
  botanico: {
    anatomy: [
      'banda superior (~16%): logo o monograma centrado, pequeño',
      'zona de marca sobre botánica (~26%): nombre centrado con la ilustración botánica DETRÁS a modo de fondo de bajo contraste, no flanqueándolo',
      'descriptor (~9%): una línea centrada, sobre campo liso sin botánica detrás',
      'zona central (~30%): ventana transparente real, o campo de color liso que la simula, dejando ver el producto',
      'pie de datos + sellos (~19%): microtexto centrado con 2 o 3 sellos circulares de certificación alineados en fila',
    ],
    logoPlacement:
      'monograma centrado arriba, ~15% del ancho; la botánica lo acompaña pero nunca lo tapa',
    dataBlock:
      'ingredientes y peso neto centrados al pie, sobre el kraft liso sin gráfica detrás; los sellos circulares van en la misma banda, alineados horizontalmente',
    margins: 'margen del 9%; la botánica puede acercarse al borde pero el texto no',
    alignment: 'centered',
    avoidLayout: [
      'botánica de fondo a contraste alto que compita con la legibilidad del nombre',
      'sellos dispersos por el panel en vez de alineados al pie',
      'texto sobre la ventana o zona central',
    ],
  },

  /* Ref: sistemas de grilla del estilo tipográfico internacional. La constante
     es la GRILLA VISIBLE: columnas explícitas, alineación a línea base, y
     asimetría deliberada — el peso cae a un lado y el otro queda vacío. */
  editorial: {
    anatomy: [
      'grilla de 4 columnas implícita; todo elemento se alinea a una columna, nada flota',
      'banda superior (~12%): wordmark en la columna 1, pequeño, con regla fina a todo el ancho debajo',
      'banda de producto (~30%): nombre en grotesca a gran escala, ocupando columnas 1-3, alineado a la izquierda, con la columna 4 deliberadamente vacía',
      'descriptor (~8%): en la columna 4, alineado a la derecha, contrapesando el bloque anterior',
      'zona de color (~30%): color-block plano ocupando columnas 2-4, asimétrico respecto al bloque de marca',
      'pie de datos (~20%): microtexto en columna 1, alineado a la izquierda y a la línea base inferior',
      'columna de metadatos: lote, volumen o número de serie en vertical sobre el borde derecho, en microtexto — rasgo firma del sistema suizo',
    ],
    logoPlacement:
      'wordmark en la columna 1 de la banda superior, ~18% del ancho; jamás centrado — la asimetría es el sistema',
    dataBlock:
      'ingredientes y peso neto en la columna 1 al pie, alineados a la izquierda y a la línea base; el resto de la fila queda vacío a propósito; los metadatos secundarios (lote, volumen) van aparte en la columna vertical derecha',
    margins: 'margen del 8% con canal entre columnas del 3%; la grilla no se viola nunca',
    alignment: 'left',
    avoidLayout: [
      'composición centrada o simétrica',
      'elementos que no se alineen a una columna',
      'rellenar el vacío que contrapesa la asimetría',
    ],
  },

  /* Ref: packaging Y2K/cromado. La constante es la CAPA: elementos flotando en
     profundidades distintas, con el nombre en el plano frontal cromado y
     starbursts o blobs detrás. El orden de zonas es laxo, la estratificación no. */
  'future-nostalgia': {
    anatomy: [
      'fondo con gradiente o campo holográfico cubriendo el panel completo',
      'banda superior (~16%): wordmark en cromo, centrado, con starburst o destello detrás',
      'banda de producto (~30%): nombre en display burbuja tratado como OBJETO 3D cromado con volumen y reflejos, no como texto plano coloreado; centrado, ligeramente rotado o en arco',
      'descriptor en cápsula (~10%): pastilla de color liso con borde, superpuesta al bloque anterior',
      'zona de blobs (~26%): formas orgánicas o estrellas flotando en el fondo, DETRÁS del texto',
      'pie de datos (~18%): franja de color liso al pie, opaca, que corta el gradiente',
    ],
    logoPlacement:
      'wordmark cromado centrado arriba, ~28% del ancho, siempre en el plano frontal; ningún blob se superpone encima de él',
    dataBlock:
      'ingredientes y peso neto sobre franja opaca de color liso al pie, que interrumpe el gradiente para garantizar contraste; nunca sobre cromo ni gradiente',
    margins: 'margen tipográfico del 6%; el fondo y los blobs sangran, el texto no',
    alignment: 'centered',
    avoidLayout: [
      'texto de datos sobre gradiente, cromo u holográfico',
      'blobs superpuestos encima del wordmark',
      'composición plana sin estratificación de capas',
    ],
  },
}

/** Acceso con error explícito, en línea con getPreset. */
export function getLayout(styleId: string): LabelLayout {
  const l = LABEL_LAYOUTS[styleId]
  if (!l) {
    throw new Error(
      `Layout desconocido: "${styleId}". Válidos: ${Object.keys(LABEL_LAYOUTS).join(', ')}`,
    )
  }
  return l
}
