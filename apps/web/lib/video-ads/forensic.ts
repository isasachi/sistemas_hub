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

/**
 * Quién dice qué dentro de un corte.
 *
 * ⚠️ `dialogo` SIGUE SIENDO EL TEXTO COMPLETO del corte y no cambia de significado: esto
 * es su DESGLOSE, no su reemplazo. `repairCutTiming` mide `dialogo.length` para el
 * cronometraje, `mergeMicroCortes` lo concatena y toda la FASE 2/3 lo copia — hacerlo
 * estructurado habría tocado los ~12 sitios que lo leen como string plano. Sin
 * `hablantes` se lee como siempre: un solo hablante y toda la línea es suya.
 */
export const HablanteSchema = z.object({
  /** Referencia a `ForensicReport.personajes[].id`. Se resuelve con `resolvePersonaje`. */
  personaje: z.string(),
  texto: z.string(),
})

/**
 * ⚠️ QUÉ HAY EN LAS MANOS AL EMPEZAR Y AL TERMINAR EL CORTE.
 *
 * Existe para UNA cosa: decidir en código si dos cortes se pueden fusionar en una sola
 * toma continua. El fallo que evita lo nombró el dueño del repo — *"en un momento tiene
 * un objeto en su mano, al siguiente ya no lo tiene, o se está aplicando un serum con un
 * gotero y el gotero desaparece mágicamente"*. En el original ese salto es un CORTE de
 * montaje y se lee como tal; dentro de un clip continuo es un objeto teletransportándose.
 *
 * Va como CAMPO y no se deduce de `accion` con búsqueda de texto: la continuidad es una
 * comparación exacta entre dos estados, y adivinarla leyendo prosa es justo la clase de
 * heurística que este repo ya pagó cara. Manos vacías se escribe "nada".
 *
 * Opcional: el forense es el paso CARO, así que toda sesión guardada lo trae ausente y
 * sin él la fusión agresiva simplemente no ocurre (fail-closed).
 */
export const ObjetoEnManoSchema = z.object({
  inicio: z.string().catch(''),
  fin: z.string().catch(''),
  /**
   * ⚠️ EL ESTADO POR MANO Y EN ORDEN — un `{inicio, fin}` no alcanza, y está medido.
   *
   * El dueño del repo lo describió con el caso exacto: *"la mujer tiene el producto en la
   * mano izquierda y mueve la mano derecha para destaparlo y aplicárselo, luego lo tapa,
   * sigue sosteniendo el producto con la mano izquierda"*. Con un solo string para las dos
   * manos y solo dos instantes, eso se aplasta a `frasco → frasco`: se pierde que la
   * izquierda no suelta nunca, que la derecha hace tres cosas distintas, y sobre todo que
   * **la tapa sale y vuelve**. De ahí el fallo que reportó: *"en el lote 1 la tapa
   * reaparece mágicamente en el frasco"*.
   *
   * `izquierda` y `derecha` son la secuencia de esa mano dentro del corte. `accesorios` es
   * el estado de las piezas que se separan del producto —tapa, gotero, cuchara— que es la
   * clase de objeto que desaparece sin que nadie lo note.
   *
   * ⚠️ SON `.catch('')`, y cada palabra de eso se pagó con una corrida. Nacieron opcionales por el motivo correcto (ninguna sesión
   * guardada los trae y un `.nullable()` a secas reventaría su `parse`), pero un campo
   * opcional SALE del `required` del JSON Schema y **lo que no se le exige, el modelo lo
   * omite en silencio**. Medido en la primera sesión analizada con el schema: `izquierda`
   * y `derecha` volvieron en **0 de 4 cortes** — y no por falta de información, porque la
   * misma `accion` decía *"Sujeta frasco con izquierda, saca gotero con derecha"*. El dato
   * estaba; el campo no se llenaba.
   *
   * ⚠️ Y NO `.nullable().catch(null)`, QUE FUE EL INTENTO ANTERIOR: eso emite
   * `{"default": null, "anyOf": [{"type":"string"},{"type":"null"}]}`, o sea le dice al
   * modelo que `null` es un valor legal Y que es el default. Medido: con esa forma, los
   * objetos volvieron 6/6 pero `izquierda`, `derecha`, `accesorios` y `posicion` salieron
   * **null en los 6 cortes** — el modelo tomó la salida que el schema le ofrecía.
   *
   * `.catch('')` emite `{"default": "", "type": "string"}`: sigue en el `required`, sigue
   * siendo infalible (un `{}` parsea a cadena vacía, y una basura también), y **no hay
   * ningún null donde escaparse**. La cadena vacía es falsy, así que todo el código que
   * ya preguntaba `if (!x)` se comporta igual.
   */
  accesorios: z.string().catch(''),
})

/**
 * ⚠️ EL DETALLE ATÓMICO — lo que se nota sin poder nombrarlo.
 *
 * `accion` es la coreografía: qué hace el cuerpo, en orden. Esto es la capa de abajo, la
 * que separa un video que "se parece" de uno que ES el mismo: el balanceo del cuerpo, el
 * vaivén de las manos, cuánto se abre la boca al hablar, si el pelo se mueve o está
 * quieto, si algo se mueve en el fondo. Pedido explícito del dueño del repo (2026-08-25).
 *
 * ⚠️ SON CINCO CAMPOS Y NO UNO, por el mismo motivo que `calidadMovimiento` y
 * `manerismos` no se pudieron colapsar: con un solo campo el modelo cubre un eje y se
 * olvida de los otros cuatro. Cinco casillas fuerzan cinco observaciones.
 *
 * ⚠️ Y SE ESCRIBEN EN TELEGRAMA, sin artículos ni verbos de relleno. No es estilo: el
 * prompt del render topa en 5000 caracteres y este es el bloque que más crece con el
 * número de tomas. *"mano derecha sube al mentón, dedos índice y medio extendidos"* dice
 * lo mismo que *"La modelo sube su mano derecha hasta la altura del mentón, con los dedos
 * índice y medio extendidos"* en la mitad del espacio.
 *
 * ⚠️ LA QUIETUD ES UNA OBSERVACIÓN, NO UN CAMPO VACÍO. Un cuerpo que casi no se mueve es
 * un dato tan renderizable como uno que se mueve mucho, y omitirlo hace que el generador
 * invente movimiento. "torso casi inmóvil, solo respiración" es una respuesta correcta.
 */
export const MicroSchema = z.object({
  /** Balanceo, peso, torsión, respiración. La rigidez SE DECLARA. */
  cuerpo: z.string().catch(''),
  /**
   * ⚠️ EL EJE POR MANO VIVE ACÁ, Y NO EN CAMPOS PROPIOS. Hubo `objetoEnMano.izquierda` y
   * `.derecha` durante tres corridas y volvieron VACÍOS las tres, mientras esta casilla
   * devolvía espontáneamente *"derecha aplica gota, izquierda sostiene frasco"*. El modelo
   * no se negaba: ya había contestado la pregunta y no la repetía en otro campo.
   *
   * La lección general —y es la que hay que recordar antes de agregar el próximo campo—
   * es que **un campo que solapa con otro que el modelo ya llenó vuelve vacío**. Se
   * arregla borrando el duplicado, no insistiendo en el schema.
   *
   * Vaivén, qué mano hace qué y en qué orden, y qué hacen cuando no hacen nada.
   */
  manos: z.string().catch(''),
  /** Cejas, párpados, mirada, y cuánto se articula la boca al hablar. */
  rostro: z.string().catch(''),
  /** Si se mueve con la cabeza, si cae sobre la cara, si está fijo. */
  cabello: z.string().catch(''),
  /** Qué se mueve DETRÁS: cortinas, ropa, reflejos, gente, nada. */
  entorno: z.string().catch(''),
})

export const CorteSchema = z.object({
  n: z.number(),
  tiempo: z.string(),          // "00:00 - 00:03"
  duracionSeg: z.number(),
  accion: z.string(),          // qué sucede, literal
  camara: z.string(),          // plano, posición, movimiento, zoom
  dialogo: z.string(),         // texto hablado en este corte, COMPLETO
  hablantes: z.array(HablanteSchema).optional(), // su desglose por persona
  /**
   * ⚠️ VOZ EN OFF: se oye la narración pero QUIEN HABLA NO ESTÁ EN CUADRO.
   *
   * Todo el pipeline nació asumiendo un protagonista visible que habla a cámara —
   * el bloque de consistencia, el avatar como primer fotograma, el perfil de
   * movimiento. Pero un formato entero de UGC es voz en off sobre b-roll: medido con
   * un anuncio real de calzado, 62 s de narración completa sobre planos de pies y de
   * manos, sin que la cara aparezca ni una vez.
   *
   * Sin este campo el render pone a un avatar a hacer lip-sync de esa narración, que
   * es exactamente lo que el original NO hace. Opcional: ausente o false significa
   * "habla a cámara", que es el comportamiento de siempre.
   */
  vozEnOff: z.boolean().optional(),
  textoOverlay: z.string(),    // "No aparece" si no hay
  transicion: z.string(),      // jump cut / corte directo / continuidad / zoom digital
  /** Ver `ObjetoEnManoSchema` y la nota de `micro`: requerido, e infalible por dentro. */
  objetoEnMano: ObjetoEnManoSchema.nullable().catch(null),
  /** Ver `MicroSchema`: el detalle atómico del movimiento. */
  /**
   * ⚠️ DOS COSAS A LA VEZ, Y HACEN FALTA LAS DOS. Se aprendieron una por corrida:
   *
   * 1. **El `.catch(null)` va en cada CASILLA, nunca solo en el objeto.** Puesto sobre
   *    `micro` a secas, cualquier casilla omitida hacía fallar el parse del objeto y el
   *    catch devolvía `null`: se perdían las SEIS. Medido — el modelo llenó `objetoEnMano`
   *    5/5 y `micro` volvió null en los 5 cortes, tirando en silencio el detalle que SÍ
   *    había producido.
   * 2. **Y el objeto tiene que seguir siendo REQUERIDO.** Al arreglar (1) se lo pasó a
   *    `.optional()`, y en la corrida siguiente el modelo omitió `micro` Y `objetoEnMano`
   *    ENTEROS: 0/5 en los dos, con las claves ausentes del JSON. Lo que no se le exige, no
   *    lo manda — la misma lección, un nivel más arriba.
   *
   * Se pueden tener las dos porque con el `.catch` por casilla el parse del objeto es
   * INFALIBLE (`MicroSchema.safeParse({})` devuelve éxito con todo en null), así que el
   * `.catch` de acá afuera no puede destruir nada: solo existe para que el campo entre en
   * el `required` sin romper las sesiones guardadas. Hay un test que fija esa infalibilidad
   * — si alguien devuelve una casilla a `z.string()` a secas, vuelve el bug de (1).
   */
  micro: MicroSchema.nullable().catch(null),
})

/** Una persona con voz propia en el video de referencia. */
export const PersonajeForenseSchema = z.object({
  id: z.string(),           // 'P1', 'P2'… estable; es lo que referencia `hablantes`
  rol: z.string(),          // 'hijo', 'padre' — cómo lo nombra el anuncio
  descripcion: z.string(),  // edad aparente, cabello, complexión…
  vestuario: z.string(),
})
export type Corte = z.infer<typeof CorteSchema>
export type Micro = z.infer<typeof MicroSchema>
export type ObjetoEnMano = z.infer<typeof ObjetoEnManoSchema>

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
  /** Las personas con voz propia. Opcional: las sesiones anteriores no la tienen y se
   *  leen como un solo personaje (ver `personajesDe`, personajes.ts). */
  personajes: z.array(PersonajeForenseSchema).optional(),
  cortes: z.array(CorteSchema).min(1),
  tomas: z.array(TomaSchema).min(1),
  edicion: EdicionSchema,
  resumenParaUsuario: z.string(),
})
export type ForensicReport = z.infer<typeof ForensicReportSchema>

/**
 * Techo físico de velocidad de habla, en caracteres por segundo.
 *
 * El español conversacional va entre 14 y 17 cps; una lectura UGC rápida llega a ~20.
 * Por encima de eso no es que suene apurado: no se puede pronunciar. El número está acá
 * arriba y no enterrado en la fórmula justamente para que se pueda discutir — si algún
 * día se analizan videos en otro idioma o con locución acelerada, este es el valor a
 * mover, no la lógica.
 *
 * A propósito NO se deriva del propio video (`caracteres / duración total`): ese
 * promedio ya viene contaminado por los cortes mal medidos que esto existe para
 * reparar, así que un video con varios errores se calibraría contra sus propios
 * errores. En la sesión que motivó esto el promedio daba 16.9 cps y un techo relativo
 * de 1.4× habría dejado el corte roto en 24 cps: la reparación se ejecutaría, reportaría
 * éxito y no arreglaría nada.
 */
export const CPS_MAX = 20

/**
 * Piso de caracteres por segundo, para el otro lado del mismo problema.
 *
 * ⚠️ MEDIDO: una locución demasiado corta para su clip hace que Veo la REPITA para
 * rellenar el audio. En la sesión `02fa1205` el lote 2 tenía 23 caracteres en 6 s
 * (3,8 car/s) y el video salió diciendo *"Y es nuestro mural y es nuestro top mural"* —
 * la frase dos veces. Ese mismo lote fue además el que falló con "unable to generate
 * audio" en el primer intento, así que la escasez de texto también le cuesta al modelo.
 *
 * 9 es permisivo a propósito: el español conversacional va a 14–17, así que esto no
 * pelea con la variación normal, solo ataca el caso patológico.
 */
export const CPS_MIN = 9

/**
 * Piso de duración de una TOMA, en segundos.
 *
 * Ya NO es un número discutible: 4 es `MIN_DURATION` de Veo 3.1, la duración más corta
 * que el modelo acepta. Una toma más corta que eso no se puede renderizar tal cual —
 * `snapDuration` la subiría a 4 s igual, o sea el clip duraría más que la toma y el
 * anuncio se alargaría solo. Fusionar antes es lo que evita esa inflación.
 *
 * Con grok esto era 3 y sí era discutible (su piso era 1 s, y un clip de 1 s renderiza
 * una pose congelada, no una acción). El argumento de costo sigue valiendo igual: cada
 * corte es una llamada PAGADA y la frontera de plano abre un lote por encuadre, así que
 * un montaje de micro-cortes multiplica el costo por la granularidad del original.
 */
export const MIN_TOMA_SEG = 4

/**
 * ¿Este corte muestra a la PERSONA, o solo al producto?
 *
 * Es la única distinción que la fusión necesita conocer, y viene de un fallo medido: el
 * lote 1 de la sesión de ropa `430c5961` encadenó cuatro cortes con "Luego," e incluía
 * un **flat-lay** —la blusa extendida sobre el suelo, sin nadie— entre dos planos de la
 * modelo. El render lo reprodujo con fidelidad: tres sub-tomas con fondos distintos
 * (pared, baldosas, sala con sofá) dentro de un mismo clip que el bloque `CONTINUIDAD`
 * declaraba invariante. El modelo hizo lo que se le pidió; lo que estaba mal era pedirle
 * un montaje dentro de un plano continuo.
 *
 * Un plano de producto y uno de persona no se pueden encadenar sin un corte, así que la
 * fusión no los mezcla: cada clase se fusiona con la suya.
 *
 * ponytail: detección por palabras, no por LLM. Un falso negativo (no reconocer a la
 * persona) solo hace que ese corte no se fusione —o sea el comportamiento anterior a la
 * fusión, que es seguro—, así que la lista puede quedarse corta sin romper nada. Un
 * clasificador que hay que pagar y que puede alucinar sería peor en las dos puntas.
 */
/**
 * ⚠️ LA MISMA PREGUNTA, PERO PREGUNTÁNDOLE AL CAMPO QUE LA DECLARA.
 *
 * `muestraPersona` busca un sustantivo ("mujer", "modelo", "persona") dentro de la prosa
 * de `accion`, y eso se rompió el día que el forense empezó a escribir en telegrama: la
 * acción pasó a ser *"Sujeta pipeta con mano derecha, aplica producto en mejilla, mira a
 * cámara"* — sin sujeto, porque el sujeto es obvio. Medido sobre una sesión real recién
 * analizada: los TRES cortes daban `false` siendo los tres planos de persona hablando a
 * cámara.
 *
 * El fallo es silencioso y caro: esta clasificación es lo que impide que un flat-lay se
 * fusione con un plano de persona (`mergeMicroCortes`, `puedenUnirse`) y lo que decide si
 * una imagen ancla lleva cara (`anchors.ts`). Con todo clasificado igual, el guard deja
 * de guardar.
 *
 * `micro` lo resuelve porque el prompt le exige DECLARARLO: en un plano sin persona,
 * `cuerpo`, `rostro` y `cabello` dicen "no aparece". Eso es una declaración explícita, no
 * una inferencia sobre prosa — el mismo reparto de "el modelo observa, el código decide"
 * que este repo ya usa para la polaridad de landing.
 *
 * Sin `micro` (toda sesión analizada antes de que el campo existiera) se cae al
 * heurístico de siempre, así que ninguna sesión guardada cambia de comportamiento.
 */
export function corteMuestraPersona(c: { accion: string; micro?: Micro | null }): boolean {
  if (!c.micro) return muestraPersona(c.accion)
  const ausente = (x: string) => !x || /^\s*no aparece\s*\.?\s*$/i.test(x)
  // Basta con que UNA de las tres partes del cuerpo esté descrita: un plano de manos
  // sigue siendo un plano de persona a efectos de continuidad y de fotograma.
  return !(ausente(c.micro.cuerpo) && ausente(c.micro.rostro) && ausente(c.micro.cabello))
}

export function muestraPersona(accion: string): boolean {
  // Defensivo: los cortes vienen de un jsonb guardado y `accion` puede faltar. Sin
  // acción no hay evidencia de persona, y el fail-safe correcto es `false` (no fusionar,
  // no compartir fotograma) — nunca reventar el render entero.
  if (!accion) return false
  const t = accion
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  // ⚠️ LA NEGACIÓN PRIMERO. Medido con el anuncio de calzado: el forense describe un
  // plano de producto como "Detalle del zapato, SIN PERSONA en cuadro" y la búsqueda por
  // palabra lo leía como plano de persona — o sea justo al revés. Un flat-lay clasificado
  // como persona se fusiona con planos de persona y comparte fotograma con ellos, que es
  // el fallo que `muestraPersona` existe para evitar.
  // El hueco tolera artículos y preposiciones: "no se ve A LA modelo", "sin NINGUNA persona".
  if (/\b(sin|no hay|no aparece|no se ve|no se observa)\s+(a\s+)?(la|el|una|un|ninguna|ningun)?\s*(persona|personas|gente|modelo|nadie)\b/.test(t)) return false
  return /\b(mujer|hombre|chica|chico|muchacha|muchacho|modelo|persona|sujeto|joven|senor|senora|ella|el sujeto|protagonista)\b/.test(t)
}

/**
 * El detalle atómico de dos cortes que se vuelven uno. Se CONCATENA en vez de quedarse
 * con el del corte dominante: la toma fusionada dura lo que duran los dos, así que
 * describir solo la mitad deja al generador inventando la otra — el mismo argumento por
 * el que `accion` también se concatena.
 */
/** Dos cortes que se vuelven uno: la secuencia de cada mano se ENCADENA, igual que la
 *  acción. Quedarse con la del corte dominante perdería la mitad del recorrido. */
function unirManos(a: ObjetoEnMano, b: ObjetoEnMano): ObjetoEnMano {
  const enc = (x: string, y: string) => {
    const [i, j] = [x.trim(), y.trim()]
    if (!i || !j) return i || j
    return i === j ? i : `${i} → ${j}`
  }
  return {
    inicio: a.inicio,
    fin: b.fin,
    accesorios: enc(a.accesorios, b.accesorios),
  }
}

function unirMicro(a?: Micro | null, b?: Micro | null): Micro | null {
  if (!a || !b) return a ?? b ?? null
  const par = (x: string, y: string) => {
    const [i, j] = [x.trim(), y.trim()]
    if (!i) return j
    if (!j || i === j) return i
    return `${i}; después ${j}`
  }
  return {
    cuerpo: par(a.cuerpo, b.cuerpo),
    manos: par(a.manos, b.manos),
    rostro: par(a.rostro, b.rostro),
    cabello: par(a.cabello, b.cabello),
    entorno: par(a.entorno, b.entorno),
  }
}

/** Normaliza para comparar dos estados de mano o dos planos: el modelo escribe "El
 *  frasco" en un corte y "frasco" en el siguiente, y eso es el MISMO objeto. Mismo
 *  criterio que `resolveSlotId` y `resolvePersonaje`. */
const normObj = (x: string) =>
  x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^(el|la|los|las|un|una|unos|unas)\s+/, '')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

/**
 * ¿Se pueden unir estos dos cortes en UNA sola toma continua?
 * ---------------------------------------------------------------------------
 * Todo lo de acá es una comparación, no un criterio: es la "matemática" que pidió el
 * dueño del repo para decidirlo con precisión en vez de a ojo.
 *
 * Las cuatro condiciones, y por qué cada una:
 *
 *  1. MISMA CLASE (`muestraPersona`). Un plano de producto y uno de persona no se
 *     encadenan sin un corte de montaje. Ya lo exigía `mergeMicroCortes`.
 *  2. MISMO ENCUADRE. Si los planos son distintos, la toma "continua" resultante
 *     necesitaría un corte adentro — que es exactamente lo que estamos evitando. Con
 *     encuadres distintos la fusión sigue siendo posible por micro-corte (ahí se
 *     sacrifica el encuadre del más corto a propósito), pero no por esta vía.
 *  3. CONTINUIDAD DE PROPS: lo que hay en las manos al terminar el primero tiene que ser
 *     lo mismo que hay al empezar el segundo. ⚠️ ES LA CONDICIÓN QUE JUSTIFICA TODO
 *     ESTO. Sin ella se produce el fallo que el dueño del repo describió: *"se está
 *     aplicando un serum con un gotero y el gotero desaparece mágicamente"*. En el
 *     original ese salto es un corte de montaje y se lee como tal; dentro de un clip
 *     continuo es un objeto teletransportándose.
 *  4. VOZ EN OFF IGUAL. Unir un tramo narrado en off con uno hablado a cámara obliga a
 *     una boca a empezar a moverse a mitad de plano.
 *
 * ⚠️ FAIL-CLOSED: sin `objetoEnMano` en los dos cortes no se fusiona. Toda sesión
 * analizada antes de que el campo existiera cae acá, y su comportamiento es el de
 * siempre — que es lo correcto: no tenemos con qué probar la continuidad, y la fusión
 * equivocada es más cara que la fusión que no ocurre.
 */
export function puedenUnirse(a: Corte, b: Corte): boolean {
  if (corteMuestraPersona(a) !== corteMuestraPersona(b)) return false
  if (normObj(a.camara) !== normObj(b.camara)) return false
  if (!!a.vozEnOff !== !!b.vozEnOff) return false
  if (!a.objetoEnMano?.fin || !b.objetoEnMano?.inicio) return false
  if (normObj(a.objetoEnMano.fin) !== normObj(b.objetoEnMano.inicio)) return false
  // ⚠️ Y los ACCESORIOS: la tapa que sale y vuelve es lo que hace que un objeto
  // reaparezca en el aire dentro de un clip continuo. Si el corte declara en qué estado
  // termina y el siguiente en cuál empieza, tienen que coincidir; si no lo declaran, no
  // bloquea (fail-open acá a propósito: `fin`/`inicio` ya cubren el caso grueso).
  const finAcc = ultimoTramo(a.objetoEnMano.accesorios)
  const iniAcc = primerTramo(b.objetoEnMano.accesorios)
  if (finAcc && iniAcc && finAcc !== iniAcc) return false
  return true
}

/** El último y el primer estado de una secuencia "a → b → c" (o "a, luego b"). */
const tramos = (x?: string) =>
  (x ?? '').split(/→|->|,\s*(?:luego|despu[eé]s)\s*|;/).map((t) => normObj(t)).filter(Boolean)
const ultimoTramo = (x?: string) => tramos(x).at(-1) ?? ''
const primerTramo = (x?: string) => tramos(x)[0] ?? ''

/**
 * Une cortes CONSECUTIVOS en tomas largas mientras la continuidad lo permita.
 * ---------------------------------------------------------------------------
 * Pedido del dueño del repo (2026-08-25): *"combinar varios cuts para crear una sola
 * toma larga y ahorrar tokens, sin que los cortes se vean forzados o raros"*.
 *
 * El ahorro es concreto y es de PRESUPUESTO DE PROMPT, no de dinero: cada toma cuesta su
 * cabecera (`### Shot N — Xs`), su línea de cámara y su bloque `micro` dentro de un
 * prompt topado en 5000 caracteres. Cuatro cortes que son la misma toma con el mismo
 * plano y el mismo objeto en la mano gastan cuatro veces eso para decir una sola cosa —
 * y lo que se come es justo la coreografía que este cambio existe para poder mandar.
 *
 * ⚠️ NO ES `mergeMicroCortes` CON OTRO NOMBRE, y las dos tienen que existir:
 *   - `mergeMicroCortes` arregla cortes DEMASIADO CORTOS para renderizar (1 s), y para
 *     lograrlo SACRIFICA el encuadre del más corto. Es una concesión.
 *   - Esta une cortes que YA SON la misma toma. No sacrifica nada: mismo plano, misma
 *     clase, mismo objeto en la mano. Si algo de eso no cuadra, no une.
 *
 * ⚠️ CONVERGE ADENTRO, y eso es lo que la hace idempotente. Unir A+B puede habilitar
 * AB+C, así que una sola pasada no es un punto fijo — y dos listas de cortes distintas
 * para el mismo contenido son dos `scriptFingerprint` distintas, que es el bug de dinero
 * que este repo ya documenta. Al salir, ningún par consecutivo cumple `puedenUnirse`
 * dentro del cap, así que una segunda llamada devuelve el MISMO objeto.
 *
 * Los topes llegan por parámetro y no importados de `lotes.ts`: ese módulo importa a
 * éste (`CPS_MAX`) y al revés sería un ciclo.
 */
export function unirTomasContinuas(
  report: ForensicReport,
  maxSeg: number,
  maxChars: number,
): { report: ForensicReport; fusiones: Fusion[] } {
  const cortes = report.cortes ?? []
  if (cortes.length < 2) return { report, fusiones: [] }

  let actual = cortes.map((c) => ({ ...c }))
  const origen = new Map<string, number>(actual.map((c) => [c.tiempo, 1]))
  let hubo = false

  // Hasta converger: se recorre de izquierda a derecha uniendo el primer par elegible y
  // se vuelve a empezar. Determinista, que es lo que la huella necesita.
  for (let cambio = true; cambio; ) {
    cambio = false
    for (let i = 0; i + 1 < actual.length; i++) {
      const a = actual[i]
      const b = actual[i + 1]
      if (!puedenUnirse(a, b)) continue
      // El cap manda: unir por encima de él solo obliga a `splitLongToma` a volver a
      // partir la toma más adelante, y ahí el reparto lo decide la duración y no la
      // continuidad — o sea se perdería justo lo que esta función acaba de proteger.
      if (a.duracionSeg + b.duracionSeg > maxSeg) continue
      if (a.dialogo.length + b.dialogo.length > maxChars) continue

      const tiempo = `${a.tiempo.split('-')[0]?.trim() ?? a.tiempo} - ${b.tiempo.split('-').slice(1).join('-').trim() || b.tiempo}`
      const unido: Corte = {
        ...a,
        tiempo,
        duracionSeg: a.duracionSeg + b.duracionSeg,
        accion: [a.accion, b.accion].map((x) => x.trim()).filter(Boolean).join(' Luego, '),
        dialogo: [a.dialogo, b.dialogo].map((x) => x.trim()).filter(Boolean).join(' '),
        hablantes: [...(a.hablantes ?? []), ...(b.hablantes ?? [])].length
          ? [...(a.hablantes ?? []), ...(b.hablantes ?? [])]
          : undefined,
        textoOverlay: [a.textoOverlay, b.textoOverlay].find((x) => x && x !== 'No aparece') ?? a.textoOverlay,
        objetoEnMano: unirManos(a.objetoEnMano!, b.objetoEnMano!),
        micro: unirMicro(a.micro, b.micro),
      }
      origen.set(tiempo, (origen.get(a.tiempo) ?? 1) + (origen.get(b.tiempo) ?? 1))
      actual = [...actual.slice(0, i), unido, ...actual.slice(i + 2)]
      cambio = true
      hubo = true
      break
    }
  }

  if (!hubo) return { report, fusiones: [] }

  actual = actual.map((c, k) => ({ ...c, n: k + 1 }))
  const fusiones: Fusion[] = actual
    .filter((c) => (origen.get(c.tiempo) ?? 1) > 1)
    .map((c) => ({ tiempo: c.tiempo, deCortes: origen.get(c.tiempo) ?? 1, duracionSeg: c.duracionSeg }))

  // `tomas` empareja 1-a-1 con `cortes`: mismo motivo y misma reconstrucción que en
  // `mergeMicroCortes` — dejarla apuntando a la lista vieja desincroniza el guión.
  const tomas = actual.map((c, k) => {
    const previa = report.tomas?.[k]
    return {
      n: k + 1,
      encuadre: previa?.encuadre ?? c.camara,
      posicion: previa?.posicion ?? '',
      accionFisica: c.accion,
      objeto: previa?.objeto ?? '',
      dialogo: c.dialogo,
      duracionSeg: c.duracionSeg,
    }
  })

  return { report: { ...report, cortes: actual, tomas }, fusiones }
}

/** Un corte que se fusionó con su vecino, para poder mostrar qué se juntó. */
export interface Fusion {
  tiempo: string
  deCortes: number
  duracionSeg: number
}

/**
 * Fusiona los micro-cortes con su vecino hasta que toda toma llegue al piso.
 * ---------------------------------------------------------------------------
 * Nace del UGC de ropa: 29 cortes en 28 s, ~1 s cada uno, y 9 encuadres que se
 * alternan sin repetirse dos veces seguidas. Con la frontera de plano eso da 24 lotes
 * de un segundo — 12× el costo del video de suero, y clips que el modelo no puede
 * llenar con nada.
 *
 * ⚠️ ESTO NO ES `maxPlanos`, Y LA DIFERENCIA ES LA HONESTIDAD DEL PROMPT. Con
 * `maxPlanos > 1` un clip recibe dos encuadres y el generador renderiza uno solo: el
 * otro se pierde en silencio. Acá los dos cortes se vuelven UNA toma con UN encuadre
 * declarado y la acción de ambos encadenada — el prompt describe algo que el modelo sí
 * puede hacer, y lo que se descarta (el encuadre del corte más corto) queda registrado
 * en `Fusion` en vez de desaparecer.
 *
 * Reglas, todas deliberadas:
 *  - Se fusiona el corte MÁS CORTO del video, no de izquierda a derecha: así se
 *    sacrifica primero lo que menos contenido tiene, y el resultado no depende de por
 *    dónde se empezó a recorrer.
 *  - Se lo absorbe el vecino MÁS CORTO de los dos (el anterior o el siguiente), para
 *    que el video no termine con una toma gigante y varias en el piso.
 *  - El encuadre y la transición que sobreviven son los del corte MÁS LARGO de los dos:
 *    es el que aporta más segundos de imagen.
 *  - El diálogo y la acción se CONCATENAN — nada de texto se pierde, que es lo que
 *    permite que el ritmo (caracteres por segundo) no se altere: suma texto y suma
 *    duración en la misma proporción.
 *  - `tiempo` abarca de un extremo al otro. Es la clave con la que `camaraDeLote`
 *    empareja y la que entra en `scriptFingerprint`, así que tiene que ser única y
 *    estable; el formato "MM:SS - MM:SS" se conserva tomando el inicio del primero y
 *    el final del último.
 *
 * Es idempotente: al salir todo corte cumple el piso, así que una segunda pasada no
 * encuentra nada que fusionar y devuelve el MISMO objeto.
 */
export function mergeMicroCortes(
  report: ForensicReport,
  minSeg = MIN_TOMA_SEG,
  /**
   * ⚠️ TOPE: la fusión no puede fabricar una toma que el reparto tenga que volver a
   * partir. `MIN_TOMA_SEG` se calibró contra un cap de clip de 30 s; con 15 s, fusionar
   * tres cortes en una toma de 17,4 s es pura pérdida — `splitLongToma` la vuelve a
   * cortar enseguida, y en el camino ya se descartó el encuadre de los cortes absorbidos.
   * Medido en la sesión que lo destapó: exactamente ese caso.
   *
   * `Infinity` por defecto para no cambiar el comportamiento de ningún caller existente.
   */
  maxSeg = Infinity,
): { report: ForensicReport; fusiones: Fusion[] } {
  const cortes = report.cortes ?? []
  // Con un solo corte no hay vecino: un video sin cortes se queda como está.
  if (cortes.length < 2 || !cortes.some((c) => c.duracionSeg < minSeg))
    return { report, fusiones: [] }

  // `origen` cuenta de cuántos cortes originales viene cada tramo, para poder reportarlo.
  let actual = cortes.map((c) => ({ ...c }))
  const origen = new Map<string, number>(actual.map((c) => [c.tiempo, 1]))

  const unirTiempo = (a: string, b: string) => {
    const ini = a.split('-')[0]?.trim() ?? a
    const fin = b.split('-').slice(1).join('-').trim() || b
    return `${ini} - ${fin}`
  }

  // Un corte solo puede fusionarse con un vecino de SU MISMA CLASE (ver `muestraPersona`):
  // encadenar un plano de producto con uno de persona obliga a un corte dentro del clip.
  const clase = (k: number) => corteMuestraPersona(actual[k])
  const compatible = (k: number, v: number) =>
    v >= 0 && v < actual.length && clase(k) === clase(v)
  const cabe = (k: number, v: number) =>
    compatible(k, v) && actual[k].duracionSeg + actual[v].duracionSeg <= maxSeg

  while (actual.length > 1) {
    // El corte más corto que todavía no llega al piso Y TIENE con quién fusionarse. Un
    // flat-lay rodeado de planos de persona se queda solo y corto: es lo correcto — es
    // una toma distinta, y meterla dentro de otra corrompe las dos.
    let i = -1
    for (let k = 0; k < actual.length; k++) {
      if (actual[k].duracionSeg >= minSeg) continue
      if (!compatible(k, k - 1) && !compatible(k, k + 1)) continue
      // Un vecino con el que la suma se pasaría del tope no cuenta como vecino.
      if (!cabe(k, k - 1) && !cabe(k, k + 1)) continue
      if (i < 0 || actual[k].duracionSeg < actual[i].duracionSeg) i = k
    }
    if (i < 0) break

    // Vecino más corto de los COMPATIBLES.
    const izq = cabe(i, i - 1) ? actual[i - 1] : null
    const der = cabe(i, i + 1) ? actual[i + 1] : null
    const usarIzq = izq && (!der || izq.duracionSeg <= der.duracionSeg)
    const j = usarIzq ? i - 1 : i + 1
    const [a, b] = i < j ? [actual[i], actual[j]] : [actual[j], actual[i]]

    // El más largo aporta encuadre y transición: es el que pone más segundos de imagen.
    const dominante = a.duracionSeg >= b.duracionSeg ? a : b
    const tiempo = unirTiempo(a.tiempo, b.tiempo)
    const fundido = {
      ...dominante,
      n: a.n,
      tiempo,
      duracionSeg: a.duracionSeg + b.duracionSeg,
      accion: [a.accion, b.accion].map((x) => x.trim()).filter(Boolean).join(' Luego, '),
      dialogo: [a.dialogo, b.dialogo].map((x) => x.trim()).filter(Boolean).join(' '),
      // Los hablantes se concatenan en el mismo orden que el diálogo: si no, el desglose
      // dejaría de reproducir el texto y `verificarHablantes` lo descartaría entero.
      hablantes: [...(a.hablantes ?? []), ...(b.hablantes ?? [])].length
        ? [...(a.hablantes ?? []), ...(b.hablantes ?? [])]
        : undefined,
      textoOverlay: [a.textoOverlay, b.textoOverlay].find((x) => x && x !== 'No aparece') ?? a.textoOverlay,
      // La toma resultante empieza donde empezaba la primera y termina donde terminaba
      // la segunda. Sin esto la continuidad de props se perdería justo al fusionar.
      objetoEnMano: a.objetoEnMano && b.objetoEnMano
        ? unirManos(a.objetoEnMano, b.objetoEnMano)
        : a.objetoEnMano ?? b.objetoEnMano ?? null,
      micro: unirMicro(a.micro, b.micro),
    }
    origen.set(tiempo, (origen.get(a.tiempo) ?? 1) + (origen.get(b.tiempo) ?? 1))
    const lo = Math.min(i, j)
    actual = [...actual.slice(0, lo), fundido, ...actual.slice(lo + 2)]
  }

  // Renumerar: `n` tiene que seguir siendo 1..N consecutivo.
  actual = actual.map((c, k) => ({ ...c, n: k + 1 }))

  const fusiones: Fusion[] = actual
    .filter((c) => (origen.get(c.tiempo) ?? 1) > 1)
    .map((c) => ({ tiempo: c.tiempo, deCortes: origen.get(c.tiempo) ?? 1, duracionSeg: c.duracionSeg }))

  // `tomas` empareja 1-a-1 con `cortes` (el prompt lo exige y `resyncTomaDurations`
  // depende de eso), así que se reconstruye desde los cortes fusionados en vez de
  // dejarla apuntando a una lista que ya no existe.
  const tomas = actual.map((c, k) => {
    const previa = report.tomas?.[k]
    return {
      n: k + 1,
      encuadre: previa?.encuadre ?? c.camara,
      posicion: previa?.posicion ?? '',
      accionFisica: c.accion,
      objeto: previa?.objeto ?? '',
      dialogo: c.dialogo,
      duracionSeg: c.duracionSeg,
    }
  })

  return { report: { ...report, cortes: actual, tomas }, fusiones }
}

/** Un corte cuya duración se movió, para poder loguear qué se tocó. */
export interface AjusteTiempo {
  n: number
  de: number
  a: number
}

const EPS = 1e-9

/**
 * Repara los cortes cuyo diálogo NO cabe en su propia duración.
 * ---------------------------------------------------------------------------
 * El análisis de video mide bien el TOTAL y mal el REPARTO. Medido en la sesión
 * `79b94ab9`: 776 caracteres en 46 s dan 16.9 cps, un ritmo perfectamente normal en
 * español; pero el corte 2 traía 60 caracteres en 2 s — 30 cps, imposible de
 * pronunciar — y los límites caían casi todos en múltiplos de 5, o sea que el modelo
 * cuantiza los cortes a la resolución que alcanza a muestrear.
 *
 * Eso envenena todo lo que viene después, porque la duración del corte es la que
 * termina pidiéndole al generador de video: una toma mal cronometrada desde acá sale
 * atropellada aunque el guión adaptado sea perfecto.
 *
 * La reparación es CONSERVADORA y deliberadamente aburrida:
 *
 *  - No re-cronometra nada que ya sea decible. Si todos los cortes caben, devuelve el
 *    informe intacto — no se toca un dato bueno.
 *  - A los cortes imposibles les da el mínimo que necesitan (`caracteres / CPS_MAX`).
 *  - Ese tiempo sale de los cortes que tienen holgura, en proporción a cuánta tienen,
 *    así que el TOTAL se conserva exacto y el ritmo general del original no se altera.
 *  - Solo si no hay holgura suficiente en todo el video (el texto entero no entra en su
 *    duración) el total crece; es el único caso en el que `duracionTotalSeg` se mueve.
 *
 * Lo que NO toca: `tiempo`. Esa marca apunta a DÓNDE estaba el corte en el video fuente
 * y el spec la trata como un campo distinto de la duración ("Tiempo original de
 * referencia" vs. "Duración objetivo" en el SHOT LIST FINAL). Dejarla quieta además
 * evita tres problemas de golpe: sigue siendo la clave única con la que `camaraDeLote`
 * empareja lote y plano, no cambia el formato que entra en `scriptFingerprint`, y no
 * puede colisionar consigo misma al redondear.
 *
 * Es idempotente por construcción: al salir, todo corte cumple `duración >= mínimo`, así
 * que una segunda pasada encuentra déficit cero y devuelve la entrada sin tocarla.
 */
/**
 * La ventana `tiempo` de un corte, en segundos. `NaN` si no se puede leer.
 * El formato es "MM:SS - MM:SS" (lo fija el prompt de FASE 1).
 */
function ventanaSeg(tiempo: string): { ini: number; fin: number } {
  const [a, b] = String(tiempo).split('-')
  const leer = (x: string) => {
    const m = /(\d+)\s*:\s*(\d+)/.exec(x ?? '')
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
  }
  return { ini: leer(a), fin: leer(b) }
}

/**
 * ⚠️ EL MODELO DECLARA LA MISMA COSA DOS VECES Y SE CONTRADICE — y el b-roll es el que paga.
 * ---------------------------------------------------------------------------
 * Cada corte trae `tiempo` ("00:10 - 00:15", su ventana en el video) y `duracionSeg`. Son
 * el mismo dato medido dos veces, y en **34 de 222 cortes** de la base no coinciden.
 *
 * Cuál de los dos miente se puede decidir con evidencia, no a ojo: medido sobre las 33
 * sesiones guardadas, las ventanas **encadenan sin un solo hueco ni un solo solape** y su
 * suma da la duración total del video en 32 de 33. O sea forman una línea de tiempo
 * coherente. `duracionSeg` es la estimación suelta, y es la que se desvía.
 *
 * ⚠️ Y SE DESVÍA CONTRA LOS CORTES MUDOS. De los 12 cortes sin diálogo de la base, **9
 * están por debajo de 3 segundos**, con desacuerdos como ventana 8 s → duración 3,5 s, o
 * ventana 5 s → 3,4 s. El modelo estima la duración a partir del habla, así que un plano
 * de producto o un b-roll nace hambriento — antes de que el reparto lo toque. Ése es el
 * origen de que los 8 segundos de frasco a pantalla completa del anuncio de serum
 * llegaran al render como 3,4 s (y de ahí, a ~1,5 s de video).
 *
 * Esto corre ANTES de `repairCutTiming` y SOLO en la primera puerta (`analyze-reference`),
 * que es donde llegan los números crudos del modelo. En `extract-template` NO se vuelve a
 * aplicar: ahí las duraciones ya pasaron por la reparación —que las mueve a propósito para
 * que el diálogo se pueda decir, sin tocar `tiempo`— y reconciliarlas otra vez con la
 * ventana desharía ese trabajo y devolvería diálogo impronunciable.
 *
 * ⚠️ FAIL-CLOSED: si las ventanas NO forman una línea coherente (alguna ilegible, un hueco
 * o un solape de más de medio segundo, o una suma que no se parece al total declarado), no
 * se toca nada. Sin esa coherencia no hay motivo para creerle a la ventana más que a la
 * duración, y el modo de fallo seguro es dejar el análisis como vino.
 */
/**
 * Cortes cuya coreografía es demasiado escasa para su duración.
 *
 * ⚠️ NO reintenta ni corrige: el forense es el paso CARO y no se vuelve a llamar por esto.
 * Lo que hace es dar VISIBILIDAD, que es lo que faltaba — el síntoma que llega al usuario
 * es *"el video no copia los movimientos"* y hasta ahora había que deducir de dónde venía.
 *
 * El piso es un movimiento cada 2 segundos, la misma cuenta que el prompt le pide al
 * modelo. Medido sobre 226 cortes reales: la media global es 1,10 movimientos por segundo,
 * pero los cortes LARGOS caen a 0,15-0,26 — el modelo escribe una frase por corte sin
 * mirar cuánto dura.
 */
export const MOV_POR_SEG_MIN = 0.5

export function coreografiaEscasa(report: ForensicReport): { n: number; seg: number; movimientos: number }[] {
  const out: { n: number; seg: number; movimientos: number }[] = []
  for (const c of report.cortes ?? []) {
    if (!(c.duracionSeg >= 4)) continue
    const m = String(c.accion).split(/[,.;]|\bluego\b|\bdespu[eé]s\b|\by\b/i)
      .map((x) => x.trim()).filter((x) => x.length > 6).length
    if (m / c.duracionSeg < MOV_POR_SEG_MIN) out.push({ n: c.n, seg: c.duracionSeg, movimientos: m })
  }
  return out
}

export function reconciliarConVentana(
  report: ForensicReport,
): { report: ForensicReport; ajustes: AjusteTiempo[] } {
  const cortes = report.cortes ?? []
  if (cortes.length < 1) return { report, ajustes: [] }

  const v = cortes.map((c) => ventanaSeg(c.tiempo))
  if (v.some((x) => !Number.isFinite(x.ini) || !Number.isFinite(x.fin) || x.fin < x.ini))
    return { report, ajustes: [] }

  // La línea de tiempo tiene que encadenar: el fin de uno es el inicio del siguiente.
  for (let i = 1; i < v.length; i++) {
    if (Math.abs(v[i].ini - v[i - 1].fin) > 0.5) return { report, ajustes: [] }
  }

  const suma = v.reduce((n, x) => n + (x.fin - x.ini), 0)
  const total = report.duracionTotalSeg
  if (Number.isFinite(total) && total > 0 && Math.abs(suma - total) > 1.5)
    return { report, ajustes: [] }

  const ajustes: AjusteTiempo[] = []
  const nuevos = cortes.map((c, i) => {
    const dur = v[i].fin - v[i].ini
    // Una ventana de 0 s no es una duración: se conserva lo que declaró el modelo.
    if (!(dur > 0) || Math.abs(dur - c.duracionSeg) <= 1.0) return c
    ajustes.push({ n: c.n, de: c.duracionSeg, a: dur })
    return { ...c, duracionSeg: dur }
  })
  if (!ajustes.length) return { report, ajustes: [] }

  return {
    report: {
      ...report,
      cortes: nuevos,
      // `tomas` empareja 1-a-1 con `cortes` y su duración tiene que seguirlas.
      tomas: (report.tomas ?? []).map((t, i) =>
        nuevos[i] ? { ...t, duracionSeg: nuevos[i].duracionSeg } : t,
      ),
      duracionTotalSeg: nuevos.reduce((n, c) => n + c.duracionSeg, 0),
    },
    ajustes,
  }
}

export function repairCutTiming(
  report: ForensicReport,
  /**
   * Piso de duración VISIBLE de un corte, además del que impone su diálogo.
   *
   * ⚠️ Sin esto, un corte SIN diálogo tiene mínimo 0 y por tanto es holgura pura: el
   * reparto lo puede vaciar entero para financiar a los que no entran. Medido en una
   * sesión real de ropa, después de fusionar los micro-cortes a 3 s: las dos tomas de
   * cierre —las únicas mudas— quedaron en **0.91 s y 1.27 s**, o sea el reparto
   * deshizo justo lo que la fusión acababa de garantizar, y esos dos clips de 1 s son
   * dos llamadas pagadas por un plano congelado.
   *
   * El default es 0 para no cambiar el comportamiento de ningún caller existente:
   * quien fusiona es quien tiene un piso que defender y quien lo pasa.
   */
  minVisibleSeg = 0,
): { report: ForensicReport; ajustes: AjusteTiempo[] } {
  const cortes = report.cortes ?? []
  if (!cortes.length) return { report, ajustes: [] }

  const dur = cortes.map((c) => (Number.isFinite(c.duracionSeg) && c.duracionSeg > 0 ? c.duracionSeg : 0))
  // ⚠️ El piso se acota a la duración que el corte YA tiene: es un suelo contra el
  // vaciado, no un empujón hacia arriba. Sin ese `Math.min`, un corte que la fusión
  // dejó corto a propósito —un flat-lay aislado, que no puede fusionarse con planos de
  // persona— se inflaba hasta el piso, y el anuncio entero crecía con él: medido en la
  // sesión de ropa, 28 s de original pasaban a 41,8 s. Con el acote, un corte por
  // encima del piso puede donar hasta el piso y uno por debajo simplemente no se toca.
  const min = cortes.map((c, i) =>
    Math.max(
      (c.dialogo ?? '').length / CPS_MAX,
      Math.min(Math.max(0, minVisibleSeg), dur[i]),
    ),
  )

  const deficit = cortes.reduce((n, _, i) => n + Math.max(0, min[i] - dur[i]), 0)
  if (deficit <= EPS) return { report, ajustes: [] }

  const holgura = cortes.map((_, i) => Math.max(0, dur[i] - min[i]))
  const totalHolgura = holgura.reduce((a, b) => a + b, 0)

  // `totalHolgura >= deficit > 0` implica `totalHolgura > 0`, así que la división es
  // segura; el caso sin holgura suficiente cae en la otra rama.
  const nuevas = cortes.map((_, i) =>
    Math.max(
      totalHolgura >= deficit
        ? Math.max(dur[i], min[i]) - (holgura[i] / totalHolgura) * deficit
        : Math.max(dur[i], min[i]),
      // El `max` final con el mínimo es lo que garantiza la idempotencia: sin él, el
      // error de coma flotante del reparto puede dejar un corte una billonésima por
      // debajo de su mínimo y una segunda pasada volvería a moverlo.
      min[i],
    ),
  )

  const ajustes: AjusteTiempo[] = []
  for (let i = 0; i < cortes.length; i++) {
    if (Math.abs(nuevas[i] - dur[i]) > 0.05) ajustes.push({ n: cortes[i].n, de: dur[i], a: nuevas[i] })
  }

  const suma = nuevas.reduce((a, b) => a + b, 0)
  return {
    report: {
      ...report,
      // Solo crece si el texto entero no entraba en el video; con reparto interno el
      // total se conserva y este `max` es un no-op.
      duracionTotalSeg: Math.max(report.duracionTotalSeg, suma),
      cortes: cortes.map((c, i) => ({ ...c, duracionSeg: nuevas[i] })),
      // El prompt exige exactamente una toma por corte y en el mismo orden, así que el
      // emparejamiento por índice está definido. Nadie río abajo lee estas duraciones
      // (todo sale de `cortes`), pero dejarlas desincronizadas es una trampa para quien
      // las lea mañana.
      tomas: report.tomas?.length === cortes.length
        ? report.tomas.map((t, i) => ({ ...t, duracionSeg: nuevas[i] }))
        : report.tomas,
    },
    ajustes,
  }
}

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
    '⚠️ VARIOS PERSONAJES: `personajes`.',
    '  Un anuncio puede tener más de una persona con voz propia. Lista CADA una que',
    '  hable o tenga presencia propia, hasta 4, con:',
    '    `id`: "P1", "P2"… en orden de aparición. Es lo que después referencia el',
    '      diálogo, así que tiene que ser estable y no repetirse.',
    '    `rol`: cómo lo nombra el anuncio ("hijo", "padre", "vendedora"). En minúsculas.',
    '    `descripcion`: edad aparente, cabello, complexión, rasgos visibles.',
    '    `vestuario`: lo que lleva puesto.',
    '  Si habla una sola persona, `personajes` lleva un único elemento.',
    '  ⚠️ Descríbelos SIN etiquetar etnia ni origen cultural, igual que `sujeto`.',
    '',
    '⚠️ QUIÉN DICE QUÉ: `hablantes`, dentro de cada corte.',
    '  Un corte puede tener varias voces (dos personas conversando, o alguien fuera de',
    '  cuadro). Reparte el `dialogo` de ese corte entre quienes lo dicen, en ORDEN, con el',
    '  `id` del personaje y su `texto`.',
    '  ⚠️ NO cambies ni una palabra: pegar los `texto` en orden tiene que dar exactamente',
    '  el mismo `dialogo`. Se comprueba en código, y si no cuadra se descarta el reparto',
    '  entero de ese corte — o sea el anuncio pierde la atribución.',
    '  Un corte mudo no lleva `hablantes`. Un corte con una sola voz lleva uno.',
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
    '⚠️ EL EQUIPO DE GRABACIÓN TAMPOCO ES COREOGRAFÍA — misma regla, otra clase de',
    'artefacto. Micrófono de mano, corbatero, caña, trípode, aro de luz, reflector, el',
    'teléfono con el que graban: son herramientas de producción, no cosas que el',
    'personaje haga. NO los menciones en `accion`, ni siquiera describiéndolos por su',
    'forma ("un pequeño objeto plateado").',
    'Medido, y por eso está acá: en un video real la presentadora sostenía un micrófono',
    'de mano a la altura del pecho durante los cinco cortes. El análisis lo describió',
    'como "sostiene un pequeño objeto plateado a la altura de su pecho" y el generador,',
    'que no tenía ningún micrófono que poner, lo interpretó como TOCARSE EL PECHO en',
    'cuatro de los cinco clips.',
    'Si la mano está ocupada con equipo, describe solo dónde está la mano y qué hace la',
    'otra — nunca el objeto.',
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
    '⚠️ LA COREOGRAFÍA CRECE CON LA DURACIÓN DEL CORTE. Una toma de 3 segundos y una de 20',
    'no se describen con el mismo número de frases: la de 20 tiene MÁS cosas pasando, y si',
    'la describes con dos frases estás tirando 18 segundos de movimiento.',
    'La cuenta: **un movimiento por cada 2 segundos de toma**, encadenados en el orden en',
    'que ocurren. Un corte de 6 s necesita al menos 3; uno de 20 s, al menos 10.',
    'Medido sobre videos reales: los cortes cortos se describen a ~1 movimiento por segundo',
    'y los largos caen a 0,15 — o sea el modelo escribe una frase por corte sin mirar cuánto',
    'dura, y el video generado se queda quieto el resto del tiempo.',
    'Si de verdad no pasa nada durante varios segundos, DILO ("se queda quieta mirando a',
    'cámara unos segundos"): la quietud declarada es un dato, un hueco no.',
    '',
    'Un ejemplo del nivel esperado: "sostiene el frasco con la mano derecha por el cuerpo,',
    'lo levanta hasta la altura del mentón y lo gira un cuarto de vuelta para que la',
    'etiqueta quede al frente; la mano izquierda queda fuera de cuadro; mira al producto',
    'y después a la cámara". Frente a eso, "muestra el producto" es inservible.',
    'Si en un corte el producto NO aparece, dilo explícitamente.',
    '',
    '⚠️ EL DETALLE ATÓMICO: `micro`, en CADA corte. Es el pedido central de este análisis.',
    '  `accion` dice qué HACE el cuerpo. `micro` dice CÓMO, al nivel que se nota sin poder',
    '  nombrarlo — y es lo que separa un video que "se parece" de uno que ES el mismo.',
    '  Cinco casillas, las cinco obligatorias, ninguna vacía:',
    '    `cuerpo`: balanceo, desplazamiento del peso, torsión del torso, hombros,',
    '      respiración visible, cuánto se acerca o aleja de la cámara.',
    '    `manos`: vaivén, qué gesto acompaña a qué palabra, qué hacen cuando no hacen nada,',
    '      si se tocan entre sí, dedos abiertos o cerrados.',
    '    `rostro`: cejas, párpados, parpadeo, adónde va la mirada y cuándo cambia, y cuánto',
    '      se ABRE LA BOCA al hablar (articulación marcada, labios apenas separados, sonrisa',
    '      mientras habla, labios que se aprietan entre frases).',
    '    `cabello`: si se mueve con la cabeza, si cae sobre la cara, si lo aparta, si está',
    '      fijo y no se mueve nada.',
    '    `entorno`: qué se mueve DETRÁS de la persona — cortinas, plantas, ropa colgada,',
    '      reflejos, gente al fondo, luz que cambia. Si el fondo está completamente quieto,',
    '      escribe exactamente eso.',
    '',
    '  ⚠️ LA QUIETUD ES UNA OBSERVACIÓN, NO UNA CASILLA VACÍA. Un cuerpo que casi no se',
    '  mueve es un dato tan útil como uno que se mueve mucho: si lo omites, el generador',
    '  inventa movimiento que el original no tiene. "torso casi inmóvil, solo respiración" y',
    '  "fondo completamente quieto" son respuestas correctas y esperadas.',
    '',
    '  ⚠️ ESCRÍBELO EN TELEGRAMA. Sin artículos, sin "la modelo", sin verbos de relleno,',
    '  separando observaciones con comas. Cada casilla, 15 palabras como mucho.',
    '    ASÍ: "mano derecha sube al mentón, dedos índice y medio extendidos, izquierda quieta".',
    '    ASÍ NO: "La modelo sube su mano derecha hasta la altura del mentón, mientras que',
    '    los dedos índice y medio permanecen extendidos y la mano izquierda queda quieta".',
    '  Dicen lo mismo y la segunda ocupa el doble. El prompt de render topa en 5000',
    '  caracteres y este bloque es el que más crece: lo que sobra de palabras se paga',
    '  perdiendo observaciones.',
    '',
    '  ⚠️ NO INVENTES NADA. Todo sale del video. Si un detalle no se alcanza a ver —el',
    '  fondo está desenfocado, las manos quedan fuera de cuadro— dilo ("manos fuera de',
    '  cuadro"), no lo completes con lo que sería razonable.',
    '',
    '⚠️ CONTINUIDAD DE OBJETOS: `objetoEnMano`, en CADA corte.',
    '  Qué sostiene la persona AL EMPEZAR el corte (`inicio`) y AL TERMINARLO (`fin`).',
    '  Nómbralo igual siempre a lo largo del video ("frasco", "gotero", "bolsa") y usa',
    '  "nada" cuando las manos están vacías. Si hay un objeto en cada mano, sepáralos con',
    '  coma en el mismo orden en los dos campos.',
    '  Sirve para decidir en CÓDIGO si dos cortes se pueden unir en una toma continua, así',
    '  que lo único que importa es que el nombre sea consistente, no que sea elegante.',
    '  Ejemplo: un corte que empieza con las manos vacías y termina con el frasco tomado de',
    '  la repisa es `{inicio: "nada", fin: "frasco"}`.',
    '  ⚠️ El equipo de grabación NO va acá tampoco (micrófono, teléfono, trípode): si la',
    '  mano sostiene equipo, para este campo esa mano está vacía.',
    '',
    '⚠️ QUÉ HAY EN LAS MANOS: `objetoEnMano`.',
    '  `inicio` / `fin`: qué sostiene al EMPEZAR el corte y qué al TERMINARLO. Manos',
    '  vacías se escribe "nada". Si no se ven las manos, "fuera de cuadro".',
    '  ⚠️ El recorrido de CADA MANO no va acá: va en `micro.manos`. Acá solo QUÉ se sostiene.',
    '  `accesorios`: el ESTADO de las piezas que se separan del producto — tapa, gotero,',
    '    cuchara, aplicador — también con flechas. Ej: "tapa puesta → tapa fuera, en la',
    '    mano derecha → tapa puesta".',
    '    ⚠️ Es el campo que evita el fallo más visible de todos: si no dices que la tapa',
    '    salió y volvió, el video generado la hace REAPARECER en el frasco de la nada.',
    '    ⚠️ Una pieza nombrada en `inicio` TAMBIÉN necesita su estado acá: `inicio` dice qué',
    '    se SOSTIENE, `accesorios` dice si está puesta o fuera, y eso cambia dentro del corte.',
    '    Si el producto no tiene piezas separables, escribe "sin accesorios".',
    '  Nómbralo igual siempre dentro del mismo video: el frasco es "frasco" en los seis',
    '  cortes, no "el producto" en uno y "el envase" en otro — se compara en código.',
    '  ⚠️ Para qué sirve: con esto el sistema decide si dos cortes se pueden unir en una',
    '  sola toma continua. Si el corte 3 termina con el gotero en la mano y el 4 empieza',
    '  con las manos vacías, unirlos haría que el gotero desaparezca en el aire.',
    '',
    'EL DETALLE ATÓMICO (`micro`) — lo que se nota sin poder nombrarlo.',
    '  `accion` dice QUÉ hace el cuerpo. `micro` dice CÓMO, al nivel que separa un video',
    '  que "se parece" de uno que es el mismo. Cinco casillas, todas obligatorias cuando',
    '  el corte muestra a una persona:',
    '    `cuerpo`: balanceo, desplazamiento del peso, torsión del torso, respiración.',
    '    `manos`: QUÉ HACE CADA MANO Y EN QUÉ ORDEN, con flechas. Casi nunca hacen lo mismo:',
    '      una sostiene mientras la otra manipula. Formato: "izquierda: sostiene frasco todo',
    '      el corte · derecha: destapa → aplica en mejilla → vuelve a tapar". Incluye el',
    '      vaivén, qué hacen cuando no hacen nada, y el estado de cualquier pieza que se',
    '      separe (tapa, gotero): si sale y vuelve, dilo acá — es lo que evita que un objeto',
    '      reaparezca de la nada en el video generado.',
    '    `rostro`: cejas, párpados, adónde va la mirada y CUÁNTO SE ABRE LA BOCA al hablar',
    '      (articulación marcada, labios apenas separados, sonríe mientras habla…).',
    '    `cabello`: si se mueve con la cabeza, si cae sobre la cara, si está fijo.',
    '    `entorno`: qué se mueve DETRÁS — cortinas, ropa colgada, reflejos, gente, hojas.',

    '',
    '  ⚠️ LA QUIETUD ES UNA OBSERVACIÓN, NO UNA CASILLA VACÍA. Un cuerpo que casi no se',
    '  mueve es un dato tan renderizable como uno que se mueve mucho: "torso casi inmóvil,',
    '  solo respiración" y "fondo completamente quieto" son respuestas CORRECTAS. Dejarlo',
    '  vacío hace que el generador invente movimiento que el original no tiene.',
    '',
    '  ⚠️ ESCRÍBELO EN TELEGRAMA. Sin artículos, sin "se puede observar que", sin verbos de',
    '  relleno, separando observaciones con comas. Máximo unas 120 caracteres por casilla.',
    '  No es estilo: esto viaja a un generador con un tope duro de espacio, y la prosa',
    '  gasta el doble para decir lo mismo.',
    '    ASÍ: "peso en pierna izquierda, hombro derecho baja al inhalar, torso quieto"',
    '    NO ASÍ: "La modelo apoya su peso sobre la pierna izquierda mientras su hombro',
    '    derecho desciende levemente cada vez que inhala."',
    '',
    '  ⚠️ SOLO LO QUE ESTÁ EN EL VIDEO. Es la regla de siempre y acá pesa más, porque el',
    '  nivel de detalle invita a rellenar: si el pelo está recogido y no se mueve, eso es',
    '  lo que va; no inventes un mechón cayendo porque quedaría bien.',
    '  Si un corte no muestra a la persona (plano de producto, flat-lay), `cuerpo`,',
    '  `manos`, `rostro` y `cabello` dicen "no aparece" y `entorno` describe lo que sí',
    '  se mueve en cuadro.',
    '',
    'CRONOMETRAJE — se mide, no se estima:',
    '  `duracionSeg` lleva DECIMALES (4.3, no 5). No redondees a números redondos ni',
    '  acomodes los límites en una rejilla de 5 segundos: los cortes de un video real',
    '  caen donde caen, y una rejilla es la señal de que se rellenó en vez de medir.',
    '  Antes de cerrar cada corte, comprueba que su diálogo SE PUEDA DECIR en su',
    '  duración: el español conversacional va a 14–17 caracteres por segundo y una',
    `  lectura rápida llega a ~${CPS_MAX}. Si el texto que le asignaste necesita más que eso, el`,
    '  límite del corte está mal puesto, no es que la persona hable rapidísimo — corrige',
    '  el límite. La suma de las duraciones tiene que dar la duración total del video.',
    '',
    '⚠️ VOZ EN OFF: `vozEnOff`.',
    '  Marca `true` cuando en ese corte SE OYE a alguien hablar pero QUIEN HABLA NO',
    '  APARECE en cuadro — narración sobre planos de producto, de manos, de pies o de',
    '  detalle. Es un formato entero de UGC, no una excepción rara.',
    '  Marca `false` (o no lo pongas) cuando la persona que habla SÍ está en cuadro y se',
    '  le ve la boca moverse.',
    '  Un corte mudo no lleva `vozEnOff`: no hay voz que ubicar.',
    '  ⚠️ Es la diferencia entre reconstruir el anuncio con alguien narrando por encima o',
    '  con alguien hablándole a la cámara. Si te equivocás, el video generado pone a una',
    '  persona a mover la boca donde el original solo mostraba el producto.',
    '',
    '⚠️ UN CORTE SIN HABLA LLEVA `dialogo` VACÍO (""), NUNCA UN MARCADOR.',
    '  "No aparece" es el marcador de `textoOverlay` y SOLO de ese campo. Si en un corte',
    '  nadie habla —música, silencio, una toma de producto— `dialogo` es la cadena vacía.',
    '  Escribir ahí "No aparece" hace que el generador de video lo LEA EN VOZ ALTA: es',
    '  texto hablado, y todo lo que esté en ese campo se pronuncia.',
    '',
    'CORTES (`cortes`): uno por corte real, en orden. Para cada uno:',
    '  `tiempo` "MM:SS - MM:SS", `duracionSeg`, `accion` (descripción literal de lo',
    '  que sucede), `dialogo` (texto hablado durante ese corte), `textoOverlay` (o "No',
    '  aparece"), `transicion` (jump cut / corte directo / continuidad / zoom digital) y',
    '  `camara`, que se declara así:',
    '',
    '  ⚠️ EL ENCUADRE SE DECLARA POR DÓNDE CORTA EL CUADRO, NO POR UNA ETIQUETA.',
    '    Medido: un anuncio grabado en primer plano se etiquetó "plano medio" en 3 de 4',
    '    cortes, el render obedeció y el video salió con la persona mucho más lejos que el',
    '    original. La etiqueta sola no es medible; el punto de corte sí. Empieza SIEMPRE por',
    '    el punto de corte y después, si quieres, el nombre:',
    '      "corta a la altura de los hombros" → primerísimo primer plano',
    '      "corta a la altura del pecho o las axilas" → primer plano',
    '      "corta a la altura del esternón" → plano medio corto',
    '      "corta a la altura de la cintura" → plano medio',
    '      "corta a la altura de los muslos" → plano americano',
    '      "se ve el cuerpo entero" → plano general',
    '    Si en cuadro NO hay persona (detalle de producto, flat-lay), di qué llena el cuadro',
    '    y cuánto: "el frasco ocupa dos tercios del alto del cuadro".',
    '    Agrega después la posición de cámara (frontal, ligeramente baja o alta, cenital), si',
    '    está fija o en mano, y el movimiento (zoom, acercamiento, paneo).',
    '',
    '⚠️ Y DÓNDE CAE CADA COSA EN EL CUADRO, en la misma línea: "persona centrada",',
    '    "desplazada al tercio izquierdo", "el frasco entra por el borde inferior derecho",',
    '    "a la altura del mentón". Referencias del encuadre, nunca medidas ni píxeles.',
    '',

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

/**
 * Un campo del forense, en prosa y acotado a UN clip.
 *
 * ⚠️ DOS DEFECTOS MEDIDOS, Y EL SEGUNDO ES EL GRAVE. Gemini devuelve espontáneamente
 * objetos y arrays en campos declarados `z.string()`, y el schema los coacciona a un
 * string con JSON adentro. Medido en la sesión `430c5961`: `fondo` viajaba al prompt de
 * render como 731 caracteres de `{"localizacionAparente": "...", "paredes": "..."}`, con
 * llaves y nombres de campo en camelCase; `sujeto` y `vestuario` igual, hacia el prompt
 * de identidad.
 *
 * Lo grave no es la sintaxis: es que el texto describe el VIDEO ENTERO dentro de un
 * prompt de un solo clip — *"muebles: En un corte, se observa un sillón tapizado en tela
 * gris claro"* — mientras el bloque `CONTINUIDAD` promete que nada cambia. De ahí salió
 * el sillón que apareció en un clip de la prueba de ropa, que se reportó como deriva del
 * modelo y no lo era: el prompt lo ofrecía.
 *
 * ponytail: el filtro de "en un corte" es una heurística sobre texto de un LLM, no un
 * contrato. Si el forense cambia de redacción deja de filtrar — y el modo de fallo es
 * volver al comportamiento anterior (una descripción de más), no romper nada.
 */
export function enProsa(campo: string | null | undefined): string {
  const crudo = (campo ?? '').trim()
  if (!crudo) return ''
  let valor: unknown = crudo
  if (crudo.startsWith('{') || crudo.startsWith('[')) {
    try { valor = JSON.parse(crudo) } catch { return crudo }
  }
  const aplanar = (v: unknown): string[] =>
    Array.isArray(v) ? v.flatMap(aplanar)
    : v && typeof v === 'object' ? Object.values(v).flatMap(aplanar)
    : [String(v)]
  return aplanar(valor)
    .map((x) => x.trim())
    .filter(Boolean)
    // Fuera lo que describe OTROS cortes: en un prompt de un solo clip es una lista de
    // escenarios alternativos, y el modelo elige uno.
    .filter((x) => !/^en (un|algunos|otros?|ciertos) cortes?\b/i.test(x))
    .map((x) => (/[.!?]$/.test(x) ? x : `${x}.`))
    .join(' ')
}

/** Frases que son un marcador de "acá no hay nada", no diálogo. */
const MARCADORES_VACIO = ['no aparece', 'no hay dialogo', 'sin dialogo', 'no se escucha', 'silencio']

const norm = (x: string) =>
  x.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.!?¡¿]+$/g, '').trim()

/**
 * Saca del diálogo las frases que en realidad son marcadores de campo vacío.
 *
 * ⚠️ FALLO MEDIDO EN UNA SESIÓN REAL (`02fa1205`). El prompt de FASE 1 pide
 * `textoOverlay` "(o 'No aparece')" y el modelo generaliza ese marcador a `dialogo`
 * cuando el corte es mudo: el corte 3 quedó con `dialogo: "No aparece. No aparece."` y
 * el corte 2 con la frase real más el marcador pegado al final. FASE 2 y FASE 3 lo
 * copian literal —que es exactamente lo que tienen que hacer— y termina en el prompt
 * del lote como `Locución:`, o sea el generador de video LO DICE EN VOZ ALTA. En el
 * guión final del usuario salieron tres "No aparece." seguidas.
 *
 * El `guionOriginal` de esa misma sesión está limpio, así que el forense sí sabía que
 * el tramo era mudo: lo contaminado es solo el campo por corte.
 *
 * Se limpia en CÓDIGO además de arreglar el prompt porque el prompt no es garantía y
 * porque esto repara también las sesiones ya guardadas, que es donde está el problema
 * ahora mismo. Mismo patrón que el resto del pipeline: el modelo redacta, el código
 * verifica.
 *
 * ponytail: solo se descartan frases COMPLETAS que son el marcador; un diálogo real que
 * contenga "no aparece" dentro de una oración más larga ("la mancha ya no aparece") no
 * se toca. El modo de fallo del acote es dejar pasar un marcador raro, no comerse
 * diálogo legítimo.
 */
export function limpiarDialogo(texto: string): string {
  return (texto ?? '')
    .split(/(?<=[.!?])\s+/)
    .filter((frase) => frase.trim() && !MARCADORES_VACIO.includes(norm(frase)))
    .join(' ')
    .trim()
}

/** `limpiarDialogo` sobre todo el reporte: los cortes y sus tomas. */
export function limpiarDialogos(report: ForensicReport): ForensicReport {
  // Dato de DB, no de este request: una fila legada puede no traer los arrays. Sin este
  // guard un `.map` sobre undefined tira un 500 en la ruta que solo iba a limpiar texto.
  if (!Array.isArray(report?.cortes) || !Array.isArray(report?.tomas)) return report
  const cortes = report.cortes.map((c) => {
    const hablantes = c.hablantes
      ?.map((h) => ({ ...h, texto: limpiarDialogo(h.texto) }))
      .filter((h) => h.texto)
    return { ...c, dialogo: limpiarDialogo(c.dialogo), ...(hablantes ? { hablantes } : {}) }
  })
  const tomas = report.tomas.map((t) => ({ ...t, dialogo: limpiarDialogo(t.dialogo) }))
  // Sin cambios devuelve el MISMO objeto: así no se ensucia una fila que ya estaba bien
  // ni se mueve la huella por una reescritura idéntica.
  const igual = cortes.every((c, i) =>
      c.dialogo === report.cortes[i].dialogo
      && (c.hablantes ?? []).length === (report.cortes[i].hablantes ?? []).length
      && (c.hablantes ?? []).every((h, k) => h.texto === report.cortes[i].hablantes?.[k]?.texto))
    && tomas.every((t, i) => t.dialogo === report.tomas[i].dialogo)
  return igual ? report : { ...report, cortes, tomas }
}

/** Solo las palabras, para comparar dos textos sin que la puntuación decida. */
const soloPalabras = (x: string) =>
  (x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Verifica que el desglose por hablante REPRODUZCA el diálogo del corte.
 *
 * El modelo reparte `dialogo` entre las personas que hablan, y ese reparto es texto libre:
 * nada le impide resumir, reordenar o inventar una línea. Acá se comprueba en código lo
 * único que se PUEDE comprobar — que las palabras concatenadas de `hablantes` sean las
 * mismas y en el mismo orden que las de `dialogo`.
 *
 * ⚠️ Lo que esto NO verifica es a QUIÉN se le asignó cada tramo: eso no se puede saber sin
 * el audio. Por eso el paso del guión tiene que MOSTRAR la atribución — es el usuario
 * quien la valida.
 *
 * Cuando no cuadra se descarta el desglose de ESE corte y se conserva `dialogo`: el modo
 * de fallo pasa a ser "sin atribución", que es exactamente el comportamiento anterior y
 * es seguro. Atribuir mal sería peor que no atribuir: le pondría la línea de un personaje
 * a otro sin que nada lo reporte.
 *
 * La comparación ignora puntuación y acentos: el modelo suele mover una coma al partir la
 * frase, y rechazar por eso tiraría un reparto correcto.
 */
export function verificarHablantes(report: ForensicReport): { report: ForensicReport; descartados: number[] } {
  if (!Array.isArray(report?.cortes)) return { report, descartados: [] }
  const descartados: number[] = []
  const cortes = report.cortes.map((c) => {
    if (!c.hablantes?.length) return c
    const junto = soloPalabras(c.hablantes.map((h) => h.texto).join(' '))
    if (junto === soloPalabras(c.dialogo)) return c
    descartados.push(c.n)
    const { hablantes: _fuera, ...sinAtribucion } = c
    return sinAtribucion
  })
  return descartados.length ? { report: { ...report, cortes }, descartados } : { report, descartados }
}
