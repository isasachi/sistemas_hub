import { z } from 'zod'

/**
 * MOVIMIENTO ESTRUCTURADO (V2) — el artefacto de primera clase del que depende la fidelidad.
 * ---------------------------------------------------------------------------------------
 * El defecto que esto arregla: hasta acá el movimiento viajaba como PROSA (`accion`,
 * `micro`) de punta a punta, y una prosa preserva la IDEA de un gesto pero no su
 * estructura temporal. Grok recibía "aplica una gota y masajea" para 11 segundos y se
 * inventaba el reparto — de ahí "faltan movimientos" y "se siente lento".
 *
 * Un `MotionTimeline` no es una descripción más rica: es una MÁQUINA DE ESTADOS. Cada
 * beat declara qué había antes y qué queda después, así que el encadenado se puede
 * VERIFICAR en código en vez de confiar en que la frase suene bien.
 *
 * ⚠️ ESTE MÓDULO NO ES UN PIPELINE PARALELO. Es la representación canónica de un campo
 * que ya existía (`Corte.accion`), extraída a su propio archivo porque `forensic.ts` ya
 * pasa de 1.400 líneas — no porque el movimiento viva aparte.
 *
 * ⚠️ Y NO DUPLICA A `micro`. Son granularidades distintas y esa distinción es lo único
 * que hace legítimo tener los dos: `micro` es el agregado POR CORTE (lo que alimenta el
 * guard de plano-de-persona y la línea compacta del prompt), un beat es un tramo DENTRO
 * del corte. Cuando dos campos hacen la misma pregunta en la MISMA granularidad, este
 * repo ya midió qué pasa: el segundo vuelve vacío. Por eso `objetoEnMano` —que sí
 * preguntaba lo mismo que `productStateBefore/After`— dejó de pedirse y se DERIVA.
 */

/** Una casilla de texto del modelo: obligatoria, infalible y sin `null` donde escaparse. */
const casilla = () => z.string().catch('')

/** Mismo valor que `ESTADO_VACIO`, declarado antes para que los schemas puedan usarlo. */
const ESTADO_VACIO_INTERNO = {
  bodyPose: '', headPose: '', gaze: '', leftHand: '', rightHand: '',
  facialExpression: '', productState: '', propsState: '', cameraState: '',
}

/**
 * El estado visible en un instante. Es lo que se compara para validar una unión, para
 * construir un ancla y para medir el clip generado contra el original.
 */
export const MotionStateSchema = z.object({
  bodyPose: casilla(),
  headPose: casilla(),
  gaze: casilla(),
  leftHand: casilla(),
  rightHand: casilla(),
  facialExpression: casilla(),
  productState: casilla(),
  propsState: casilla(),
  cameraState: casilla(),
})
export type MotionState = z.infer<typeof MotionStateSchema>

/**
 * Un tramo de movimiento dentro de un corte. **DIEZ campos, y ese número es el diseño.**
 *
 * ⚠️ EMPEZÓ CON DIECIOCHO Y ESO ERA EL TECHO. Medido: con el beat gordo el modelo devolvía
 * 1 beat por corte en el pase general y 2-3 con el dedicado — un corte de 19 s resuelto con
 * dos beats. La causa no es que no sepa ver el movimiento: es que **cada beat cuesta lo que
 * cuesta emitirlo**, y con 18 campos emite menos beats de los que antes emitía frases. Un
 * timeline con mucho detalle por beat y tres beats preserva MENOS que uno con lo justo y
 * doce.
 *
 * Lo que se fue, y por qué — es el criterio que este repo ya tiene medido, aplicado campo
 * por campo: **un campo que ya está contestado en la granularidad correcta vuelve vacío o
 * roba presupuesto**.
 *   `id`                          → se deriva (`b1`, `b2`, …). Nada que preguntar.
 *   `referenceStartMs` / `EndMs`  → se DERIVAN de la ventana del corte + `startSec/endSec`.
 *   `productInteraction`          → es exactamente el par `productStateBefore/After` dicho
 *                                   otra vez en prosa, más lo que ya dicen las manos.
 *   `cameraMotion`                → `camara` es por CORTE, y con `maxPlanos = 1` hay un solo
 *                                   encuadre por clip: por beat no había nada que variar.
 *   `environmentMotion`           → es `micro.entorno`, que ya se pide por corte.
 *   `face`                        → es `micro.rostro`, ídem. La mirada SÍ se queda porque
 *                                   cambia dentro del corte y la Regla B la lista como
 *                                   topología a preservar.
 *   `dialogueMode`                → se deriva de `vozEnOff` y `dialogo`, que son del corte.
 *   `continuityCritical`          → solapaba con `importance: 'major'`. Dos etiquetas para
 *                                   la misma decisión, y la escalera solo lee una.
 *
 * Queda lo que de verdad CAMBIA dentro de un corte y nadie más responde: cuándo, dónde
 * mirar, qué hace cada mano, en qué estado queda el producto, y cuánto importa.
 *
 * ⚠️ `importance` es lo que la escalera de degradación del prompt necesita para saber qué
 * puede soltar: un beat `major` es la coreografía; uno `micro` es textura. Sin ese eje, el
 * recorte por presupuesto vuelve a ser ciego y se lleva puesto lo que hay que preservar.
 *
 * ⚠️ `referenceFrameMs` NO es metadato decorativo: es el instante del video ORIGINAL del
 * que se extrae el fotograma que ancla la pose. Es la única forma de que un ancla lleve
 * postura y estado del producto, y no solo la habitación.
 */
export const MotionBeatSchema = z.object({
  // Relativos al corte. La ventana del corte manda: estos nunca la mueven.
  startSec: z.number().catch(0),
  endSec: z.number().catch(0),
  /** El instante del video ORIGINAL del que se extrae el fotograma que ancla la pose. */
  referenceFrameMs: z.number().catch(0),

  body: casilla(),
  headAndGaze: casilla(),
  leftHand: casilla(),
  rightHand: casilla(),

  productStateBefore: casilla(),
  productStateAfter: casilla(),

  /** Lo que la escalera de degradación necesita para no recortar a ciegas. */
  importance: z.enum(['major', 'supporting', 'micro']).catch('supporting'),
})
export type MotionBeat = z.infer<typeof MotionBeatSchema>

/**
 * ⚠️ LOS TRES CONTADORES LOS CALCULA EL CÓDIGO, NO EL MODELO. Un LLM es un mal
 * aritmético y pedírselo abre la puerta a que el número y los beats se contradigan —
 * y el número es el que después decide cuánta carga de movimiento entra en un clip.
 * Van en el schema porque se persisten, pero `normalizeMotionTimeline` los reescribe
 * siempre desde `beats`.
 */
export const MotionTimelineSchema = z.object({
  // ⚠️ Infalibles también acá dentro: con `startState: MotionStateSchema` a secas, un
  // estado malformado hace fallar el objeto entero y el `.catch` de afuera devuelve el
  // timeline VACÍO — destruyendo los beats que el modelo SÍ produjo. Es la trampa que este
  // repo ya documentó con `micro`: el `.catch` sobre el objeto convierte una casilla
  // omitida en la pérdida de todo. Cada pieza aguanta sola.
  startState: MotionStateSchema.catch(() => ({ ...ESTADO_VACIO_INTERNO })),
  beats: z.array(MotionBeatSchema).catch([]),
  endState: MotionStateSchema.catch(() => ({ ...ESTADO_VACIO_INTERNO })),
  majorBeatCount: z.number().catch(0),
  productStateTransitionCount: z.number().catch(0),
  majorBeatsPerSecond: z.number().catch(0),
})
export type MotionTimeline = z.infer<typeof MotionTimelineSchema>

/** Un estado vacío pero VÁLIDO: el fallback que reemplaza al `null`. */
export const ESTADO_VACIO: MotionState = {
  bodyPose: '', headPose: '', gaze: '', leftHand: '', rightHand: '',
  facialExpression: '', productState: '', propsState: '', cameraState: '',
}

/**
 * ⚠️ EL TIMELINE VACÍO EXISTE PARA QUE EL SCHEMA NO LE OFREZCA `null` AL MODELO — y esto
 * está MEDIDO, no razonado.
 *
 * La primera versión declaraba `motion: MotionTimelineSchema.nullable().catch(null)`,
 * copiando la forma de `micro`. Resultado sobre un video real: **0 de 5 cortes con
 * timeline.** Ni uno.
 *
 * La causa es la misma que este repo ya pagó una vez con las casillas de `micro`:
 * `.nullable().catch(null)` emite `{"default": null, "anyOf": [...]}`, o sea el schema le
 * dice al modelo que `null` es un valor válido **y que es el que se espera por defecto**.
 * Con un objeto tan grande —un array de beats de 18 campos cada uno— esa salida es
 * irresistible. El prompt lo pedía; el schema le ofrecía no darlo.
 *
 * `.catch(TIMELINE_VACIO)` compra las tres cosas a la vez: el campo sigue en el `required`
 * (el modelo DEBE responderlo), no hay ningún `null` donde escaparse, y una sesión
 * guardada —que no trae el campo— parsea a un timeline vacío en vez de reventar. "Tiene
 * movimiento" pasa a ser `beats.length > 0`, que es una pregunta sobre el contenido y no
 * sobre la presencia.
 */
export const TIMELINE_VACIO: MotionTimeline = {
  startState: ESTADO_VACIO,
  beats: [],
  endState: ESTADO_VACIO,
  majorBeatCount: 0,
  productStateTransitionCount: 0,
  majorBeatsPerSecond: 0,
}

/** ¿Este corte trae la representación V2? Es una pregunta sobre CONTENIDO, no presencia. */
export function tieneMotion(c: { motion?: MotionTimeline | null }): boolean {
  return (c.motion?.beats?.length ?? 0) > 0
}

const r2 = (n: number) => Math.round(n * 100) / 100
const norm = (x: string) =>
  x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Acota los tiempos de los beats a la ventana del corte y recalcula los contadores.
 *
 * ⚠️ EL CORTE ES LA AUTORIDAD DE TIEMPO, no los beats. Es la misma regla por la que
 * `repairCutTiming` nunca toca `tiempo`: media docena de cosas emparejan por esa marca, y
 * dejar que un beat mal medido corra la ventana desincroniza el guion del render en
 * silencio. Un beat fuera de rango se recorta; nunca al revés.
 *
 * Idempotente por construcción: al salir todo beat ya cumple las invariantes, así que una
 * segunda pasada no mueve nada — sin eso, dos pasadas darían dos huellas de reanudación
 * distintas para el mismo contenido.
 */
export function normalizeMotionTimeline(tl: MotionTimeline, duracionSeg: number): MotionTimeline {
  const dur = Number.isFinite(duracionSeg) && duracionSeg > 0 ? duracionSeg : 0
  let cursor = 0
  const beats = (tl.beats ?? []).map((b, i) => {
    // Monótono: un beat nunca empieza antes de donde terminó el anterior. Un solape real
    // (la mano levanta el frasco MIENTRAS la cabeza gira) se conserva como duración, no
    // como retroceso — el orden de la lista ya expresa la simultaneidad.
    const start = Math.min(Math.max(Number.isFinite(b.startSec) ? b.startSec : cursor, cursor), dur)
    const end = Math.min(Math.max(Number.isFinite(b.endSec) ? b.endSec : start, start), dur)
    cursor = end
    return { ...b, startSec: r2(start), endSec: r2(end) }
  })
  const major = beats.filter((b) => b.importance === 'major')
  const transiciones = beats.filter((b) => norm(b.productStateBefore) !== norm(b.productStateAfter)).length
  return {
    ...tl,
    beats,
    majorBeatCount: major.length,
    productStateTransitionCount: transiciones,
    majorBeatsPerSecond: dur > 0 ? r2(major.length / dur) : 0,
  }
}

export interface MotionIssue { beat: string; motivo: string }

/**
 * ¿Dos estados del producto son el MISMO estado?
 *
 * ⚠️ LA IGUALDAD LITERAL DA FALSOS POSITIVOS, y está medido: sobre un video real el
 * validador marcó roto un eslabón donde un beat dejaba *"Dropper held in front of face"* y
 * el siguiente esperaba *"Dropper in front of face"* — el mismo estado con una palabra de
 * más. Marcar eso como defecto entrena a ignorar el validador, que es peor que no tenerlo.
 *
 * Se comparan las palabras de contenido: si una es subconjunto de la otra, es el mismo
 * estado descrito con más o menos detalle. Una contradicción real —"on the table" contra
 * "at her face"— no comparte esas palabras y sigue saltando. Mismo criterio de tolerancia
 * que `resolveSlotId` y que las contracciones de `alignSlots`: angosto, y el modo de fallo
 * es dejar pasar un cambio sutil, nunca inventar uno.
 */
const VACIAS = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'of', 'to', 'is', 'her', 'his', 'its', 'and', 'with', 'held', 'still'])
function mismoEstado(a: string, b: string): boolean {
  if (a === b) return true
  const pal = (x: string) => new Set(x.split(' ').filter((w) => w.length > 2 && !VACIAS.has(w)))
  const A = pal(a)
  const B = pal(b)
  if (!A.size || !B.size) return a === b
  const chico = A.size <= B.size ? A : B
  const grande = A.size <= B.size ? B : A
  return [...chico].every((w) => grande.has(w))
}

/**
 * Comprueba que el timeline sea una máquina de estados coherente: lo que un beat deja es
 * lo que el siguiente encuentra.
 *
 * ⚠️ REPORTA, NO REPARA. Inventar la transición que falta sería fabricar movimiento que no
 * está en la referencia — exactamente lo que este eje existe para impedir. Lo que se hace
 * con el reporte (reintentar el pase de movimiento dentro de su cuota, o seguir con lo que
 * hay) es decisión de la ruta, no de esta función.
 *
 * La comparación va normalizada porque el modelo escribe *"el frasco"* en un beat y
 * *"frasco"* en el siguiente — mismo criterio que `resolveSlotId` y `puedenUnirse`.
 */
export function validateMotionTimeline(tl: MotionTimeline): MotionIssue[] {
  const out: MotionIssue[] = []
  const beats = tl.beats ?? []
  for (let i = 0; i < beats.length - 1; i++) {
    const deja = norm(beats[i].productStateAfter)
    const encuentra = norm(beats[i + 1].productStateBefore)
    if (!deja || !encuentra) continue
    if (!mismoEstado(deja, encuentra)) {
      out.push({ beat: `b${i + 2}`, motivo: `el beat anterior deja "${beats[i].productStateAfter}" y este espera "${beats[i + 1].productStateBefore}"` })
    }
  }
  for (const b of beats) {
    if (b.endSec < b.startSec) out.push({ beat: `b${beats.indexOf(b) + 1}`, motivo: 'termina antes de empezar' })
  }
  return out
}

/**
 * `objetoEnMano` DERIVADO del timeline, no pedido al modelo.
 *
 * ⚠️ Preguntaba lo mismo que `productStateBefore` del primer beat y `productStateAfter`
 * del último, en la misma granularidad — y este repo ya midió que un campo que solapa con
 * otro que el modelo ya contestó vuelve vacío (0 de 4 y 0 de 6 cortes). Derivarlo mata el
 * duplicado sin tocar a sus dos consumidores (`puedenUnirse`, `unirManos`), que siguen
 * leyendo la misma forma. Es el §35.5 pregunta 5 —"qué código deja de hacer falta"—
 * resuelto sin borrar nada que alguien lea.
 */
export function objetoEnManoFromMotion(tl: MotionTimeline): { inicio: string; fin: string; accesorios: string } | null {
  const beats = tl.beats ?? []
  if (!beats.length) return null
  const estados = beats.map((b) => b.productStateAfter.trim()).filter(Boolean)
  const inicio = beats[0].productStateBefore.trim() || tl.startState?.productState?.trim() || ''
  const fin = estados.at(-1) || tl.endState?.productState?.trim() || ''
  if (!inicio && !fin) return null
  // Los accesorios son la SECUENCIA de estados del producto, que es justamente lo que
  // `accesorios` expresaba con flechas: un estado que sale y vuelve solo se ve en la
  // cadena completa, nunca comparando el primero con el último.
  const cadena = [inicio, ...estados].filter(Boolean)
  const sinRepetir = cadena.filter((x, i) => i === 0 || norm(x) !== norm(cadena[i - 1]))
  return { inicio, fin, accesorios: sinRepetir.length > 1 ? sinRepetir.join(' → ') : '' }
}

/**
 * Compila la coreografía en prosa desde el timeline.
 *
 * ⚠️ ES LA REGLA C DEL SPEC AL REVÉS DE COMO ESTABA: `accionVisual` deja de ser la FUENTE
 * del movimiento y pasa a ser una PROYECCIÓN de él. Sigue existiendo porque el prompt del
 * lote la emite y porque toda sesión guardada la tiene, pero para una sesión nueva ya no
 * la escribe nadie a mano: si el timeline cambia, la prosa cambia con él y no pueden
 * contradecirse.
 *
 * El separador es ` Luego, `, el mismo centinela que ya escriben `mergeMicroCortes` y
 * `unirTomasContinuas` y que `repartirAccion` sabe partir — no se inventa uno nuevo.
 */
export function compileAccion(tl: MotionTimeline): string {
  const partes = (tl.beats ?? [])
    .filter((b) => b.importance !== 'micro')
    .map((b) => [b.body, b.leftHand && `left: ${b.leftHand}`, b.rightHand && `right: ${b.rightHand}`, b.headAndGaze]
      .map((x) => String(x ?? '').trim()).filter(Boolean).join('; '))
    .filter(Boolean)
  return partes.join(' Luego, ')
}

/**
 * Reparte los beats entre los fragmentos de una toma partida, y REBASA sus tiempos.
 *
 * ⚠️ SIN ESTO EL TIMELINE SE DUPLICA, que es el bug que este repo ya pagó con la prosa:
 * `splitLongToma` parte una toma en fragmentos que conservan el mismo `tiempoOriginal`, así
 * que los dos leerían el MISMO timeline entero y a cada clip se le pediría la coreografía
 * completa en la mitad del tiempo. Es una instrucción imposible, y lo que el modelo hace
 * con ella es una fracción arbitraria.
 *
 * Cada beat cae en el fragmento que contiene su punto medio: un beat pertenece a un solo
 * tramo y el reparto no depende del recorrido. Los tiempos se rebasan al arranque del
 * fragmento —un clip empieza en 0— mientras `referenceFrameMs` se conserva INTACTO: es la
 * marca del video ORIGINAL y es lo que después extrae el fotograma de la pose.
 *
 * Un fragmento que se quede sin beats devuelve lista vacía y el prompt cae a la prosa,
 * que es el comportamiento de siempre: vacío es recuperable, duplicado no.
 */
export function repartirBeats(beats: MotionBeat[], duraciones: number[]): MotionBeat[][] {
  const out: MotionBeat[][] = duraciones.map(() => [])
  if (!beats?.length || duraciones.length <= 1) return duraciones.map((_, i) => (i === 0 ? [...(beats ?? [])] : []))
  // Fronteras acumuladas de cada fragmento dentro de la toma original.
  const bordes: number[] = []
  let acc = 0
  for (const d of duraciones) { acc += d; bordes.push(acc) }
  for (const b of beats) {
    const medio = (b.startSec + b.endSec) / 2
    let i = bordes.findIndex((borde) => medio < borde)
    if (i < 0) i = duraciones.length - 1
    const desde = i === 0 ? 0 : bordes[i - 1]
    // ⚠️ SE CLAMPEA A LA VENTANA DEL FRAGMENTO, no solo se rebasa. Un beat cae en el
    // fragmento que contiene su PUNTO MEDIO, así que puede empezar antes o terminar
    // después de sus bordes: sin el clamp, un beat [6.5–13.2] dentro de un fragmento de
    // 11,6 s se emite como "[6.5–13.2s]" en un clip que dura 11,6 — un tramo que arranca
    // (o termina) después de que el video se acabó. Son dos relojes en el mismo prompt,
    // que es exactamente el defecto que el candado existe para no cometer.
    const d = duraciones[i]
    out[i].push({
      ...b,
      startSec: r2(Math.min(Math.max(0, b.startSec - desde), d)),
      endSec: r2(Math.min(Math.max(0, b.endSec - desde), d)),
    })
  }
  // ⚠️ PISO DE UN BEAT POR FRAGMENTO, por el mismo motivo medido que lo tiene
  // `repartirAccion`: con duraciones 9:1 los tres tramos caían en el primero y el segundo
  // fragmento quedaba MUDO teniendo material. Y acá un fragmento sin beats es peor que
  // vacío: cae a la prosa, que se compila de TODOS los beats de la toma — o sea repite lo
  // que el candado del hermano ya pidió. Se le presta el beat vecino en el tiempo,
  // reencajado en la ventana del fragmento que lo recibe.
  for (let i = 0; i < out.length; i++) {
    if (out[i].length) continue
    const donante = i > 0 && out[i - 1].length > 1 ? i - 1 : out.findIndex((f, j) => j > i && f.length > 1)
    if (donante < 0) continue
    const b = donante < i ? out[donante].pop()! : out[donante].shift()!
    out[i].push({ ...b, startSec: 0, endSec: r2(duraciones[i]) })
  }
  return out
}
