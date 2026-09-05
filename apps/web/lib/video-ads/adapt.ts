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
})
export type SlotValues = z.infer<typeof SlotValuesSchema>

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

/**
 * El diálogo del corte tal como se le puede mostrar al modelo como "lo que decía el
 * original". Un corte MUDO llega con `"No aparece"` —el marcador que el prompt de la
 * FASE 1 pide para `textoOverlay` y que el modelo generaliza a `dialogo`— y mostrarlo
 * como texto a espejar le pide adaptar una frase que nadie dijo.
 *
 * ponytail: se descarta solo la oración COMPLETA que es el marcador, así que "la mancha
 * ya no aparece" sobrevive; el arreglo de raíz es limpiarlo en la FASE 1.
 */
const dichoEn = (d: string) => (/^\s*(no aparece\.?\s*)+$/i.test(d ?? '') ? '' : d)

export function buildAdaptInstruction(
  template: ScriptTemplate,
  forensic: ForensicReport,
  inputs: UserInputs,
  scan: ProductScan | null,
  slots: Slot[],
  acento: string,
  /** Quién aparece en el video: el bloque de consistencia que produjo la FASE 4. */
  personaje: string,
): string {
  // QUÉ DECÍA EL ORIGINAL EN CADA HUECO. Sale del `alignSlots` que ya se calculaba y
  // se tiraba, y es la mitad que le faltaba a esta fase: la etiqueta del hueco no dice
  // la FORMA que la oración pide (sustantivo o infinitivo, género, número) y el
  // original sí. También es lo único que separa dos huecos que comparten nombre —
  // inevitable con una lista cerrada de variables.
  const originales = slotOriginals(template, forensic.cortes)
  const porN = new Map(forensic.cortes.map((c) => [c.n, c.dialogo]))
  return [
    'Actúa como estratega de marketing de respuesta directa.',
    '',
    // La orden de rellenar va en la SEGUNDA LÍNEA y no entre los bullets: metida ahí
    // abajo, el modelo se queda con el tono conservador del encabezado y deja huecos.
    'NO ESCRIBAS UN GUION NUEVO. El guion ya existe: es el del video de referencia, y lo',
    'tienes abajo palabra por palabra junto a la plantilla con sus huecos. Tu trabajo es',
    'sustituir las variables con los INPUTS del usuario, y nada más.',
    '',
    'RELLENA CADA HUECO QUE LOS INPUTS PERMITAN, en este orden: (1) lo que está literal',
    'en un INPUT o en la etiqueta del envase; (2) lo que se deduzca de ellos — el ángulo,',
    'el problema, el público, la categoría, lo que se ve en la foto del producto.',
    '',
    '⛔ Y AHÍ SE ACABA. Si ningún INPUT sostiene ese hueco, NO LO INVENTES: devuélvelo',
    'VACÍO y queda marcado como pendiente para que lo escriba el usuario. "Lo más',
    'verosímil para un producto de esta categoría" NO es una fuente. Un hueco pendiente',
    'se corrige en diez segundos; un dato inventado se publica en nombre del usuario.',
    '',
    'LA ÚNICA REGLA INVIOLABLE ES EL ANDAMIAJE: el texto que rodea a los corchetes es el',
    'del anuncio original y se copia palabra por palabra. Lo reconstruye el código, así',
    'que no lo reescribas — lo único que puede moverse ahí es la concordancia gramatical',
    '(género, número, artículo, tiempo verbal) cuando el valor que pusiste la rompa.',
    'Dentro de los corchetes tienes libertad; fuera, ninguna.',
    '',
    '── HUECOS ──',
    'Devuelve un `valores` por cada `id` de esta lista, exactamente estos ids:',
    ...slots.map((sl) => {
      const orig = originales[sl.id]
      return `  ${sl.id}  ·  ${sl.contexto}` + (orig ? `\n      EL ORIGINAL DECÍA AQUÍ: "${orig}"` : '')
    }),
    '',
    // La regla va DENTRO del bloque de huecos, pegada a la lista: este repo tiene
    // medido tres veces que una regla lejos de su campo es una sugerencia.
    'EL NOMBRE DEL HUECO ES ORIENTATIVO; EL ORIGINAL MANDA. La etiqueta sale de una lista',
    'cerrada, así que dos huecos distintos se llaman igual a menudo. Lo que decía el',
    'original te dice DOS cosas que la etiqueta no: la forma exacta que pide la oración',
    '—sustantivo o infinitivo, género, número— y cuál es cuál. Si dos huecos con el mismo',
    'nombre tenían originales distintos, sus valores también son distintos.',
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
    '  - Un hueco se deja VACÍO solo si pide algo que el usuario tendría que salir a',
    '    demostrar: un premio, un aval médico, un estudio clínico, una certificación,',
    '    una garantía o un plazo de devolución. Ahí un hueco marcado es mejor que una',
    '    afirmación que le explota en la cara. En todo lo demás, rellena.',
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
    '── REGLA DE ADAPTACIÓN LITERAL ──',
    'Se cambia el DATO y se conserva la FRASE. Así:',
    '',
    '    ORIGINAL:   "Si estás cansado de [problema original], necesitas probar',
    '                 [producto original]."',
    '    ADAPTACIÓN: "Si estás cansado de [nuevo problema], necesitas probar',
    '                 [nuevo producto]."',
    '',
    'NO permitido: "¿Sabías que miles de personas están descubriendo una revolucionaria',
    'solución…?" — dice lo mismo y cambió la estructura, que es lo único que esta tool',
    'promete conservar. Esa frase es un CONTRAEJEMPLO: no la copies ni la imites.',
    '',
    // Sin el guion original delante, el modelo mide cada valor contra la ETIQUETA del
    // hueco y no contra el anuncio: "gomitas de melatonina" es la respuesta correcta a
    // `[Categoría del producto]` y la equivocada al anuncio, que decía el nombre
    // comercial. Con el par ORIGINAL/ANDAMIAJE por toma, la diferencia se ve.
    'GUION ORIGINAL Y ANDAMIAJE, toma por toma. Lo de la izquierda es lo que se dijo en',
    'el video de referencia; lo de la derecha es esa misma frase con sus huecos, y es la',
    'que hay que rellenar:',
    ...template.tomas.map((t) => {
      const dicho = dichoEn(porN.get(t.n) ?? '')
      return [
        `  Toma ${t.n}`,
        dicho ? `    ORIGINAL:  ${dicho}` : '    ORIGINAL:  (sin diálogo: toma muda)',
        `    ANDAMIAJE: ${t.locucion}`,
      ].join('\n')
    }),
    '',
    'CORTES REALES DE LA REFERENCIA (empareja por índice con las tomas):',
    JSON.stringify(forensic.cortes.map((c) => ({ n: c.n, tiempo: c.tiempo, accion: c.accion, camara: c.camara }))),
    '',
    '── INPUTS DEL USUARIO ── (jerarquía de sustitución, en este orden)',
    `  1. PRODUCTO: ${inputs.productName}`,
    `  2. DESCRIPCIÓN DEL PRODUCTO: ${inputs.productDescription}`,
    `  3. ÁNGULO DEL VIDEO: ${inputs.angle}`,
    `  4. AVATAR / PÚBLICO OBJETIVO: ${inputs.targetAudience}`,
    `  5. PROBLEMA O DESEO PRINCIPAL: ${inputs.problem}`,
    // El personaje ya no se escribe a mano: sale de la foto de referencia, y lo que la
    // describe es el bloque de consistencia que produjo la FASE 4. Por ahí llega también
    // la información de la IMAGEN DEL PERSONAJE de la jerarquía.
    personaje ? `  6. PERSONAJE QUE APARECE EN EL VIDEO: ${personaje}` : '',
    scan?.productDescription ? `  7. IMAGEN DEL PRODUCTO (observado): ${scan.productDescription}` : '',
    scan?.brandingDescription ? `  8. ETIQUETA DEL ENVASE (transcrita): ${scan.brandingDescription}` : '',
    inputs.constraints ? `  9. INFORMACIÓN ADICIONAL: ${inputs.constraints}` : '',
    '',
    `ACENTO DEL PERSONAJE: ${acento}`,
    'La locución se escribe en la variante regional del español de ese acento:',
    'vocabulario, giros y conjugación ("tú" / "vos" / "usted") tienen que coincidir.',
    '',
    '⛔ LO QUE NO SE INVENTA NUNCA, ni siquiera bajo la escala de arriba: una MARCA que',
    'el usuario no escribió, un ingrediente que no está en la etiqueta, y cualquier',
    'cifra, plazo, estudio, certificación o garantía. Eso no es rellenar un hueco: es',
    'firmar una declaración en nombre del usuario. El nombre comercial NO es la marca.',
    'Antes de escribir un ingrediente o una cifra, búscalo palabra por palabra en los',
    'INPUTS y en la etiqueta; si no está ahí, el hueco va vacío.',
    '',
    'TEXTO EN PANTALLA: NINGUNO. Ni captions, ni subtítulos, ni overlays, ni watermarks.',
    'Solo puede aparecer texto físicamente impreso en el producto o en objetos reales del',
    'escenario. No agregues ningún campo de texto en pantalla.',
    '',
    'Todo el output va en español.',
  ].filter(Boolean).join('\n')
}
