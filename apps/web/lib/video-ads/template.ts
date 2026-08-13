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
    'ÚNICAMENTE los elementos específicos del nicho original, y SOLO con estos nombres:',
    '  [Público objetivo]  [Problema]  [Situación frustrante]  [Producto]',
    '  [Categoría del producto]  [Marca]  [Nombre comercial]  [Beneficio]',
    '  [Mecanismo]  [Ingrediente]  [Característica]  [Objeción]  [Resultado]  [CTA]',
    '',
    'Esa lista es CERRADA. No inventes nombres nuevos. Si algo no encaja en ninguno de',
    'los catorce, es señal de que no había que marcarlo. Un nombre inventado como',
    '[frecuencia] o [parte del cuerpo] convierte una palabra corriente en un agujero que',
    'después alguien tiene que rellenar a mano, y el guion se vuelve ilegible.',
    '',
    'TRES NOMBRES DISTINTOS PARA EL PRODUCTO, porque son TRES DATOS DISTINTOS:',
    '  [Categoría del producto] → qué clase de cosa es: "serum", "gomitas", "faja".',
    '  [Marca]                  → quién lo fabrica: "Apivita", "La Roche-Posay".',
    '  [Nombre comercial]       → cómo se llama ese producto: "Beevine Elixir".',
    'Marcar los tres como [Producto] es el error más caro de esta fase: quien rellena',
    'después ve tres huecos con la misma etiqueta, les pone el mismo valor, y la frase',
    'sale diciendo "el suero de la marca suero y se llama suero". Usa [Producto] solo',
    'cuando de verdad no se distinga cuál de los tres es.',
    '',
    'NO REEMPLACES PALABRAS UNIVERSALES INNECESARIAMENTE.',
    'La plantilla debe parecer PRÁCTICAMENTE IGUAL al guion original: mismas frases,',
    'mismo orden, mismo número aproximado de palabras, misma puntuación, mismas',
    'repeticiones. Si al leerla no se reconoce el guion de origen, marcaste de más.',
    '',
    'Criterio para decidir: una palabra se marca si un anuncio de otro producto NO la',
    'podría decir igual. "cara", "cuello", "todos los días", "de día y de noche", "los',
    '30" son palabras corrientes: van tal cual. "menstruación", "dolor de regla", "esos',
    'días" atan el guion a su nicho: esas sí, y caben en [Problema] o',
    '[Situación frustrante].',
    '',
    'Como referencia de volumen: un guion de un minuto suele necesitar entre cinco y',
    'ocho huecos. Si te pasas de diez, casi seguro estás marcando palabras universales.',
    '',
    '── CÓMO SE MARCA ──',
    'El corchete cubre el MÍNIMO: la palabra o el sintagma corto que cambia, nada más.',
    'Artículos, preposiciones, posesivos y conjunciones van FUERA. Nunca metas una',
    'oración entera en un corchete.',
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
