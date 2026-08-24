import { z } from 'zod'
import type { TomaFinal } from './adapt'
import type { MotionProfile, VoiceProfile } from './character'
import { KIE_PROMPT_MAX } from './kie'
import { nicheSpec } from './niches'
import { etiqueta, type Personaje } from './personajes'

/**
 * FASE 5 del prompt maestro — agrupación de tomas en lotes de generación.
 * ---------------------------------------------------------------------------
 * Esto es aritmética, no criterio: agrupar por duración no necesita un LLM, y pedírselo
 * lo volvería no determinista justo donde importa que no lo sea (el tope es el techo
 * duro del modelo de KIE).
 *
 * ⚠️ EL TOPE LO PONE EL MODELO, NO EL SPEC, y con `grok-imagine/image-to-video` pasa a
 * ser **30 s** — por encima de los 15 del spec. Es 3,75× el techo de Veo (8 s), y el
 * efecto es directo sobre el dinero: los mismos cortes caben en muchos menos lotes, y
 * cada lote es una llamada PAGADA. La duración final de cada lote la fija
 * `clampDuration` (kie.ts), que es donde se decide qué se pierde al ajustar.
 *
 * INVARIANTE QUE ESTE MÓDULO EXISTE PARA GARANTIZAR: ningún `Lote` devuelto por
 * `groupIntoLotes` puede tener `duracionSeg > LOTE_MAX_SEC`. Cada lote es una llamada
 * PAGADA a la API de video; uno inválido cuesta dinero y falla tarde (o peor, alguien
 * río abajo lo clampea y el audio sale cortado a mitad de frase). Todo lo de abajo
 * (saneo de duraciones, recursión en `splitLongToma`, comparación con epsilon en el
 * guard) está para que ese invariante se cumpla pase lo que pase con el input, no solo
 * en el caso feliz.
 */

export const LOTE_MAX_SEC = 30

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

/**
 * UN LOTE ES UN CLIP CONTINUO, ASÍ QUE NO PUEDE CONTENER UN CAMBIO DE PLANO.
 * ---------------------------------------------------------------------------
 * Cada lote se renderiza de una sola pasada: el generador produce una toma continua a
 * partir de las imágenes. Meterle dos encuadres adentro es pedirle un corte de montaje
 * dentro de un plano-secuencia, y lo que devuelve es uno solo de los dos.
 *
 * Medido en un render real del lote 1 de `30ff55d6`: el prompt anunciaba "Plano medio"
 * en las tomas 1–2 y "Primer plano del rostro" en la 3, y el clip salió entero en plano
 * medio. La información llegaba bien; el pedido era imposible. El lote 2 era peor —
 * TRES cambios de encuadre (primer plano rostro+pecho → rostro+cuello → plano medio →
 * plano general) en un solo clip de 15 s.
 *
 * Cerrar el lote donde el original corta el plano es, además, lo que ya dice el spec:
 * FASE 1 define la unidad como el CORTE REAL, y el entregable son N clips
 * independientes — o sea que el corte cae naturalmente ENTRE clips, que es donde el
 * montaje lo pone. Un lote que abarca dos planos no es un lote de más, es un corte
 * perdido.
 *
 * ⚠️ CUESTA PLATA: más lotes son más llamadas pagadas a KIE, y el número depende del
 * original (uno sin cortes sigue dando un lote). Por eso `planoPorTiempo` es OPCIONAL y
 * sin él la función se comporta exactamente como antes: quien llama decide.
 */
/**
 * El mapa de encuadres que espera `groupIntoLotes`, construido en UN solo lugar.
 *
 * ⚠️ Existe porque las tres copias de esta línea se desincronizaron y eso costaba plata
 * de forma invisible: el servidor la construía y la pasaba, pero las dos previsualizaciones
 * del wizard (`Section6Lotes`, `Section4Template`) llamaban a `groupIntoLotes` SIN ella.
 * O sea la pantalla contaba los clips con la regla vieja y el render usaba la nueva: con
 * los números del video de ropa que documenta AGENTS.md, el preview decía 2 clips y el
 * servidor creaba 24 llamadas pagadas. Y ese aviso solo aparece cuando todavía no hay
 * lotes — justo el momento en que el usuario decide gastar.
 *
 * La clave es `tiempo` y NO `n`, por lo mismo que `camaraDeLote`: `groupIntoLotes`
 * renumera la secuencia tras `splitLongToma`, así que en cuanto una toma se parte el `n`
 * deja de ser el índice de su corte.
 */
export function planoPorTiempoDe(
  cortes: ReadonlyArray<{ tiempo: string; camara: string }> | undefined | null,
): Map<string, string> {
  return new Map((cortes ?? []).map((c) => [c.tiempo, c.camara.trim()]))
}

export function groupIntoLotes(
  tomas: TomaFinal[],
  planoPorTiempo?: Map<string, string>,
  /**
   * Cuántos encuadres distintos puede contener UN clip.
   *
   * ⚠️ EL DEFAULT CAMBIÓ DE 1 A "SIN LÍMITE" (2026-08-24), y eso invierte una regla que
   * este archivo documentaba como medida. La medición era real pero su PREMISA cambió:
   * se hizo sobre Veo, donde el clip solo recibía texto y dos keyframes, y ahí pedirle
   * dos encuadres devolvía uno — el otro se perdía en silencio. Ahora el clip recibe
   * además una IMAGEN ANCLA por escena (`anchors.ts`, hasta 7 imágenes) y el prompt
   * describe el corte entre ellas, que es justamente lo que faltaba.
   *
   * Con 30 s de techo, mantener el corte por plano daría clips de 1–2 s: el reparto de
   * ropa medido en AGENTS.md daba 24 clips, o sea 24 llamadas pagadas para 28 s de
   * video. Concatenar escenas dentro de un clip es lo que pidió el dueño del repo.
   *
   * Sigue siendo un PARÁMETRO y no un hardcode porque es el dial de costo: bajarlo a 1
   * recupera el comportamiento de máxima fidelidad de encuadre al precio de multiplicar
   * las llamadas.
   */
  maxPlanos = Infinity,
): Lote[] {
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
    // …y también si cambia el encuadre: el clip que sale de acá es continuo (ver la
    // cabecera). Solo se compara contra la toma anterior DEL LOTE ABIERTO, así que un
    // plano que vuelve más adelante abre su propio lote, igual que en el original.
    else if (actual.length && planoPorTiempo) {
      const ahora = planoPorTiempo.get(t.tiempoOriginal)
      if (ahora) {
        const yaEnLote = new Set(
          actual.map((x) => planoPorTiempo.get(x.tiempoOriginal)).filter(Boolean),
        )
        // Cierra si este encuadre es nuevo Y el lote ya llegó a su cupo. Con
        // `maxPlanos = 1` es "cierra en cuanto cambie el plano"; con 2 o 3 el clip
        // puede contener ese número de encuadres distintos.
        if (!yaEnLote.has(ahora) && yaEnLote.size >= maxPlanos) cerrar()
      }
    }
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
 * El párrafo que prohíbe overlay. Con grok existió en dos versiones —larga y comprimida—
 * porque los 4096 caracteres obligaban a elegir entre repetir la prohibición y describir
 * el movimiento. Veo acepta 60.000: se usa siempre la larga.
 */
/**
 * ⚠️ EL PROMPT DE RENDER VA EN INGLÉS, LA LOCUCIÓN EN ESPAÑOL.
 *
 * La doc de `grok-imagine/image-to-video` dice que `prompt` es *English only*, y el
 * dueño del repo lo confirmó por resultado ("salen mucho mejor cuando son en inglés").
 * Pero el anuncio es para el mercado peruano: lo que la persona DICE tiene que salir en
 * español, palabra por palabra. Son dos cosas distintas y el prompt las separa —
 * instrucciones en inglés, líneas habladas entrecomilladas y rotuladas como español
 * latinoamericano a decir literal.
 *
 * ⚠️ Deuda conocida y acotada: el CONTENIDO que se inyecta (bloque de consistencia,
 * `accionVisual`, escenario, cámara, perfil de voz) lo produce el análisis forense en
 * ESPAÑOL, así que el prompt queda mixto: andamiaje inglés + descripciones españolas.
 * Traducirlo exigiría una llamada de LLM por lote —costo, latencia y no-determinismo
 * justo donde `scriptFingerprint` necesita que el prompt sea función pura de sus
 * insumos— o re-correr el análisis de cada sesión guardada, que es el paso caro. El
 * camino barato, si hace falta: pedirle a FASE 1/FASE 4 esos campos también en inglés.
 */
const BLOQUE_OVERLAY_EN = [
  'NO TEXT / NO OVERLAY.',
  'Do not generate captions, subtitles, on-screen text, titles, lower thirds, banners,',
  'stickers, emojis, arrows, callouts, graphics, watermarks, interfaces or UI elements.',
  'The frame stays visually clean, centered on the character and the product.',
  'The only text allowed is text physically printed on the product or on real props in',
  'the scene, as part of their appearance.',
  // La contraparte FÍSICA de la regla de overlay: lo de arriba prohíbe gráficos añadidos,
  // esto prohíbe el equipo con el que se grabó el original. Un micrófono en cuadro
  // delata que es una grabación y no un video casero, que es lo contrario del formato.
  'No recording gear is visible either: no handheld or lavalier microphones, no booms,',
  'no tripods, no ring lights, no cameras or phones on camera.',
  'Do not invent dialogue to fill time: the clip ends when the spoken lines end.',
]

/**
 * Niveles de detalle del prompt, de más a menos detallado.
 *
 * ⚠️ ESTA ESCALERA VOLVIÓ (2026-08-24) y no es opcional. Se había BORRADO con la
 * migración a Veo, donde el tope era 60.000 caracteres y no había nada que recortar.
 * Este modelo topa en **5.000**, y encima los clips ahora duran hasta 30 s en vez de 8:
 * el mismo prompt tiene que sostener ~4× las tomas en 1/12 del espacio. Sin escalera,
 * `buildLotePrompt` lanzaría en cuanto un lote tenga contenido real.
 *
 * Lo que se suelta primero es lo que DUPLICA información que ya está en otro lado. La
 * línea hablada de cada toma NO está en esa categoría y nunca se suelta (ver
 * `renderAcciones`): es la única señal de qué frase va con qué acción y en cuántos
 * segundos. El orden viene de incidentes medidos, documentados en AGENTS.md — no lo
 * reordenes sin volver a medir.
 */
const NIVEL_COMPLETO = 0
const NIVEL_SIN_OVERLAY_POR_TOMA = 1
const NIVEL_SIN_GUION_GLOBAL = 2
/**
 * Comprime el párrafo de prohibición de overlay antes de tocar la coreografía. Es el
 * último escalón que se puede bajar sin perder información: la lista larga son quince
 * sinónimos de la misma orden, mientras que `accionVisual` es el único texto del prompt
 * que describe QUÉ HACE EL CUERPO — justo lo que se reportó que no se copia.
 */
const NIVEL_OVERLAY_COMPACTO = 3
/**
 * Recorta la descripción del producto a su parte FÍSICA. Es el último escalón antes de
 * tocar la coreografía, y el que más presupuesto libera.
 *
 * `productDescription` viene del scan y transcribe la etiqueta entera — medido: 677
 * caracteres listando "SÉRUM FACIAL CON VITAMINA C", "30 ml / 1.01 fl oz"… El envase va
 * como imagen en TODOS los lotes y el prompt ya ordena reproducirlo idéntico: esa
 * transcripción le cuenta en palabras lo que el modelo está viendo en píxeles, y lo hace
 * a costa del único texto que describe qué hace el cuerpo. Medido en su momento: la
 * coreografía conservada pasó de 46 % a 84 % en el lote 1.
 */
const NIVEL_PRODUCTO_FISICO = 4

/** Las dos primeras oraciones: la forma del envase, sin la transcripción de la etiqueta. */
function productoFisico(desc: string): string {
  const frases = desc.match(/[^.!?]+[.!?]+/g)
  if (!frases || frases.length <= 2) return desc
  return `${frases.slice(0, 2).join('').trim()} Read the rest of the label from its reference image and reproduce it exactly.`
}

/** El párrafo de overlay, largo o comprimido. Dice lo mismo; el largo lo dice 15 veces. */
function bloqueOverlay(nivel: number): string[] {
  if (nivel >= NIVEL_OVERLAY_COMPACTO)
    return [
      'NO TEXT / NO OVERLAY: no captions, subtitles, on-screen text, graphics, watermarks',
      'or UI. Only text physically printed on the product or on real props. No recording',
      'gear on camera. Do not invent dialogue to fill time.',
    ]
  return BLOQUE_OVERLAY_EN
}

export function buildLotePrompt(args: {
  lote: Lote
  consistencyBlock: string
  productDesc: string
  escenario: string
  camara: string
  voz: VoiceProfile
  /** Cómo se mueve. Null en sesiones anteriores a FASE 4.6: el bloque no se emite. */
  movimiento?: MotionProfile | null
  images: LoteImage[]
  /** Los cortes del forense, para poder decir QUÉ plano va con QUÉ toma (ver abajo). */
  cortes?: { tiempo: string; camara: string }[]
  /** Nicho de la sesión: en ropa/zapatos el producto se LLEVA PUESTO, y el bloque que
   *  lo describe como "un objeto" contradice al bloque de consistencia. Ver niches.ts. */
  niche?: unknown
  /** Todos los personajes del anuncio. Con uno solo (o sin la lista) el prompt sale
   *  exactamente igual que antes del soporte de varios. */
  personajes?: Personaje[]
  /** Quién habla en cada `tiempoOriginal` (ver `hablantesPorTiempo`). */
  quien?: Map<string, Personaje[]>
  /** Qué `tiempoOriginal` son VOZ EN OFF: se oye la narración pero nadie habla en cuadro. */
  vozEnOff?: Set<string>
  /**
   * `tiempoOriginal` → índice 1-based dentro de `images` de la IMAGEN ANCLA con la que
   * arranca esa toma. Lo llena `anchors.ts` cuando el video cambia tanto de escena que
   * una sola referencia no alcanza. Vacío = todas las tomas parten del avatar.
   */
  anclas?: Map<string, number>
}): string {
  const { lote, consistencyBlock, productDesc, escenario, camara, voz, movimiento, images, cortes } = args

  /**
   * VARIOS PERSONAJES. Quiénes salen en ESTE lote: la unión de los hablantes de sus
   * tomas. Con uno solo —o sin atribución, que es toda sesión anterior— el prompt se arma
   * exactamente como antes: un bloque de personaje, uno de voz y uno de movimiento.
   */
  const quien = args.quien ?? new Map<string, Personaje[]>()
  const presentes: Personaje[] = []
  for (const t of lote.tomas) {
    for (const p of quien.get(t.tiempoOriginal) ?? []) {
      if (!presentes.some((x) => x.id === p.id)) presentes.push(p)
    }
  }
  const varios = presentes.length > 1
  const off = args.vozEnOff ?? new Set<string>()
  const anclas = args.anclas ?? new Map<string, number>()
  /**
   * ⚠️ EN VOZ EN OFF LA LÍNEA NO ES DE NADIE EN CUADRO. Rotularla como diálogo de
   * alguien hace que el modelo le mueva la boca; el original solo mostraba el producto
   * mientras una voz narraba por encima.
   */
  const dice = (t: { tiempoOriginal: string }) => {
    if (off.has(t.tiempoOriginal)) return 'VOICE-OVER, nobody speaks on camera (Latin American Spanish, verbatim)'
    const gente = quien.get(t.tiempoOriginal) ?? []
    return gente.length === 1
      ? `${etiqueta(gente[0])} says (Latin American Spanish, verbatim)`
      : 'Spoken line (Latin American Spanish, verbatim)'
  }
  /** El lote entero es narración por encima: ninguna de sus tomas se dice en cuadro. */
  const todoEnOff = lote.tomas.length > 0
    && lote.tomas.every((t) => !t.locucion || off.has(t.tiempoOriginal))
    && lote.tomas.some((t) => !!t.locucion)

  /** El bloque completo de un personaje: cómo se ve, cómo suena y cómo se mueve. */
  const bloqueDe = (p: Personaje) => [
    `CHARACTER ${etiqueta(p)} — full description, no external references:`,
    p.consistencyBlock ?? '',
    p.voiceProfile
      ? `  VOICE: ${p.voiceProfile.idioma} · ${p.voiceProfile.varianteRegional} · acento ${p.voiceProfile.acento} · ${p.voiceProfile.tono} · ${p.voiceProfile.timbre} · edad vocal ${p.voiceProfile.edadVocal} · ritmo ${p.voiceProfile.ritmo} · energía ${p.voiceProfile.energia} · estilo ${p.voiceProfile.estilo}`
      : '',
    p.motionProfile
      ? `  HOW THEY MOVE: ${p.motionProfile.calidadMovimiento} Mannerisms: ${p.motionProfile.manerismos}`
      : '',
  ].filter(Boolean).join('\n')
  const spec = nicheSpec(args.niche)

  /**
   * EL PLANO, POR TOMA — solo cuando el lote mezcla más de uno.
   *
   * `camaraDeLote` deduplica y concatena los planos de las tomas del lote en UN string,
   * y esa línea es todo lo que el render sabía del encuadre. Con un solo plano alcanza;
   * con dos es ambigua por construcción, y ahora que un clip puede contener varias
   * escenas (ver `maxPlanos`) es el caso NORMAL, no la excepción.
   *
   * El emparejamiento va por `tiempoOriginal` y NO por `n`, por el mismo motivo que en
   * `camaraDeLote`: `groupIntoLotes` renumera después de `splitLongToma`.
   *
   * Se emite solo cuando el plano CAMBIA respecto de la toma anterior: un shot list se
   * lee así, el plano vale hasta que se anuncia otro. Medido en su momento, emitirlo en
   * todas las tomas costaba ~285 caracteres y hundía la coreografía del 54 % al 33 %.
   *
   * Cuando se emite no se suelta en ningún nivel de degradación — es alineación, no
   * contenido, el mismo argumento que la línea hablada.
   */
  const porTiempo = new Map((cortes ?? []).map((c) => [c.tiempo, c.camara.trim()]))
  const planos = lote.tomas.map((t) => porTiempo.get(t.tiempoOriginal) ?? '')
  const mezclaPlanos = new Set(planos.filter(Boolean)).size >= 2
  const planoPorToma = (i: number) =>
    mezclaPlanos && planos[i] && planos[i] !== planos[i - 1] ? planos[i] : ''

  const legend = images.map((img, i) => `@image(${i + 1}) = ${img.role}`).join('\n')
  const locucionFinal = lote.tomas.map((t) => t.locucion).filter(Boolean).join(' ')

  /**
   * ¿Este clip contiene más de una escena? Con el techo de 30 s y sin frontera de plano,
   * un lote normalmente abarca varios cortes del original. Eso cambia qué hay que
   * prometerle al modelo: antes era "una sola toma continua", ahora es "cortes secos
   * entre escenas, sin efectos de transición".
   */
  const variasEscenas = new Set(planos.filter(Boolean)).size >= 2 || anclas.size > 1

  /**
   * `t.personaje` y `t.producto` (FASE 3, preservados en `Lote.tomas`) NO se leen acá a
   * propósito. Son dato de shot list —lectura para el usuario en el wizard, no
   * instrucción para el modelo— y a nivel de render los supersede el bloque de
   * consistencia y `productDesc`, que ya cubren esa información una vez para todo el
   * lote. Repetirlos por toma duplicaría contenido y se comería justo el presupuesto que
   * esta función administra.
   */
  const renderAcciones = (nivel: number, capAccion: number | null) =>
    lote.tomas
      .map((t, i) => {
        const accionVisual =
          capAccion != null && t.accionVisual.length > capAccion
            ? `${t.accionVisual.slice(0, capAccion).trimEnd()}…`
            : t.accionVisual
        const plano = planoPorToma(i)
        const ancla = anclas.get(t.tiempoOriginal)
        return [
          // r1: `duracionSeg` sale de un reparto proporcional y llegaba cruda al prompt
          // ("Toma 1 — 0.8854477611940298 s", medido). Es ruido en un presupuesto que ya
          // trunca coreografía, y una precisión que el render no tiene.
          `### Shot ${t.n} — ${r1(t.duracionSeg)}s`,
          // La imagen ancla de esta escena. Es lo que hace posible que un clip contenga
          // varios encuadres: sin ella, el modelo tiene que inventar cómo se ve la escena
          // nueva y devuelve el mismo plano de antes.
          ancla ? `Starts from @image(${ancla}): match that framing and setting exactly.` : '',
          // Ver `planoPorToma`: nunca se degrada, por el mismo motivo que la línea hablada.
          plano ? `Camera: ${plano}` : '',
          accionVisual,
          // NUNCA se suelta, en ningún nivel de degradación. Esta línea es lo único que
          // le dice al generador QUÉ FRASE va con QUÉ ACCIÓN y en cuántos segundos: es la
          // sincronización audio↔imagen, no una copia del guion global. Con el tope viejo
          // llegó a perderse en un lote y no en los otros, y el resultado fue "una habla
          // muy rápido y la otra muy lento".
          //
          // ⚠️ Una toma muda tiene que DECLARARSE muda. El silencio por omisión es
          // ambiguo: el modelo genera audio y ante una toma sin línea rellena con habla
          // inventada.
          t.locucion
            ? `${dice(t)}: “${t.locucion}”`
            : 'No dialogue: the person does NOT speak in this shot. Action and ambient sound only; do not invent lines and do not move their mouth as if speaking.',
          nivel < NIVEL_SIN_OVERLAY_POR_TOMA ? 'No text / no overlay.' : '',
        ].filter(Boolean).join('\n')
      })
      .join('\n\n')

  const render = (nivel: number, capAccion: number | null) =>
    [
      `Vertical 9:16 UGC video, ${lote.duracionSeg} seconds total, shot on a phone.`,
      // La única línea del prompt que habla de idiomas. Sin ella, un prompt en inglés con
      // frases en español entrecomilladas es ambiguo: el modelo puede traducirlas.
      'All instructions below are in English. The quoted spoken lines are in Latin',
      'American Spanish and must be spoken EXACTLY as written, without translating them.',
      '',
      legend,
      '',
      ...(varios
        ? [
            `THERE ARE ${presentes.length} PEOPLE IN THIS CLIP. They look different from each`,
            'other and each one keeps their own face, voice and way of moving for the whole',
            'clip. Do not mix them up, do not swap them, do not give one the other’s voice.',
            '',
            ...presentes.map(bloqueDe),
          ]
        : ['CHARACTER (full description, no external references):', consistencyBlock]),
      '',
      spec.productBlockEn,
      nivel >= NIVEL_PRODUCTO_FISICO ? productoFisico(productDesc) : productDesc,
      '',
      `SETTING AND LIGHTING: ${escenario}`,
      // ⚠️ NO digas "estable". Durante mucho tiempo esta línea inyectaba esa palabra en
      // todos los prompts mientras el formato UGC se define por lo contrario: teléfono en
      // mano o apoyado, ángulo bajo, micro-temblor. Era pedirle trípode a un lenguaje
      // visual que no lo tiene.
      `CAMERA: ${camara.replace(/\.\s*$/, '')}. Vertical 9:16, handheld phone with natural`,
      'micro-shake, focus on the character and the product.',
      // ⚠️ ACÁ ESTÁ EL CAMBIO DE ARQUITECTURA. Con Veo el clip era un plano único y este
      // bloque decía "TOMA CONTINUA, sin cortes internos". Ahora un clip de hasta 30 s
      // abarca varias escenas del original a propósito, así que hay que decir cómo se
      // pasa de una a otra — y sobre todo cómo NO: los efectos de transición son lo que
      // delata un video generado, y un cambio de entorno no pedido rompe la continuidad.
      ...(variasEscenas
        ? [
            'CUTS: this clip contains several shots from the same piece. Move between them',
            'with straight, natural hard cuts — the way a real edit cuts. NO crossfades, no',
            'dissolves, no whip pans, no zoom transitions, no morphing, no speed ramps and',
            'no camera fly-throughs between shots.',
            'Across every cut the person, their wardrobe, the product, the room and the',
            'lighting stay THE SAME. Only the framing and the action change. Do not move',
            'the scene to another place and do not redecorate it.',
          ]
        : [
            'CONTINUOUS TAKE: one single shot from start to finish, no internal cuts, no jump',
            'cuts and no scene changes inside the clip.',
          ]),
      'CONTINUITY: character, product, wardrobe, setting and lighting stay identical from',
      'start to finish, exactly as described above. Only the action below advances.',
      '',
      varios ? '' : 'VOICE AND ACCENT PROFILE:',
      varios ? '' : `  Idioma: ${voz.idioma} · Variante: ${voz.varianteRegional} · Acento: ${voz.acento}`,
      varios ? '' : `  Pronunciación: ${voz.pronunciacion} · Ritmo: ${voz.ritmo} · Velocidad: ${voz.velocidad}`,
      varios ? '' : `  Entonación: ${voz.entonacion} · Energía: ${voz.energia} · Pausas: ${voz.pausas}`,
      varios ? '' : `  Tono: ${voz.tono} · Timbre: ${voz.timbre} · Edad vocal: ${voz.edadVocal} · Estilo: ${voz.estilo}`,
      '',
      // ⚠️ Va SIEMPRE que exista, íntegro y en cada lote, por la misma REGLA DE CONTEXTO
      // ABSOLUTO que el bloque de consistencia: el generador no recuerda el lote anterior,
      // así que un personaje que se mueve distinto en el lote 3 que en el 1 es el mismo
      // fallo que uno que cambia de cara.
      ...(movimiento && !varios
        ? [
            'HOW THEY MOVE (applies for the whole clip, also between gestures):',
            `  Calidad del movimiento: ${movimiento.calidadMovimiento}`,
            `  Manerismos: ${movimiento.manerismos}`,
            '',
          ]
        : []),
      ...(todoEnOff
        ? [
            'VOICE-OVER: the narration is HEARD but whoever says it is NOT on camera.',
            'NO mouth moves in this clip, nobody looks at the camera to speak and there is no',
            'presenter: it is the product on screen while a voice narrates over it.',
            '',
          ]
        : []),
      'SHOT LIST:',
      renderAcciones(nivel, capAccion),
      '',
      // El guion completo de una vez. Es lo PRIMERO que se suelta bajo presión de
      // presupuesto: sale del mismo texto que las líneas de cada toma, así que soltarlo no
      // pierde ni una palabra — solo deja de repetirlas juntas.
      ...(nivel < NIVEL_SIN_GUION_GLOBAL
        ? [
            todoEnOff
              ? 'FULL VOICE-OVER SCRIPT in Latin American Spanish (exact: do not summarize, extend, correct, add or remove lines). It is heard over the image; nobody says it on camera:'
              : 'FULL SPOKEN SCRIPT in Latin American Spanish (exact: do not summarize, extend, correct, add or remove lines):',
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

  // Piso: el nivel más bajo sin truncar `accionVisual` sigue sin entrar. Se busca el cap
  // de caracteres por toma más grande que sí entra (búsqueda binaria — el largo total es
  // monótono no-decreciente en el cap, así que es válida). Con cap 0 cada acción queda
  // reducida a "…"; si ni así entra, el exceso vive en las partes fijas y no hay nada más
  // que este nivel pueda recortar sin violar el propósito de la función.
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
    'así fallaría y la cuota de KIE ya estaría gastada.',
  )
}
