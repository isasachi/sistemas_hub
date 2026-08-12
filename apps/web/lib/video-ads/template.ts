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
    'Convierte el VIDEO ORIGINAL analizado en una plantilla reutilizable.',
    '',
    'IMPORTANTE: NO debes crear un guion nuevo. El GUION ORIGINAL es la fuente de',
    'verdad. Reemplaza únicamente los elementos específicos del nicho original',
    'mediante variables entre corchetes.',
    '',
    'GUION ORIGINAL:',
    forensic.guionOriginal,
    '',
    'TOMAS DEL ORIGINAL:',
    JSON.stringify(forensic.tomas),
    '',
    'ESCENARIO DEL ORIGINAL:',
    `  Sujeto: ${forensic.sujeto}`,
    `  Vestuario: ${forensic.vestuario}`,
    `  Producto: ${forensic.producto}`,
    `  Fondo: ${forensic.fondo}`,
    '',
    'PATRÓN DE EDICIÓN DEL ORIGINAL:',
    JSON.stringify(forensic.edicion),
    '',
    'REGLAS DEL GUION FILL IN BLANK (`guionFillInBlank`):',
    '  - Mantén las mismas frases, el mismo orden, el mismo número aproximado de',
    '    palabras, la misma puntuación cuando sea posible, los mismos cambios de idea',
    '    y las mismas repeticiones.',
    '  - La plantilla debe parecer prácticamente igual al guion original.',
    '  - No reemplaces palabras universales innecesariamente.',
    '  - Variables válidas: [Público objetivo], [Problema], [Situación frustrante],',
    '    [Producto], [Categoría del producto], [Beneficio], [Mecanismo], [Ingrediente],',
    '    [Característica], [Objeción], [Resultado], [CTA].',
    '',
    'Ejemplo de la transformación correcta:',
    '  ORIGINAL:   "Si estás cansado de [problema original], necesitas probar [producto original]."',
    '  PLANTILLA:  "Si estás cansado de [Problema], necesitas probar [Producto]."',
    '  PROHIBIDO:  "¿Sabías que miles de personas están descubriendo una revolucionaria',
    '              solución...?" — cambia la estructura.',
    '',
    'TOMAS (`tomas`): una por cada toma del original, mismo número y mismo orden.',
    '  `accionVisual` incorpora variables cuando corresponda, `locucion` es la línea',
    '  Fill in Blank y `duracionSeg` mantiene exactamente la duración obtenida del video original.',
    '',
    'ESCENARIO (`escenario`): la mise-en-scène convertida a variables.',
    '',
    'EDICIÓN (`edicion`): reglas reutilizables basadas exclusivamente en el original.',
    '  `cortesPorSalto`, `ceroSilencios`, `zoom`, `ritmo` y `loopInfinito` describen el',
    '  patrón detectado. Subtítulos, overlays y texto en pantalla: NO GENERAR — la',
    '  plantilla nunca los reproduce, sin importar qué hacía el original.',
    '',
    '`resumenParaUsuario` va en español neutro: se muestra en la interfaz.',
    'Todo el output va en español.',
  ].join('\n')
}
