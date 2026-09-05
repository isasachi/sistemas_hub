import { z } from 'zod'
import type { ForensicReport } from './forensic'

/**
 * FASE 2 del prompt maestro — el VIDEO ORIGINAL convertido en plantilla reutilizable.
 * ---------------------------------------------------------------------------
 * La regla que sostiene todo: NO se escribe un guión nuevo. Se toma el guión
 * original y se reemplazan con [variables] únicamente los elementos específicos del
 * nicho original. "La plantilla debe parecer prácticamente igual al guion original."
 *
 * Las reglas de edición se emiten con los overlays ya apagados (NO GENERAR): la
 * plantilla es lo que se reutiliza, así que la regla de video limpio tiene que
 * viajar dentro de ella, no aplicarse recién al renderizar.
 */

export const EscenarioSchema = z.object({
  publicoObjetivo: z.string(),
  problemaDeseo: z.string(),
  personaje: z.string(),
  vestuario: z.string(),
  producto: z.string(),
  caracteristicasProducto: z.string(),
  fondo: z.string(),
  objetosSecundarios: z.string(),
})

export const TomaTemplateSchema = z.object({
  n: z.number(),
  accionVisual: z.string(),
  locucion: z.string(),
  duracionSeg: z.number(),
})
export type TomaTemplate = z.infer<typeof TomaTemplateSchema>

export const EdicionTemplateSchema = z.object({
  cortesPorSalto: z.string(),
  ceroSilencios: z.string(),
  zoom: z.string(),
  ritmo: z.string(),
  loopInfinito: z.string(),
})

/**
 * Lo ÚNICO que el modelo decide en la FASE 2: dónde van los huecos dentro del diálogo
 * de cada corte. Las tomas NO se las pedimos — ya existen, son los cortes del análisis
 * forense, con su duración y su diálogo. Pedirle que las re-particione produjo frases
 * cortadas a la mitad, oraciones enteras metidas dentro de un corchete
 * (`[Este es el Producto]`) y tomas cuyo texto era el nombre del campo.
 */
export const TemplateDraftSchema = z.object({
  locuciones: z.array(z.object({
    n: z.number(),
    /** El diálogo de ESE corte, palabra por palabra, con los huecos marcados. */
    texto: z.string(),
  })).min(1),
  escenario: EscenarioSchema,
  edicion: EdicionTemplateSchema,
  resumenParaUsuario: z.string(),
})
export type TemplateDraft = z.infer<typeof TemplateDraftSchema>

export const ScriptTemplateSchema = z.object({
  guionFillInBlank: z.string(),
  escenario: EscenarioSchema,
  tomas: z.array(TomaTemplateSchema).min(1),
  edicion: EdicionTemplateSchema,
  resumenParaUsuario: z.string(),
})
export type ScriptTemplate = z.infer<typeof ScriptTemplateSchema>

export function buildTemplateInstruction(forensic: ForensicReport): string {
  return [
    'Actúa como constructor de templates Fill in the Blank.',
    '',
    'TU ÚNICO TRABAJO: marcar con [corchetes] las palabras del guion que son específicas',
    'del nicho del video original, para que otro producto pueda ocupar su lugar.',
    'No escribas un guion nuevo, no reordenes, no partas ni juntes frases, no decidas',
    'cuántas tomas hay. Las tomas ya existen: son los cortes de abajo, cada uno con su',
    'diálogo. Devuelve, por cada corte, ESE MISMO diálogo con los huecos marcados.',
    '',
    'DIÁLOGO DE CADA CORTE (devuelve un `locuciones` por cada `n`, exactamente estos).',
    'El `texto` que devuelves es el diálogo pelado con sus corchetes: sin comillas, sin',
    'guillemets, sin llaves ni ningún envoltorio alrededor.',
    ...forensic.cortes.map((c) => `  n=${c.n}\n  ${c.dialogo}`),
    '',
    '── QUÉ SE MARCA ──',
    'Todo DATO del anuncio original: cualquier cosa que el guion afirma y que solo es',
    'cierta para ESE producto, ESE público o ESE modo de usarlo.',
    '',
    'El criterio para decidir NO es si la palabra suena corriente, es qué pasa si NO la',
    'marcas: la palabra del anuncio VIEJO se queda en el guion del usuario y se publica',
    'como si fuera suya. "de día y de noche" suena corriente y es FALSO para una',
    'mascarilla semanal. "en cara y en cuello" es falso para un producto capilar. "casi a',
    'punto de entrar a los 30" es falso para un público de 50. Esas se marcan. Lo que de',
    'verdad va tal cual es el ANDAMIAJE —"si tú también", "es momento de empezar a",',
    '"y de verdad que es el culpable de"—, que no afirma nada del producto.',
    '',
    '── CÓMO SE LLAMA CADA HUECO ──',
    'NO HAY LISTA DE NOMBRES. El nombre correcto es el que describe el ROL QUE ESE DATO',
    'CUMPLE EN SU PROPIA FRASE, en minúsculas. Quien rellena después lee ese nombre y',
    'nada más: si dice "beneficio" donde la frase pide un verbo, pondrá un sustantivo y',
    'la oración quedará rota.',
    '',
    'Ejemplos del TIPO de nombre que se espera — NO es una lista cerrada, inventa el que',
    'haga falta con tal de que describa el rol:',
    '  [mecanismo de acción]        lo que el producto hace por dentro para lograr algo',
    '  [beneficio secundario]       un beneficio que la frase enumera tras el principal',
    '  [resultado personal]         lo que le pasó a QUIEN habla',
    '  [momento de uso]             cuándo se usa',
    '  [zona de aplicación]         dónde se aplica o dónde actúa',
    '  [segmento de uso]            para quién sirve',
    '  [objeción u obstáculo]       lo que frenaba a comprarlo',
    '  [atributo diferenciador]     por qué este y no otro',
    '  [situación del avatar]       en qué momento de su vida está quien mira',
    '',
    'DOS AFINACIONES DEL NOMBRE, las dos importan:',
    '  · BARRAS cuando el dato admite más de una lectura y no se puede decidir cuál es:',
    '    [ingrediente / característica clave], [zona de aplicación / prueba visual].',
    '    Así quien rellena elige la lectura que le sirva a SU producto.',
    '  · NÚMERO cuando el MISMO tipo de dato aparece varias veces con datos DISTINTOS:',
    '    [ingrediente 1], [ingrediente 2], [ingrediente 3]. Sin número, los tres reciben',
    '    el mismo valor y la frase enumera tres veces la misma palabra. Al revés, si es',
    '    el MISMO dato repetido (el producto nombrado tres veces), NO lleva número: las',
    '    tres apariciones tienen que recibir la misma palabra.',
    '',
    'TRES NOMBRES DISTINTOS PARA EL PRODUCTO, porque son TRES DATOS DISTINTOS:',
    '  [categoría de producto] → qué clase de cosa es: "serum", "gomitas", "faja".',
    '  [marca]                 → quién lo fabrica.',
    '  [nombre del producto]   → cómo se llama ese producto en particular.',
    'Darles el mismo nombre a los tres es el error más caro de esta fase: quien rellena',
    've tres huecos con la misma etiqueta, les pone el mismo valor, y la frase sale',
    'diciendo "el suero de la marca suero y se llama suero".',
    '',
    'LA PLANTILLA TIENE QUE SEGUIR PARECIÉNDOSE AL GUION ORIGINAL: mismas frases, mismo',
    'orden, mismo número aproximado de palabras, misma puntuación, los mismos cambios de',
    'idea y las mismas repeticiones. Si el original repite una palabra o se corta a mitad',
    'de idea, la plantilla también. Marcar los DATOS no cambia nada de eso — lo que la',
    'haría irreconocible es reescribir el andamiaje, no marcar mucho.',
    '',
    '── CÓMO SE MARCA ──',
    'EL CORCHETE CUBRE EL DATO COMPLETO, no la primera palabra del dato. Un dato es todo',
    'lo que solo vale para ESTE producto: el verbo Y lo que el verbo afirma, el ingrediente',
    'Y su cantidad, el resultado Y la parte del cuerpo donde ocurre. Si marcas la primera',
    'palabra y dejas el resto afuera, ese resto se publica como una afirmación del anuncio',
    'NUEVO — y es la afirmación del producto VIEJO.',
    '',
    'Y NO SE TRAGA EL ANDAMIAJE, que es el error opuesto. Lo que enmarca al dato se',
    'queda fuera: "de la marca [Marca]", nunca "[Marca]" cubriendo también "de la',
    'marca". Artículos, preposiciones, posesivos y conjunciones van FUERA, y una',
    'oración entera nunca va dentro de un corchete.',
    '',
    '── LA PRUEBA PARA SABER DÓNDE CORTA EL HUECO ──',
    'Antes de cerrar un corchete, lee la frase poniendo adentro el valor de un producto',
    'de otro rubro cualquiera (un champú, un taladro, un colchón). Dos resultados:',
    '  · lo que queda AFUERA afirma algo que ese otro producto no hace → el hueco es',
    '    chico y tiene que crecer hasta tragarse esa afirmación entera;',
    '  · la frase deja de entenderse o pierde su conector → creciste de más, devolvé',
    '    afuera las palabras que servirían para cualquier producto.',
    'Haz esa prueba en cada hueco. Es la única forma de saber dónde corta.',
    '',
    'Y EL HUECO TIENE QUE ENCAJAR GRAMATICALMENTE donde está: si detrás de él viene un',
    'complemento ("a [X] las capas…"), el hueco pide un verbo y su complemento juntos,',
    'no un sustantivo suelto. Si el hueco y lo que lo rodea no se pueden leer de corrido',
    'con cualquier valor razonable dentro, está mal cortado.',
    '',
    'ANTE LA DUDA, MARCAR. Los dos errores no cuestan lo mismo: un hueco de más le lleva',
    'al usuario diez segundos de edición; un hueco de menos deja la palabra del anuncio',
    'ORIGINAL dentro de su guion y le publica el claim de otra marca.',
    '',
    '    ORIGINAL: "que quiero que vean mi cara sin maquillaje"',
    '    MAL:      "que quiero que vean [Parte del cuerpo] sin [Objeción]"',
    '    BIEN:     "que quiero que vean mi cara sin maquillaje"   ← nada es del nicho',
    '',
    '    ORIGINAL: "Este es el serum antienvejecimiento de la marca Apivita y se llama',
    '               Beevine Elixir"',
    '    MAL:      "[Este es el Producto]"   ← se tragó la oración',
    '    MAL:      "Este es el [Producto] de la marca [Producto] y se llama [Producto]"',
    '               ← tres datos distintos con la misma etiqueta',
    '    BIEN:     "Este es el [Categoría del producto] de la marca [Marca] y se llama',
    '               [Nombre comercial]"',
    '',
    '    ORIGINAL: "contiene ácido hialurónico, niacinamida y propóleo"',
    '    BIEN:     "contiene [Ingrediente], [Ingrediente] y [Ingrediente]"',
    '',
    'REGLA DE COPIA: fuera de los corchetes, el texto de cada `locuciones[].texto` es',
    'idéntico carácter por carácter al diálogo del corte con ese mismo `n`. Ni una',
    'palabra añadida, quitada ni reordenada.',
    '',
    'ESCENARIO Y EDICIÓN, a partir de lo observado en el original:',
    `  Sujeto: ${forensic.sujeto}`,
    `  Vestuario: ${forensic.vestuario}`,
    `  Producto: ${forensic.producto}`,
    `  Fondo: ${forensic.fondo}`,
    `  Patrón de edición: ${JSON.stringify(forensic.edicion)}`,
    '`escenario` es la mise-en-scène con sus variables. `edicion` describe el patrón real',
    'del original, pero con subtítulos, overlays y texto en pantalla en NO GENERAR: la',
    'plantilla es lo que se reutiliza, así que la regla de video limpio viaja dentro.',
    '',
    '`resumenParaUsuario` va en español neutro: se muestra en la interfaz.',
    'Todo el output va en español.',
  ].join('\n')
}
