import { z } from 'zod'
import type { TomaFinal } from './adapt'
import type { VoiceProfile } from './character'
import { KIE_PROMPT_MAX } from './kie'

/**
 * FASE 5 del prompt maestro — agrupación de tomas en lotes de generación.
 * ---------------------------------------------------------------------------
 * Esto es aritmética, no criterio: agrupar por duración y cortar en 15 s no necesita
 * un LLM, y pedírselo lo volvería no determinista justo donde importa que no lo sea
 * (el tope de 15 s es también el techo duro del modelo de KIE).
 *
 * El 15 aparece dos veces por razones distintas que coinciden: es la regla del spec
 * y es `MAX_DURATION` de grok-imagine-video-1-5-preview. Si el modelo cambiara, hay
 * que revisar si el spec sigue queriendo 15.
 *
 * INVARIANTE QUE ESTE MÓDULO EXISTE PARA GARANTIZAR: ningún `Lote` devuelto por
 * `groupIntoLotes` puede tener `duracionSeg > LOTE_MAX_SEC`. Cada lote es una llamada
 * PAGADA a la API de video; uno inválido cuesta dinero y falla tarde (o peor, alguien
 * río abajo lo clampea y el audio sale cortado a mitad de frase). Todo lo de abajo
 * (saneo de duraciones, recursión en `splitLongToma`, comparación con epsilon en el
 * guard) está para que ese invariante se cumpla pase lo que pase con el input, no solo
 * en el caso feliz.
 */

export const LOTE_MAX_SEC = 15

export const LoteSchema = z.object({
  n: z.number(),
  tomas: z.array(z.object({
    n: z.number(),
    duracionSeg: z.number(),
    accionVisual: z.string(),
    personaje: z.string(),
    producto: z.string(),
    locucion: z.string(),
    tiempoOriginal: z.string(),
  })),
  duracionSeg: z.number(),
  prompt: z.string(),
  taskId: z.string().nullable(),
  status: z.enum(['idle', 'waiting', 'queuing', 'generating', 'success', 'fail']),
  videoUrl: z.string().nullable(),
  // Motivo de un `status: 'fail'` (viene de `TaskDetail.failMsg` en kie.ts). Sin esto
  // la UI podía decir "el lote 2 falló" pero nunca por qué (fix round 1, Task 6).
  failMsg: z.string().nullable(),
  // Huella del contenido con el que se renderizó ESTE lote (`scriptFingerprint`,
  // render-lotes.ts). `groupIntoLotes` no la conoce —depende de la sesión entera, no
  // de las tomas— así que nace en `null` y la estampa `generate-lotes/route.ts` sobre
  // todos los lotes de una misma llamada. Al reanudar se compara contra la huella
  // recalculada: si el guión (o el personaje, o la voz) cambió, reanudar mezclaría un
  // lote ya renderizado del contenido VIEJO con lotes nuevos del contenido ACTUAL, y
  // el video sale incoherente (fix round 4, Task 6). Va acá adentro y no en una
  // columna nueva a propósito: `lotes` ya es jsonb y un string hexadecimal cruza ese
  // ida y vuelta sin transformarse, así que no hace falta migración.
  scriptHash: z.string().nullable(),
})
export type Lote = z.infer<typeof LoteSchema>

/** Redondea a 1 decimal: sumar floats produce 14.299999999999999. Solo para display —
 *  ver comentario en `EPS` sobre por qué las comparaciones contra el tope no usan esto. */
const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * Tolerancia SOLO para ruido de punto flotante (ej. 14.299999999999999), no para
 * exceso genuino. Redondear a 1 decimal antes de comparar (como hacía la v1) se traga
 * un exceso real: un guión con duraciones de 2 decimales que sume 15.02 pasaría el
 * check `r1(15.02) > 15` como falso (r1 lo baja a 15.0) y el lote saldría inválido.
 * Con epsilon, cualquier exceso por encima del ruido de floats sí corta el lote.
 */
const EPS = 1e-9
const excedeTope = (segundos: number) => segundos - LOTE_MAX_SEC > EPS

/** Piso de duración para una toma con `duracionSeg` inválido (no finito, cero o
 *  negativo). Esta es LA ÚNICA defensa contra duraciones degeneradas — a propósito:
 *  `TomaFinalSchema.duracionSeg` (adapt.ts) es un `z.number()` sin refinar. Un `.positive()`
 *  ahí se probó y se revirtió (fix round 2): el forense puede reportar legítimamente un
 *  corte de 0s, y esa misma plantilla se relee en cada reintento de `AdaptedScriptSchema`
 *  — un 0 la tumba de forma determinista en los 6 intentos (3 OpenAI + 3 Gemini) y deja
 *  la sesión trabada sin salida sin re-correr el análisis forense (el paso caro). Sin
 *  este piso, un NaN nunca hace `> LOTE_MAX_SEC` (comparación con NaN es siempre falsa)
 *  y el lote nunca cierra, fusionando TODO el resto del guión en uno solo; un Infinity
 *  revienta `Array.from({ length: Infinity })` con RangeError. 0.1s es arbitrario — el
 *  valor correcto no existe sin re-preguntarle al LLM — pero garantiza que la función
 *  no crashee ni rompa el invariante. */
const DUR_FALLBACK = 0.1
const sanearDuracion = (d: number) => (Number.isFinite(d) && d > 0 ? d : DUR_FALLBACK)

/**
 * Parte una toma que por sí sola supera el tope. El spec pide dividir "solamente en
 * puntos naturales de acción o diálogo": se corta por frases y se reparte la duración
 * en proporción a los caracteres de cada tramo. Sin puntos que aprovechar (o si el
 * reparto proporcional deja un fragmento igual de largo — frase corta seguida de una
 * larga, ej. "Ok." + explicación completa hereda casi toda la duración), se recurre
 * sobre ESE fragmento hasta que quepa: la rama de reparto uniforme más abajo garantiza
 * el ajuste por construcción (`ceil` asegura `dur / minPartes <= LOTE_MAX_SEC`), así
 * que la recursión siempre termina ahí como mucho.
 */
function splitLongToma(t: TomaFinal): TomaFinal[] {
  const dur = sanearDuracion(t.duracionSeg)
  // SIN r1 acá (fix round 2): esta es la salida de la inmensa mayoría de las tomas —
  // las que no necesitan dividirse. Aplastar su duración a 1 decimal antes de que
  // `groupIntoLotes` la sume anula el epsilon de `excedeTope`: dos tomas de 7.51 s
  // (15.02 s reales) llegaban redondeadas a 7.5 y sumaban exactamente 15.0, así que el
  // guard nunca disparaba. El resultado no se veía como lote inválido (el invariante
  // publicado seguía en <=15) sino como MENOS lotes de los que tocaba — la API igual
  // renderiza una duración entera, así que ese excedente sale como diálogo cortado.
  // El redondeo se queda solo en `r1` sobre el `duracionSeg` de display del lote.
  if (dur <= LOTE_MAX_SEC) return [{ ...t, duracionSeg: dur }]

  const partes = t.locucion.split(/(?<=[.!?])\s+/).filter((s) => s.trim())

  if (partes.length < 2) {
    // Sin puntos que aprovechar: reparto uniforme conservando el texto en la primera.
    // `dur > LOTE_MAX_SEC` acá, así que `Math.ceil(dur / LOTE_MAX_SEC)` es siempre >= 2.
    const minPartes = Math.ceil(dur / LOTE_MAX_SEC)
    return Array.from({ length: minPartes }, (_, i) => ({
      ...t,
      duracionSeg: r1(dur / minPartes),
      locucion: i === 0 ? t.locucion : '',
    }))
  }

  const totalChars = partes.reduce((n, p) => n + p.length, 0) || 1
  // Reparto proporcional a caracteres — NO es garantía suficiente por sí solo (ver
  // comentario de la función), así que cada fragmento se vuelve a verificar
  // recursivamente antes de aceptarlo.
  return partes.flatMap((p) =>
    splitLongToma({ ...t, duracionSeg: r1((p.length / totalChars) * dur), locucion: p }),
  )
}

export function groupIntoLotes(tomas: TomaFinal[]): Lote[] {
  // Renumeramos TODA la secuencia expandida en orden: si una toma se divide, sus
  // fragmentos no pueden compartir el `n` original (colisionarían al rotular "Toma N"
  // en el prompt de Task 5 — dos "Toma 1" en el mismo guión). Numerar secuencial y
  // global es la forma más simple de garantizar unicidad y orden sin inventar un
  // esquema paralelo (sufijos, decimales) que Task 5 tendría que aprender a leer.
  const expandidas = tomas.flatMap(splitLongToma).map((t, i) => ({ ...t, n: i + 1 }))
  const lotes: Lote[] = []
  let actual: TomaFinal[] = []
  let acumulado = 0

  const cerrar = () => {
    if (!actual.length) return
    lotes.push({
      n: lotes.length + 1,
      tomas: actual.map((t) => ({
        n: t.n, duracionSeg: t.duracionSeg, accionVisual: t.accionVisual,
        personaje: t.personaje, producto: t.producto, locucion: t.locucion,
        tiempoOriginal: t.tiempoOriginal,
      })),
      // Redondeamos recién acá, para mostrar: el check que decide si el lote cierra ya
      // pasó por `excedeTope` sobre el acumulado SIN redondear, así que este r1 no
      // puede esconder un exceso real — como mucho, es cosmético.
      duracionSeg: r1(acumulado),
      prompt: '', taskId: null, status: 'idle', videoUrl: null, failMsg: null,
      // Nace en null: la huella depende de la sesión completa (personaje, voz,
      // producto, escenario), no solo de las tomas — la estampa el caller.
      scriptHash: null,
    })
    actual = []
    acumulado = 0
  }

  for (const t of expandidas) {
    // "Si agregar la siguiente Toma provoca que el lote supere 15.0 segundos: NO la
    // agregues. Esa Toma pasa automáticamente a ser la primera del siguiente Lote."
    // Nota: `t.duracionSeg` ya viene <= LOTE_MAX_SEC garantizado por `splitLongToma`
    // (recursivamente), así que una toma sola SIEMPRE entra en un lote propio aunque
    // el lote esté vacío — el guard de abajo solo protege la SUMA con lo ya acumulado.
    if (actual.length && excedeTope(acumulado + t.duracionSeg)) cerrar()
    actual.push(t)
    acumulado += t.duracionSeg
  }
  cerrar()

  return lotes
}

export interface LoteImage {
  url: string
  role: string
}

/**
 * La cámara de UN lote son las cámaras de SUS cortes, no la del primer corte del video.
 *
 * El spec pide la cámara por lote y que replique "el lenguaje visual detectado en el
 * original"; mandarle a los lotes 2 y 3 el encuadre del corte 1 es justamente no
 * replicarlo — un guión que abre en primer plano y cierra en plano medio salía entero
 * en primer plano.
 *
 * El emparejamiento va por `tiempoOriginal` y NO por `n`: `groupIntoLotes` renumera la
 * secuencia entera después de `splitLongToma`, así que en cuanto una toma se parte el
 * `n` de la toma deja de ser el índice de su corte y `cortes[n - 1]` apunta a otro
 * plano. `tiempoOriginal` es la marca del análisis forense y sobrevive al split intacta
 * (los fragmentos la heredan), que es exactamente lo que hace falta acá.
 *
 * Se deduplica por texto: varios cortes seguidos con el mismo encuadre son lo normal y
 * repetirlo tres veces solo gasta presupuesto de prompt.
 */
export function camaraDeLote(
  lote: Lote,
  cortes: { tiempo: string; camara: string }[],
  fallback: string,
): string {
  const porTiempo = new Map(cortes.map((c) => [c.tiempo, c.camara]))
  const vistas: string[] = []
  for (const t of lote.tomas) {
    const c = porTiempo.get(t.tiempoOriginal)?.trim()
    if (c && !vistas.includes(c)) vistas.push(c)
  }
  return vistas.join(' · ') || fallback
}

/**
 * Niveles de detalle del prompt, de más a menos detallado. Lo que se suelta primero es
 * lo que DUPLICA información que ya está en otro lado; la línea `Locución:` de cada toma
 * no está en esa categoría y nunca se suelta (ver el comentario en `renderAcciones`).
 *
 * Niveles de detalle de la sección "SECUENCIA DE ACCIONES VISUALES", de más a menos
 * detallado. `buildLotePrompt` prueba cada uno en orden y usa el primero que entra en
 * `KIE_PROMPT_MAX` — ver el comentario grande sobre `render` más abajo para el porqué
 * de este orden específico (viene de un incidente real, documentado en AGENTS.md).
 */
const NIVEL_COMPLETO = 0
const NIVEL_SIN_OVERLAY_POR_TOMA = 1
const NIVEL_SIN_GUION_GLOBAL = 2
/**
 * Comprime el párrafo de prohibición de overlay a dos líneas antes de tocar la
 * coreografía. Es el último escalón que se puede bajar sin perder información: la lista
 * larga ("captions, subtítulos, títulos, lower thirds, banners, stickers, emojis,
 * flechas, callouts, gráficos, watermarks, interfaces…") son quince sinónimos de la
 * misma orden, mientras que `accionVisual` es el único texto del prompt que describe
 * QUÉ HACE EL CUERPO — justo lo que el usuario reportó que no se copia.
 *
 * Medido sobre los lotes guardados: las dos sesiones más recientes (`30ff55d6`,
 * `6a1e6157`) truncan la coreografía en TODOS sus lotes. En el lote 1 de `30ff55d6` las
 * cinco tomas necesitaban 1332 caracteres de acción y recibieron ~78 cada una, cortadas
 * a mitad de palabra ("…con ambas manos,…"): se tiraba el 70 % del movimiento.
 */
const NIVEL_OVERLAY_COMPACTO = 3

/**
 * Recorta la descripción del producto a su parte FÍSICA. Es el último escalón antes de
 * tocar la coreografía, y el que más presupuesto libera.
 *
 * `productDescription` viene del scan y transcribe la etiqueta entera — medido en
 * `30ff55d6`: 677 caracteres, en inglés, listando *"SÉRUM FACIAL CON VITAMINA C"*,
 * *"PARA PIEL GRASA"*, *"Ilumina • Unifica • Antioxidante"* y *"30 ml / 1.01 fl oz"*.
 * El envase va como `@image(2)` en TODOS los lotes y el prompt ya ordena reproducirlo
 * idéntico: esa transcripción le cuenta en palabras lo que el modelo está viendo en
 * píxeles, y lo hace a costa del único texto que describe qué hace el cuerpo.
 *
 * Medido sobre esa sesión, con el resto igual: la coreografía conservada pasa de 46 % a
 * 80 % en el lote 1 y de 34 % a 66 % en el lote 2.
 *
 * ponytail: el corte es por frases, no por longitud — cortar prosa a mitad de palabra es
 * justo lo que este nivel existe para evitarle a la coreografía. Se queda con las dos
 * primeras oraciones porque el scan describe la forma antes que la etiqueta (el prompt
 * de `analyze-product` pide "forma, envase, colores, etiqueta, texto legible" en ese
 * orden), pero es una heurística sobre texto de un LLM, no un contrato: si algún día el
 * scan cambia de orden, esto recorta lo que no debe. El techo real está en pedirle al
 * scan una descripción física corta aparte de la transcripción — eso es un campo nuevo
 * y una re-corrida del análisis en cada sesión guardada.
 */
const NIVEL_PRODUCTO_FISICO = 4

/** Las dos primeras oraciones: la forma del envase, sin la transcripción de la etiqueta. */
function productoFisico(desc: string): string {
  const frases = desc.match(/[^.!?]+[.!?]+/g)
  if (!frases || frases.length <= 2) return desc
  return `${frases.slice(0, 2).join('').trim()} El resto de la etiqueta se lee de su imagen: reprodúcela idéntica.`
}

/** El párrafo de overlay, largo o comprimido. Dice lo mismo; el largo lo dice 15 veces. */
function bloqueOverlay(nivel: number): string[] {
  if (nivel >= NIVEL_OVERLAY_COMPACTO)
    return [
      'TEXTO / OVERLAY: NINGUNO. Sin captions, subtítulos, texto en pantalla, gráficos,',
      'watermarks ni UI. Solo el texto impreso en el producto o en objetos reales del',
      'escenario. No inventes diálogo para rellenar.',
    ]
  return [
    'TEXTO / OVERLAY: NINGUNO.',
    'No generes captions, subtítulos, texto en pantalla, títulos, lower thirds, banners,',
    'stickers, emojis, flechas, callouts, gráficos, watermarks, interfaces ni elementos',
    'de UI. El plano queda visualmente limpio, centrado en el personaje y el producto.',
    'Solo puede aparecer el texto físicamente impreso en el producto o en objetos reales',
    'del escenario, como parte de su apariencia.',
    'No inventes diálogo para rellenar: el clip termina cuando termina la locución.',
  ]
}

/**
 * Prompt de un lote. Es autosuficiente por obligación: el generador no recuerda el
 * lote anterior, así que personaje, producto, escenario, iluminación y cámara se
 * repiten completos en cada uno. Escribir "el mismo personaje" produciría otra
 * persona, que es exactamente el fallo que este diseño evita.
 *
 * PRESUPUESTO DE CARACTERES: el detalle forense de un lote real no siempre cabe en
 * `KIE_PROMPT_MAX` (AGENTS.md documenta ~6300 chars con ~11 beats, contra un tope de
 * 4096). Esta función es la única que conoce la estructura del prompt y por tanto el
 * único lugar que puede decidir QUÉ recortar sin perder información real — un caller
 * que reciba el string ya armado no tiene forma de saberlo. Por eso el presupuesto se
 * administra acá adentro, no en quien llama (Task 6): se prueban niveles de detalle
 * decrecientes y se devuelve el más detallado que entre. El guard de Task 6 antes de
 * `createTask` sigue existiendo, pero pasa a ser la última red, no el único control.
 */
export function buildLotePrompt(args: {
  lote: Lote
  consistencyBlock: string
  productDesc: string
  escenario: string
  camara: string
  voz: VoiceProfile
  images: LoteImage[]
  /** Los cortes del forense, para poder decir QUÉ plano va con QUÉ toma (ver abajo). */
  cortes?: { tiempo: string; camara: string }[]
}): string {
  const { lote, consistencyBlock, productDesc, escenario, camara, voz, images, cortes } = args

  /**
   * EL PLANO, POR TOMA — solo cuando el lote mezcla más de uno.
   *
   * `camaraDeLote` deduplica y concatena los planos de las tomas del lote en UN string,
   * y esa línea es todo lo que el render sabía del encuadre. Con un solo plano alcanza;
   * con dos es ambigua por construcción. Caso real (`30ff55d6`, lote 1): las tomas 1–2
   * son "Plano medio frontal" y las 3–4 "Primer plano frontal del rostro y parte del
   * pecho", y al generador le llegaba `Plano medio frontal, estático. · Primer plano…`
   * sin ninguna forma de saber cuál corresponde a cuál. De ahí sale "no copió el plano
   * en el que aparece la persona".
   *
   * El emparejamiento va por `tiempoOriginal` y NO por `n`, por el mismo motivo que en
   * `camaraDeLote`: `groupIntoLotes` renumera después de `splitLongToma`.
   *
   * Dos recortes, los dos medidos, porque este presupuesto se lo quita a la coreografía
   * — que es la OTRA mitad de la misma queja ("que se copien los movimientos exactos"):
   *
   *  1. Solo si hay ≥2 planos distintos en el lote. Con uno solo la línea global
   *     `CÁMARA:` ya lo dice sin ambigüedad y repetirla por toma no agrega nada.
   *  2. Solo cuando el plano CAMBIA respecto de la toma anterior. Un shot list se lee
   *     así: el plano vale hasta que se anuncia otro. Medido sobre el lote 1 de
   *     `30ff55d6` (5 tomas, 2 planos), emitirlo en las cinco costaba ~285 caracteres y
   *     hundía la coreografía del 54 % al 33 %; emitirlo en los dos cambios cuesta ~115
   *     y conserva la misma información.
   *
   * Cuando se emite no se suelta en ningún nivel de degradación — es alineación, no
   * contenido, el mismo argumento que la línea `Locución:`.
   */
  const porTiempo = new Map((cortes ?? []).map((c) => [c.tiempo, c.camara.trim()]))
  const planos = lote.tomas.map((t) => porTiempo.get(t.tiempoOriginal) ?? '')
  const mezclaPlanos = new Set(planos.filter(Boolean)).size >= 2
  const planoPorToma = (i: number) =>
    mezclaPlanos && planos[i] && planos[i] !== planos[i - 1] ? planos[i] : ''

  const legend = images.map((img, i) => `@image(${i + 1}) = ${img.role}`).join('\n')
  const locucionFinal = lote.tomas.map((t) => t.locucion).filter(Boolean).join(' ')

  /**
   * `t.personaje` y `t.producto` (FASE 3, preservados por Task 4 en `Lote.tomas`) NO
   * se leen acá a propósito. Son dato de shot list — lectura para el usuario en el
   * wizard, no instrucción para el modelo de video — y a nivel de render los
   * supersede el bloque de consistencia (`consistencyBlock`) y `productDesc`, que ya
   * cubren esa información una sola vez para todo el lote. Repetirlos por toma
   * duplicaría contenido y se comería justo el presupuesto que esta función
   * administra, sin agregar nada que el modelo no tenga ya.
   */
  const renderAcciones = (nivel: number, capAccion: number | null) =>
    lote.tomas
      .map((t, i) => {
        const accionVisual =
          capAccion != null && t.accionVisual.length > capAccion
            ? `${t.accionVisual.slice(0, capAccion).trimEnd()}…`
            : t.accionVisual
        const plano = planoPorToma(i)
        return [
          // r1: `duracionSeg` sale de un reparto proporcional y llegaba cruda al prompt
          // ("Toma 1 — 0.8854477611940298 s", medido). Son ~14 caracteres de ruido por
          // toma en un presupuesto que ya trunca la coreografía, y además una precisión
          // que el render no tiene: `clampDuration` le pide a KIE un entero.
          `### Toma ${t.n} — ${r1(t.duracionSeg)} s`,
          // Ver `planoPorToma`: nunca se degrada, por el mismo motivo que `Locución:`.
          plano ? `Cámara: ${plano}` : '',
          accionVisual,
          // NUNCA se suelta, en ningún nivel de degradación. Esta línea es lo único que
          // le dice al generador QUÉ FRASE va con QUÉ ACCIÓN y en cuántos segundos: es
          // la sincronización audio↔imagen, no una copia del guion global.
          //
          // La versión anterior la soltaba primero, razonando que "duplica, no informa"
          // porque el texto ya estaba abajo en GUION DE LOCUCIÓN FINAL. Se comprobó en
          // una sesión real que eso es falso: el lote 1 (4095/4096 caracteres) la perdió
          // y los lotes 2–4 la conservaron, así que el primer clip recibió un párrafo de
          // 263 caracteres sin ninguna pista de cómo repartirlo entre sus cuatro tomas y
          // el resto sí la tuvo. El usuario lo describió como "una habla muy rápido y la
          // otra muy lento, no hay consistencia" — que es exactamente lo que produce
          // degradar un lote sí y otro no en la única señal de ritmo del prompt.
          t.locucion ? `Locución: “${t.locucion}”` : '',
          // Se solapa con el párrafo global "TEXTO / OVERLAY: NINGUNO" de más abajo,
          // que ya prohíbe overlay para TODO el lote — igual de redundante por toma.
          nivel < NIVEL_SIN_OVERLAY_POR_TOMA ? 'Texto / Overlay: NINGUNO.' : '',
        ].filter(Boolean).join('\n')
      })
      .join('\n\n')

  /**
   * Todo lo que NO es la sección de acciones es fijo en los tres niveles: el bloque
   * de consistencia, el producto, el escenario y la cámara son la identidad del lote
   * (Task 5 existe para que NUNCA se recorten) y el guion de locución final y el
   * párrafo de overlay son las dos reglas de seguridad del render — comprimirlas para
   * ganar espacio sería ahorrar presupuesto rompiendo el propósito de la función.
   * La cámara en particular sobrevive intacta hasta el piso por regla de AGENTS.md:
   * es corta y es lo que sostiene el encuadre cuando todo lo demás se degrada.
   */
  const render = (nivel: number, capAccion: number | null) =>
    [
      `Video UGC vertical 9:16. Duración total del clip: ${lote.duracionSeg} segundos.`,
      '',
      legend,
      '',
      'PERSONAJE (descripción completa, sin referencias externas):',
      consistencyBlock,
      '',
      'PRODUCTO (debe verse idéntico a su imagen de referencia — misma forma, etiqueta,',
      'colores y texto; nunca lo rediseñes):',
      nivel >= NIVEL_PRODUCTO_FISICO ? productoFisico(productDesc) : productDesc,
      '',
      // "ESCENARIO E ILUMINACIÓN" y no "ESCENARIO" a secas porque el spec pide la
      // iluminación como bloque propio dentro de cada lote, y el `fondo` del forense ya
      // la trae dentro (su prompt la pide junto a paredes, superficies y profundidad).
      // Rotularla es gratis; sacarla a un campo aparte del forense costaría una
      // re-corrida del análisis —el paso caro— para cada sesión ya guardada.
      `ESCENARIO E ILUMINACIÓN: ${escenario}`,
      `CÁMARA: ${camara.replace(/\.\s*$/, '')}. Formato vertical 9:16, estable, enfoque en el personaje y el producto.`,
      // Bloque "Continuidad" del spec: qué NO puede cambiar dentro del clip. Una línea,
      // no un párrafo — todo lo que describe ya está arriba, acá solo se declara que es
      // invariante, y cada carácter que ocupa sale del presupuesto de la coreografía.
      //
      // Redactado SIN "el mismo personaje" / "igual que antes" a propósito: acá esas
      // palabras significarían "idéntico a lo largo de este clip", pero son
      // literalmente las frases que el spec prohíbe y que el test de referencias a
      // lotes anteriores vigila. Un generador que las lee no distingue las dos
      // intenciones — busca un contexto anterior que no existe y devuelve otra persona.
      'CONTINUIDAD: personaje, producto, vestuario, escenario e iluminación permanecen',
      'idénticos de principio a fin del clip, tal como se describen arriba. Lo único que',
      'avanza es la acción detallada abajo.',
      '',
      'PERFIL DE VOZ Y ACENTO:',
      `  Idioma: ${voz.idioma} · Variante: ${voz.varianteRegional} · Acento: ${voz.acento}`,
      `  Pronunciación: ${voz.pronunciacion} · Ritmo: ${voz.ritmo} · Velocidad: ${voz.velocidad}`,
      `  Entonación: ${voz.entonacion} · Energía: ${voz.energia} · Pausas: ${voz.pausas}`,
      `  Tono: ${voz.tono} · Timbre: ${voz.timbre} · Edad vocal: ${voz.edadVocal} · Estilo: ${voz.estilo}`,
      '',
      'SECUENCIA DE ACCIONES VISUALES:',
      renderAcciones(nivel, capAccion),
      '',
      // El guion completo de una vez. Es lo PRIMERO que se suelta bajo presión de
      // presupuesto (antes era lo último): sale del mismo texto que las líneas
      // `Locución:` de cada toma, así que soltarlo no pierde ni una palabra — solo deja
      // de repetirlas juntas. La regla de diálogo del spec ("exacto: no resumir, no
      // extender…") se sigue cumpliendo, distribuida por toma, y de paso el modelo
      // conserva la correspondencia frase↔toma↔segundos que este bloque no da.
      ...(nivel < NIVEL_SIN_GUION_GLOBAL
        ? [
            'GUION DE LOCUCIÓN FINAL (exacto: no resumir, no extender, no corregir, no añadir frases, no eliminar frases):',
            `“${locucionFinal}”`,
            '',
          ]
        : []),
      ...bloqueOverlay(nivel),
    ].join('\n')

  for (const nivel of [
    NIVEL_COMPLETO,
    NIVEL_SIN_OVERLAY_POR_TOMA,
    NIVEL_SIN_GUION_GLOBAL,
    NIVEL_OVERLAY_COMPACTO,
    NIVEL_PRODUCTO_FISICO,
  ]) {
    const prompt = render(nivel, null)
    if (prompt.length <= KIE_PROMPT_MAX) return prompt
  }

  // Piso: el nivel más bajo sin truncar accionVisual sigue sin entrar. Se busca el cap
  // de caracteres por toma más grande que sí entra (binary search — el largo total es
  // monótono no-decreciente en el cap, así que la búsqueda es válida). Con cap 0 cada
  // accionVisual queda reducida a "…"; si ni así entra, el exceso vive en las partes
  // fijas (consistencyBlock/productDesc/escenario/cámara/voz) y no hay nada más que
  // este nivel pueda recortar sin violar el propio propósito de la función.
  const maxAccionLen = Math.max(0, ...lote.tomas.map((t) => t.accionVisual.length))
  let lo = 0
  let hi = maxAccionLen
  let mejor: string | null = null
  while (lo <= hi) {
    const cap = Math.floor((lo + hi) / 2)
    const prompt = render(NIVEL_PRODUCTO_FISICO, cap)
    if (prompt.length <= KIE_PROMPT_MAX) {
      mejor = prompt
      lo = cap + 1
    } else {
      hi = cap - 1
    }
  }
  if (mejor) return mejor

  const piso = render(NIVEL_PRODUCTO_FISICO, 0)
  throw new Error(
    `El prompt del Lote ${lote.n} no entra en el tope de KIE (${KIE_PROMPT_MAX} caracteres) ` +
    `ni truncando la acción de cada toma al mínimo (${piso.length} caracteres resultantes). ` +
    'El bloque de consistencia, la descripción del producto, el escenario o la cámara son ' +
    'demasiado largos por sí solos y hay que acortarlos antes de reintentar — crear la tarea ' +
    'así fallaría con 422 y la cuota de KIE ya gastada.',
  )
}
