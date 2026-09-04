import { z } from 'zod'
import type { TomaFinal } from './adapt'
import type { MotionProfile, VoiceProfile } from './character'

import { CPS_MAX } from './forensic'
import { KIE_PROMPT_MAX } from './kie'
import { limpiarEscenaDeFoto } from './product-scan'
import { nicheSpec } from './niches'
import { etiqueta, type Personaje } from './personajes'
import { repartirBeats, MotionBeatSchema, type MotionBeat, type MotionTimeline } from './motion'

/**
 * FASE 5 del prompt maestro — agrupación de tomas en lotes de generación.
 * ---------------------------------------------------------------------------
 * Esto es aritmética, no criterio: agrupar por duración no necesita un LLM, y pedírselo
 * lo volvería no determinista justo donde importa que no lo sea (el tope es el techo
 * duro del modelo de KIE).
 *
 * ⚠️ EL TOPE LO PONE LA CONSISTENCIA DEL MODELO, NO LA API. `grok-imagine/image-to-video`
 * acepta hasta 30 s y durante un tiempo ese fue el cap; el dueño del repo lo bajó a
 * **15 s** (2026-08-25) porque grok pierde la consistencia del personaje y del entorno
 * en clips largos. Vuelve a coincidir con los 15 s del spec, por otro camino.
 *
 * El efecto sobre el dinero es directo y va en contra: los mismos cortes caben en el
 * doble de lotes, y cada lote es una llamada PAGADA. Lo que se compra a ese precio es
 * que el clip se parezca al personaje. La duración final de cada lote la fija
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

export const LOTE_MAX_SEC = 15

/**
 * Presupuesto de HABLA de un lote, en caracteres. Es el cap de segundos traducido al
 * único otro eje que puede estirar un clip.
 *
 * ⚠️ EL PISO DE `clampDuration` PERFORA EL CAP, y con 30 s eso no se veía. Ese piso es
 * `ceil(caracteres / CPS_MAX)` y manda sobre todo lo demás a propósito: el texto tiene
 * que poder decirse, y violarlo corta el diálogo a mitad de frase. Con el techo en 30 s
 * un lote nunca llegaba a rozarlo; con 15 s, un lote de 400 caracteres devuelve **20 s**
 * y se renderiza un clip que pasa el cap que este módulo publica.
 *
 * Y esos 400 caracteres son un caso REAL, no teórico: `repairCutTiming` garantiza el
 * ritmo sobre los cortes del FORENSE, pero FASE 3 reescribe la locución y el usuario la
 * edita a mano — AGENTS.md tiene medido un corte que pasó de 82 a 272 caracteres en los
 * mismos 5 s. Así que el lote cierra también por caracteres, con la misma aritmética.
 *
 * ⚠️ Una toma que SOLA pasa el presupuesto no se puede arreglar cerrando el lote, y ahí
 * el piso gana: sale un clip más largo que el cap antes que uno con la frase cortada.
 * Es la misma jerarquía que dentro de `clampDuration`.
 */
export const LOTE_MAX_CHARS = LOTE_MAX_SEC * CPS_MAX


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
    /**
     * Los beats de ESTE fragmento. Lo llena el código (`groupIntoLotes`), no el modelo, y
     * por eso `.optional()` es correcto acá y no la trampa de siempre: una sesión guardada
     * no lo trae y se lee como antes. Vive en la toma y no se busca por `tiempoOriginal`
     * porque dos fragmentos de una misma toma COMPARTEN esa marca — y cada uno se queda
     * solo con los suyos.
     */
    beats: z.array(MotionBeatSchema).optional(),
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
/**
 * ⚠️ LA COREOGRAFÍA SE REPARTE ENTRE LOS FRAGMENTOS, NO SE DUPLICA.
 *
 * `splitLongToma` partía `locucion` por frases y copiaba `accionVisual` TAL CUAL a cada
 * fragmento. O sea que una toma fusionada de 17 s partida en dos le pedía al modelo la
 * coreografía COMPLETA de los 17 s en 3 s, y otra vez en 8,7 s. Es una instrucción
 * imposible, y lo que el modelo hace con ella es una fracción arbitraria: de ahí el
 * *"faltan movimientos y gestos"* que reportó el dueño del repo.
 *
 * Medido sobre la base: **21 de 119 tomas** llevaban la coreografía duplicada. (Contando
 * por lote la cifra parece 5 de 85 — pero `splitLongToma` corre ANTES de `groupIntoLotes`,
 * así que los fragmentos caen en lotes distintos y ahí el conteo por lote no los ve.)
 *
 * El separador ` Luego, ` no es una heurística sobre prosa: lo escribe `mergeMicroCortes`
 * al fusionar, así que cada tramo es EXACTAMENTE un corte del original. Se reparten en
 * orden y proporcionalmente a la duración de cada fragmento.
 *
 * Sin separador (una toma que nunca se fusionó) la acción entera va al PRIMER fragmento y
 * los demás quedan sin línea de acción. Es peor que repartir y mucho mejor que duplicar:
 * una acción vacía omite una línea del prompt, una duplicada le pide al modelo hacer dos
 * veces lo mismo en la mitad del tiempo.
 *
 * ⚠️ HAY UN SEGUNDO SEPARADOR, Y NO TENERLO ERA UNA REGRESIÓN DE LA MEJORA DE FASE 1.
 * Desde que el forense describe los cortes de más de 10 s **por tramos con marca de
 * tiempo** (`0-5 s: …; 5-10 s: …`), el separador de un corte largo SIN fusionar ya no es
 * ` Luego, ` sino el `;` delante del siguiente tramo. Esta función solo conocía el
 * primero, así que veía UN tramo y se iba por la rama de "sin separador".
 *
 * Medido en la sesión `ca62aaed`: una toma de 20 s con sus cuatro tramos se partió en
 * 11,6 + 6 + 2,3 s, el primer fragmento se llevó los 20 s de coreografía y **los otros dos
 * — 8,3 s de video, el 18 % del anuncio — se renderizaron con la acción VACÍA**. Ahí el
 * modelo improvisa, que es exactamente el *"se pierden movimientos"* reportado.
 *
 * ⚠️ Y ES UNA REGRESIÓN, no un hueco viejo: antes de que FASE 1 pidiera los tramos, un
 * corte de 20 s llegaba como UNA frase de prosa y no había nada mejor que repartir. Ahora
 * la información de tiempo existe y se estaba tirando.
 */
/** El arranque de un tramo con marca de tiempo (`0-5 s:`, `10-15 s :`), tras `;` o punto. */
const TRAMO_SEP = /\s*[;.]\s*(?=\d+\s*-\s*\d+\s*s\s*:)/gi
/** La marca de tiempo misma, al principio de un tramo. */
const TRAMO_MARCA = /^\d+\s*-\s*\d+\s*s\s*:\s*/i

export function repartirAccion(accion: string, duraciones: number[]): string[] {
  const F = duraciones.length
  if (F <= 1) return [accion]
  // Los dos separadores se normalizan a uno solo antes de partir, así conviven sin
  // pelearse: un corte fusionado CUYOS tramos además vienen numerados existe en la base.
  const segs = accion
    .replace(TRAMO_SEP, ' Luego, ')
    .split(' Luego, ')
    // ⚠️ LA MARCA DE TIEMPO SE CAE AL PARTIR. Es relativa a la toma ENTERA, mientras que la
    // duración de cada fragmento sale del reparto proporcional del texto hablado: un
    // fragmento de 6 s que recibe "10-15 s: …" le pide al modelo que no haga nada durante
    // los primeros diez segundos de un clip que dura seis. Ninguna re-numeración las vuelve
    // ciertas — el fragmento no hereda la ventana de tiempo de sus tramos — y dos
    // instrucciones que se contradicen en el mismo prompt es el modo de fallo que este repo
    // ya registró cuatro veces. Mientras la toma NO se parte (`F <= 1`, arriba) las marcas
    // se conservan intactas: ahí sí son ciertas, y son la mejora de FASE 1 funcionando.
    .map((x) => x.trim().replace(TRAMO_MARCA, '').trim())
    .filter(Boolean)
  if (segs.length <= 1) return duraciones.map((_, i) => (i === 0 ? accion : ''))

  // Cuántos tramos le tocan a cada fragmento, proporcional a su duración y por resto
  // mayor. ⚠️ Con al menos un tramo por fragmento cuando alcanza: un reparto puramente
  // posicional deja fragmentos VACÍOS teniendo material que darles (medido con
  // duraciones 9:1, los tres tramos caían en el primero).
  const total = duraciones.reduce((a, b) => a + b, 0) || 1
  const piso = segs.length >= F ? 1 : 0
  const libres = segs.length - piso * F
  const exactos = duraciones.map((d) => (libres * d) / total)
  const cuenta = exactos.map((x) => piso + Math.floor(x))
  // Los tramos que sobran por el redondeo van a los fragmentos con mayor resto.
  const sobran = segs.length - cuenta.reduce((a, b) => a + b, 0)
  exactos
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i)
    .slice(0, Math.max(0, sobran))
    .forEach(({ i }) => { cuenta[i]++ })

  const out: string[] = []
  let j = 0
  for (let i = 0; i < F; i++) {
    out.push(segs.slice(j, j + cuenta[i]).join(' Luego, '))
    j += cuenta[i]
  }
  // Lo que quede sin asignar por cualquier desajuste se pega al último: nunca se pierde.
  if (j < segs.length) out[F - 1] = [out[F - 1], ...segs.slice(j)].filter(Boolean).join(' Luego, ')
  return out
}

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
    const duraciones = Array.from({ length: minPartes }, () => r1(dur / minPartes))
    const acciones = repartirAccion(t.accionVisual, duraciones)
    const trozos = repartirBeats(t.beats ?? [], duraciones)
    return duraciones.map((d, i) => ({
      ...t,
      duracionSeg: d,
      accionVisual: acciones[i],
      // Los beats se reparten igual que la prosa y por el mismo motivo: pedirle a los dos
      // fragmentos la coreografía entera es pedir lo imposible dos veces.
      beats: trozos[i],
      locucion: i === 0 ? t.locucion : '',
    }))
  }

  const totalChars = partes.reduce((n, p) => n + p.length, 0) || 1
  const duraciones = partes.map((p) => r1((p.length / totalChars) * dur))
  // La coreografía se REPARTE entre los fragmentos, no se copia a cada uno: ver
  // `repartirAccion`. Es lo que evita pedirle al modelo los 17 s de movimiento en 3 s.
  const acciones = repartirAccion(t.accionVisual, duraciones)
  // Reparto proporcional a caracteres — NO es garantía suficiente por sí solo (ver
  // comentario de la función), así que cada fragmento se vuelve a verificar
  // recursivamente antes de aceptarlo.
  const trozos = repartirBeats(t.beats ?? [], duraciones)
  return partes.flatMap((p, i) =>
    splitLongToma({ ...t, duracionSeg: duraciones[i], accionVisual: acciones[i], beats: trozos[i], locucion: p }),
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

/**
 * ⚠️ LOS TRES CIERRES PROPIOS DE ESTE REPO SE FUERON (2026-09-03, vuelta al PROMPT
 * MAESTRO). La FASE 5 del spec tiene UNA regla: agrupar tomas en orden, tope de 15 s, y
 * nunca partir una toma salvo que ella sola pase de 15. Lo demás lo agregó este archivo a
 * fuerza de parches, y el propio ejemplo del spec lo contradice: su Lote 1 mete un plano
 * medio y un primer plano en el mismo clip ("A sequence of two shots").
 *
 * Lo que se quitó, con su medición apuntada para que se pueda restaurar sin re-descubrirla:
 *   - `maxPlanos` — cerraba el lote por cambio de encuadre. Medido: los lotes con dos
 *     encuadres pasaban de 18 a 0 por 1,15× de llamadas.
 *   - `clasePorTiempo` — cerraba al pasar de persona a solo-producto. Medido: los lotes
 *     mezclados pasaban de 8 a 0 por 1,07×.
 *   - `LOTE_MAX_COREO` — cerraba por presupuesto de coreografía. Medido: los prompts con la
 *     coreografía truncada pasaban de 10 a 5 de 135.
 * **Es la decisión del dueño del repo, no un re-descubrimiento**: las tres mediciones
 * siguen siendo ciertas y las tres describen síntomas del prompt anterior. Si vuelven a
 * aparecer, están acá para reponerse.
 *
 * ⚠️ `LOTE_MAX_CHARS` SE QUEDA, y la distinción importa: no da forma al reparto, protege
 * contra un fallo medido del RENDER —a 577 caracteres grok deja de recitar y empieza a
 * improvisar— que el spec no contempla porque sus tomas vienen cronometradas del original a
 * un ritmo decible, y las nuestras las reescribe FASE 3 y las edita el usuario.
 */
export function groupIntoLotes(
  tomas: TomaFinal[],
  /** `tiempoOriginal` → los beats de ese corte. Se adjuntan ANTES de partir, para que
   *  `splitLongToma` pueda repartirlos entre los fragmentos. */
  motionPorTiempo?: Map<string, MotionTimeline>,
): Lote[] {
  // Renumeramos TODA la secuencia expandida en orden: si una toma se divide, sus
  // fragmentos no pueden compartir el `n` original (colisionarían al rotular "Toma N"
  // en el prompt de Task 5 — dos "Toma 1" en el mismo guión). Numerar secuencial y
  // global es la forma más simple de garantizar unicidad y orden sin inventar un
  // esquema paralelo (sufijos, decimales) que Task 5 tendría que aprender a leer.
  // Los beats se adjuntan ANTES de partir: `splitLongToma` los reparte entre los
  // fragmentos igual que la prosa, y cada uno se queda solo con los suyos.
  const conBeats = motionPorTiempo
    ? tomas.map((t) => {
        const tl = motionPorTiempo.get(t.tiempoOriginal)
        return { ...t, beats: tl?.beats ?? [] }
      })
    : tomas
  const expandidas = conBeats.flatMap(splitLongToma).map((t, i) => ({ ...t, n: i + 1 }))
  const lotes: Lote[] = []
  let actual: TomaFinal[] = []
  let acumulado = 0
  let chars = 0
  let coreo = 0

  const cerrar = () => {
    if (!actual.length) return
    lotes.push({
      n: lotes.length + 1,
      tomas: actual.map((t) => ({
        n: t.n, duracionSeg: t.duracionSeg, accionVisual: t.accionVisual,
        personaje: t.personaje, producto: t.producto, locucion: t.locucion,
        tiempoOriginal: t.tiempoOriginal,
        // Los beats de ESTE fragmento. La proyección es explícita a propósito (lo que se
        // guarda en el jsonb es lo que el prompt lee), así que un campo que no se nombra
        // acá no llega al render — que es justo lo que pasaba con el candado.
        beats: t.beats,
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
    chars = 0
    coreo = 0
  }

  for (const t of expandidas) {
    // "Si agregar la siguiente Toma provoca que el lote supere 15.0 segundos: NO la
    // agregues. Esa Toma pasa automáticamente a ser la primera del siguiente Lote."
    // `t.duracionSeg` ya viene <= LOTE_MAX_SEC garantizado por `splitLongToma`, así que una
    // toma sola SIEMPRE entra en un lote propio aunque el lote esté vacío.
    if (actual.length && excedeTope(acumulado + t.duracionSeg)) cerrar()
    // …y por CARACTERES, que es lo único que sobrevive de los cierres propios: ver arriba.
    else if (actual.length && chars + t.locucion.length > LOTE_MAX_CHARS) cerrar()
    actual.push(t)
    acumulado += t.duracionSeg
    chars += t.locucion.length
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
/**
 * Lo que se emite cuando NO se sabe el encuadre de ninguna toma del lote.
 *
 * ⚠️ **NO PUEDE SER EL PLANO DE UN CORTE CONCRETO, Y ESE ERA EL BUG.** `generate-lotes`
 * pasaba `cortes[0].camara` como fallback — o sea el encuadre del corte 1 mandado a TODOS
 * los lotes, que es exactamente el defecto que `camaraDeLote` se escribió para arreglar,
 * entrando por la puerta de atrás. Y no es un fallback inofensivo: la línea `CAMERA:` del
 * prompt afirma ese plano como un hecho, así que un lote de primer plano de producto salía
 * pidiendo el plano medio de la primera toma hablada.
 *
 * Si el emparejamiento por `tiempoOriginal` falla no sabemos NADA del encuadre, así que la
 * respuesta honesta es no afirmar ninguna escala: solo el carácter de cámara en mano, que
 * es la única propiedad cierta para todo el formato. Sin escala, el encuadre lo decide la
 * imagen de referencia — que es el fail-safe correcto (`preservar`), el mismo criterio que
 * la zona del cuerpo y la paleta en el generador de anuncios.
 */
export const CAMARA_SIN_DATO = 'cámara en mano, con micro-temblor natural'

export function camaraDeLote(
  lote: Lote,
  cortes: { tiempo: string; camara: string }[],
  fallback: string = CAMARA_SIN_DATO,
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
/**
 * LA REGLA DE VIDEO LIMPIO, literal del PROMPT MAESTRO.
 *
 * Reemplaza al párrafo de quince sinónimos que este repo fue engordando (`captions,
 * subtítulos, títulos, lower thirds, banners, stickers, emojis, flechas, callouts…`) y a su
 * escalón de degradación. Dice lo mismo en un tercio del espacio, y con 4.096 caracteres de
 * tope ese espacio es la coreografía.
 */
const REGLA_VIDEO_LIMPIO =
  'Clean video rule: no on-screen text. No captions. No subtitles. No overlays. No titles. ' +
  'No stickers. No emojis. No arrows. No graphics. No UI. No watermarks. Only the character, ' +
  'the product and real physical elements of the room. Text physically printed on the product ' +
  'may stay as part of the product.'

/**
 * LA SECUENCIA DE ACCIONES DE UNA TOMA, NUMERADA — es el corazón de la emisión nueva.
 *
 * ⚠️ NACE DE UN CONTRAEJEMPLO MEDIDO. El dueño del repo generó desde el wizard de KIE un
 * clip que SÍ ejecuta la coreografía (suelta la gota en la mejilla, la masajea y presenta el
 * frasco) con la forma del spec: **una lista numerada de acciones distintas, sin marcas de
 * tiempo**. Lo que emitía este repo eran seis ventanas de 1,5 s en telegrama, y cinco de las
 * seis eran la misma acción rebanada. Un modelo que no puede distinguir un tramo del
 * siguiente hace un gesto genérico y se queda quieto — que es exactamente lo que salía.
 *
 * La REGLA DE ACCIONES del spec pide la secuencia completa: posición inicial, movimiento,
 * interacción, dirección de manos, manipulación del producto, mirada, expresión y posición
 * final. Eso es, campo por campo, lo que trae un `MotionBeat`, así que el timeline de V2 se
 * REUSA como fuente — sin sus ventanas de tiempo, que es lo único que se descarta.
 *
 * Los beats `micro` se absorben en el evento anterior: el spec quiere acciones que se
 * distingan entre sí, no un muestreo del segundo a segundo.
 *
 * Sin timeline —toda sesión guardada— se cae a partir `accionVisual` por sus separadores,
 * que es el camino de siempre.
 */
function accionesNumeradas(t: Lote['tomas'][number], cap: number | null): string[] {
  const corta = (x: string) => (cap != null && x.length > cap ? `${x.slice(0, cap).trimEnd()}…` : x)
  const limpia = (x: unknown) => String(x ?? '').trim().replace(/^[·;,.\s]+|[;,.\s]+$/g, '')
  const beats = (t.beats ?? []) as MotionBeat[]
  if (beats.length) {
    const grupos: MotionBeat[][] = []
    for (const b of beats) {
      if (!grupos.length || b.importance !== 'micro') grupos.push([b])
      else grupos[grupos.length - 1].push(b)
    }
    // ⚠️ UNA ORACIÓN DESCRIPTIVA POR EVENTO — pedido explícito del dueño del repo, con su
    // ejemplo: *"The avatar gently raises the dropper in her left hand and releases a drop of
    // serum on her left cheek while holding the bottle with her right hand down almost out of
    // frame"*. No `Mano derecha: …`, que es una etiqueta de campo y no una instrucción.
    //
    // Se llegó acá por descarte, y las dos formas anteriores fallaron por lados opuestos:
    // un ítem con cuatro hechos encadenados se ejecuta como un gesto solo, y una línea por
    // casilla da 5×N ítems que el presupuesto recorta a trece caracteres. Una oración por
    // evento, con las dos manos tejidas y la transferencia del producto dentro, tiene el
    // tamaño de los bullets del spec y nombra el instrumento junto a su acción.
    const g = (x: unknown) => {
      const v = limpia(x)
      return v ? v[0].toLowerCase() + v.slice(1) : ''
    }
    return grupos.map((grupo, k) => {
      const a = grupo[0]
      const z = grupo[grupo.length - 1]
      const previo = k ? grupos[k - 1][0] : null
      // ⚠️ LA ORACIÓN VIENE ESCRITA DEL FORENSE. Coserla acá desde cuatro casillas producía
      // una frase que suena a inventario (*"is holding the dropper with her right hand while
      // her left hand is holding bottle in place"*); el prompt que sí se ejecuta al detalle
      // la trae redactada, y ahora el forense la escribe así.
      // ⚠️ EL ESTADO DEL PRODUCTO YA NO SE APENDA, y es el mismo criterio de siempre: la
      // oración tiene que nombrar el instrumento y el destino, o sea YA dice la
      // transferencia. Apendarlo daba *"places a drop of serum on her cheek, and serum on
      // cheek"* — el duplicado que este repo mide una y otra vez. Los estados siguen en el
      // beat porque de ellos salen `objetoEnManoFromMotion` y el validador de la cadena.
      return corta(limpia(a.action))
    }).filter(Boolean)
  }
  return partirEnHechos(t.accionVisual).map(corta)
}

/**
 * Parte la coreografía en HECHOS ATÓMICOS: uno por línea numerada.
 *
 * ⚠️ ES LO QUE FALTABA, y lo cazó el ojo del dueño del repo sobre un render que por lo demás
 * salió bien: *"cuando saca el gotero no llega a aplicar la gota en el rostro CON EL GOTERO,
 * sino que saca el gotero, deja caer la gota en el frasco y la gota aparece en la mejilla"*.
 *
 * La causa no es la lista numerada —eso ya estaba— sino cuánto se mete en cada ítem. El
 * prompt del wizard que SÍ se ejecutó al detalle pone **un hecho por línea**:
 *
 *     Holding gotero in right hand.
 *     Gently releasing one clear drop onto her left cheek.
 *     Product bottle is held below.
 *     Looking at the camera with a confident smile.
 *
 * El nuestro emitía *"Sostiene gotero con mano derecha, lo levanta y muestra la gota; mano
 * izquierda sostiene el frasco. Mirada a cámara."* como UN ítem: cuatro hechos encadenados
 * con comas y punto y coma. El modelo los resuelve como un gesto —mostrar el gotero— y la
 * aplicación de la línea siguiente queda huérfana del instrumento, así que la gota "aparece".
 *
 * Se parte por punto, punto y coma, el separador de fusión (` Luego, `) y los conectores de
 * secuencia (`, luego`, ` y luego`). NO por coma a secas: *"gotero con mano derecha"* y
 * *"mejilla izquierda"* llevan comas que no separan hechos, y partir ahí deja fragmentos sin
 * verbo — que es peor que un ítem largo.
 */
export function partirEnHechos(accion: string): string[] {
  return accion
    .split(TRAMO_SEP).join(' Luego, ')
    // ⚠️ ` y luego ` NO parte, y es un falso positivo medido: *"Mira producto y luego a
    // cámara"* son dos destinos de la MISMA mirada, y partirlo deja "a cámara" sin verbo.
    // `, luego ` sí, que es como el forense encadena dos acciones distintas.
    .split(/\s+Luego,\s+|\s*;\s*|(?<=[a-záéíóúñ)])\.\s+|,\s+luego\s+/i)
    // El `Luego,` de cabeza sobrevive cuando el corte anterior fue por punto.
    .map((x) => x.replace(TRAMO_MARCA, '').replace(/^\s*Luego,\s*/i, '').trim().replace(/^[·,;.\s]+|[,;.\s]+$/g, ''))
    .filter((x) => x.length > 2)
}

/**
 * Recorta la descripción del producto a su parte física.
 *
 * El scan transcribe la etiqueta entera y eso son ~677 caracteres contándole al modelo, en
 * palabras, lo que está viendo en píxeles como `@image(2)`. Es el primer escalón de la
 * escalera por eso: duplica una referencia que ya viaja.
 */
/**
 * El encuadre sin la prosa de más. Se queda con la primera oración, que es donde el forense
 * declara el punto de corte del cuadro; lo que sigue suele ser textura ("con la luz entrando
 * por la izquierda, fondo desenfocado…") que el avatar ya muestra en píxeles.
 */
function camaraCorta(c: string): string {
  const frases = c.split(/(?<=\.)\s+/).filter(Boolean)
  return frases.length <= 1 ? c : frases[0]
}

function productoFisico(desc: string): string {
  const frases = desc.split(/(?<=\.)\s+/).filter(Boolean)
  if (frases.length <= 2) return desc
  return `${frases.slice(0, 2).join(' ')} El resto de la etiqueta se lee de su imagen.`
}

/**
 * LA ESCALERA, de siete escalones a TRES.
 *
 * Con 4.096 caracteres hay menos aire que antes, pero también mucho menos que emitir: la
 * emisión del spec no repite el guion global (la locución del lote ya está una vez), no
 * lleva el detalle atómico por corte (las acciones numeradas lo cubren) y su regla de video
 * limpio ocupa un tercio del párrafo viejo. Lo que se cede sigue siendo, en orden, lo que
 * DUPLICA información que ya viaja por otro lado.
 */
const NIVEL_COMPLETO = 0
/** El escenario en TEXTO contra el escenario en la IMAGEN. Ver la nota en `buildLotePrompt`. */
const NIVEL_SIN_ESCENARIO = 1
/**
 * El ENCUADRE, recortado a su primera oración. Medido sobre 146 lotes reales: `camaraDeLote`
 * llega a **411 caracteres** —el forense a veces escribe un párrafo por corte— y hasta ahora
 * era el único bloque grande del prompt que **no estaba en ningún escalón**, así que su costo
 * se lo terminaba pagando la coreografía en el piso.
 */
const NIVEL_CAMARA_CORTA = 2
/** La etiqueta del producto, que `@image(2)` ya muestra. */
const NIVEL_PRODUCTO_FISICO = 3
/**
 * El bloque de CÓMO SE MUEVE (FASE 4.6) es el ÚLTIMO que se suelta.
 *
 * ⚠️ ESTABA DE SEGUNDO Y ERA EL PEOR LUGAR POSIBLE. El argumento para soltarlo temprano era
 * que no está en el OUTPUT del spec y que la secuencia numerada ya dice lo concreto. Lo que
 * ese argumento no pesaba es el modo de fallo del modelo: **grok se queda ESTÁTICO cuando no
 * se le pide movimiento** (guía de Replicate para este mismo modelo). O sea el síntoma de
 * soltarlo es exactamente el defecto que más se reporta de esta tool —"se queda casi quieto
 * todo el tiempo"— y se estaba fabricando en **26 de 146 lotes (18 %)** medidos.
 *
 * Lo que se suelta antes que él DUPLICA información que las imágenes ya traen (el escenario,
 * el encuadre, la etiqueta); esto no lo dice nadie más.
 */
const NIVEL_SIN_MOVIMIENTO = 4

export function buildLotePrompt(args: {
  lote: Lote
  consistencyBlock: string
  productDesc: string
  camara: string
  voz: VoiceProfile
  /** Escenario e iluminación. El spec los EXIGE por lote (REGLA DE CONTEXTO ABSOLUTO).
   *  ⚠️ Ver la nota de `buildLotePrompt`: está medido que contradice a la imagen. */
  escenario?: string
  /** Cómo se mueve. Null en sesiones anteriores a FASE 4.6: el bloque no se emite. */
  movimiento?: MotionProfile | null
  images: LoteImage[]
  /** Los cortes del forense, para poder decir QUÉ plano va con QUÉ toma. */
  cortes?: { tiempo: string; camara: string }[]
  /** Nicho de la sesión: en ropa/zapatos el producto se LLEVA PUESTO. Ver niches.ts. */
  niche?: unknown
  /** Todos los personajes del anuncio. */
  personajes?: Personaje[]
  /** Quién habla en cada `tiempoOriginal` (ver `hablantesPorTiempo`). */
  quien?: Map<string, Personaje[]>
  /** Qué `tiempoOriginal` son VOZ EN OFF. */
  vozEnOff?: Set<string>
  /** `tiempoOriginal` → índice 1-based de su IMAGEN ANCLA dentro de `images`. */
  anclas?: Map<string, number>
}): string {
  const { lote, consistencyBlock, productDesc, camara, voz, movimiento, images, cortes } = args

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
  const spec = nicheSpec(args.niche)

  /** El plano de cada toma, por `tiempoOriginal` y nunca por `n` (`groupIntoLotes`
   *  renumera después de `splitLongToma`). Se emite cuando CAMBIA. */
  const porTiempo = new Map((cortes ?? []).map((c) => [c.tiempo, c.camara.trim()]))
  const planos = lote.tomas.map((t) => porTiempo.get(t.tiempoOriginal) ?? '')
  const mezclaPlanos = new Set(planos.filter(Boolean)).size >= 2
  const planoPorToma = (i: number) =>
    mezclaPlanos && planos[i] && planos[i] !== planos[i - 1] ? planos[i] : ''

  const legend = images.map((img, i) => `@image(${i + 1}) = ${img.role}`).join(' · ')
  const locucionFinal = lote.tomas.map((t) => t.locucion).filter(Boolean).join(' ')
  const todoEnOff = lote.tomas.length > 0
    && lote.tomas.every((t) => !t.locucion || off.has(t.tiempoOriginal))
    && lote.tomas.some((t) => !!t.locucion)

  const perfilDeVoz = (v: VoiceProfile) =>
    `${v.idioma}, regional variant ${v.varianteRegional}, accent ${v.acento}. Delivery ${v.pronunciacion}. ` +
    `Pace ${v.ritmo}, speed ${v.velocidad}, intonation ${v.entonacion}, energy ${v.energia}, pauses ${v.pausas}. ` +
    `Tone ${v.tono}, timbre ${v.timbre}, vocal age ${v.edadVocal}. Style ${v.estilo}.`

  /** Un personaje: cómo se ve, cómo suena y cómo se mueve, entero y sin referencias. */
  const bloqueDe = (p: Personaje) => [
    `Character ${etiqueta(p)}: ${p.consistencyBlock ?? ''}`,
    p.voiceProfile ? `  Voice of ${etiqueta(p)}: ${perfilDeVoz(p.voiceProfile)}` : '',
    p.motionProfile
      ? `  How they move: ${p.motionProfile.calidadMovimiento} Mannerisms: ${p.motionProfile.manerismos}`
      : '',
  ].filter(Boolean).join('\n')

  const dice = (t: { tiempoOriginal: string }) => {
    if (off.has(t.tiempoOriginal)) return 'VOICE-OVER (nobody speaks on camera)'
    // ⚠️ Solo se atribuye cuando hay VARIOS personajes en el clip. Con uno, `P1 dice:` es
    // ruido: no hay a quién confundirlo. Con dos o más, es lo que impide que el modelo le
    // dé toda la línea a la misma persona.
    const gente = quien.get(t.tiempoOriginal) ?? []
    return varios && gente.length === 1 ? `${etiqueta(gente[0])} says` : 'Spoken line'
  }

  const render = (nivel: number, capAccion: number | null) => {
    const secuencia = lote.tomas.flatMap((t, i) => {
      const plano = planoPorToma(i)
      const ancla = anclas.get(t.tiempoOriginal)
      const acciones = accionesNumeradas(t, capAccion)
      return [
        `Shot ${t.n} — ${r1(t.duracionSeg)} seconds`,
        ancla ? `Starts from @image(${ancla}): same framing and same room.` : '',
        plano ? `Camera: ${plano}` : '',
        ...acciones.map((a, k) => `${k + 1}. ${a}`),
        // ⚠️ Una toma muda tiene que DECLARARSE muda: el silencio por omisión es ambiguo
        // para un modelo que genera audio, y ante una toma sin línea rellena con habla
        // inventada.
        t.locucion
          ? `${dice(t)}: “${t.locucion}”`
          : 'No dialogue: she does NOT speak in this shot. Action and ambient sound only.',
        'Text / Overlay: NONE.',
        '',
      ].filter((x) => x !== '')
    })

    return [
      'Visual Generation Prompt (absolute context):',
      `Vertical 9:16 UGC video, ${r1(lote.duracionSeg)} seconds, shot handheld on a phone with natural micro-shake.`,
      // ⚠️ LA ÚNICA LÍNEA DEL PROMPT QUE HABLA DE IDIOMAS, y no es decorativa: todo el
      // prompt va en inglés y lo entrecomillado es español que hay que decir literal. Sin
      // esto el modelo puede traducir la locución, que es el entregable.
      'Everything below is in English. The quoted lines are Latin American Spanish: speak them EXACTLY as written, never translate them.',
      `References: ${legend}. They define APPEARANCE — person, product, room — they are not shots to reproduce and they do not set the framing.`,
      '',
      // ⚠️ LA COREOGRAFÍA VA ARRIBA, ANTES DEL CONTEXTO. Estaba en el bloque 12 de 13, detrás
      // de ~3.000 caracteres de descripción. La guía de este modelo dice que *"cada fotograma
      // informa al siguiente, y la acción escrita al PRINCIPIO del prompt aparece al principio
      // del clip"*, y el ejemplo oficial de xAI abre con el movimiento de cámara y la entrada
      // del personaje, no con el catálogo de referencias.
      //
      // Lo que NO cambia es el CONTENIDO: los mismos bloques, el mismo texto, la misma regla de
      // contexto absoluto. Solo el orden, que es reversible y no cuesta un carácter.
      'Visual Action Sequence:',
      ...secuencia,
      '',
      // REGLA DE CONTEXTO ABSOLUTO: el generador no recuerda el lote anterior, así que todo
      // se repite entero. Nunca "el mismo personaje" ni "igual que en el Lote 1".
      ...(varios
        ? [`${presentes.length} people appear in this clip.`, ...presentes.map(bloqueDe)]
        : [`Character: ${consistencyBlock}`]),
      '',
      `${spec.productBlock.replace(/:\s*$/, '')}: ${nivel >= NIVEL_PRODUCTO_FISICO ? productoFisico(productDesc) : productDesc}`,
      spec.wornProduct ? '' : 'The product exists inside the scene — in her hands or resting on a surface — never as a floating cut-out or a full-frame product shot.',
      ...(nivel < NIVEL_SIN_ESCENARIO && args.escenario ? [`Setting and lighting: ${limpiarEscenaDeFoto(args.escenario)}`] : []),
      // ⚠️ La línea global de cámara solo cuando el lote NO mezcla planos: con dos, ésta
      // los concatena con ` · ` (ambigua por construcción) y además cada toma ya declara el
      // suyo abajo. Son ~90 caracteres diciendo dos veces algo peor.
      mezclaPlanos ? '' : `Camera: ${nivel >= NIVEL_CAMARA_CORTA ? camaraCorta(camara) : camara}`,
      'Continuity: character, wardrobe, product, room and lighting stay identical throughout the clip. Only the action advances.',
      '',
      ...(varios ? [] : [`Voice and accent profile: ${perfilDeVoz(voz)}`]),
      ...(movimiento && !varios && nivel < NIVEL_SIN_MOVIMIENTO
        ? [`How she moves: ${movimiento.calidadMovimiento} Mannerisms: ${movimiento.manerismos}`]
        : []),
      ...(todoEnOff
        ? ['VOICE-OVER: the narration is HEARD but whoever says it is NOT on camera. No mouth moves and nobody looks at the camera to speak.']
        : []),
      REGLA_VIDEO_LIMPIO,
      '',
      'Final spoken script:',
      locucionFinal ? `“${locucionFinal}”` : 'No dialogue in this lot.',
    ].filter((x) => x !== '').join('\n')
  }

  // ⚠️ EL ORDEN DE ESTA LISTA **ES** LA ESCALERA. Lo que se suelta primero es lo que DUPLICA
  // información que las imágenes ya traen; el movimiento va último porque sin él el modelo se
  // queda quieto. Ver los comentarios de cada NIVEL_*.
  for (const nivel of [NIVEL_COMPLETO, NIVEL_SIN_ESCENARIO, NIVEL_CAMARA_CORTA, NIVEL_PRODUCTO_FISICO, NIVEL_SIN_MOVIMIENTO]) {
    const prompt = render(nivel, null)
    if (prompt.length <= KIE_PROMPT_MAX) return prompt
  }

  // Piso: se busca el cap por acción más grande que entra (búsqueda binaria — el largo
  // total es monótono no-decreciente en el cap).
  let lo = 0
  let hi = 400
  let mejor: string | null = null
  while (lo <= hi) {
    const cap = Math.floor((lo + hi) / 2)
    const prompt = render(NIVEL_SIN_MOVIMIENTO, cap)
    if (prompt.length <= KIE_PROMPT_MAX) { mejor = prompt; lo = cap + 1 } else { hi = cap - 1 }
  }
  if (mejor) return mejor

  const piso = render(NIVEL_SIN_MOVIMIENTO, 0)
  throw new Error(
    `El prompt del Lote ${lote.n} no entra en el tope de KIE (${KIE_PROMPT_MAX} caracteres) ` +
    `ni recortando cada acción al mínimo (${piso.length} caracteres resultantes). ` +
    'El bloque de consistencia o la descripción del producto son demasiado largos por sí ' +
    'solos y hay que acortarlos antes de reintentar — crear la tarea así fallaría y la ' +
    'cuota de KIE ya estaría gastada.',
  )
}
