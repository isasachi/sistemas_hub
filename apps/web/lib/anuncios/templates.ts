import type { ReferenceAnalysis } from '@/lib/types'

/**
 * LAS 8 PLANTILLAS CURADAS — el eje A del spec (§3), y la mitad "cómo se ve" de la tríada
 * TEMPLATE / CONCEPT / VARIANT (§38).
 *
 * ⚠️ UNA PLANTILLA ES UNA REFERENCIA YA ANALIZADA, y esa es toda la arquitectura.
 *
 * El spec propone (§6) compilar la plantilla una vez a un `visualBlueprint` y saltarse el
 * análisis forense en cada generación. En este repo eso NO necesita un pipeline nuevo: el
 * forense ya produce un `ReferenceAnalysis` que se persiste en la sesión, así que una plantilla
 * es exactamente ese objeto escrito a mano en vez de extraído de una imagen del usuario.
 *
 * Consecuencia práctica, y es la razón de que el flujo de plantilla sea barato: al elegir una,
 * la ruta escribe `reference_url` (la imagen maestra) y `reference_analysis` (este blueprint) en
 * la sesión, y de ahí en adelante **todo el pipeline existente corre sin cambios** —
 * `analyze-product`, STEP5, `editImage`, `refine-image` y hasta la miniatura del dashboard, que
 * filtra por `reference_url is not null`.
 *
 * ⚠️ LA IMAGEN MAESTRA NO SE PUEDE REEMPLAZAR POR ESTE TEXTO. Medido tres veces en este repo (el
 * bloque SETTING AND LIGHTING de landing, el avatar como `@image(1)` en video, el layout que
 * `editImage` saca de la Imagen 1): la imagen le gana al texto. El blueprint es el insumo del
 * PLANNER y de STEP5; la imagen maestra se sigue adjuntando como Imagen 1 en el render.
 *
 * ⚠️ `bodyFocus` es `null` en las 8, y no es un olvido. Una plantilla es agnóstica del producto:
 * no puede apuntar a una zona del cuerpo antes de saber qué se vende. Con `null`, §10 de STEP5
 * se salta el re-apuntado — que es lo correcto, porque no hay ningún marcador mal apuntado que
 * corregir. La zona la expresa el copy.
 */

/** El objetivo publicitario que agrupa a la plantilla en el selector (§31). */
export type ObjetivoPlantilla = 'captar' | 'educar' | 'persuadir' | 'convertir'

export const OBJETIVOS: Record<ObjetivoPlantilla, string> = {
  captar: 'Captar atención',
  educar: 'Educar',
  persuadir: 'Persuadir',
  convertir: 'Convertir',
}

/**
 * Un hueco de texto de la plantilla, con significado semántico (§8).
 *
 * ⚠️ NUNCA `{TEXT_1}`, `{TEXT_2}`. El nombre del slot es su ROL PERSUASIVO, por el mismo motivo
 * por el que el flujo clásico ya obliga a nombrar los elementos así: es lo que le permite al
 * planificador decidir qué idea va en cada hueco antes de redactar, y lo que impide que dos
 * slots digan lo mismo.
 */
export interface TemplateSlot {
  /** Id estable, en mayúsculas — viaja al prompt y se guarda en la variante. */
  id: string
  /** Cómo se llama el elemento en el copy final (el `element` de `CopyElement`). */
  rol: string
  /** Lo que ve el usuario en pantalla. */
  etiqueta: string
  /**
   * Tope de palabras. ⚠️ NO se manda como `maxLength` al schema del modelo: medido en landing,
   * OpenAI lo aplica AL DECODIFICAR y devuelve el texto CORTADO a mitad de frase en vez de uno
   * más corto. Va como instrucción en el prompt y se verifica después (`recortarSlots`).
   */
  maxPalabras: number
  /** Registro pedido para este hueco. */
  tono: string
  /**
   * De dónde sale el texto. `producto` = lo copia el código desde la sesión (el nombre de la
   * marca no se le pide a un modelo que lo puede reescribir); `modelo` = lo redacta el LLM.
   */
  fuente: 'modelo' | 'producto'
}

export interface CreativeTemplate {
  id: string
  nombre: string
  objetivo: ObjetivoPlantilla
  /** Una línea para la tarjeta del selector. */
  descripcion: string
  /** Para qué producto/objetivo conviene (§2 `recommendedFor`). */
  recomendadaPara: string
  slots: TemplateSlot[]
  /**
   * Reglas de copy propias de esta familia, que van al prompt del lote. Son las que impiden que
   * el mecanismo se rompa: en un antes/después los dos lados no son intercambiables, en una
   * comparativa no se nombra a un competidor real, etc.
   */
  reglasCopy: string[]
  /**
   * El prompt con el que se GENERA la imagen maestra (`scripts/generar-plantillas.ts`). Se corre
   * una vez y la imagen se sube al bucket; no corre en ninguna request de usuario.
   */
  promptMaestro: string
  /** El blueprint precomputado — lo que el forense habría extraído de la imagen maestra. */
  blueprint: ReferenceAnalysis
}

/**
 * Paleta neutra compartida por las 8 maestras, y es una decisión de diseño, no de gusto.
 *
 * §5 de STEP5 mapea la paleta de la referencia sobre la marca del usuario ROL POR ROL. Una
 * maestra con colores de marca fuertes le daría al modelo dos paletas peleando; una neutra
 * (papel, tinta, un solo acento) se recolorea limpio para cualquier marca.
 */
const PALETA_NEUTRA =
  'fondo papel hueso #F4F1EC, tinta gris muy oscura #1C1C1E para los titulares, ' +
  'un ÚNICO acento cálido #C8553D para el elemento de acción, y gris medio #8A8A8E para el texto secundario'

const TIPOGRAFIA_NEUTRA =
  'Titular en grotesca sans muy bold, caja alta, tracking ajustado, alineado a la izquierda. ' +
  'Subtítulo y cuerpo en la misma familia en peso regular, caja normal, a la mitad del tamaño del ' +
  'titular. Números y rótulos en la misma sans en bold. Sin serif, sin script, sin efectos sobre ' +
  'las letras salvo donde el layout pida una caja de resalte.'

/** Lo común a las 8: son maquetas neutras, no anuncios de una marca concreta. */
const ESTILO_MAESTRA =
  'Diseño publicitario editorial limpio para feed de Instagram, relación de aspecto 4:5 exacta. ' +
  `Paleta: ${PALETA_NEUTRA}. ${TIPOGRAFIA_NEUTRA} ` +
  'Es una MAQUETA neutra: no incluyas ningún logotipo, ninguna marca real, ningún nombre de ' +
  'producto inventado ni ninguna cifra de precio, descuento, calificación o número de reseñas. ' +
  'Donde va el producto, deja un envase genérico sin etiqueta legible. Fotografía realista, luz ' +
  'suave y pareja, sin filtros de belleza ni acabado plástico. Sin marcas de agua, sin interfaz ' +
  'de red social, sin bordes ni marcos decorativos.'

/** Los campos del blueprint que son idénticos en las 8, para no repetirlos ocho veces. */
function blueprintBase(): Pick<
  ReferenceAnalysis,
  'format' | 'style' | 'colorimetry' | 'typography' | 'bodyFocus' | 'replacements'
> {
  return {
    format: { ratio: '4:5', platform: 'Instagram / Facebook feed' },
    style: 'Publicitario editorial limpio: mucho aire, jerarquía tipográfica marcada, fotografía realista con luz suave y un único color de acento.',
    colorimetry: `Fondo claro dominante (papel hueso), tinta oscura para el texto principal, un ÚNICO acento cálido reservado al elemento de acción y gris medio para el texto secundario. Estructura de contraste: ${PALETA_NEUTRA}.`,
    typography: TIPOGRAFIA_NEUTRA,
    // Agnóstica del producto: una maqueta no puede apuntar a una zona del cuerpo antes de saber
    // qué se vende. Ver la nota de cabecera.
    bodyFocus: null,
    replacements: ['el envase genérico', 'los textos de la maqueta', 'la zona de marca'],
  }
}

export const TEMPLATES: CreativeTemplate[] = [
  // ─── 1 · Antes y después ────────────────────────────────────────────────────
  {
    id: 'antes-despues',
    nombre: 'Antes y después',
    objetivo: 'captar',
    descripcion: 'Dos mitades que contrastan el problema con el resultado.',
    recomendadaPara: 'Skincare, cabello, fitness, limpieza, hogar, restauración — todo producto con transformación visible.',
    slots: [
      { id: 'BEFORE_LABEL', rol: 'rótulo antes', etiqueta: 'Rótulo del lado "antes"', maxPalabras: 3, tono: 'seco, factual', fuente: 'modelo' },
      { id: 'AFTER_LABEL', rol: 'rótulo después', etiqueta: 'Rótulo del lado "después"', maxPalabras: 3, tono: 'seco, factual', fuente: 'modelo' },
      { id: 'PROBLEM', rol: 'problema', etiqueta: 'El problema (lado izquierdo)', maxPalabras: 8, tono: 'la queja en las palabras de la audiencia', fuente: 'modelo' },
      { id: 'RESULT', rol: 'resultado', etiqueta: 'El resultado (lado derecho)', maxPalabras: 8, tono: 'concreto, sin superlativos', fuente: 'modelo' },
      { id: 'TIME_FRAME', rol: 'plazo', etiqueta: 'Plazo', maxPalabras: 4, tono: 'específico', fuente: 'modelo' },
      { id: 'PRODUCT_NAME', rol: 'marca', etiqueta: 'Nombre del producto', maxPalabras: 4, tono: '—', fuente: 'producto' },
    ],
    reglasCopy: [
      'Los dos lados NO son intercambiables: el izquierdo enuncia el PROBLEMA y el derecho el RESULTADO. Nunca los cruces y nunca hagas que digan lo mismo.',
      'El rótulo de cada lado no puede ser la palabra "Antes" ni "Después" a secas: la maqueta ya los dibuja como pastillas. Nombra el ESTADO ("Semana 1" / "Semana 4", "Con lo de siempre" / "Con esto").',
      'El plazo lo dice el usuario o no se dice: nunca inventes "en 7 días" si nadie lo dio.',
    ],
    promptMaestro:
      `${ESTILO_MAESTRA} Composición: el lienzo partido verticalmente en dos mitades iguales por ` +
      'una línea vertical fina. Cada mitad muestra la misma escena fotográfica en dos estados, con ' +
      'una pastilla redondeada rotulada arriba de cada una (la izquierda en gris, la derecha en el ' +
      'color de acento). Debajo de cada mitad, una línea de texto corta. Abajo del todo, una banda ' +
      'con el envase genérico a la izquierda y una línea de texto a su derecha. ' +
      'Textos de maqueta exactos, no agregues otros: pastilla izquierda "ANTES", pastilla derecha ' +
      '"DESPUÉS", bajo la izquierda "El problema va aquí", bajo la derecha "El resultado va aquí", ' +
      'en la banda inferior "En 30 días".',
    blueprint: {
      ...blueprintBase(),
      composition: [
        'Lienzo partido verticalmente en dos mitades iguales por una línea fina',
        'Una pastilla rotulada corona cada mitad: la izquierda en gris, la derecha en el color de acento',
        'Una línea de texto corta bajo cada mitad',
        'Banda inferior con el producto a la izquierda y el plazo a su derecha',
      ],
      physicalPosition: 'El producto descansa sobre la banda inferior, apoyado, alineado a la izquierda, con sombra suave de contacto. Cámara frontal a la altura del envase.',
      // ⚠️ El plazo se dibuja MUCHO más grande que el resto — es el segundo elemento tipográfico
      // en peso después de las pastillas. Está acá porque STEP5 congela la jerarquía de tamaños
      // entre bloques (§6) y arma el instructivo con TEXTO PURO: lo que no diga este campo, no
      // existe para él.
      typography: `${TIPOGRAFIA_NEUTRA} El plazo de la banda inferior va en un cuerpo MUY grande, del alto del envase que tiene al lado, en la misma sans bold en caja normal: es el remate visual del anuncio, no una línea de pie.`,
      persuasiveLogic: 'Prueba por contraste: el espectador ve el estado que padece a la izquierda y el que desea a la derecha, y el plazo hace la promesa creíble.',
      layoutDescription: 'División vertical 50/50 con banda inferior de marca. Lectura en Z: pastilla izquierda → pastilla derecha → textos → producto.',
      sceneElements: {
        // ⚠️ LA MISMA PERSONA EN LAS DOS MITADES, y por eso está declarada. Con `people` vacío,
        // §10 de STEP5 no tendría sujeto primario que adaptar al público del usuario — y el
        // anuncio saldría con la demografía de la maqueta pase lo que pase.
        people: ['la misma persona adulta en las dos mitades, de medio cuerpo y en el mismo ángulo, mostrando el estado inicial a la izquierda y el resultado a la derecha'],
        props: ['envase genérico sin etiqueta en la banda inferior'],
        brandElements: [],
        setting: 'Fondo de estudio claro y uniforme, idéntico en las dos mitades para que el único cambio sea el estado de la persona.',
      },
      creativeConcept:
        'Antes/después: dos mitades verticales de la MISMA escena, la izquierda rotulada con el estado inicial y su problema, la derecha con el estado final y su resultado, separadas por una línea y cerradas por una banda con el producto y el plazo.',
      attentionMarkers: [
        'La línea divisoria vertical al centro, que obliga a comparar los dos lados',
        'La pastilla rotulada sobre cada mitad',
        'El contraste de color entre la pastilla gris (izquierda) y la de acento (derecha)',
      ],
      summaryForUser: 'Dos mitades que comparan el antes con el después, con el producto y el plazo cerrando abajo.',
    },
  },

  // ─── 2 · Testimonio UGC ─────────────────────────────────────────────────────
  {
    id: 'ugc-testimonio',
    nombre: 'Testimonio UGC',
    objetivo: 'captar',
    descripcion: 'Se ve como el contenido casero de una clienta, no como un anuncio.',
    recomendadaPara: 'Cualquier producto que se compre por recomendación: belleza, suplementos, hogar, moda.',
    slots: [
      { id: 'HOOK', rol: 'hook', etiqueta: 'Frase de apertura', maxPalabras: 12, tono: 'confesional, primera persona, como se habla', fuente: 'modelo' },
      { id: 'PERSONAL_PROBLEM', rol: 'problema personal', etiqueta: 'El problema, contado en primera persona', maxPalabras: 12, tono: 'íntimo, sin jerga de marketing', fuente: 'modelo' },
      { id: 'DISCOVERY', rol: 'descubrimiento', etiqueta: 'Cómo lo encontró', maxPalabras: 12, tono: 'casual', fuente: 'modelo' },
      { id: 'BENEFIT', rol: 'beneficio', etiqueta: 'Lo que cambió', maxPalabras: 10, tono: 'concreto, verificable', fuente: 'modelo' },
      { id: 'CTA', rol: 'cta', etiqueta: 'Llamado a la acción', maxPalabras: 4, tono: 'directo, imperativo', fuente: 'modelo' },
    ],
    reglasCopy: [
      'Está escrito en PRIMERA PERSONA por alguien que compró: "yo", "me", "mi". Nunca en voz de marca.',
      'El hook es una confesión, no un eslogan: suena a algo que alguien escribiría en un comentario.',
      'Nunca inventes una calificación, un número de reseñas ni un testimonio atribuido a una persona con nombre.',
    ],
    promptMaestro:
      `${ESTILO_MAESTRA} Composición: fotografía vertical tipo selfie casera de una persona adulta ` +
      'sosteniendo un envase genérico a la altura del pecho, mirando a cámara, en el interior de una ' +
      'casa corriente con luz de ventana. Ocupa los dos tercios superiores del lienzo. Sobre la parte ' +
      'alta de la foto, una caja de texto de fondo blanco con esquinas redondeadas y tres líneas de ' +
      'texto. En el tercio inferior, fondo papel hueso con dos líneas de texto y, abajo del todo, un ' +
      'botón rectangular redondeado en el color de acento. ' +
      'Textos de maqueta exactos, no agregues otros: en la caja blanca "Pensé que otra vez había ' +
      'botado mi plata" en la primera línea y "hasta que probé esto" en la segunda; en el tercio ' +
      'inferior "Lo llevo usando tres semanas"; en el botón "QUIERO EL MÍO".',
    blueprint: {
      ...blueprintBase(),
      style: 'Contenido generado por usuario: foto casera con luz de ventana, encuadre de teléfono en mano, sobre ella una caja de texto tipo subtítulo de red social y un bloque publicitario limpio abajo.',
      composition: [
        'Foto vertical tipo selfie ocupando los dos tercios superiores, con la persona sosteniendo el producto junto a su rostro',
        'Caja de texto blanca de esquinas redondeadas superpuesta en la parte alta de la foto',
        'Tercio inferior de fondo liso con el texto de beneficio',
        'Botón de acción rectangular redondeado al pie, en el color de acento',
      ],
      physicalPosition: 'El producto está SOSTENIDO en la mano de la persona, a la altura de su rostro y junto a él, ligeramente girado hacia la cámara. Sin sombra proyectada propia: la ilumina la misma luz de ventana que a ella.',
      layoutDescription: 'Foto arriba, caja de subtítulo superpuesta, bloque de texto y botón abajo. Lectura vertical de arriba a abajo.',
      persuasiveLogic: 'Prueba social por identificación: quien mira reconoce su propia objeción en la voz de alguien igual a ella, no en la de una marca.',
      sceneElements: {
        people: ['una persona adulta sosteniendo el producto a la altura del pecho, mirando a cámara'],
        props: ['envase genérico sin etiqueta'],
        brandElements: [],
        setting: 'Interior doméstico corriente con luz natural de ventana: se ven un sofá, una planta y un cuadro desenfocados al fondo.',
      },
      creativeConcept:
        'Testimonio UGC: una foto casera de la usuaria sosteniendo el producto, con su frase de apertura superpuesta como subtítulo de red social y el beneficio y el llamado a la acción en un bloque limpio al pie.',
      attentionMarkers: null,
      summaryForUser: 'Una foto casera con la frase de la clienta encima y el llamado a la acción abajo.',
    },
  },

  // ─── 3 · Educativo, 3 puntos ────────────────────────────────────────────────
  {
    id: 'educativo-3-puntos',
    nombre: 'Educativo — 3 puntos',
    objetivo: 'educar',
    descripcion: 'Explica algo en tres puntos numerados y recién ahí presenta el producto.',
    recomendadaPara: 'Productos que requieren entender el problema antes de comprar: skincare activo, suplementos, salud.',
    slots: [
      { id: 'EDUCATIONAL_HOOK', rol: 'hook educativo', etiqueta: 'Titular', maxPalabras: 10, tono: 'afirmación con número, despierta curiosidad', fuente: 'modelo' },
      { id: 'POINT_1', rol: 'punto 1', etiqueta: 'Punto 1', maxPalabras: 12, tono: 'didáctico, una idea por punto', fuente: 'modelo' },
      { id: 'POINT_2', rol: 'punto 2', etiqueta: 'Punto 2', maxPalabras: 12, tono: 'didáctico, una idea por punto', fuente: 'modelo' },
      { id: 'POINT_3', rol: 'punto 3', etiqueta: 'Punto 3', maxPalabras: 12, tono: 'didáctico, una idea por punto', fuente: 'modelo' },
      { id: 'PRODUCT_BRIDGE', rol: 'puente al producto', etiqueta: 'Puente al producto', maxPalabras: 10, tono: 'consecuencia natural de los tres puntos', fuente: 'modelo' },
      { id: 'PRODUCT_NAME', rol: 'marca', etiqueta: 'Nombre del producto', maxPalabras: 4, tono: '—', fuente: 'producto' },
    ],
    reglasCopy: [
      'Los tres puntos tienen que ser TRES COSAS DISTINTAS, no la misma dicha de tres formas. Si dos se pueden fusionar, uno está de más.',
      'El titular anuncia exactamente tres: si dice "3", hay tres puntos y ni uno más.',
      'El puente NO repite un punto: es lo que se deduce de los tres juntos y da pie al producto.',
      'Nada de mecanismos clínicos inventados. Si el producto no declara un activo, no lo nombres.',
    ],
    promptMaestro:
      `${ESTILO_MAESTRA} Composición: titular de dos líneas en la parte alta, alineado a la izquierda. ` +
      'Debajo, tres filas apiladas, cada una con un número grande en el color de acento a la ' +
      'izquierda ("01", "02", "03") y una línea de texto a su derecha, separadas por líneas finas ' +
      'horizontales. Al pie, una banda con el envase genérico a la derecha y una línea de texto a su ' +
      'izquierda. ' +
      'Textos de maqueta exactos, no agregues otros: titular "3 razones por las que sigue pasando", ' +
      'fila 01 "La primera razón va aquí", fila 02 "La segunda razón va aquí", fila 03 "La tercera ' +
      'razón va aquí", banda inferior "Por eso existe esto".',
    blueprint: {
      ...blueprintBase(),
      composition: [
        'Titular de dos líneas en la parte alta, alineado a la izquierda',
        'Tres filas numeradas apiladas, con el número grande en color de acento a la izquierda de cada una',
        'Líneas finas horizontales separando las filas',
        'Banda inferior con el puente al producto a la izquierda y el envase a la derecha',
      ],
      physicalPosition: 'El producto descansa sobre la banda inferior, apoyado, alineado a la derecha, con sombra suave de contacto. Cámara frontal ligeramente elevada.',
      layoutDescription: 'Pila vertical: titular → tres filas numeradas → banda de producto. Lectura estrictamente de arriba a abajo.',
      persuasiveLogic: 'Autoridad por explicación: primero se enseña por qué el problema persiste, y el producto aparece como la consecuencia de haberlo entendido.',
      sceneElements: {
        people: [],
        props: ['envase genérico sin etiqueta'],
        brandElements: [],
        setting: 'Fondo liso de papel hueso, sin escenografía.',
      },
      creativeConcept:
        'Educativo de lista numerada: un titular que anuncia tres puntos, tres filas numeradas 01/02/03 con una idea cada una, y una banda al pie donde el producto aparece como consecuencia.',
      attentionMarkers: [
        'Los números 01, 02 y 03 en color de acento, que ordenan la lectura',
        'Las líneas finas horizontales que separan cada punto',
      ],
      summaryForUser: 'Un titular con tres puntos numerados y el producto cerrando abajo.',
    },
  },

  // ─── 4 · Problema → Solución ────────────────────────────────────────────────
  {
    id: 'problema-solucion',
    nombre: 'Problema → Solución',
    objetivo: 'persuadir',
    descripcion: 'Nombra el dolor, lo agranda y baja hasta el producto como salida.',
    recomendadaPara: 'La estructura más universal. Sirve para casi cualquier producto con un problema claro.',
    slots: [
      { id: 'PROBLEM', rol: 'problema', etiqueta: 'El problema', maxPalabras: 10, tono: 'pregunta o afirmación que el lector reconoce como propia', fuente: 'modelo' },
      { id: 'PAIN_AMPLIFIER', rol: 'amplificador', etiqueta: 'Por qué duele', maxPalabras: 12, tono: 'concreto, la consecuencia real', fuente: 'modelo' },
      { id: 'SOLUTION_MECHANISM', rol: 'mecanismo', etiqueta: 'Cómo se resuelve', maxPalabras: 12, tono: 'explicativo, sin tecnicismos inventados', fuente: 'modelo' },
      { id: 'BENEFIT', rol: 'beneficio', etiqueta: 'El resultado', maxPalabras: 8, tono: 'deseable y concreto', fuente: 'modelo' },
      { id: 'PRODUCT_NAME', rol: 'marca', etiqueta: 'Nombre del producto', maxPalabras: 4, tono: '—', fuente: 'producto' },
    ],
    reglasCopy: [
      'El amplificador NO repite el problema con otras palabras: dice qué CUESTA que siga pasando.',
      'El mecanismo solo puede nombrar lo que la etiqueta del producto declara. Si no dice el activo, se describe qué hace, nunca con qué.',
      'Nada de plazos, porcentajes ni avales que el usuario no haya dado.',
    ],
    promptMaestro:
      `${ESTILO_MAESTRA} Composición: titular grande de dos líneas arriba, centrado. Debajo, una ` +
      'línea de texto más pequeña, centrada. Debajo, una flecha vertical fina apuntando hacia abajo ' +
      'en el color de acento. Debajo de la flecha, otra línea de texto. Debajo, una segunda flecha ' +
      'vertical igual. Al pie, el envase genérico centrado sobre una superficie clara, con una línea ' +
      'de texto corta debajo. ' +
      'Textos de maqueta exactos, no agregues otros: titular "¿Cansada de que siga volviendo?", bajo ' +
      'el titular "Y de gastar en lo que no funciona", tras la primera flecha "Aquí va el mecanismo", ' +
      'bajo el producto "Piel uniforme".',
    blueprint: {
      ...blueprintBase(),
      composition: [
        'Titular grande de dos líneas, centrado, en la parte alta',
        'Línea de amplificación bajo el titular, centrada y más pequeña',
        'Dos flechas verticales finas en color de acento que encadenan la lectura hacia abajo',
        'Producto centrado al pie con una línea de beneficio debajo',
      ],
      physicalPosition: 'El producto descansa centrado sobre una superficie clara al pie del lienzo, con sombra suave de contacto. Cámara frontal a la altura del envase.',
      layoutDescription: 'Embudo vertical centrado: problema → amplificación → mecanismo → producto → beneficio. La lectura baja en línea recta.',
      persuasiveLogic: 'Embudo de tensión y alivio: se nombra el dolor, se agranda su costo y recién entonces se ofrece la salida, de modo que el producto llega como resolución y no como oferta.',
      sceneElements: {
        people: [],
        props: ['envase genérico sin etiqueta'],
        brandElements: [],
        setting: 'Fondo liso de papel hueso con una superficie de apoyo apenas insinuada al pie.',
      },
      creativeConcept:
        'Problema→solución en embudo vertical: el titular enuncia el dolor, una línea lo amplifica, dos flechas descendentes encadenan hacia el mecanismo y el producto cierra abajo con el beneficio.',
      attentionMarkers: [
        'Las dos flechas verticales en color de acento, que fuerzan la lectura descendente',
        'La centralidad del eje, que concentra la mirada en la columna del medio',
      ],
      summaryForUser: 'Un embudo que baja del problema al producto con dos flechas.',
    },
  },

  // ─── 5 · Beneficios del producto ────────────────────────────────────────────
  {
    id: 'beneficios-producto',
    nombre: 'Beneficios del producto',
    objetivo: 'persuadir',
    descripcion: 'El producto al centro y cuatro beneficios rodeándolo.',
    recomendadaPara: 'Ecommerce, skincare, suplementos, gadgets, hogar — cuando el producto ya se entiende y hay que listar por qué.',
    slots: [
      { id: 'BENEFIT_1', rol: 'beneficio 1', etiqueta: 'Beneficio arriba', maxPalabras: 5, tono: 'telegráfico', fuente: 'modelo' },
      { id: 'BENEFIT_2', rol: 'beneficio 2', etiqueta: 'Beneficio izquierda', maxPalabras: 5, tono: 'telegráfico', fuente: 'modelo' },
      { id: 'BENEFIT_3', rol: 'beneficio 3', etiqueta: 'Beneficio derecha', maxPalabras: 5, tono: 'telegráfico', fuente: 'modelo' },
      { id: 'BENEFIT_4', rol: 'beneficio 4', etiqueta: 'Beneficio abajo', maxPalabras: 5, tono: 'telegráfico', fuente: 'modelo' },
      { id: 'PRODUCT_NAME', rol: 'marca', etiqueta: 'Nombre del producto', maxPalabras: 4, tono: '—', fuente: 'producto' },
    ],
    reglasCopy: [
      'Los cuatro beneficios atacan CUATRO EJES DISTINTOS (qué resuelve, cómo se siente, cómo se usa, qué evita). Cuatro formas de decir "hidrata" es un solo beneficio repetido.',
      'Telegráfico de verdad: son etiquetas alrededor de una foto, no frases.',
      'Solo beneficios que la etiqueta o el usuario declaren. Nada de "dermatológicamente probado" por tu cuenta.',
    ],
    promptMaestro:
      `${ESTILO_MAESTRA} Composición: el envase genérico grande y centrado, ocupando el centro del ` +
      'lienzo sobre fondo liso. Cuatro etiquetas de texto cortas dispuestas alrededor (arriba, ' +
      'izquierda, derecha y abajo), cada una unida al producto por una línea fina de acento que ' +
      'termina en un punto. Sin titular. ' +
      'Textos de maqueta exactos, no agregues otros: arriba "Beneficio uno", izquierda "Beneficio ' +
      'dos", derecha "Beneficio tres", abajo "Beneficio cuatro".',
    blueprint: {
      ...blueprintBase(),
      composition: [
        'Producto grande y centrado, protagonista absoluto del lienzo',
        'Cuatro etiquetas de texto cortas alrededor: arriba, izquierda, derecha y abajo',
        'Una línea fina de acento une cada etiqueta con un punto sobre el producto',
        'Sin titular: el producto es el titular',
      ],
      physicalPosition: 'El producto flota centrado sobre fondo liso, sin superficie de apoyo, con una sombra suave y difusa por debajo. Cámara frontal a la altura media del envase.',
      layoutDescription: 'Radial: el producto al centro y cuatro satélites de texto conectados por líneas. La lectura gira alrededor del producto.',
      persuasiveLogic: 'Argumentación por acumulación: el producto ocupa el centro y cada beneficio suma una razón distinta, de modo que la suma se lee de un golpe.',
      sceneElements: {
        people: [],
        props: ['envase genérico sin etiqueta'],
        brandElements: [],
        setting: 'Fondo liso de papel hueso, sin escenografía ni superficie.',
      },
      creativeConcept:
        'Lista de beneficios radial: el producto grande y centrado con cuatro etiquetas cortas alrededor, cada una unida a él por una línea fina que apunta a un punto del envase.',
      attentionMarkers: [
        'Las cuatro líneas finas que conectan cada etiqueta con un punto del producto',
        'La centralidad y el tamaño del producto, que fija la mirada al medio',
      ],
      summaryForUser: 'El producto al centro con cuatro beneficios conectados alrededor.',
    },
  },

  // ─── 6 · Razones / lista ────────────────────────────────────────────────────
  {
    id: 'razones-lista',
    nombre: 'Razones (lista)',
    objetivo: 'educar',
    descripcion: 'Un número grande y una lista de razones en primera persona.',
    recomendadaPara: 'Cuando hay comentarios y reseñas de donde sacar las razones reales de compra.',
    slots: [
      { id: 'NUMBER', rol: 'número', etiqueta: 'El número', maxPalabras: 1, tono: 'una cifra: 3, 4 o 5', fuente: 'modelo' },
      { id: 'HOOK', rol: 'hook', etiqueta: 'Titular', maxPalabras: 10, tono: 'primera persona, decisión personal', fuente: 'modelo' },
      { id: 'REASON_1', rol: 'razón 1', etiqueta: 'Razón 1', maxPalabras: 10, tono: 'concreta, como la diría una clienta', fuente: 'modelo' },
      { id: 'REASON_2', rol: 'razón 2', etiqueta: 'Razón 2', maxPalabras: 10, tono: 'concreta, como la diría una clienta', fuente: 'modelo' },
      { id: 'REASON_3', rol: 'razón 3', etiqueta: 'Razón 3', maxPalabras: 10, tono: 'concreta, como la diría una clienta', fuente: 'modelo' },
      { id: 'PRODUCT_NAME', rol: 'marca', etiqueta: 'Nombre del producto', maxPalabras: 4, tono: '—', fuente: 'producto' },
    ],
    reglasCopy: [
      'El número tiene que coincidir con la cantidad de razones que se muestran: la maqueta dibuja TRES, así que el número es "3".',
      'Las razones salen de los comentarios de la audiencia, no del folleto: lo que la gente realmente valora.',
      'Tres razones distintas entre sí; si dos comparten eje, una sobra.',
    ],
    promptMaestro:
      `${ESTILO_MAESTRA} Composición: un número enorme en el color de acento ocupando el ángulo ` +
      'superior izquierdo, del alto de dos líneas de texto. A su derecha, un titular de dos líneas. ' +
      'Debajo, tres viñetas apiladas, cada una precedida por un guion largo en color de acento. Al ' +
      'pie, el envase genérico pequeño alineado a la derecha. ' +
      'Textos de maqueta exactos, no agregues otros: el número "3", titular "razones por las que ' +
      'cambié la mía", viñeta primera "La primera razón va aquí", segunda "La segunda razón va ' +
      'aquí", tercera "La tercera razón va aquí".',
    blueprint: {
      ...blueprintBase(),
      composition: [
        'Número enorme en color de acento en el ángulo superior izquierdo',
        'Titular de tres líneas a la derecha del número, que empieza a media altura de este',
        'Tres viñetas apiladas en la mitad izquierda, cada una precedida por un guion largo de acento',
        'Escena fotográfica del producto ocupando el cuadrante inferior derecho, detrás de las viñetas',
      ],
      // ⚠️ ES LA ÚNICA DE LAS OCHO CON ESCENOGRAFÍA, y el blueprint tiene que decirlo. La maestra
      // salió con una escena de baño real (superficie de piedra, eucalipto, toalla) ocupando el
      // cuadrante inferior derecho en vez del envase pequeño en la esquina que pedía el prompt.
      // Se conserva porque el resultado es bueno; lo que NO se puede es dejar el blueprint
      // diciendo "sin escenografía", porque STEP5 lo lee como texto y estaría contradiciendo a
      // la Imagen 1 — el modo de fallo que este repo ya midió con el escenario de video.
      physicalPosition: 'El producto se apoya sobre una superficie de piedra clara en el cuadrante inferior derecho, a escala media, acompañado por una ramita de eucalipto y una toalla enrollada desenfocada al fondo. Luz natural lateral y suave, sombra de contacto marcada.',
      layoutDescription: 'Encabezado de número + titular, tres viñetas en la mitad izquierda, y una escena fotográfica del producto ocupando el cuadrante inferior derecho. Lectura de arriba a abajo por la columna izquierda, con el número como ancla de entrada.',
      persuasiveLogic: 'Enumeración en primera persona: el formato de lista promete que la lectura es corta y el "yo cambié" convierte la recomendación en experiencia vivida.',
      sceneElements: {
        people: [],
        props: ['envase genérico sin etiqueta', 'ramita de eucalipto', 'toalla enrollada', 'superficie de piedra clara'],
        brandElements: [],
        setting: 'La mitad superior izquierda es fondo liso de papel hueso; el cuadrante inferior derecho es una escena fotográfica de baño con luz natural.',
      },
      creativeConcept:
        'Lista de razones: un número enorme de entrada, un titular en primera persona que lo completa, tres viñetas con una razón cada una y el producto pequeño cerrando en la esquina inferior.',
      attentionMarkers: [
        'El número gigante en color de acento, que es el punto de entrada de la mirada',
        'Los guiones largos de acento que abren cada viñeta',
      ],
      summaryForUser: 'Un número grande, un titular en primera persona y tres razones en lista.',
    },
  },

  // ─── 7 · Comparativa ────────────────────────────────────────────────────────
  {
    id: 'comparativa',
    nombre: 'Comparativa',
    objetivo: 'persuadir',
    descripcion: 'Una tabla de ✗ y ✓ contra la categoría de siempre.',
    recomendadaPara: 'Cuando el producto compite contra un método tradicional o una categoría entera.',
    slots: [
      { id: 'COMPETITOR_CATEGORY', rol: 'categoría rival', etiqueta: 'Contra qué se compara', maxPalabras: 4, tono: 'una CATEGORÍA, nunca una marca', fuente: 'modelo' },
      { id: 'ATTRIBUTE_1', rol: 'atributo 1', etiqueta: 'Atributo 1', maxPalabras: 4, tono: 'telegráfico', fuente: 'modelo' },
      { id: 'ATTRIBUTE_2', rol: 'atributo 2', etiqueta: 'Atributo 2', maxPalabras: 4, tono: 'telegráfico', fuente: 'modelo' },
      { id: 'ATTRIBUTE_3', rol: 'atributo 3', etiqueta: 'Atributo 3', maxPalabras: 4, tono: 'telegráfico', fuente: 'modelo' },
      { id: 'PRODUCT_NAME', rol: 'marca', etiqueta: 'Nombre del producto', maxPalabras: 4, tono: '—', fuente: 'producto' },
    ],
    reglasCopy: [
      '⚠️ NUNCA nombres una marca competidora real. La columna rival es una CATEGORÍA: "cremas tradicionales", "el método de siempre", "las pastillas comunes".',
      'Los tres atributos tienen que ser ejes en los que el producto GANE de verdad según lo que declaró el usuario. Inventar una desventaja del rival es publicidad comparativa falsa.',
      'Un atributo es un sustantivo o una frase nominal corta ("Uso diario", "Sin residuo graso"), nunca una oración.',
    ],
    promptMaestro:
      `${ESTILO_MAESTRA} Composición: titular corto de una línea arriba, centrado. Debajo, una tabla ` +
      'de tres filas y tres columnas: la primera columna con la etiqueta del atributo alineada a la ' +
      'izquierda, la segunda con una cruz gris, la tercera con una marca de verificación en el color ' +
      'de acento. Sobre la segunda y la tercera columna, un encabezado de columna cada uno. Filas ' +
      'separadas por líneas finas. Al pie, el envase genérico centrado y pequeño. ' +
      'Textos de maqueta exactos, no agregues otros: titular "La diferencia está aquí", encabezado ' +
      'de la segunda columna "LO DE SIEMPRE", encabezado de la tercera "ESTO", filas "Atributo uno", ' +
      '"Atributo dos", "Atributo tres".',
    blueprint: {
      ...blueprintBase(),
      composition: [
        'Titular corto de una línea, centrado, en la parte alta',
        'Tabla de tres filas por tres columnas: etiqueta del atributo, columna rival, columna propia',
        'Encabezado sobre las dos columnas comparadas',
        'Cruz gris en la columna rival y marca de verificación de acento en la propia, fila por fila',
        'Producto pequeño y centrado al pie',
      ],
      physicalPosition: 'El producto descansa centrado al pie, a pequeña escala, con sombra suave de contacto. Cámara frontal.',
      layoutDescription: 'Tabla comparativa centrada con encabezados de columna, cerrada por el producto. Lectura fila por fila de izquierda a derecha.',
      persuasiveLogic: 'Contraste punto por punto: la repetición visual de cruz contra verificación construye la conclusión sin tener que enunciarla.',
      sceneElements: {
        people: [],
        props: ['envase genérico sin etiqueta'],
        brandElements: [],
        setting: 'Fondo liso de papel hueso, sin escenografía.',
      },
      creativeConcept:
        'Comparativa en tabla: tres atributos en filas, una columna para la categoría de siempre marcada con cruces grises y otra para el producto marcada con verificaciones de acento, con el envase cerrando al pie.',
      attentionMarkers: [
        'La columna de cruces grises frente a la de verificaciones en color de acento',
        'Las líneas finas que separan cada fila y obligan a comparar en horizontal',
      ],
      summaryForUser: 'Una tabla de tres atributos que compara el producto contra la categoría de siempre.',
    },
  },

  // ─── 8 · Prueba social ──────────────────────────────────────────────────────
  {
    id: 'prueba-social',
    nombre: 'Prueba social',
    objetivo: 'convertir',
    descripcion: 'Una cita entrecomillada grande, con estrellas y firma.',
    recomendadaPara: 'Cuando ya hay comentarios reales que dicen mejor que la marca por qué el producto sirve.',
    slots: [
      { id: 'QUOTE', rol: 'cita', etiqueta: 'La cita', maxPalabras: 16, tono: 'habla real, primera persona, sin publicidad', fuente: 'modelo' },
      { id: 'PERSON_NAME', rol: 'firma', etiqueta: 'Firma', maxPalabras: 3, tono: 'un nombre de pila y una inicial', fuente: 'modelo' },
      { id: 'MICRO_CTA', rol: 'micro cta', etiqueta: 'Micro llamado a la acción', maxPalabras: 4, tono: 'directo', fuente: 'modelo' },
      { id: 'PRODUCT_NAME', rol: 'marca', etiqueta: 'Nombre del producto', maxPalabras: 4, tono: '—', fuente: 'producto' },
    ],
    reglasCopy: [
      '⚠️ La cita se ESCRIBE a partir de la voz de la audiencia; NUNCA se pega un comentario textual ni se cosen dos. Un comentario real es de una persona real y publicarlo como testimonio de marca no es nuestro.',
      'La firma es un nombre de pila con inicial ("María P."), nunca un nombre completo ni una persona identificable.',
      'La maqueta dibuja cinco estrellas: no las conviertas en un texto ni inventes un promedio ni un número de reseñas.',
    ],
    promptMaestro:
      `${ESTILO_MAESTRA} Composición: una fila de cinco estrellas llenas en el color de acento, ` +
      'centradas en el tercio superior. Debajo, una cita entrecomillada grande de tres líneas, ' +
      'centrada, en tinta oscura. Debajo, una línea corta con un guion largo delante, en gris medio. ' +
      'Al pie, el envase genérico centrado y, bajo él, un botón rectangular redondeado en el color de ' +
      'acento. ' +
      'Textos de maqueta exactos, no agregues otros: la cita "Literalmente es lo único que me ' +
      'funcionó", la firma "— María P.", el botón "PROBARLO".',
    blueprint: {
      ...blueprintBase(),
      composition: [
        'Fila de cinco estrellas llenas en color de acento, centradas en el tercio superior',
        'Cita entrecomillada grande de tres líneas, centrada, como elemento dominante',
        'Firma corta precedida de un guion largo, en gris medio',
        'Producto centrado al pie con un botón de acción debajo',
      ],
      physicalPosition: 'El producto descansa centrado al pie sobre una superficie clara, con sombra suave de contacto. Cámara frontal a la altura del envase.',
      layoutDescription: 'Pila centrada y simétrica: estrellas → cita → firma → producto → botón. La cita ocupa el mayor peso visual.',
      persuasiveLogic: 'Prueba social directa: la voz de otra compradora vale más que la de la marca, y las estrellas dan el veredicto antes de que se lea una palabra.',
      sceneElements: {
        people: [],
        props: ['envase genérico sin etiqueta'],
        brandElements: [],
        setting: 'Fondo liso de papel hueso con una superficie de apoyo apenas insinuada al pie.',
      },
      creativeConcept:
        'Cita de prueba social: cinco estrellas de acento, una cita entrecomillada grande como elemento dominante, la firma de quien la dijo y el producto con su botón de acción al pie.',
      attentionMarkers: [
        'La fila de cinco estrellas en color de acento, que da el veredicto antes de leer',
        'Las comillas grandes que enmarcan la cita',
      ],
      summaryForUser: 'Cinco estrellas, una cita grande, la firma y el producto con su botón.',
    },
  },
]

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id)

export function getTemplate(id: string | null | undefined): CreativeTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * Dónde vive la imagen maestra de una plantilla.
 *
 * Es una ruta FIJA del bucket público, no una columna: las maestras son assets del hub, las
 * genera `scripts/generar-plantillas.ts` una sola vez y son las mismas para todos los usuarios.
 * Guardarlas en la base sería sincronizar dos fuentes para un dato que ya es constante.
 */
export function templateImageUrl(id: string): string {
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/ad-uploads/plantillas/${id}.png`
}

/** Los slots que redacta el modelo (los de `fuente: 'producto'` los llena el código). */
export function slotsDelModelo(t: CreativeTemplate): TemplateSlot[] {
  return t.slots.filter((s) => s.fuente === 'modelo')
}
