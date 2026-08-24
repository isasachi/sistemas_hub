import { z } from 'zod'
import type { ScriptTemplate } from './template'
import { slotOriginals, type Slot } from './fill'
import type { ForensicReport } from './forensic'
import type { UserInputs } from './types'
import type { ProductScan } from '@/lib/types'
import { extractPending } from './pending'

/**
 * FASE 3 del prompt maestro — rellenar el Fill in the Blank con los INPUTS.
 * ---------------------------------------------------------------------------
 * La única libertad permitida es gramatical (género, número, concordancia, tiempos
 * verbales). Todo lo demás se copia. Por eso el prompt manda el conteo de caracteres
 * del original: es la métrica objetiva de "no te fuiste de largo", y el spec pide
 * reportar la diferencia.
 *
 * `variablesPendientes` existe para que la UI pueda avisar antes de gastar un render:
 * un guión con [VARIABLE PENDIENTE] se renderizaría con el corchete leído en voz alta.
 */

/**
 * Lo ÚNICO que el modelo decide en la FASE 3: qué valor va en cada hueco y cómo se
 * traduce la coreografía observada al producto nuevo. El guión no lo escribe él — lo
 * arma `fillTemplate` copiando la plantilla, que es la única forma de garantizar que
 * fuera de los corchetes no cambie ni una palabra.
 */
export const SlotValuesSchema = z.object({
  valores: z.array(z.object({
    id: z.string(),
    /** Vacío = no hay dato para rellenarlo; queda pendiente y se le pide al usuario. */
    valor: z.string(),
  })),
  acciones: z.array(z.object({
    n: z.number(),
    accionVisual: z.string(),
  })),
  /**
   * La locución de cada toma REESCRITA por el modelo, como la escribiría el spec: el
   * guión original con los datos nuevos puestos y la gramática cosida a mano.
   *
   * No sustituye a `valores` — se piden las dos cosas en la misma llamada. `valores`
   * alimenta el relleno determinista, que es el PISO al que se cae cuando la reescritura
   * deriva demasiado del andamiaje (`acceptRewrite`, fill.ts). Por eso el sistema nunca
   * queda peor que con el relleno solo: como mucho, igual.
   */
  locuciones: z.array(z.object({
    n: z.number(),
    texto: z.string(),
  })).default([]),
})
export type SlotValues = z.infer<typeof SlotValuesSchema>

/**
 * Segunda pasada de la FASE 3: releer el guión YA ARMADO y corregir los valores que no
 * encajan en su frase.
 *
 * Existe porque la primera pasada juzga a ciegas. El modelo devuelve pares `id → valor`
 * y el guión lo ensambla `fillTemplate` con código, así que nunca lee el resultado: mide
 * cada valor contra la ETIQUETA del hueco, no contra la oración que queda. Con eso, en
 * dos pruebas reales, salieron valores que respondían bien a su etiqueta y mal a su
 * frase — un adjetivo pedido donde se volcó una oración entera, un ingrediente pedido
 * donde se puso un beneficio, una cantidad pedida donde se puso un momento del día.
 *
 * Devuelve SOLO correcciones de valores, nunca texto de locución. Si pudiera devolver la
 * frase, alguien terminaría usándola y se perdería en silencio la fidelidad del 100%
 * fuera de los corchetes, que es lo único que este diseño garantiza por construcción.
 */
export const CoherenceSchema = z.object({
  correcciones: z.array(z.object({
    id: z.string(),
    /** Valor nuevo. VACÍO = borrar el valor: el hueco queda pendiente y lo escribe el usuario. */
    valor: z.string(),
    motivo: z.string(),
  })),
  /**
   * La ÚNICA excepción a la copia literal, y solo sobre el guión adaptado — la plantilla
   * sigue siendo espejo del original. Es la licencia de la directiva 13 del spec
   * ("naturalidad mínima indispensable"), para las frases donde NINGÚN valor cabe en el
   * andamiaje congelado ("andas muy ___" con un producto que no tiene adjetivo que poner).
   *
   * `idHueco` ata el cambio a su justificación: código verifica que ese hueco exista en
   * esa toma. Sin eso, sería un permiso abierto para reescribir cualquier frase.
   */
  ajustes: z.array(z.object({
    n: z.number(),
    idHueco: z.string(),
    locucion: z.string(),
    motivo: z.string(),
  })).default([]),
})
export type Coherence = z.infer<typeof CoherenceSchema>

export const TomaFinalSchema = z.object({
  n: z.number(),
  tiempoOriginal: z.string(),
  // Sin refinar a propósito (fix round 2, se probó `.finite().positive()` y se
  // revirtió): `.finite()` es no-op en la versión de zod de este repo — z.number()
  // ya rechaza NaN/Infinity sin él, así que no defendía nada que no estuviera
  // defendido. `.positive()` sí cambiaba algo, y para peor: template.ts y forensic.ts
  // declaran duracionSeg sin restricción de signo, y este prompt manda copiar la
  // duración de la plantilla sin cambios — un corte de 0s legítimo (relámpago) tumba
  // los 6 intentos de AdaptedScriptSchema (3 OpenAI + 3 Gemini) de forma determinista,
  // porque el reintento relee la misma plantilla guardada: la sesión queda trabada sin
  // salida salvo re-correr el análisis forense, que es el paso caro con tope per-step.
  // Las duraciones degeneradas (NaN/Infinity/0/negativo) se sanean en un solo lugar:
  // `sanearDuracion` en lotes.ts, justo antes de que importen (agrupar en lotes).
  duracionSeg: z.number(),
  accionVisual: z.string(),
  personaje: z.string(),
  producto: z.string(),
  locucion: z.string(),
})
export type TomaFinal = z.infer<typeof TomaFinalSchema>

export const AdaptedScriptSchema = z.object({
  guionFinal: z.string(),
  caracteresAdaptado: z.number(),
  diferenciaCaracteres: z.number(),
  tomas: z.array(TomaFinalSchema).min(1),
  variablesPendientes: z.array(z.string()),
  /**
   * Tomas cuyo andamiaje se ajustó, con el texto de ANTES. Se guarda el texto y no solo
   * el número de toma porque la justificación entera de permitir el cambio es que sea
   * auditable: un contador no le dice al usuario qué se movió.
   *
   * `.optional()` de verdad, no solo ausente en los fixtures: `generate-lotes` hace
   * `AdaptedScriptSchema.parse` sobre el jsonb guardado, y sin esto cada sesión anterior
   * a este cambio reventaría con un 500 al renderizar.
   */
  ajustesAndamiaje: z.array(z.object({
    n: z.number(),
    antes: z.string(),
    motivo: z.string(),
  })).optional(),
})
export type AdaptedScript = z.infer<typeof AdaptedScriptSchema>

/**
 * Aplica las ediciones del usuario sobre el guión ya adaptado, línea por línea.
 *
 * El spec de la FASE 3 es explícito: "No preguntes nada" — si una variable no se puede
 * completar con seguridad, se deja el marcador en el texto y punto. La versión anterior
 * hacía lo contrario: levantaba un formulario con un campo por variable pendiente y
 * volvía a llamar al modelo con esos valores. El usuario lo llamó engorroso y tenía
 * razón por partida doble — preguntaba lo que el spec manda no preguntar, y aun así
 * dejaba fuera lo único que hacía falta cuando el modelo elegía mal un valor (arreglar
 * la concordancia, cambiar una palabra que no encaja), porque un campo etiquetado
 * "Producto" no permite escribir la frase entera.
 *
 * Editar la locución directamente cubre los dos casos con un mecanismo en vez de dos.
 *
 * Se edita POR TOMA y no sobre `guionFinal`: las tomas son lo que `groupIntoLotes` lee
 * para armar los lotes, y `guionFinal` es la concatenación de sus locuciones. Editar el
 * texto unido y guardarlo aparte dejaría al usuario leyendo un guión corregido mientras
 * el render sigue mandando los marcadores originales.
 *
 * Todo lo derivado se recalcula acá (nunca se acepta del cliente): los caracteres, la
 * diferencia contra el original y los marcadores que quedan. `variablesPendientes` sale
 * del texto y no de una lista aparte — es lo que bloquea el render, y un cliente que
 * mandara la lista vacía renderizaría corchetes leídos en voz alta.
 *
 * Las ediciones se indexan por POSICIÓN en el array, no por `toma.n`. El `n` viene del
 * análisis forense (`assembleTemplate` mapea los cortes uno a uno y hereda su `n`), y
 * nada garantiza que sea único: dos cortes con el mismo número harían que una sola
 * edición pisara las dos locuciones. La posición es única por construcción.
 */
export function applyScriptEdits(
  adapted: AdaptedScript,
  ediciones: Record<number, string>,
  caracteresOriginal: number,
): AdaptedScript {
  const tomas = adapted.tomas.map((t, i) => {
    const nueva = ediciones[i]
    return nueva !== undefined ? { ...t, locucion: nueva.trim() } : t
  })
  const guionFinal = tomas.map((t) => t.locucion).join(' ')
  return {
    ...adapted,
    tomas,
    guionFinal,
    caracteresAdaptado: guionFinal.length,
    diferenciaCaracteres: guionFinal.length - caracteresOriginal,
    variablesPendientes: extractPending(guionFinal),
  }
}

/**
 * Baja al guión ya adaptado las duraciones recronometradas de los cortes.
 *
 * Sin esto, reparar el cronometraje de una sesión que YA tiene guión adaptado no llega
 * al render: `generate-lotes` agrupa sobre `adapted.tomas`, no sobre el forense, así que
 * el video seguiría saliendo con las duraciones rotas hasta que alguien re-adaptara — y
 * nada se lo diría al usuario.
 *
 * Se re-sincroniza en vez de borrar `adapted` y obligar a re-adaptar por dos razones:
 * re-adaptar tira las correcciones que el usuario escribió a mano línea por línea, y
 * volvería a pasar por el modelo un texto que ya estaba bien. Acá solo cambia el número
 * de segundos; el texto no se toca.
 *
 * Empareja por ÍNDICE porque así se construyó (`adapt-script` toma `cortes[i].tiempo`
 * para el `tiempoOriginal` de la toma i). Si los largos no coinciden, el guión no
 * corresponde a estos cortes y no se toca nada.
 */
export function resyncTomaDurations(
  adapted: AdaptedScript,
  cortes: { duracionSeg: number }[],
): AdaptedScript | null {
  if (adapted.tomas.length !== cortes.length) return null
  if (adapted.tomas.every((t, i) => t.duracionSeg === cortes[i].duracionSeg)) return null
  return { ...adapted, tomas: adapted.tomas.map((t, i) => ({ ...t, duracionSeg: cortes[i].duracionSeg })) }
}

export function buildAdaptInstruction(
  template: ScriptTemplate,
  forensic: ForensicReport,
  inputs: UserInputs,
  scan: ProductScan | null,
  slots: Slot[],
): string {
  const porN = new Map(forensic.cortes.map((c) => [c.n, c.dialogo]))
  const originales = slotOriginals(template, forensic.cortes)
  return [
    'Actúa como estratega de marketing de respuesta directa.',
    '',
    // ⚠️ Este encabezado decía "no reescribas el guion: no se usaría" — texto de cuando
    // `locuciones` no existía. Quedó contradiciendo a la sección que SÍ le pide reescribir,
    // y medido sobre la sesión real la reescritura salía tan pegada como el relleno
    // automático ("andas muy no poder dormir", "ayuda a el funcionamiento"): el modelo
    // hacía caso a la primera instrucción, que es la que le decía que no valía la pena.
    'TU TRABAJO NO ES ESCRIBIR UN GUION NUEVO. El guion ya existe: es el del video de',
    'referencia, que tienes abajo palabra por palabra. Lo que haces es ADAPTARLO: cambiar',
    'los datos del producto viejo por los del nuevo y dejar la frase bien escrita. No',
    'reordenas, no resumes, no mejoras el argumento, no agregas nada.',
    '',
    // ⚠️ VA ACÁ ARRIBA Y NO SOLO EN LAS REGLAS DE ABAJO. Medido sobre una sesión real:
    // con la orden metida entre los quince bullets de "reglas de los valores", dos
    // corridas del mismo guión dejaron 4 y 9 huecos pendientes — el modelo se queda con
    // el tono conservador del encabezado y vacía. Una instrucción que compite con otras
    // quince gana poco; puesta como segunda línea del prompt, manda.
    'EL GUION SALE COMPLETO. Ningún hueco se queda sin rellenar: los rellenas con lo que',
    'el usuario entregó, con lo que se deduzca de ello y, cuando ni eso alcanza, con lo',
    'más verosímil para un producto de esta categoría. El usuario lo va a leer y corregir',
    'antes de renderizar, así que un borrador completo le sirve y uno con agujeros no: un',
    'hueco sin rellenar se lee EN VOZ ALTA dentro del video. La única excepción está al',
    'final de las reglas de los valores y es corta.',
    '',
    // El contexto que el spec tiene gratis por correr de una sola pasada: el guión
    // original DELANTE. Sin esto, un hueco `[producto]` solo dice "acá va un producto" y
    // la descripción de la categoría es una respuesta tan válida como el nombre
    // comercial que había ahí. Es la mitad que sostiene todo lo demás — el `original`
    // por hueco de más abajo se cae cuando `alignSlots` no alinea, esto no.
    '── EL ORIGINAL, TOMA POR TOMA ──',
    'A la izquierda lo que se DICE en el video de referencia; a la derecha la plantilla',
    'que se sacó de él, que es ese mismo texto con los datos del nicho viejo vaciados. Tu',
    'trabajo es volver a llenar esos huecos, con los datos del producto NUEVO.',
    ...template.tomas.flatMap((t) => [
      `  Toma ${t.n}`,
      `    ORIGINAL:  ${JSON.stringify(porN.get(t.n) ?? '(no disponible)')}`,
      `    PLANTILLA: ${JSON.stringify(t.locucion)}`,
    ]),
    '',
    '── HUECOS ──',
    'Devuelve un `valores` por cada `id` de esta lista, exactamente estos ids.',
    'Donde aparece "el original decía", ese es el texto que ocupaba ese hueco en el video',
    'de referencia: es lo que tienes que sustituir, no copiar.',
    ...slots.map((sl) => {
      const o = originales[sl.id]
      return `  ${sl.id}  ·  ${sl.contexto}${o ? `  ·  el original decía: ${JSON.stringify(o)}` : ''}`
    }),
    '',
    'Reglas de los valores:',
    '  - El valor sustituye SOLO lo que estaba entre corchetes; lo de alrededor ya está',
    '    escrito. Si el contexto dice "mi ⟦parte del cuerpo⟧", el valor es "cara", no',
    '    "mi cara": el posesivo ya está puesto y duplicarlo rompe la frase.',
    '  - Dos huecos con el MISMO nombre y distinto número casi nunca llevan el mismo',
    '    valor: lo que decide es la frase de cada uno. Si un hueco viene después de "es',
    '    el", pide la CATEGORÍA; después de "de la marca", la MARCA; después de "se',
    '    llama", el NOMBRE COMERCIAL. Son tres datos distintos y rellenarlos igual deja',
    '    una frase que se muerde la cola. Lo mismo con dos huecos de zona del cuerpo en',
    '    la misma frase: uno es uno y el otro es el otro, nunca el mismo.',
    // El caso que motivó esto: la FASE 2 bautizó `[tipo de producto]` un hueco donde el
    // original decía "Gomi Energy" —un nombre comercial—, y el modelo respondía a la
    // etiqueta ("gomitas de melatonina"), que para esa etiqueta es correcto. La etiqueta
    // la escribió otro modelo; el original es un hecho del video.
    '  - EL NOMBRE DEL HUECO ES ORIENTATIVO; EL ORIGINAL MANDA. La etiqueta entre',
    '    corchetes la escribió otro paso y a veces nombra mal el dato: puede decir "tipo de',
    '    producto" donde el original tenía un nombre comercial. Si las dos se contradicen,',
    '    gana lo que decía el original.',
    '  - MISMA FUNCIÓN Y MISMA FORMA QUE EL ORIGINAL. Tu valor es el equivalente, para el',
    '    producto nuevo, de lo que había ahí: si el original era un nombre comercial, va',
    '    un nombre comercial —no la categoría ni la descripción de qué es—; si era una',
    '    forma corta de nombrar al público, va otra igual de corta —no la definición',
    '    demográfica entera—. Mismo tipo de dato y aproximadamente el mismo número de',
    '    palabras. Una frase del original que cumplía una función, adaptada, cumple esa',
    '    misma función.',
    // "Ella" → "adultos y jóvenes" pasaba la regla de arriba (es corto) y aun así perdía
    // lo único que ese hueco decía: a quién le habla el personaje, en qué persona y en
    // qué género. Nada conectaba el hueco con quién está en cámara.
    '  - CONSERVA LA PERSONA Y EL GÉNERO DEL ORIGINAL. Si el original le hablaba a alguien',
    '    en concreto ("para ella", "para ti"), el tuyo también: un hueco de público no se',
    '    cambia por una franja demográfica solo porque quepa. Quien habla es el PERSONAJE',
    '    de los INPUTS, así que el género y el tratamiento salen de ahí.',
    '  - LOS INPUTS SON NOTAS DE UN FORMULARIO, no texto listo para pegar. Están escritos',
    '    como apuntes sueltos ("adultos y jóvenes desde los 12 años", "no puedo dormir por',
    '    las noches") y no como parte de una oración. Volcarlos tal cual dentro de una',
    '    frase que pedía una o dos palabras deja el guión ilegible: hay que sacar el dato y',
    '    darle la forma que la frase pide. El original te muestra cuál es esa forma.',
    '  - Encaja en género, número y en la forma que pide la oración. El contexto te',
    '    muestra las palabras vecinas justamente para eso.',
    '  - Forma CORTA. El hueco ocupa el lugar de una palabra o dos, y la locución va',
    '    cronometrada contra tomas de duración fija: meter la descripción entera del',
    '    producto donde iba "serum" alarga el audio y lo desincroniza de la imagen.',
    '  - NUNCA uses el nombre del hueco como valor: "tipo de producto" es la etiqueta del',
    '    agujero, no un valor.',
    '  - NUNCA devuelvas la frase entera ya armada. El valor es SOLO lo que va dentro del',
    '    corchete: si el contexto es "es el ⟦Producto⟧ de la marca", el valor son una o',
    '    dos palabras, jamás algo que empiece por "es el" ni que incluya "de la marca".',
    '    Un valor que repite las palabras vecinas se descarta automáticamente y el hueco',
    '    queda sin rellenar.',
    '  - RELLENA SIEMPRE. Ningún hueco se queda vacío: un guión con agujeros no se',
    '    puede renderizar y obliga al usuario a escribir a mano lo que tú ya puedes',
    '    deducir. El orden para elegir el valor es este, y solo se baja un escalón',
    '    cuando el de arriba no da respuesta:',
    '      1. Está literal en los INPUTS o en la etiqueta del envase → cópialo (con la',
    '         forma que pida la frase; la etiqueta se traduce, no se pega).',
    '      2. No está literal pero se DEDUCE de lo que sí hay: el ángulo, el problema,',
    '         el público, la categoría del producto, lo que se ve en la foto.',
    '      3. Ni siquiera se deduce → escribe lo más VEROSÍMIL para un producto de esta',
    '         categoría. Que sea corriente y creíble, nunca espectacular: si te falta un',
    '         plazo, "en pocas semanas" antes que "en 3 días"; si te falta una cifra, la',
    '         que un producto así tendría de verdad. Es un borrador que el usuario va a',
    '         leer y corregir, no una ficha técnica.',
    '  - Deja `valor` VACÍO solo si rellenarlo exigiría afirmar algo que el usuario',
    '    tendría que desmentir — un premio, un aval médico, un estudio clínico, una',
    '    certificación o una garantía que nadie mencionó.',
    '',
    '── EL GUION REESCRITO (`locuciones`) ──',
    'Además de los valores, devuelve la locución COMPLETA de cada toma ya adaptada: el',
    'ORIGINAL de esa toma —lo tienes arriba, palabra por palabra— con los datos nuevos',
    'puestos en el sitio de los viejos. Escríbela como la',
    'escribirías a mano, no como un pegado — si al poner el valor la frase pide un ajuste',
    'de concordancia, de preposición o de conector, hazlo. Eso es lo único que puedes',
    'tocar del texto que rodea al hueco.',
    '',
    'TODO LO DEMÁS SE COPIA PALABRA POR PALABRA del original. No reordenes, no resumas, no',
    'mejores el argumento, no cambies el tono ni agregues frases. Si al leer tu locución',
    'no se reconoce el guion de referencia, te fuiste: se descarta y se usa el pegado',
    'automático en su lugar.',
    '',
    'Si aun así dejaste algún hueco VACÍO en `valores` (solo el caso del párrafo',
    'anterior), en la locución va como `[PENDIENTE: nombre del hueco]`, con ese formato',
    'exacto y el mismo nombre: es lo que bloquea el render para que nadie grabe un',
    'corchete leído en voz alta. Lo normal es que no quede ninguno.',
    '',
    '── ACCIONES ──',
    'Devuelve un `acciones` por cada toma, con su `n`. La acción de cada toma NO se',
    'inventa ni se resume: se copia la `accion` del corte con el mismo índice, cambiando',
    'solo lo que es específico del producto viejo.',
    'Si el original dice "aplica unas gotas en la mejilla derecha con un gotero, luego',
    'masajea y muestra el producto a cámara girándolo", tu acción conserva el gotero (o',
    'su equivalente en el producto nuevo: una gomita se toma con los dedos, un frasco se',
    'destapa), la mejilla, el masaje, el giro y el orden. Perder "con un gotero" o',
    '"girándolo" convierte una coreografía en un gesto genérico y el video deja de',
    'parecerse al original, que es lo único que se le pide.',
    'Conserva SIEMPRE: qué mano, cómo agarra, dónde toca, hacia dónde mira, y en qué',
    'momento el producto entra y sale del cuadro.',
    '',
    'CORTES REALES DE LA REFERENCIA (empareja por índice con las tomas):',
    JSON.stringify(forensic.cortes.map((c) => ({ n: c.n, tiempo: c.tiempo, accion: c.accion, camara: c.camara }))),
    '',
    'TOMAS DE LA PLANTILLA (para ver el contexto de cada hueco):',
    JSON.stringify(template.tomas),
    '',
    '── INPUTS DEL USUARIO ── (jerarquía de sustitución, en este orden)',
    `  1. PRODUCTO: ${inputs.productName}`,
    `  2. DESCRIPCIÓN DEL PRODUCTO: ${inputs.productDescription}`,
    `  3. ÁNGULO DEL VIDEO: ${inputs.angle}`,
    `  4. AVATAR / PÚBLICO OBJETIVO: ${inputs.targetAudience}`,
    `  5. PROBLEMA O DESEO PRINCIPAL: ${inputs.problem}`,
    `  6. PERSONAJE: ${inputs.characterDesc}`,
    `  7. ACENTO REGIONAL: ${inputs.accent}`,
    scan?.productDescription ? `  7. IMAGEN DEL PRODUCTO (forma observada): ${scan.productDescription}` : '',
    // El texto de la ETIQUETA es la fuente más autorizada que existe sobre el producto —
    // ingredientes, dosis, beneficios impresos por el propio fabricante— y durante un
    // tiempo se leía de la foto, se guardaba y NO se le pasaba a esta fase. Resultado
    // medido: una sesión con 11 huecos pendientes cuya respuesta estaba en la etiqueta
    // guardada. El spec ya lo dice ("La imagen proporcionada por el usuario es la fuente
    // de verdad visual del producto"); omitirlo era la desviación, no incluirlo.
    scan?.brandingDescription ? `  8. TEXTO DE LA ETIQUETA (leído de la foto del producto): ${scan.brandingDescription}` : '',
    inputs.constraints ? `  9. INFORMACIÓN ADICIONAL: ${inputs.constraints}` : '',
    '',
    'La locución se escribe en la variante regional del español del acento indicado:',
    'vocabulario, giros y conjugación ("tú" / "vos" / "usted") tienen que coincidir.',
    '',
    '⛔ LA REGLA QUE MANDA SOBRE TODAS LAS DEMÁS: LA PLANTILLA NO SE INVENTA.',
    'El texto que rodea a los corchetes es del anuncio original y se copia palabra por',
    'palabra: no reescribas la estructura, no cambies el orden de las frases, no agregues',
    'ni quites ideas, no "mejores" el argumento. Eso es lo intocable.',
    '',
    'LO QUE VA DENTRO DE LOS CORCHETES SÍ SE COMPLETA, aunque no esté literal en los',
    'datos. Primero lo que el usuario entregó; si no alcanza, lo que se deduzca de ello;',
    'y si tampoco, lo más aproximado a la realidad de un producto de esta categoría. Es',
    'un borrador que el usuario revisa línea por línea antes de renderizar: un guión',
    'completo y corregible le sirve, uno lleno de agujeros no.',
    '',
    'Lo verosímil no es lo espectacular. Nada de superlativos, cifras redondas llamativas',
    'ni plazos cortos que suenen a promesa. Y NUNCA inventes lo que un cliente podría',
    'exigirle al usuario que demuestre: premios, avales médicos, estudios clínicos,',
    'certificaciones, garantías ni testimonios de terceros. Eso se queda vacío.',
    '',
    'LA ETIQUETA DEL PRODUCTO SÍ CUENTA COMO FUENTE, y es la mejor que hay. Si dice',
    '"NIACINAMIDA PURA, PHE-RESORCINOL" o "Melatonin 10mg Per Serving", esos son datos',
    'del producto del usuario y puedes usarlos: los imprimió el fabricante en el envase.',
    'Lo que no puedes es completar lo que la etiqueta NO dice con lo que tú sepas de esa',
    'marca por otro lado.',
    '',
    '⚠️ La etiqueta se ADAPTA, no se pega. Suele venir en otro idioma y en mayúsculas de',
    'packaging ("Fall Asleep Faster", "100% Drug-Free"): hay que traducirla y darle la',
    'forma que pide la frase, igual que con cualquier otro input. Pegar el fragmento tal',
    'cual deja un anuncio en español con retazos en inglés.',
    '',
    'Antes de escribir un ingrediente, una cifra, un plazo, una marca o una cantidad,',
    'búscalo primero en los INPUTS y en la etiqueta: lo que esté ahí SIEMPRE le gana a lo',
    'que tú puedas suponer, y suponer teniendo el dato delante es el error más caro.',
    '',
    'TEXTO EN PANTALLA: NINGUNO. Ni captions, ni subtítulos, ni overlays, ni watermarks.',
    'Solo puede aparecer texto físicamente impreso en el producto o en objetos reales del',
    'escenario. No agregues ningún campo de texto en pantalla.',
    '',
    'Todo el output va en español.',
  ].filter(Boolean).join('\n')
}

/**
 * Prompt de la segunda pasada. Recibe el guión ya armado por código y la tabla de qué
 * valor ocupó cada hueco.
 *
 * ⚠️ NO trae ejemplos con forma de frase rellenada. Los defectos se enuncian por
 * CATEGORÍA, no mostrando oraciones rotas. La razón está documentada en `fill.ts`: la
 * primera versión del prompt de esta fase incluía un "así salió mal" con forma de valor
 * y el modelo lo copió literal como valor. Acá el artefacto bajo revisión ES una frase
 * rellenada, así que un ejemplo con esa forma sería todavía más fácil de copiar.
 */
export function buildCoherenceInstruction(
  tomas: { n: number; locucion: string }[],
  valores: { id: string; valor: string; contexto: string }[],
  inputs: UserInputs,
  scan: ProductScan | null,
): string {
  return [
    'Eres un corrector de estilo. Abajo hay un guión publicitario en español al que ya se',
    'le rellenaron los huecos, y la tabla de qué valor se puso en cada uno.',
    '',
    'TU ÚNICO TRABAJO: leerlo EN VOZ ALTA mentalmente, frase por frase, y devolver los',
    'valores que NO encajan. Nada más. No reescribas el guión: el texto de alrededor de',
    'cada hueco es intocable y se copia con código — si devuelves una frase, se descarta.',
    '',
    '── GUIÓN ARMADO, tal como se leería ──',
    ...tomas.map((t) => `  Toma ${t.n}: ${t.locucion}`),
    '',
    '── QUÉ VALOR OCUPÓ CADA HUECO ──',
    ...valores.map((v) => `  ${v.id} = "${v.valor}"     en: ${v.contexto}`),
    '',
    '── QUÉ CUENTA COMO "NO ENCAJA" ──',
    'Cuatro categorías. Todas se detectan leyendo la frase completa, no la etiqueta:',
    '',
    '  1. LA FRASE SE ROMPE GRAMATICALMENTE. Concordancia de género o número, o un verbo',
    '     que no rige lo que se le puso delante. Si al leerlo suena a traducción rota,',
    '     está mal.',
    '  2. EL VALOR NO ES DE LA CLASE QUE PIDE EL VERBO. "tiene ___" pide una cosa que el',
    '     producto contiene, no un efecto que produce. "con solo tomar ___" pide una',
    '     cantidad o una dosis, no un momento del día. "andas muy ___" pide un adjetivo,',
    '     no una oración. Fíjate en qué exige el verbo que va antes del hueco.',
    '  3. SE VOLCÓ UN INPUT CRUDO. Los datos del usuario están redactados como notas',
    '     ("No puedo dormir por las noches"), no como parte de una frase. Meterlos tal',
    '     cual donde la oración pedía una palabra deja el guión ilegible: hay que',
    '     adaptarlos a la forma que la frase pide.',
    '  4. EL VALOR REPITE PALABRAS QUE YA ESTÁN A SU LADO, o arrastra puntuación que',
    '     duplica la de la frase.',
    // ⚠️ NO LE PASES EL GUIÓN ORIGINAL A ESTE PROMPT. Se probó (una categoría "no cumple
    // la función del original", con el texto original al lado de cada valor) y el
    // corrector empezó a devolver EL PRODUCTO VIEJO como corrección: `ingrediente 1 →
    // "maca roja"`, `situación personal → "cansada y sin energía para esos momentos"`.
    // Es el mismo mecanismo que ya documenta `fill.ts`: cualquier texto con la forma del
    // artefacto que el modelo tiene que producir se convierte en algo que copiar. La
    // primera pasada SÍ lo lleva, y ahí es correcto — su trabajo es sustituirlo. El de
    // este es juzgar lo ya escrito.
    '',
    '── CÓMO CORREGIR ──',
    'Para cada hueco que falle, devuelve su `id`, el `valor` nuevo y el `motivo` (corto).',
    'Los huecos que están bien NO se devuelven.',
    '',
    '⚠️ NO VACÍES EL HUECO PARA SALIR DEL PASO. Un valor que no encaja se REEMPLAZA por',
    'uno que sí: mira primero los INPUTS y la etiqueta del envase (ahí suele estar la',
    'respuesta al ingrediente, la dosis o el beneficio), después lo que se deduzca de',
    'ellos, y si nada de eso da, escribe lo más verosímil para un producto de esta',
    'categoría — el usuario lo revisa y lo corrige antes de renderizar.',
    'La etiqueta se traduce y se adapta a la frase, no se pega tal cual.',
    'Vacía solo si rellenar exigiría afirmar un premio, un aval médico, un estudio, una',
    'certificación o una garantía que nadie mencionó.',
    '',
    'El valor corregido sigue siendo CORTO —una palabra o un sintagma— y sustituye solo lo',
    'que estaba entre corchetes: las palabras vecinas ya están escritas.',
    '',
    '── SI NINGÚN VALOR CABE: `ajustes` ──',
    'A veces la frase original no admite ningún valor correcto. Solo en ESE caso puedes',
    'tocar las palabras de alrededor. Dos formas de que pase:',
    '',
    '  a) NO EXISTE EL VALOR. El guion dice "andas muy ___" y para este producto no hay',
    '     adjetivo que vaya ahí: cualquier cosa que pongas deja la oración rota.',
    '  b) EL ARTÍCULO O LA PREPOSICIÓN DE AL LADO NO CONCUERDAN CON EL VALOR CORRECTO.',
    '     ⚠️ Este caso es el más frecuente y `correcciones` NO puede arreglarlo: el',
    '     artículo es andamiaje, no valor. Medido en un anuncio real: el original decía',
    '     "si te encuentras en la Galería Santa Lucía", el hueco quedó "en la [ubicación]"',
    '     y el valor correcto era una ciudad, así que el guión salió diciendo "si te',
    '     encuentras en la Lima". El arreglo es quitar el artículo, no cambiar la ciudad.',
    '     Lo mismo con el género ("el/la"), el número ("este/estos") y las contracciones',
    '     ("a el" → "al", "de el" → "del").',
    '',
    'Devuelve entonces un `ajustes` con: la toma `n`, el `idHueco` que no se puede',
    'rellenar, la `locucion` COMPLETA de esa toma ya arreglada, y el `motivo`.',
    '',
    'Condiciones, todas obligatorias:',
    '  - Es el ÚLTIMO recurso. Si existe un valor que encaje, usa `correcciones`, no esto.',
    '  - El arreglo es MÍNIMO y local: se toca el conector o la concordancia que estorba,',
    '    no se reescribe la frase ni se cambia lo que dice.',
    '  - Todo lo demás de la toma se copia palabra por palabra: el resto del guion, los',
    '    valores ya rellenados y los marcadores [PENDIENTE: …] siguen exactamente igual.',
    '  - No es para mejorar el estilo de una frase que ya se entiende. Una toma sin',
    '    problema no lleva ajuste.',
    '',
    '── LO ÚNICO QUE PUEDES USAR PARA RELLENAR ──',
    'Ojo: esto son NOTAS que escribió el usuario en un formulario, no texto listo para',
    'pegar. Están redactadas en primera persona y como oraciones completas. Pegarlas tal',
    'cual dentro de una frase que pedía una palabra es el error más frecuente de esta',
    'fase: hay que extraer el dato y darle la forma que la oración exige.',
    `  PRODUCTO: ${inputs.productName}`,
    `  DESCRIPCIÓN: ${inputs.productDescription}`,
    `  ÁNGULO: ${inputs.angle}`,
    `  PÚBLICO: ${inputs.targetAudience}`,
    `  PROBLEMA: ${inputs.problem}`,
    inputs.constraints ? `  ADICIONAL: ${inputs.constraints}` : '',
    scan?.brandingDescription ? `  TEXTO DE LA ETIQUETA: ${scan.brandingDescription}` : '',
    scan?.productDescription ? `  FORMA DEL PRODUCTO: ${scan.productDescription}` : '',
    'Nada que no esté en esa lista. Tu conocimiento del producto real no cuenta.',
    '',
    'Todo el output va en español.',
  ].filter(Boolean).join('\n')
}
