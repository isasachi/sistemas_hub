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

export const CorteSchema = z.object({
  n: z.number(),
  tiempo: z.string(),          // "00:00 - 00:03"
  duracionSeg: z.number(),
  accion: z.string(),          // qué sucede, literal
  camara: z.string(),          // plano, posición, movimiento, zoom
  dialogo: z.string(),         // texto hablado en este corte, COMPLETO
  hablantes: z.array(HablanteSchema).optional(), // su desglose por persona
  textoOverlay: z.string(),    // "No aparece" si no hay
  transicion: z.string(),      // jump cut / corte directo / continuidad / zoom digital
})

/** Una persona con voz propia en el video de referencia. */
export const PersonajeForenseSchema = z.object({
  id: z.string(),           // 'P1', 'P2'… estable; es lo que referencia `hablantes`
  rol: z.string(),          // 'hijo', 'padre' — cómo lo nombra el anuncio
  descripcion: z.string(),  // edad aparente, cabello, complexión…
  vestuario: z.string(),
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
export function muestraPersona(accion: string): boolean {
  const t = accion
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return /\b(mujer|hombre|chica|chico|muchacha|muchacho|modelo|persona|sujeto|joven|senor|senora|ella|el sujeto|protagonista)\b/.test(t)
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
  const clase = (k: number) => muestraPersona(actual[k].accion)
  const compatible = (k: number, v: number) =>
    v >= 0 && v < actual.length && clase(k) === clase(v)

  while (actual.length > 1) {
    // El corte más corto que todavía no llega al piso Y TIENE con quién fusionarse. Un
    // flat-lay rodeado de planos de persona se queda solo y corto: es lo correcto — es
    // una toma distinta, y meterla dentro de otra corrompe las dos.
    let i = -1
    for (let k = 0; k < actual.length; k++) {
      if (actual[k].duracionSeg >= minSeg) continue
      if (!compatible(k, k - 1) && !compatible(k, k + 1)) continue
      if (i < 0 || actual[k].duracionSeg < actual[i].duracionSeg) i = k
    }
    if (i < 0) break

    // Vecino más corto de los COMPATIBLES.
    const izq = compatible(i, i - 1) ? actual[i - 1] : null
    const der = compatible(i, i + 1) ? actual[i + 1] : null
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
    'Un ejemplo del nivel esperado: "sostiene el frasco con la mano derecha por el cuerpo,',
    'lo levanta hasta la altura del mentón y lo gira un cuarto de vuelta para que la',
    'etiqueta quede al frente; la mano izquierda queda fuera de cuadro; mira al producto',
    'y después a la cámara". Frente a eso, "muestra el producto" es inservible.',
    'Si en un corte el producto NO aparece, dilo explícitamente.',
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
    '⚠️ UN CORTE SIN HABLA LLEVA `dialogo` VACÍO (""), NUNCA UN MARCADOR.',
    '  "No aparece" es el marcador de `textoOverlay` y SOLO de ese campo. Si en un corte',
    '  nadie habla —música, silencio, una toma de producto— `dialogo` es la cadena vacía.',
    '  Escribir ahí "No aparece" hace que el generador de video lo LEA EN VOZ ALTA: es',
    '  texto hablado, y todo lo que esté en ese campo se pronuncia.',
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
