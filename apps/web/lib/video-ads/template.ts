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
    'Todo lo que cambiaría si este mismo anuncio fuera de OTRO producto o de OTRA',
    'persona. Esa es la única prueba. Aplícala palabra por palabra:',
    '',
    '  ¿Un anuncio de champú podría decir esta palabra igual? Si no, va en corchete.',
    '',
    'Eso incluye cosas que parecen corrientes y NO lo son:',
    '  - la edad o el hito vital del avatar ("casi a punto de entrar a los 30");',
    '  - la zona donde se aplica ("en cara y en cuello");',
    '  - la frecuencia o el momento de uso ("de día y de noche");',
    '  - el público al que sirve ("todo tipo de piel");',
    '  - la parte del cuerpo o el aspecto que mejora ("la piel");',
    '  - el contexto de uso ("a tu rutina");',
    '  - la evidencia que se muestra en cámara ("mi cara sin maquillaje").',
    'Un champú no se aplica en cara y cuello, una mascarilla semanal no se usa de día y',
    'de noche, y una faja no sirve para "todo tipo de piel". Dejar esas palabras fijas es',
    'peor que marcarlas de más: el anuncio del usuario terminaría afirmando algo que su',
    'producto no hace.',
    '',
    'NOMBRA CADA HUECO POR LO QUE PIDE, en minúsculas y descriptivo. No hay lista cerrada.',
    'Si el dato admite varias lecturas, sepáralas con barras para orientar a quien rellena:',
    '  [tipo de producto]   [nombre de la marca]   [nombre del producto]',
    '  [situación personal / edad / hito]   [frecuencia / momento del día]',
    '  [área de aplicación / contexto de uso]   [público objetivo / tipo de piel, cabello]',
    '  [beneficio 1]   [beneficio 2]   [resultado personal 1]   [evidencia visible]',
    'NUMERA cuando son DATOS DISTINTOS que comparten tipo: `[ingrediente 1]`,',
    '`[ingrediente 2]`, `[ingrediente 3]`; `[beneficio 1]`, `[beneficio 2]`. Repetir el',
    'mismo nombre para dos datos distintos es el error más caro de esta fase — quien',
    'rellena ve la misma etiqueta y les pone el mismo valor a ambos.',
    'NO numeres cuando es LITERALMENTE EL MISMO dato repetido: si el guion nombra el',
    'producto tres veces, las tres van como `[tipo de producto]`, sin número, porque las',
    'tres tienen que recibir la misma palabra.',
    '',
    'TRES NOMBRES DISTINTOS PARA EL PRODUCTO, porque son TRES DATOS DISTINTOS:',
    '  [tipo de producto]     → qué clase de cosa es: "serum", "gomitas", "faja".',
    '  [nombre de la marca]   → quién lo fabrica: "Apivita", "La Roche-Posay".',
    '  [nombre del producto]  → cómo se llama: "Beevine Elixir".',
    'Marcar los tres igual es el error más caro de esta fase: quien rellena ve tres huecos',
    'con la misma etiqueta, les pone el mismo valor, y sale "el suero de la marca suero y',
    'se llama suero".',
    '',
    'Lo único que NO se marca es el andamiaje: las palabras que sostienen la frase y que',
    'cualquier anuncio diría igual — "Este", "me está cambiando", "Si tú también estás",',
    '"como yo", "es momento de empezar a implementar", "y de verdad que es el culpable de".',
    'Ese andamiaje es lo que hace que la plantilla siga pareciéndose al guion original.',
    '',
    '── CÓMO SE MARCA ──',
    'El corchete cubre el DATO COMPLETO, no solo su primera palabra. Si el original dice',
    '"hidratar las capas más profundas de la piel", el beneficio es esa frase entera: otro',
    'producto pondrá ahí algo de largo parecido, no una sola palabra suelta pegada a un',
    'resto que ya no le corresponde.',
    '',
    'Pero el corchete TAMPOCO se traga el andamiaje que lo rodea. Los posesivos y las',
    'fórmulas fijas que presentan el dato se quedan FUERA, porque las dice igual cualquier',
    'anuncio. Estos cuatro son los que más se cuelan:',
    '',
    '    "de la marca Apivita"        MAL [nombre de la marca] cubriendo todo',
    '                                 BIEN de la marca [nombre de la marca]',
    '    "a tu rutina"                MAL a [rutina]',
    '                                 BIEN a tu [rutina]',
    '    "que vean mi cara sin maquillaje"  MAL que vean [evidencia visible] ← con "mi" dentro',
    '                                 BIEN que vean mi [evidencia visible]',
    '    "y de verdad que es el culpable"   MAL marcar "y de verdad": es andamiaje puro,',
    '                                 no lleva corchete ninguno.',
    '',
    'Regla simple para decidir el borde: si la palabra la diría igual un anuncio de',
    'champú, va fuera del corchete. "de la marca" sí; "Apivita" no.',
    '',
    'ALINEACIÓN DE REFERENCIA — cómo se ve un trabajo bien hecho. La columna izquierda es',
    'de OTRO video, sobre un producto distinto: NO copies estas palabras ni estos nombres',
    'al resultado, solo el criterio de qué se marca y hasta dónde llega cada corchete.',
    '',
    '    "serum"                                       → [tipo de producto]',
    '    "la piel"                                     → [aspecto a mejorar / característica]',
    '    "casi a punto de entrar a los 30"             → [situación personal / edad / hito]',
    '    "rutina"                                      → [rutina / vida diaria]',
    '    "Apivita"                                     → [nombre de la marca]',
    '    "Beevine Elixir"                              → [nombre del producto]',
    '    "ácido hialurónico"                           → [ingrediente 1]',
    '    "niacinamida"                                 → [ingrediente 2]',
    '    "hidratar las capas más profundas de la piel" → [beneficio 1]',
    '    "muchísima luminosidad"                       → [beneficio 2]',
    '    "unificar el tono de piel"                    → [resultado personal 1]',
    '    "cara sin maquillaje"                         → [evidencia visible]',
    '    "todo tipo de piel"                           → [público objetivo]',
    '    "día y de noche"                              → [frecuencia / momento del día]',
    '    "cara y en cuello"                            → [área de aplicación]',
    '',
    'Fíjate en el volumen: un guion de unos 45 segundos dio VEINTITRÉS huecos. Marcar de',
    'menos es el fallo habitual, no marcar de más.',
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
