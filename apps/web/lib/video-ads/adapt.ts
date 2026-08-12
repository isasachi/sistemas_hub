import { z } from 'zod'
import type { ScriptTemplate } from './template'
import type { ForensicReport } from './forensic'
import type { UserInputs } from './types'
import type { ProductScan } from '@/lib/types'

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

export const TomaFinalSchema = z.object({
  n: z.number(),
  tiempoOriginal: z.string(),
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
})
export type AdaptedScript = z.infer<typeof AdaptedScriptSchema>

export function buildAdaptInstruction(
  template: ScriptTemplate,
  forensic: ForensicReport,
  inputs: UserInputs,
  scan: ProductScan | null,
): string {
  return [
    'Actúa como estratega de marketing de respuesta directa.',
    'Rellena la plantilla Fill in the Blank con los INPUTS del usuario.',
    '',
    'PLANTILLA (guión):',
    template.guionFillInBlank,
    '',
    'TOMAS DE LA PLANTILLA:',
    JSON.stringify(template.tomas),
    '',
    'ESCENARIO DE LA PLANTILLA:',
    JSON.stringify(template.escenario),
    '',
    'INPUTS DEL USUARIO (jerarquía de sustitución, en este orden):',
    `  1. PRODUCTO: ${inputs.productName}`,
    `  2. DESCRIPCIÓN DEL PRODUCTO: ${inputs.productDescription}`,
    `  3. ÁNGULO DEL VIDEO: ${inputs.angle}`,
    `  4. AVATAR / PÚBLICO OBJETIVO: ${inputs.targetAudience}`,
    `  5. PROBLEMA O DESEO PRINCIPAL: ${inputs.problem}`,
    `  6. PERSONAJE: ${inputs.characterDesc}`,
    scan?.productDescription ? `  7. IMAGEN DEL PRODUCTO (observado): ${scan.productDescription}` : '',
    inputs.constraints ? `  9. INFORMACIÓN ADICIONAL: ${inputs.constraints}` : '',
    '',
    'REGLA DE ADAPTACIÓN LITERAL — así y solo así:',
    '  ORIGINAL:   "Si estás cansado de [problema original], necesitas probar [producto original]."',
    '  ADAPTACIÓN: "Si estás cansado de [nuevo problema], necesitas probar [nuevo producto]."',
    '  PROHIBIDO:  "¿Sabías que miles de personas están descubriendo una revolucionaria',
    '              solución...?" — cambiaría la estructura.',
    '',
    'REGLAS:',
    '  - Mantén flujo, ritmo, orden, intención, función de cada frase, longitud',
    '    aproximada, número de tomas, tipo de hook, tipo de demostración y tipo de CTA.',
    '  - Ajustes gramaticales permitidos SOLO para género, número, concordancia,',
    '    tiempos verbales y la naturalidad mínima indispensable.',
    '  - NO mejores el guion por iniciativa propia.',
    '  - NO introduzcas frameworks de marketing externos.',
    '  - NO agregues argumentos que el anuncio original no tenga.',
    '  - Si una frase original cumple una función específica, la adaptación debe',
    '    cumplir esa misma función.',
    '',
    'NO INVENTES beneficios, ingredientes, estudios, certificaciones, resultados,',
    'características, claims ni mecanismos que no estén en los INPUTS. Si falta',
    'información para completar una variable de forma segura, déjala literalmente como',
    '[VARIABLE PENDIENTE] y regístrala en `variablesPendientes`.',
    '',
    'LONGITUD:',
    `  El guion original tiene ${forensic.caracteresGuion} caracteres. Cuenta los del`,
    '  guion adaptado en `caracteresAdaptado` y la diferencia en `diferenciaCaracteres`',
    '  (positiva si es más largo). Mantente tan cerca como sea razonablemente posible.',
    '',
    'TOMAS (`tomas`): mismo número y mismo orden que la plantilla.',
    '  `tiempoOriginal` y `duracionSeg` se copian de la plantilla sin cambios.',
    '  `accionVisual` describe secuencialmente: posición inicial, movimiento,',
    '  interacción, dirección de manos, manipulación del producto, mirada, expresión y',
    '  posición final. No describas solo el resultado final.',
    '  `personaje` y `producto` describen lo que se ve en esa toma.',
    '  `locucion` es el texto hablado EXACTO de esa toma, tomado del guión adaptado.',
    '',
    'TEXTO EN PANTALLA: NINGUNO. No generes captions, subtítulos, overlays, títulos,',
    'stickers, emojis, flechas, banners, gráficos, UI ni watermarks. Solo puede',
    'aparecer texto físicamente impreso en el producto o en elementos reales del',
    'escenario. No agregues ningún campo de texto en pantalla a las tomas.',
    '',
    'Todo el output va en español.',
  ].filter(Boolean).join('\n')
}
