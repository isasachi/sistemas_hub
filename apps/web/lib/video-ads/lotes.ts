import { z } from 'zod'
import type { TomaFinal } from './adapt'
import type { VoiceProfile } from './character'
import { KIE_PROMPT_MAX } from './kie'
import { CPS_MAX } from './forensic'

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
 * La coreografía describe un cuerpo, no una foto de catálogo.
 *
 * El system prompt del hub (`gemini-system.md`, el motor de anuncios ESTÁTICOS) ordena
 * declarar la posición física del producto terminando en "No está flotando.", y la
 * FASE 3 del video lo obedecía dentro de `accionVisual`: medido sobre una sesión real,
 * las 6 tomas terminaban con esa frase y se emitía 6 veces en los prompts de render.
 * El system prompt propio de la tool (`video-system.md`) cierra la puerta para los
 * guiones NUEVOS; esto repara los ya GUARDADOS, que es donde vive el guion que el
 * usuario ya pagó — mismo criterio que limpiar al leer en vez de re-correr un paso caro.
 *
 * El acote es angosto a propósito: solo la oración COMPLETA sobre flotar o apoyarse. El
 * modo de fallo correcto es dejar pasar una frase de escenografía, nunca comerse
 * coreografía; por eso, si al limpiar no queda nada, se devuelve el original.
 */
const ESCENA_DE_FOTO = /\s*(?:El producto |El envase |El frasco )?[Nn]o est[áa] (?:flotando|apoyad[oa] en ninguna superficie)\s*\.?/g

export function sinEscenaDeFoto(accion: string): string {
  const limpio = accion.replace(ESCENA_DE_FOTO, ' ').replace(/\s+/g, ' ').replace(/\s*[;,]\s*(?=[A-ZÁÉÍÓÚ]|$)/g, '. ').trim()
  return limpio || accion
}

/**
 * Verbos con los que abre un HECHO de coreografía. La lista es CERRADA a propósito, y
 * es lo único que hace seguro partir por coma.
 *
 * AGENTS.md tiene medido el falso positivo de partir por coma a secas: "Mira producto y
 * luego a cámara" son dos destinos de la MISMA mirada, y partirlo deja "a cámara" sin
 * verbo. Lo que distingue ese caso de un hecho nuevo es exactamente esto — el fragmento
 * huérfano no empieza con un verbo. Medido sobre las tomas partidas de la base, las
 * cláusulas separadas por coma abren TODAS con uno de estos.
 *
 * Se amplía agregando verbos acá, no aflojando el criterio: un verbo nuevo es visible en
 * el diff y un umbral flojo no. Sin coincidencia NO se parte, que es la dirección
 * correcta del fallo — under-partir es preferible a producir fragmentos sin verbo.
 *
 * ponytail: solo español. Una `accion` en inglés se parte igual por punto y punto y
 * coma; lo que pierde es el corte por coma. Fail-safe, y hoy son 2 tomas de la base.
 */
const VERBOS_TRAMO = new Set([
  'aplica', 'sostiene', 'sujeta', 'masajea', 'muestra', 'presenta', 'extiende', 'esparce',
  'realiza', 'toca', 'frota', 'desliza', 'mira', 'observa', 'gesticula', 'acerca', 'aleja',
  'retira', 'abre', 'cierra', 'destapa', 'tapa', 'levanta', 'baja', 'senala', 'alterna',
  'suelta', 'deposita', 'coloca', 'gira', 'inclina', 'saca', 'recoge', 'vuelve', 'pasa',
  'habla', 'sonrie', 'termina', 'inicia', 'continua', 'agita', 'aprieta', 'guarda',
])

const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const abreHecho = (clausula: string) =>
  VERBOS_TRAMO.has(sinTildes(clausula.trim()).split(/\s+/)[0] ?? '')

/**
 * Parte la coreografía en HECHOS. Punto y punto y coma siempre; la coma solo cuando lo
 * que sigue abre con un verbo de `VERBOS_TRAMO`.
 */
export function partirEnTramos(accion: string): string[] {
  return accion
    .split(/(?<=[.;])\s+/)
    .flatMap((frase) => {
      const out: string[] = []
      for (const parte of frase.split(/,\s+/)) {
        if (out.length && !abreHecho(parte)) out[out.length - 1] += ', ' + parte
        else out.push(parte)
      }
      return out
    })
    .map((s) => s.replace(/[\s.;,]+$/, '').trim())
    .filter(Boolean)
}

/** Cuántos tramos le toca a cada fragmento: proporcional a su duración, por resto
 *  mayor, y con al menos uno cada uno cuando alcanza — un fragmento sin ninguna línea
 *  de movimiento se renderiza improvisando (AGENTS.md lo tiene medido: 18 % de un
 *  anuncio salió así). Cuando NO alcanza, los últimos quedan vacíos: vacío es
 *  recuperable, duplicado no. */
function cuotas(nTramos: number, duraciones: number[]): number[] {
  const total = duraciones.reduce((a, b) => a + b, 0) || 1
  const ideal = duraciones.map((d) => (nTramos * d) / total)
  const cuota = ideal.map((v) => Math.floor(v))
  const orden = ideal
    .map((v, i) => ({ resto: v - Math.floor(v), i }))
    .sort((a, b) => b.resto - a.resto)
  for (let k = 0, faltan = nTramos - cuota.reduce((a, b) => a + b, 0); faltan > 0; k++, faltan--) {
    cuota[orden[k % orden.length].i]++
  }
  if (nTramos >= duraciones.length) {
    for (let i = 0; i < cuota.length; i++) {
      if (cuota[i] > 0) continue
      const donante = cuota.indexOf(Math.max(...cuota))
      cuota[donante]--
      cuota[i]++
    }
  }
  return cuota
}

/**
 * Reparte la coreografía de una toma entre sus fragmentos, EN ORDEN.
 *
 * Sin esto `splitLongToma` copiaba `accionVisual` entera en cada fragmento: una toma de
 * 19,3 s partida en dos le pedía al modelo los 19,3 s de coreografía dentro de un clip
 * de 11 s, y otra vez dentro del de 8,3 — una instrucción imposible de la que el modelo
 * ejecuta una fracción arbitraria, y dos clips seguidos intentando el mismo gesto.
 * Medido sobre la base antes del arreglo: 71 de 253 fragmentos (28 %) y 462 s de 1655.
 *
 * Sin separador que aprovechar, TODO va al primer fragmento y los demás quedan sin
 * línea — mismo fail-safe que el reparto de tramos.
 */
export function repartirAccion(accion: string, duraciones: number[]): string[] {
  // Se limpia ANTES de partir, no solo al emitir: "El producto no está flotando." es
  // una oración entera, así que sobrevive como tramo propio y puede quedar siendo la
  // ÚNICA instrucción de movimiento de un fragmento — el defecto que `sinEscenaDeFoto`
  // existe para evitar, reentrando por la puerta del reparto.
  const tramos = partirEnTramos(sinEscenaDeFoto(accion))
  if (tramos.length < 2) return duraciones.map((_, i) => (i === 0 ? accion : ''))

  const cuota = cuotas(tramos.length, duraciones)
  let desde = 0
  return cuota.map((c, i) => {
    const trozo = tramos.slice(desde, desde + c)
    const previos = tramos.slice(0, desde)
    desde += c
    if (!trozo.length) return ''
    if (i === 0) return trozo.join('. ') + '.'
    // Un fragmento que no es el primero arranca A MITAD del corte, y el clip se renderiza
    // sin memoria del anterior: lo que las manos tienen y lo que ya pasó hay que
    // decírselo. Medido en el lote 3 de `00471f8a`: el corte decía "sujeta el frasco con
    // la derecha; aplica una gota; extiende con las yemas; mira", el segundo fragmento
    // recibió solo "extiende con las yemas; mira", y grok inventó el dispensado entero
    // (saca el gotero, gota en la palma) para tener suero que extender, y después el
    // frasco desapareció de las manos. Nada de esto inventa coreografía: el estado es el
    // que el forense declaró, y la transferencia ya ocurrió en el fragmento anterior.
    const estado = [...previos].reverse().find(esEstadoDeManos)
    const yaAplicado = previos.some(esTransferencia) && !trozo.some(esTransferencia)
    return [
      ...(estado && !trozo.some((t) => t === estado) ? [estado] : []),
      ...trozo,
      ...(yaAplicado ? [YA_APLICADO] : []),
    ].join('. ') + '.'
  })
}

/** Un tramo que declara qué tiene una mano, no un movimiento: se hereda entre fragmentos. */
const esEstadoDeManos = (t: string) => /^(sujeta|sostiene|mantiene|tiene)\b/i.test(sinTildes(t)) && /\bmano/i.test(t)
/** El producto llegó al cuerpo en este tramo. */
const esTransferencia = (t: string) => /\b(aplica|deja caer|suelta|vierte|deposita|echa)\b/i.test(t) && /\b(gota|suero|serum|producto|crema)\b/i.test(t)
const YA_APLICADO = 'el producto ya está en la piel desde antes: no vuelve a dispensar'

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

/** Lo que se emite cuando a un fragmento no le tocó ningún hecho (su toma tenía uno
 *  solo y se partió en varios). La quietud DECLARADA es un dato; un encabezado sin nada
 *  detrás es un carril que la plantilla dibuja y el prompt no llena, y este repo ya tiene
 *  medido que el modelo lo llena solo. No dice "sigue lo anterior": el clip se renderiza
 *  sin memoria de nada que esté fuera de su propio prompt. */
const SIN_HECHO_NUEVO = 'mantiene la postura, sin gesto nuevo.'

/** `splitLongToma` reparte la duración y la locución; esto reparte la COREOGRAFÍA sobre
 *  la lista de fragmentos ya cerrada — el reparto necesita verlos todos a la vez, y la
 *  recursión de aquella devuelve de a uno. */
function partirToma(t: TomaFinal): TomaFinal[] {
  const frags = splitLongToma(t)
  if (frags.length < 2) return frags
  const acciones = repartirAccion(t.accionVisual, frags.map((f) => f.duracionSeg))
  return frags.map((f, i) => ({ ...f, accionVisual: acciones[i] }))
}

/**
 * Presupuesto de COREOGRAFÍA por lote, en caracteres. El prompt del lote es hoy casi
 * solo movimiento (las imágenes cargan con lo visual), así que lo único que puede
 * desbordar `KIE_PROMPT_MAX` es la suma de las `accionVisual` de sus tomas.
 *
 * Medido con la coreografía real que pide la FASE 1 (~400 caracteres por toma): 6 tomas
 * dan un prompt de 3.832 de 4.096 y 7 ya no entran. El tope se cierra en el REPARTO, con
 * la misma aritmética que el de 15 segundos, y no truncando el texto: recortar la
 * coreografía es perder justo lo que el clip tiene que ejecutar. Cierra el lote antes,
 * que es la respuesta correcta cuando el contenido no cabe en un clip.
 *
 * ⚠️ Un lote de más es una llamada pagada de más, así que el costo se midió antes de
 * cablearlo (lectura pura de las sesiones guardadas, cero LLM): de 36 sesiones con
 * guión, **3 ganan lotes** y el total pasa de 152 a 156 — +2,6 % de llamadas pagadas.
 *
 * ⚠️ 2600 → 2450: el andamiaje fijo creció ~180 caracteres (bloque de producto y la
 * invariante de piezas), así que el techo de coreografía tiene que bajar lo mismo o el
 * prompt se pasa. Re-medido sobre las 36 sesiones: 162 → 163 lotes, UNA llamada pagada
 * de más en toda la base.
 * Solo se dispara en montajes muy picados (muchos cortes cortos dentro de 15 s); un
 * anuncio hablado normal no lo roza.
 */
export const LOTE_MAX_COREO = 2450

/**
 * Tercer cierre: por CARACTERES de locución, con la misma aritmética que los 15 s.
 * Medido sobre grok (AGENTS.md, probe-cap-30): a 281 caracteres dice el 100 % y a 577
 * deja de recitar y balbucea. `repairCutTiming` garantiza el ritmo sobre los cortes del
 * FORENSE, pero FASE 3 reescribe la locución y el usuario la edita a mano — medido en
 * esta base, 20 % de los lotes pasaban de 20 car/s. Una toma que SOLA se pasa no se
 * arregla cerrando el lote: ahí manda el piso de habla de `generate-lotes`.
 */
export const LOTE_MAX_CHARS = LOTE_MAX_SEC * CPS_MAX

export function groupIntoLotes(tomas: TomaFinal[]): Lote[] {
  // Renumeramos TODA la secuencia expandida en orden: si una toma se divide, sus
  // fragmentos no pueden compartir el `n` original (colisionarían al rotular "Toma N"
  // en el prompt de Task 5 — dos "Toma 1" en el mismo guión). Numerar secuencial y
  // global es la forma más simple de garantizar unicidad y orden sin inventar un
  // esquema paralelo (sufijos, decimales) que Task 5 tendría que aprender a leer.
  const expandidas = tomas.flatMap(partirToma).map((t, i) => ({ ...t, n: i + 1 }))
  const lotes: Lote[] = []
  let actual: TomaFinal[] = []
  let acumulado = 0
  let coreografia = 0
  let locucion = 0

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
    coreografia = 0
    locucion = 0
  }

  for (const t of expandidas) {
    // "Si agregar la siguiente Toma provoca que el lote supere 15.0 segundos: NO la
    // agregues. Esa Toma pasa automáticamente a ser la primera del siguiente Lote."
    // Nota: `t.duracionSeg` ya viene <= LOTE_MAX_SEC garantizado por `splitLongToma`
    // (recursivamente), así que una toma sola SIEMPRE entra en un lote propio aunque
    // el lote esté vacío — el guard de abajo solo protege la SUMA con lo ya acumulado.
    // Igual que con los segundos: una toma SOLA siempre entra en su propio lote aunque
    // se pase (ahí no hay nada que cerrar y el guard de `buildLotePrompt` la caza), el
    // cierre solo protege la SUMA con lo ya acumulado.
    if (actual.length && (
      excedeTope(acumulado + t.duracionSeg)
      || coreografia + t.accionVisual.length > LOTE_MAX_COREO
      || locucion + t.locucion.length > LOTE_MAX_CHARS
    )) cerrar()
    actual.push(t)
    acumulado += t.duracionSeg
    coreografia += t.accionVisual.length
    locucion += t.locucion.length
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
 * Prompt de un lote. Reparto de trabajo entre las dos entradas del modelo:
 *
 *   LAS IMÁGENES son las anclas visuales — definen CÓMO SE VE el video (el personaje,
 *   el producto, la ropa, la habitación, la luz). Se citan por su nombre: Image1, Image2.
 *   EL PROMPT es el motion control — define CÓMO TRANSCURRE el movimiento, y entiende
 *   mejor el lenguaje natural que un telegrama de atributos.
 *
 * De ahí sale todo lo demás. El prompt NO describe con palabras lo que las imágenes ya
 * muestran: nada de bloque de consistencia, descripción del producto ni escenario —
 * decirlo dos veces solo puede contradecir a la imagen, y cuando se contradicen el
 * resultado deja de ser estable. Queda: las referencias a las imágenes, el movimiento en
 * lenguaje natural, el guion de locución y el ancla de voz y acento.
 *
 * Y por eso NO hay escalera de degradación: lo que se comía el presupuesto eran los
 * bloques descriptivos que ya no están. El guard de `KIE_PROMPT_MAX` sigue al final como
 * última red antes de un 422 con la cuota gastada, pero no hay nada que recortar.
 *
 * El movimiento va EXPLÍCITO: un "muestra el producto" lo resuelve el modelo con un
 * gesto cualquiera. La `accionVisual` de cada toma viene del análisis forense
 * justamente con ese nivel de detalle (qué mano, cómo agarra, dónde toca, hacia dónde
 * mira), y acá se emite tal cual.
 */
/**
 * La parte FÍSICA de la descripción del producto: sus tres primeras oraciones.
 *
 * `product_scan.productDescription` mezcla la forma del envase con la transcripción de
 * la etiqueta, y la etiqueta la muestra Image2 mejor de lo que la cuenta un párrafo. Lo
 * que la imagen NO puede sostener sola es el color y las piezas: medido, los renders
 * salían con el frasco de otro color, sin tapa y con un segundo cuentagotas. Las dos
 * primeras oraciones son justamente "es un frasco de vidrio púrpura con tapón
 * cuentagotas blanco"; el resto es etiqueta. Son TRES y no dos porque está medido: de
 * las 24 descripciones que nombran una pieza (tapa, cuentagotas, aplicador), con dos
 * oraciones sobreviven 21 y con tres, 23 — y el presupuesto no se mueve (MAX 3.965 de
 * 4.096 en los dos casos, cero lotes sueltan el bloque). Mismo recorte que el `NIVEL_PRODUCTO_FISICO`
 * que AGENTS.md midió en la época del presupuesto apretado, acá aplicado siempre.
 *
 * Se limpia la escenografía de la foto de catálogo por la misma puerta que la
 * coreografía: en el video el producto está en la mano de alguien, así que la superficie
 * y la sombra de la foto de la que salió no son parte del producto.
 */
export function productoFisico(desc: string): string {
  const limpio = sinEscenaDeFoto((desc ?? '').trim())
  // Se parte con el MISMO lookbehind que `partirEnTramos` y no con `/[^.]+/`: un
  // volumen de etiqueta ("30 ml / 1.01 fl oz") tiene un punto sin espacio detrás, así
  // que la partición ingenua gasta las dos oraciones en una sola y se come justo la
  // que nombra la tapa o el aplicador — la mitad que arregla el gotero duplicado.
  return limpio.split(/(?<=[.;])\s+/).slice(0, 3).join(' ').trim()
}

/**
 * Invariante FÍSICA, no coreografía: no dice qué gesto hacer, dice qué no puede pasar
 * mientras se hace. Va en el prompt porque cada clip se renderiza sin memoria de los
 * otros (REGLA DE CONTEXTO ABSOLUTO) y sin memoria de lo que la toma anterior dejó en
 * cada mano — y ahí el modelo resuelve la ambigüedad dibujando una copia del
 * cuentagotas, un frasco sin su tapa o un tercer brazo.
 *
 * Es la contraparte de render de la regla del forense sobre dónde termina cada pieza que
 * se separa del envase, igual que la línea de "sin texto en pantalla" lo es de
 * `elementosGraficos`.
 *
 * Va comprimida a una línea por el precedente medido del bloque de video limpio: la
 * letanía de sinónimos no compraba nada y el presupuesto lo paga la coreografía.
 */
const reglaPiezas = (imagenProducto: string) =>
  'Dos manos y nada más: para tomar algo, primero suelta lo que tenía. La tapa y el aplicador son los del envase ' +
  `de ${imagenProducto}: no hay una segunda copia, y el envase no se queda sin la suya.`

export function buildLotePrompt(args: {
  lote: Lote
  camara: string
  voz: VoiceProfile
  images: LoteImage[]
  /**
   * Parte física del producto (`productoFisico`); vacío emite el prompt sin ese bloque.
   * OBLIGATORIO aunque acepte la cadena vacía, y a propósito: `scriptFingerprint` lo
   * exige, así que un caller que lo omitiera compilaría igual y produciría una huella
   * que describe un producto que su prompt no lleva. Un campo opcional acá es una
   * divergencia silenciosa entre lo que se renderiza y lo que la huella jura.
   */
  producto: string
  /**
   * Los cortes del forense (`tiempo` + `camara`). Con ellos, un lote cuyas tomas vienen
   * de DOS planos distintos deja de pedir "una sola toma continua" con dos cámaras en la
   * misma línea —está medido que grok renderiza una y descarta la otra— y anuncia el
   * plano POR TOMA, con cortes secos entre ellas. Sin `cortes` se emite como siempre.
   */
  cortes?: { tiempo: string; camara: string }[]
}): string {
  const { lote, camara, voz, images, producto } = args

  const planoDe = new Map((args.cortes ?? []).map((c) => [c.tiempo, c.camara.trim().replace(/\s*\.\s*$/, '')]))
  const planos = [...new Set(lote.tomas.map((t) => planoDe.get(t.tiempoOriginal)).filter(Boolean))]
  const multiPlano = planos.length > 1

  // El orden ES el contrato: `Image1` es la primera del array. Reordenarlo le da a una
  // toma la imagen de otra.
  const anclas = images.map((img, i) => `Image${i + 1} = ${img.role}`).join(' · ')
  // El rol se cita DENTRO de la cláusula que lo usa, no solo en la leyenda de arriba:
  // AGENTS.md tiene medido (4 renders) que la leyenda sola deja derivar la etiqueta y el
  // aplicador. Se deriva del array y no se escribe `Image2` a mano — el orden es el
  // contrato, y hardcodear el índice acá lo rompería en silencio si cambia.
  const iProd = images.findIndex((img) => img.role.includes('producto'))
  const imagenProducto = iProd >= 0 ? `Image${iProd + 1}` : 'la imagen del producto'

  const acciones = (unaLinea: boolean) => [
    // El rótulo va SIEMPRE. Colgaba del caso de UNA toma, así que el lote con varias
    // —el que más hechos tiene que ordenar— abría sin nada que dijera que lo que sigue
    // es la coreografía: la lista de tomas quedaba pegada a la regla de piezas.
    'MOVIMIENTO:',
    ...lote.tomas.map((t, i) => {
      // Dos fragmentos del MISMO corte en el MISMO lote heredan el mismo estado de manos y
      // la misma aclaración de "ya aplicado" (`repartirAccion`): dentro de un clip
      // continuo decirlo dos veces es ruido. Entre lotes sí se repite, y debe.
      const previos = new Set(i ? partirEnTramos(sinEscenaDeFoto(lote.tomas[i - 1].accionVisual)) : [])
      // UN HECHO POR LÍNEA, con los mismos cortes que usa el reparto (`partirEnTramos`).
      // El prompt del wizard que este repo verificó fotograma a fotograma escribe cada
      // hecho en su renglón (`Holding gotero in right hand.` / `Gently releasing one
      // clear drop onto her left cheek.`); el nuestro los metía todos en un renglón, y
      // ahí el modelo los resuelve como UN gesto — de ahí la gota que "aparece" en la
      // mejilla sin que el gotero llegue nunca. El texto es el MISMO, cambia dónde corta.
      const hechos = partirEnTramos(sinEscenaDeFoto(t.accionVisual))
        .filter((h) => !(previos.has(h) && (esEstadoDeManos(h) || h === YA_APLICADO)))
      // El plano se anuncia solo cuando CAMBIA respecto de la toma anterior: un shot
      // list se lee así, el plano vale hasta que se anuncia otro.
      const plano = multiPlano ? planoDe.get(t.tiempoOriginal) : undefined
      const anterior = multiPlano ? planoDe.get(lote.tomas[lote.tomas.indexOf(t) - 1]?.tiempoOriginal ?? '') : undefined
      const rotuloPlano = plano && plano !== anterior ? ` — ${plano}` : ''
      return [
        ...(lote.tomas.length > 1 ? [`Toma ${t.n} (${r1(t.duracionSeg)} s)${rotuloPlano}:`] : []),
        ...(!hechos.length ? [SIN_HECHO_NUEVO]
          : unaLinea ? [`${hechos.join('. ')}.`]
          : hechos.map((h) => `  - ${h[0].toUpperCase()}${h.slice(1)}.`)),
        // Esta línea es lo único que dice QUÉ FRASE va con QUÉ ACCIÓN y en cuántos
        // segundos: es la sincronización audio↔imagen. Se comprobó en una sesión real
        // que perderla en un lote y conservarla en otro produce "una habla muy rápido y
        // la otra muy lento".
        t.locucion ? `  Dice, literal: “${t.locucion}”` : '  No habla en esta toma.',
      ].join('\n')
    }),
  ].join('\n')

  // Un solo escalón de degradación, y en la dirección que este repo ya tiene medida: lo
  // primero que se suelta es lo que DUPLICA lo que la imagen ya muestra. Medido sobre
  // los 155 lotes reales, un lote de una sesión se pasaba del tope al sumar el bloque —
  // sin el escalón, esa sesión dejaba de poder renderizarse. La invariante de piezas NO
  // se suelta: no la dice nadie más.
  // Micro-temblor solo si la cámara del original no es fija: medido, el 74 % de los
  // cortes dicen "fija/estática/estable", y pedir temblor en la misma línea eran dos
  // órdenes opuestas — el modo de fallo que este repo tiene registrado seis veces.
  const fija = /fij|est[aá]t|estab|tr[ií]pode/i.test(camara)
  const temblor = fija ? '' : ' Grabado con teléfono en mano, con micro-temblor natural.'
  const armar = (desc: string, unaLinea = false) => [
    multiPlano
      ? `Video UGC vertical 9:16, ${lote.duracionSeg} segundos, ${lote.tomas.length} tomas con corte seco donde cambia el plano; sin fundidos ni transiciones, y nada cambia al otro lado del corte.`
      : `Video UGC vertical 9:16, ${lote.duracionSeg} segundos, una sola toma continua.`,
    `Referencias: ${anclas}. Las imágenes definen cómo se ven la persona, el producto y el lugar: reprodúcelos idénticos.`,
    // La descripción NO compite con la imagen: la cita en la misma cláusula y dice lo
    // mismo que ella. Sin esto el prompt no nombraba el color ni las piezas del envase
    // en ninguna parte, y el clip los derivaba.
    ...(desc ? [`PRODUCTO — el de ${imagenProducto}, y se ve así durante todo el clip: ${desc}`] : []),
    reglaPiezas(imagenProducto),
    '',
    acciones(unaLinea),
    '',
    multiPlano
      ? `CÁMARA: la de cada toma, anunciada arriba.${temblor}`
      : `CÁMARA: ${camara.replace(/\s*\.\s*$/, '')}.${temblor}`,
    '',
    `VOZ: ${voz.tono}, timbre ${voz.timbre}, edad vocal ${voz.edadVocal}. Habla en ${voz.idioma} con acento ${voz.acento}, ${voz.ritmo.toLowerCase()}, energía ${voz.energia.toLowerCase()}. ${voz.entonacion}.`,
    'Dice exactamente lo que está entre comillas arriba: no resumas, no extiendas, no corrijas, no agregues frases ni inventes diálogo para rellenar.',
    '',
    'Sin texto en pantalla: ni subtítulos, ni overlays, ni watermarks, ni interfaz. Solo el texto impreso en el propio producto.',
  ].join('\n')

  const prompt = armar(producto)
  if (prompt.length <= KIE_PROMPT_MAX) return prompt
  const sinProducto = armar('')
  if (sinProducto.length <= KIE_PROMPT_MAX) return sinProducto
  // Segundo escalón: se suelta el FORMATO, no el contenido. Los mismos hechos vuelven a
  // la línea corrida de siempre — se ejecutan peor, pero están todos. Recortar la
  // coreografía sería perder lo único que dice qué hace el cuerpo. Ojo con cuánto compra:
  // son ~4 caracteres por hecho, o sea una banda de ~130 sobre un tope de 4096. No es una
  // red general; es lo justo para el lote más pesado de la base, que queda a 15 del tope.
  const corrido = armar('', true)
  if (corrido.length <= KIE_PROMPT_MAX) return corrido
  throw new Error(
    `El prompt del Lote ${lote.n} no entra en el tope de KIE (${prompt.length} de ${KIE_PROMPT_MAX} caracteres). ` +
    'Con este formato eso solo puede pasar si la coreografía de las tomas del lote es enorme: ' +
    'hay que acortarla antes de reintentar — crear la tarea así fallaría con 422 y la cuota de KIE ya gastada.',
  )
}
