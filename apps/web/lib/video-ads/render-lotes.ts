import { createHash } from 'crypto'
import type { Lote, LoteImage } from './lotes'
import type { MotionProfile, VoiceProfile } from './character'
import type { Personaje } from './personajes'
import { toNiche } from './niches'

/**
 * Lógica pura de orquestación del render por lotes (Task 6, fix rounds 1 a 4).
 * ---------------------------------------------------------------------------
 * Separada de la ruta para poder probarla sin red: `generate-lotes/route.ts` pega
 * contra KIE, Supabase y `gen-quota`, pero la aritmética de qué se guarda cuando
 * algo falla a mitad de camino, quién puede reanudar y si eso cuenta como una
 * generación nueva no necesita nada de eso.
 *
 * Estas funciones existen por un mismo motivo: un lote ya creado en KIE está
 * PAGADO. Perder su `taskId` (recreándolo, o simplemente no guardándolo cuando algo
 * más adelante en el loop falla) es dinero gastado en un video que el usuario nunca
 * podrá ver ni recuperar. `isPaidResume` cubre el caso simétrico: dejar de cobrar
 * una generación que SÍ se pagó, o cobrarla de más porque un cliente pidió
 * "reanudar" sin que hubiera nada real que reanudar.
 */

/** Suma la duración real de un array de lotes, placeholders incluidos: `duracionSeg`
 *  ya viene calculado por `groupIntoLotes` para TODOS los lotes, hayan arrancado su
 *  render o no, así que sirve igual para un render completo que para un rescate
 *  parcial. */
export function totalDuration(lotes: Lote[]): number {
  return lotes.reduce((n, l) => n + l.duracionSeg, 0)
}

/**
 * `true` solo cuando NINGÚN lote puede seguir avanzando solo: cada uno o ya tiene
 * video (`videoUrl`) o terminó en `fail` explícito de KIE. Un lote `waiting` /
 * `queuing` / `generating` (sigue vivo del lado de KIE) o `idle` (nunca llegó a
 * crear tarea — el caso "a medias" que `Section6Lotes` llama `stuck`) hace que esto
 * dé `false`.
 *
 * Única fórmula de "¿terminó el render?" del módulo — antes vivía solo, inline, en
 * `lote-status/route.ts` (para su propio `done` de respuesta); ahora también la usan
 * `generate-lotes/route.ts` (para escribir `render_done` en la base cada vez que
 * persiste `lotes`) y `db.ts`/`sessions/route.ts` (para leerlo en el dashboard sin
 * traer el jsonb completo). Que las tres fuentes deriven del mismo cálculo es lo que
 * evita que el booleano cacheado en `render_done` se desincronice de lo que `lotes`
 * dice de verdad.
 */
export function renderDone(lotes: Lote[]): boolean {
  return lotes.every((l) => l.videoUrl || l.status === 'fail')
}

/**
 * Empareja `base` (recién recalculado por `groupIntoLotes`, siempre determinista
 * mientras `adapted.tomas` no cambie — que ya no es un supuesto: `isPaidResume` lo
 * EXIGE vía la huella antes de dejar llamar acá) con lo que ya estaba guardado,
 * por ÍNDICE: si la posición `i` ya tiene un `taskId`, esa tarea ya está pagada y se
 * conserva tal cual — no se crea una nueva. Si no, se usa el lote fresco de `base`
 * (idle, sin taskId), que sí va a intentar crear tarea.
 *
 * Esto es lo que hace que reanudar un render parcial no vuelva a cobrar por los
 * lotes que ya se pagaron la primera vez.
 */
export function resumeSeed(base: Lote[], existentes: Lote[]): Lote[] {
  return base.map((lote, i) => {
    const previo = existentes[i]
    // ⚠️ UN LOTE QUE FALLÓ NO SE CONSERVA, aunque tenga `taskId`. Ese id apunta a una
    // tarea muerta: no hay video detrás y no lo va a haber. Conservarlo lo dejaba fuera
    // de `pendientes` (`filter(l => !l.taskId)`), así que "reintentar" no recreaba nada
    // y —si era el único que faltaba— la ruta salía por el early return de "nada por
    // crear". El lote quedaba irrecuperable desde la UI: el usuario podía darle a
    // reintentar para siempre sin que pasara nada.
    //
    // Pasó de verdad: Veo devolvió "The Google model was unable to generate audio for
    // this request" en 1 de 5 lotes, y el MISMO prompt funcionó al reintentarlo. O sea
    // el fallo es transitorio y reintentar es exactamente lo correcto.
    return previo?.taskId && previo.status !== 'fail' ? previo : lote
  })
}

/** Separador de campos del texto canónico de `scriptFingerprint`. Un carácter de
 *  control que no aparece en texto escrito por humanos ni en URLs; además cada lista
 *  va precedida por su largo, así que dos contenidos distintos no pueden producir el
 *  mismo texto canónico "corriendo" el separador de lugar. */
const SEP = '\u0001'

/** Normaliza un número para el texto canónico. Redondea a milésimas (las duraciones
 *  vienen con 1-2 decimales reales; el resto es ruido de suma de floats) y colapsa
 *  `-0`/no-finitos, para que la huella no cambie por un dígito que nadie ve. */
const num = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000 + 0) : 'NaN')

/**
 * Huella determinista del CONTENIDO con el que se renderiza un video: si dos llamadas
 * producen la misma huella, renderizar lote por lote en cualquier orden (o en dos
 * tandas separadas por una reanudación) da un video coherente; si difiere, no.
 *
 * Qué entra, y por qué es más que "el guión adaptado" — ensanchamiento deliberado:
 * todo lo que `generate-lotes` le pasa a `buildLotePrompt`/`createVideoTask`. No solo
 * las tomas, también el bloque de consistencia, la descripción del producto, el
 * escenario, la cámara, el perfil de voz y las URLs de las imágenes. Motivo: volver a
 * correr la FASE 4/4.5 (identidad y voz) cambia la PERSONA que el modelo genera. Un
 * "resume" a través de ese cambio pegaría un lote con la señora del intento anterior
 * y otro con la del intento nuevo — exactamente la misma incoherencia que re-adaptar
 * el guión, por otra puerta. El precio de incluirlos: re-hacer el personaje también
 * invalida la reanudación (se cobra una generación nueva). Es el lado correcto del
 * intercambio: un video mezclado es basura, una generación de más es recuperable.
 *
 * Qué NO entra: nada de estado mutable del lote (`prompt`, `taskId`, `status`,
 * `videoUrl`, `failMsg` ni el propio `scriptHash`). Meter cualquiera de esos la
 * volvería auto-referencial o dependiente del intento, y entonces la huella de la
 * segunda llamada nunca podría coincidir con la guardada.
 *
 * Los campos se extraen UNO POR UNO en orden fijo en vez de `JSON.stringify(obj)`:
 * Postgres reordena las claves de un jsonb al guardarlo, así que el texto de un
 * stringify no es estable a través del ida y vuelta por la DB. Hoy ambos lados leen
 * de jsonb y coincidirían igual, pero un caller futuro que compare contra un objeto
 * recién construido en memoria se comería un falso negativo silencioso.
 */
export function scriptFingerprint(input: {
  lotes: Lote[]
  consistencyBlock: string
  productDesc: string
  escenario: string
  /** Una por lote, en el mismo orden que `lotes` (ver `camaraDeLote`, lotes.ts). */
  camaras: string[]
  voz: VoiceProfile
  /** Cómo se mueve. Cambia el prompt de cada lote, así que cambia el render. */
  movimiento?: MotionProfile | null
  /** Todos los personajes: su identidad, su voz y su movimiento entran en el prompt, y
   *  sus avatares son de donde salen los frames. Cambiar cualquiera cambia el video. */
  personajes?: Personaje[]
  images: LoteImage[]
  /** Nicho: cambia el rótulo del bloque de producto y el bloque de consistencia. Sin
   *  esto, cambiar el chip y re-renderizar deja la huella igual con otro prompt. */
  niche?: unknown
  /** Quién habla en cada toma, por `tiempo`. Decide la atribución en el prompt
   *  (`P2 (padre) dice:`) y de qué avatares salen los frames. */
  quien?: Map<string, { id: string }[]>
  /** Tomas narradas por encima, por `tiempo`. Cambia el rótulo de la locución y la
   *  orden de no mover la boca. */
  enOff?: Set<string>
}): string {
  const { lotes, consistencyBlock, productDesc, escenario, camaras, voz, images } = input
  const campos: string[] = [
    // Versión del formato canónico: si algún día cambia qué entra en la huella, este
    // prefijo hace que las huellas viejas no coincidan (que es lo correcto: dejan de
    // ser comparables) en vez de coincidir por casualidad.
    //
    // v1 → v2: la huella hashea los INSUMOS de `buildLotePrompt`, no el texto que
    // produce, así que un cambio en la plantilla del prompt (bloque de continuidad,
    // rótulo de iluminación, cámara por lote) es invisible para ella. Sin bumpear,
    // reanudar una sesión a medias pegaría un lote renderizado con el prompt viejo a
    // uno con el nuevo mientras `isPaidResume` jura que es el mismo contenido — la
    // incoherencia que la huella existe para evitar, entrando por una puerta que no
    // vigila. Con el bump, esos parciales cuentan como generación nueva: fail-closed,
    // igual que las sesiones legadas sin `scriptHash`.
    //
    // v2 → v3: misma razón. La plantilla cambió otra vez — el plano por toma cuando el
    // lote mezcla más de uno, la duración de la toma redondeada a 1 decimal y el nivel
    // de degradación que comprime el párrafo de overlay antes de truncar la coreografía.
    // v3 → v4: migración a Veo 3.1. Cambia TODO lo que la huella cubre sin que ella pueda
    // verlo — el modelo, el tope de lote (15 s → 8 s, o sea otro reparto), la duración
    // legal ({4,6,8}) y la plantilla del prompt (sin escalera de degradación, sin
    // "estable", con el bloque de toma continua). Un resume a través de este cambio
    // pegaría un clip de grok a uno de Veo jurando que es el mismo contenido.
    // v4 → v5: el render pasa al modo de keyframes. Cambia el `generationType` que se
    // le manda a Veo y cambia la plantilla del prompt (la leyenda `@image(n)` se
    // reemplaza por la instrucción de interpolar entre el primer y el último fotograma).
    // Las URLs de los frames NO entran en la huella a propósito: son salida, cambian en
    // cada corrida, y meterlas haría que `isPaidResume` no reanudara nunca. Lo que sí
    // entra —el avatar y el producto de los que salen, más las tomas— es lo que decide
    // si las poses serían las mismas.
    // v5 → v6: el perfil de movimiento entra al prompt de cada lote. Cambia el render
    // sin que ninguno de los otros insumos se mueva, así que sin el bump un resume
    // pegaría un clip con perfil y otro sin él.
    // v6 → v7: varios personajes. El prompt de cada lote pasa a llevar un bloque por
    // persona presente y la locución atribuida (`P2 (padre) dice:`), y los frames salen
    // de los avatares de quienes salen en cada toma. Nada de eso lo ve la huella sola.
    // v7 → v8: el eje de voz en off y la atribución de hablantes ENTRAN a la huella.
    // Estaban en el prompt y en `frameSpecs` desde su slice, pero no acá: se derivan de
    // `forensic_analysis.cortes`, y `analyze-reference` reescribe esa columna SIN limpiar
    // `adapted` ni `template`. O sea re-analizar la referencia de una sesión ya renderizada
    // podía cambiar `vozEnOff`/`hablantes` conservando las tomas; si los `tiempo` no se
    // movían, `camaras` tampoco, y `isPaidResume` daba `true` sobre contenido distinto —
    // pegando un clip con la boca moviéndose a otro narrado en off. Angosto, pero es
    // exactamente la clase de incoherencia que la huella existe para evitar, y toca dinero.
    // v8 → v9: CAMBIO DE MOTOR. El render vuelve a grok (`grok-imagine/image-to-video`)
    // desde Veo 3.1, y con él cambia TODO lo que la huella protege: el cap de clip pasa
    // de 8 a 30 s (o sea el reparto en lotes es otro), desaparecen los keyframes y entran
    // las imágenes ancla, la plantilla del prompt se reescribe en inglés y vuelve la
    // escalera de degradación para caber en 5.000 caracteres. Un resume a través de este
    // cambio pegaría un clip de Veo a uno de grok jurando que es el mismo contenido — que
    // es exactamente el fallo que esta versión existe para evitar. Los parciales
    // anteriores pasan a contar como generación nueva, fail-closed.
    // v9 → v10: EL CAP DE CLIP BAJA DE 30 A 15 s y con él cambia el reparto entero, la
    // plantilla del prompt se comprime (el andamiaje fijo se reescribió en telegrama para
    // liberar los ~2.500 caracteres que se comía), aparece el bloque de DETALLE ATÓMICO
    // por toma y la voz deja de venir del usuario para salir de `VOZ_POR_DEFECTO`. La
    // huella hashea INSUMOS, no el texto producido, así que el cambio de plantilla es
    // invisible para ella: sin este bump, reanudar a través del cambio pegaría un clip de
    // 30 s con la voz vieja a uno de 15 s con la nueva mientras `isPaidResume` jura que es
    // el mismo contenido. Los parciales anteriores cuentan como generación nueva.
    // v10 → v11: CUATRO cambios que la huella no vería sola. (a) el prompt del lote gana un bloque SOUND
    // (ambiente + foley + nada de música), porque el clip trae su propia banda de audio y
    // hasta ahora nadie la describía; (b) SALE el bloque `SETTING AND LIGHTING` — medido
    // con 4 renders, con la descripción puesta el fondo no era ni el de la imagen ni el
    // mismo entre draws (ver `buildLotePrompt`). La huella hashea INSUMOS y no el texto
    // producido, así que los dos le son invisibles: sin el bump, reanudar a través de este
    // cambio pegaría un clip en otra habitación y con la banda que grok se inventó a uno
    // con la habitación de la referencia y el ambiente pedido, mientras `isPaidResume`
    // jura que es el mismo contenido — y con la concatenación eso se ve Y se oye.
    // (c) `repartirAccion` aprende el separador de tramos, así que el reparto de una toma
    // larga entre fragmentos CAMBIA (y con él la coreografía que recibe cada lote); (d) con
    // UN personaje la voz sale íntegra de `VOZ_POR_DEFECTO`, o sea los 13 campos que la
    // huella hashea uno por uno se mueven. Los parciales anteriores cuentan como generación
    // nueva, fail-closed.
    // v11 → v12: EL CANDADO DE MOVIMIENTO. La plantilla del prompt cambia de forma (la
    // coreografía deja de ser prosa y pasa a ser `START STATE` / `TIMED MOTION` con la
    // ventana de tiempo de cada tramo / `END STATE`), y la huella hashea los INSUMOS y no
    // el texto producido: sin el bump, reanudar a través del cambio pegaría un clip con la
    // coreografía en prosa a uno con la línea de tiempo explícita mientras `isPaidResume`
    // jura que es el mismo contenido.
    // v12 → v13: VUELTA AL PROMPT MAESTRO. Cambia el MODELO de render
    // (`grok-imagine-video-1-5-preview`, con su propio tope de prompt y de duración), la
    // plantilla entera del prompt y la regla de reparto en lotes. Un resume a través de esto
    // pegaría un clip del modelo viejo con la plantilla vieja a uno nuevo mientras
    // `isPaidResume` jura que es el mismo contenido.
    'v13',
    // Pasa por `toNiche`: un nicho BLOQUEADO se renderiza como suplementos, así que su
    // huella tiene que ser la de suplementos. Sin esto, una sesión guardada como 'ropa'
    // con lotes ya pagados reanudaría pegando un clip del camino de prenda a uno del
    // camino de objeto, con la huella jurando que es el mismo contenido.
    toNiche(input.niche),
    // ⚠️ `escenario` SIGUE EN LA HUELLA aunque ya NO entre al prompt del lote: alimenta el
    // prompt del AVATAR, y el avatar es la imagen de la que ahora sale la escena. Sacarlo
    // haría la reanudación menos conservadora, nunca más — y ese no es el lado correcto.
    consistencyBlock, productDesc, escenario,
    voz.idioma, voz.varianteRegional, voz.acento, voz.pronunciacion, voz.ritmo,
    voz.velocidad, voz.entonacion, voz.energia, voz.pausas, voz.tono, voz.timbre,
    voz.edadVocal, voz.estilo,
    // Opcional: las sesiones anteriores a FASE 4.6 no lo tienen, y una cadena vacía las
    // deja con la misma huella que antes en vez de invalidarlas.
    input.movimiento?.calidadMovimiento ?? '', input.movimiento?.manerismos ?? '',
    // Con su largo delante, como las demás listas: dos repartos distintos de los mismos
    // personajes tienen que dar huellas distintas.
    String(input.personajes?.length ?? 0),
    ...(input.personajes ?? []).flatMap((p) => [
      p.id, p.rol, p.avatarUrl ?? '', p.consistencyBlock ?? '',
      p.voiceProfile?.acento ?? '', p.voiceProfile?.tono ?? '', p.voiceProfile?.edadVocal ?? '',
      p.motionProfile?.calidadMovimiento ?? '', p.motionProfile?.manerismos ?? '',
    ]),
    String(images.length),
  ]
  for (const img of images) campos.push(img.url, img.role)
  // Van con su largo delante, igual que las demás listas: la cámara ya no es un solo
  // string, y dos repartos distintos de los mismos planos entre lotes tienen que dar
  // huellas distintas.
  campos.push(String(camaras.length))
  for (const c of camaras) campos.push(c)
  campos.push(String(lotes.length))
  for (const l of lotes) {
    campos.push(String(l.n), num(l.duracionSeg), String(l.tomas.length))
    for (const t of l.tomas) {
      campos.push(
        String(t.n), num(t.duracionSeg), t.accionVisual, t.personaje, t.producto,
        t.locucion, t.tiempoOriginal,
      )
      // Por toma y no una sola vez al final: los dos se emparejan por `tiempoOriginal`,
      // así que lo que cambia el render es qué toma concreta queda narrada o a quién se
      // le atribuye la línea — un total agregado no distinguiría mover el off de una
      // toma a otra. Las sesiones sin ninguno de los dos campos pushean '' y '0', que es
      // lo mismo que hashearían antes de que existieran… salvo por el bump de versión,
      // que es lo que las invalida a propósito.
      // ⚠️ LOS BEATS SE HASHEAN, y no alcanza con `accionVisual`. Desde el CANDADO DE
      // MOVIMIENTO la prosa ya no se emite cuando hay timeline: la compila `compileAccion`
      // desde estos mismos beats, y esa proyección DESCARTA los `micro` y —lo que importa
      // acá— los TIEMPOS. Dos timelines que difieren solo en la ventana de cada tramo
      // compilan a la misma prosa: misma huella, prompts distintos, y `isPaidResume`
      // jurando que es el mismo contenido. Y la ventana de tiempo es justamente lo único
      // que el candado agrega sobre la prosa.
      const beats = t.beats ?? []
      campos.push(String(beats.length))
      for (const b of beats) {
        campos.push(
          num(b.startSec), num(b.endSec), num(b.referenceFrameMs), b.importance,
          b.body, b.headAndGaze, b.leftHand, b.rightHand, b.productStateBefore, b.productStateAfter,
        )
      }
      campos.push((input.enOff?.has(t.tiempoOriginal) ? '1' : '0'))
      const hablan = input.quien?.get(t.tiempoOriginal) ?? []
      campos.push(String(hablan.length), ...hablan.map((p) => p.id))
    }
  }
  return createHash('sha256').update(campos.join(SEP)).digest('hex')
}

/**
 * `true` solo si `resume` es una reanudación REAL y SEGURA de reanudar por índice.
 * Tres condiciones, ninguna opcional:
 *
 * 1. Que ya exista al menos un `taskId` pagado en la sesión (fix round 2). Sin esto,
 *    un cliente que mande `{ resume: true }` sobre una sesión que nunca llegó a
 *    gastar un centavo (la primera llamada falló armando el prompt del lote 1 y
 *    nunca tocó KIE) se trataría como "ya pagó su generación" y se saltaría el cobro
 *    de `video-generation` — un hueco para no pagar nunca. El flag del cliente es
 *    una intención, no un hecho: el hecho es si `existentes` tiene algo pagado.
 *
 * 2. Que TODOS los lotes guardados lleven la huella `huella` — la del contenido con
 *    el que se va a renderizar AHORA (fix round 4). Este es el chequeo operativo: lo
 *    que hace que "reanudar" signifique "terminar ESTE video" y no "pegar tramos de
 *    dos videos distintos". `resumeSeed` empareja por ÍNDICE sin mirar el contenido
 *    de `base[i]`, así que un lote ya renderizado se conserva tal cual esté; si el
 *    guión (o el personaje, o la voz) se re-hizo en el medio —nada lo impide:
 *    `video-adapt` y la FASE 4 no tienen tope per-step— ese lote quedó renderizado
 *    con el contenido VIEJO y los pendientes se renderizarían con el ACTUAL. La
 *    revisión lo reprodujo ejecutándolo: `lote1.prompt` con el texto del guión viejo
 *    y su `taskId` original intacto, `lote2` con el texto del guión nuevo. No es un
 *    caso exótico — los lotes se arman empaquetando tomas en buckets de hasta 15 s,
 *    así que dos adaptaciones de duración parecida caen en la misma cantidad de lotes
 *    de forma rutinaria.
 *
 * 3. Que `base` tenga la misma cantidad de lotes que `existentes`. La huella ya lo
 *    implica (la cantidad de lotes entra en el texto canónico), pero `resumeSeed`
 *    empareja por índice y su precondición merece estar escrita donde se usa: si
 *    alguien angostara la huella en el futuro, este chequeo sigue impidiendo que
 *    `base.map(...)` descarte en silencio los `taskId` pagados que quedan más allá
 *    del nuevo final.
 *
 * Sesiones SIN huella (`scriptHash` en `null`/ausente: filas escritas antes de este
 * fix) NO se pueden reanudar — la condición 2 no se cumple y se tratan como una
 * generación nueva. Es fail-closed a propósito: la huella es lo único que hace
 * verificable "es el mismo contenido", y sin ella la afirmación no se puede sostener.
 *
 * Residuales conocidos, nombrados como residuales y no como comportamiento correcto:
 *
 * - Editar el guión (o rehacer personaje/voz) durante un render a medias cuesta una
 *   generación nueva y ABANDONA los `taskId` ya pagados (la ruta los loguea con el id
 *   de sesión antes de seguir). No hay forma de que sea gratis: el lote viejo ya no
 *   pertenece a este video. El tope de `VIDEO_GENERATION_LIMIT` deja margen para eso.
 * - Las dos ventanas de concurrencia de los rounds 1 y 2 siguen abiertas igual: dos
 *   `resume` simultáneos, y dos reintentos simultáneos sobre una sesión cuyo primer
 *   intento falló por completo. `isPaidResume` es una función pura sobre una lectura
 *   ya hecha; cerrarlas pide atomicidad en la DB, no un chequeo más acá.
 */
export function isPaidResume(
  resume: boolean,
  existentes: Lote[],
  base: Lote[],
  huella: string,
): boolean {
  return (
    resume &&
    existentes.some((l) => l.taskId != null) &&
    base.length === existentes.length &&
    existentes.every((l) => l.scriptHash === huella)
  )
}

/**
 * Arma el array a persistir cuando el loop de creación no llega al final: los
 * primeros `completados.length` lotes son los que sí arrancaron (con `taskId` real,
 * ya pagados), y el resto sale de `seed` tal cual — placeholders `idle` sin tocar.
 *
 * Por qué placeholders y no simplemente los lotes que sí completaron: si el array
 * persistido tuviera SOLO los completados, `lote-status` (`done = lotes.every(...)`)
 * vería un array de largo 1 en un guión de 3 lotes y lo reportaría `done: true` con
 * un tercio del video — la sesión se marcaría terminada sin estarlo, y no quedaría
 * ninguna traza de que faltan 2 lotes por render. Con los placeholders (`status:
 * 'idle'`, sin `taskId`) el array sigue teniendo los 3, `done` se mantiene en falso,
 * y `resumeSeed` sabe exactamente qué falta la próxima vez.
 */
export function mergeRescue(seed: Lote[], completados: Lote[]): Lote[] {
  return [...completados, ...seed.slice(completados.length)]
}
