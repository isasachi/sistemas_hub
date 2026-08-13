import { z } from 'zod'

/**
 * FASE 1 del prompt maestro — análisis forense del VIDEO ORIGINAL.
 * ---------------------------------------------------------------------------
 * Cambio de fondo respecto del pipeline anterior: la unidad de análisis es el
 * CORTE REAL (cambio visual o corte de edición), no la frase. El sistema viejo
 * pedía "un beat por cada cambio visual O por frase, lo que llegue primero", lo
 * que fabricaba cortes donde el original tenía una toma continua y destruía el
 * ritmo al reconstruir.
 *
 * Los elementos gráficos SÍ se analizan (para entender el original) pero se
 * registran aparte, nunca dentro de la acción — así no viajan al render como algo
 * a reproducir.
 */

export const CorteSchema = z.object({
  n: z.number(),
  tiempo: z.string(),          // "00:00 - 00:03"
  duracionSeg: z.number(),
  accion: z.string(),          // qué sucede, literal
  camara: z.string(),          // plano, posición, movimiento, zoom
  dialogo: z.string(),         // texto hablado en este corte
  textoOverlay: z.string(),    // "No aparece" si no hay
  transicion: z.string(),      // jump cut / corte directo / continuidad / zoom digital
})
export type Corte = z.infer<typeof CorteSchema>

export const TomaSchema = z.object({
  n: z.number(),
  encuadre: z.string(),
  posicion: z.string(),
  accionFisica: z.string(),
  objeto: z.string(),
  dialogo: z.string(),
  duracionSeg: z.number(),
})
export type Toma = z.infer<typeof TomaSchema>

export const EdicionSchema = z.object({
  sincronizacion: z.string(),
  textoOverlay: z.string(),
  escalaZoom: z.string(),
  cortes: z.string(),
  ritmo: z.string(),
  corteFinal: z.string(),
})

export const ForensicReportSchema = z.object({
  duracionTotalSeg: z.number(),
  caracteresGuion: z.number(),
  guionOriginal: z.string(),
  sujeto: z.string(),
  vestuario: z.string(),
  producto: z.string(),
  fondo: z.string(),
  elementosGraficos: z.string(),
  cortes: z.array(CorteSchema).min(1),
  tomas: z.array(TomaSchema).min(1),
  edicion: EdicionSchema,
  resumenParaUsuario: z.string(),
})
export type ForensicReport = z.infer<typeof ForensicReportSchema>

export function buildForensicInstruction(): string {
  return [
    'Actúa como analista forense experto en videos de respuesta directa.',
    'Analiza el VIDEO ORIGINAL completo, en orden cronológico.',
    '',
    'REGLA DE CORTES — la más importante:',
    '  Registra una nueva escena/corte ÚNICAMENTE cuando exista un cambio visual real o un corte de edición identificable. NO dividas una toma continua solo porque cambia el diálogo. Una toma de 8 segundos con tres frases es UN corte, no tres.',
    '',
    'MÉTRICAS GLOBALES:',
    '  - `duracionTotalSeg`: duración total del video en segundos.',
    '  - `caracteresGuion`: número total de caracteres del texto hablado, con espacios.',
    '',
    'GUION ORIGINAL (`guionOriginal`): transcripción literal, palabra por palabra.',
    '  Conserva errores, repeticiones, muletillas, frases incompletas y la gramática',
    '  original. No resumir. No corregir. No parafrasear. Si una palabra no se puede',
    '  identificar con certeza, escribe [inaudible].',
    '',
    'ELEMENTOS BASE (solo lo observable):',
    '  - `sujeto`: edad aparente, sexo aparente, cabello, barba si existe, expresión,',
    '    complexión visible y posición. Descríbelo con detalle suficiente para hacer',
    '    un casting equivalente.',
    '  - `vestuario`: prendas, colores, tejidos visibles, joyería, gafas, maquillaje.',
    '  - `producto`: forma, envase, colores, etiqueta, texto legible, materiales y',
    '    forma de manipulación.',
    '  - `fondo`: localización aparente, paredes, muebles, superficies, texturas,',
    '    objetos, iluminación y profundidad.',
    '  - `elementosGraficos`: texto en pantalla, subtítulos, colores, posición,',
    '    tipografía aparente, contorno, animación, duración, emojis, flechas, gráficos',
    '    y watermarks.',
    '',
    'Los elementos gráficos se analizan ÚNICAMENTE para entender el original.',
    'NO deben reproducirse en el video generado. Por eso van en su propio campo y',
    'nunca dentro de `accion` ni de `camara`.',
    '',
    'LA `accion` DE CADA CORTE ES COREOGRAFÍA, NO RESUMEN.',
    'Lo que se reconstruye después es un video: si la acción dice "muestra el producto",',
    'el generador inventa un gesto cualquiera y el resultado deja de parecerse al',
    'original. Describe lo que el CUERPO hace, en orden, con este nivel de detalle:',
    '  - qué mano usa y cómo agarra (con los dedos, con el puño, con ambas manos, por',
    '    el cuerpo del envase o por la tapa);',
    '  - qué hace exactamente con el producto: destaparlo, girarlo, inclinarlo, apretar',
    '    el gotero, sacar una unidad, dejarlo fuera de cuadro;',
    '  - en qué momento el producto ENTRA al cuadro y en cuál SALE, y a qué altura queda',
    '    respecto de la cara (a la altura del mentón, junto a la mejilla, tapando el',
    '    cuello, centrado frente al pecho);',
    '  - dónde se aplica o se toca: qué zona concreta, con qué dedos, en qué dirección',
    '    (círculos, toques, deslizamiento hacia arriba);',
    '  - qué hace la mano libre mientras tanto;',
    '  - hacia dónde mira: a la cámara, al producto, fuera de cuadro;',
    '  - qué expresión tiene y en qué posición empieza y termina el corte — el spec pide',
    '    la secuencia completa (posición inicial → movimiento → interacción → posición',
    '    final), no solo el resultado.',
    'Un ejemplo del nivel esperado: "sostiene el frasco con la mano derecha por el cuerpo,',
    'lo levanta hasta la altura del mentón y lo gira un cuarto de vuelta para que la',
    'etiqueta quede al frente; la mano izquierda queda fuera de cuadro; mira al producto',
    'y después a la cámara". Frente a eso, "muestra el producto" es inservible.',
    'Si en un corte el producto NO aparece, dilo explícitamente.',
    '',
    'CORTES (`cortes`): uno por corte real, en orden. Para cada uno:',
    '  `tiempo` "MM:SS - MM:SS", `duracionSeg`, `accion` (descripción literal de lo',
    '  que sucede), `camara` (plano, posición, movimiento, zoom), `dialogo` (texto',
    '  hablado durante ese corte), `textoOverlay` (o "No aparece") y `transicion`',
    '  (jump cut / corte directo / continuidad / zoom digital).',
    '',
    'TOMAS (`tomas`): convierte cada corte real en una toma de grabación, con',
    '  `encuadre`, `posicion` del personaje, `accionFisica` exacta, `objeto` usado,',
    '  `dialogo` literal y `duracionSeg` derivada del video original.',
    '  Debe haber exactamente una toma por corte, en el mismo orden.',
    '',
    'EDICIÓN (`edicion`): describe SOLO el patrón realmente usado en el original —',
    '  `sincronizacion`, `textoOverlay`, `escalaZoom`, `cortes`, `ritmo` y',
    '  `corteFinal` (cómo termina el video).',
    '',
    'PROHIBICIONES:',
    '  - No describas como hecho nada que no sea visible o audible en el video.',
    '  - NUNCA infieras raza, etnia, origen cultural ni acento a partir de la',
    '    apariencia visual. Esos datos los entrega el usuario, no el análisis.',
    '    Descríbe lo que se ve (tono de piel, cabello, facciones) sin etiquetarlo.',
    '  - Si algo no se puede determinar con seguridad, dilo explícitamente en el',
    '    campo correspondiente en vez de inventarlo.',
    '',
    '`resumenParaUsuario` va en español neutro: se muestra en la interfaz.',
    'Todo el output va en español.',
  ].join('\n')
}
