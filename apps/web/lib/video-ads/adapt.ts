import { z } from 'zod'
import type { ScriptTemplate } from './template'
import type { Slot } from './fill'
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
  return [
    'Actúa como estratega de marketing de respuesta directa.',
    '',
    'TU TRABAJO NO ES ESCRIBIR UN GUION. El guion ya existe: es el del video de',
    'referencia, y se reconstruye copiándolo con código, palabra por palabra. Lo único',
    'que decides tú es QUÉ VALOR va en cada hueco y cómo se traduce al producto nuevo lo',
    'que el cuerpo hace en cada toma. Cualquier frase que escribas fuera de esos dos',
    'campos se descarta, así que no reescribas el guion: no se usaría.',
    '',
    '── HUECOS ──',
    'Devuelve un `valores` por cada `id` de esta lista, exactamente estos ids:',
    ...slots.map((sl) => `  ${sl.id}  ·  ${sl.contexto}`),
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
    '  - Si no tienes con qué rellenarlo, devuelve `valor` VACÍO. No lo adivines: el',
    '    hueco queda marcado en el guión y el usuario lo escribe él mismo antes de',
    '    renderizar. Un hueco vacío es un resultado correcto; uno inventado es',
    '    inservible.',
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
    scan?.productDescription ? `  8. IMAGEN DEL PRODUCTO (observado): ${scan.productDescription}` : '',
    inputs.constraints ? `  9. INFORMACIÓN ADICIONAL: ${inputs.constraints}` : '',
    '',
    'La locución se escribe en la variante regional del español del acento indicado:',
    'vocabulario, giros y conjugación ("tú" / "vos" / "usted") tienen que coincidir.',
    '',
    '⛔ LA REGLA QUE MANDA SOBRE TODAS LAS DEMÁS: NO INVENTES.',
    'Ni beneficios, ni ingredientes, ni marcas, ni cantidades, ni plazos, ni estudios, ni',
    'certificaciones, ni resultados, ni características, ni claims, ni mecanismos. Solo',
    'puedes usar lo que está literalmente en los INPUTS y en la descripción observada del',
    'producto. Tu conocimiento del mundo NO es una fuente válida acá.',
    '',
    'Esto pasó de verdad y no puede repetirse. El usuario escribió solo "Suero de',
    'niacinamida para marcas de acné", y el guion salió diciendo: "contiene niacinamida,',
    'PHE-resorcinol y agua termal de La Roche-Posay". Esos dos últimos son la fórmula',
    'real de un producto de OTRA marca, sacados de memoria. Publicar eso es una',
    'declaración falsa de composición nombrando a un competidor. Lo correcto era dejar',
    'el hueco vacío. En el mismo guion se inventó "la marca Pure" a partir del nombre',
    'del producto: el nombre comercial NO es la marca, y ninguna marca que el usuario no',
    'haya escrito puede aparecer jamás.',
    '',
    'Antes de escribir un ingrediente, una cifra, un plazo, una marca o una cantidad,',
    'búscalo palabra por palabra en los INPUTS. Si no está ahí es invención, por muy',
    'plausible que suene y por muy bien que encaje en la frase.',
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
    '',
    '── CÓMO CORREGIR ──',
    'Para cada hueco que falle, devuelve su `id`, el `valor` nuevo y el `motivo` (corto).',
    'Los huecos que están bien NO se devuelven.',
    '',
    '⚠️ DEJAR EL HUECO VACÍO ES UNA CORRECCIÓN VÁLIDA Y A MENUDO LA CORRECTA.',
    'Devuelve `valor` como cadena vacía cuando en los INPUTS no haya con qué rellenarlo.',
    'Si la frase pide un ingrediente y el usuario nunca dijo qué ingredientes tiene su',
    'producto, NO inventes uno que suene creíble: vacíalo. El hueco queda marcado y lo',
    'escribe el usuario, que sí lo sabe. Un ingrediente inventado en un anuncio que se',
    'publica es una declaración falsa de composición; un hueco vacío es solo un pendiente.',
    '',
    'El valor corregido sigue siendo CORTO —una palabra o un sintagma— y sustituye solo lo',
    'que estaba entre corchetes: las palabras vecinas ya están escritas.',
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
    'Nada que no esté en esa lista. Tu conocimiento del producto real no cuenta.',
    '',
    'Todo el output va en español.',
  ].filter(Boolean).join('\n')
}
