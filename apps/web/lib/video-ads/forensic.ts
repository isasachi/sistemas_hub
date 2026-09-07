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
 * Un hecho de coreografía con su ventana de tiempo DENTRO del corte (segundos desde el
 * inicio del corte). Los hechos de un corte lo cubren de punta a punta, incluida la
 * quietud declarada: un segundo sin hecho es un segundo que el generador rellena con un
 * gesto inventado (medido: mano con suero, frasco mostrado a cámara, cambio de mano con
 * el frasco flotando — nada de eso estaba en el prompt).
 */
export const HechoSchema = z.object({
  desde: z.number().catch(0),
  hasta: z.number().catch(0),
  texto: z.string().catch(''),
})
export type Hecho = z.infer<typeof HechoSchema>

export const CorteSchema = z.object({
  n: z.number(),
  tiempo: z.string(),          // "00:00 - 00:03"
  duracionSeg: z.number(),
  // `accion` se DERIVA de `hechos` (`normalizarHechos`): el modelo llena la lista. Un
  // análisis anterior a los hechos trae solo `accion`, y todo río abajo la sigue leyendo.
  accion: z.string().catch(''),
  hechos: z.array(HechoSchema).catch([]),
  camara: z.string(),          // MOVIMIENTO primero (fija / en mano / paneo / zoom), luego el encuadre
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
 * Piso VISIBLE de un corte mudo al recronometrar. Un corte sin diálogo tiene mínimo de
 * habla 0, así que para el reparto es holgura pura y lo vaciaba entero para financiar a
 * los hablados: medido en esta base, 8 de 13 cortes mudos quedaron por debajo de 1 s —
 * un plano de producto de 3-8 s convertido en un clip de 1 s (una llamada pagada por
 * una pose congelada). Se acota a la duración que el corte YA tiene: es un suelo contra
 * el vaciado, no un empujón hacia arriba.
 */
export const MIN_VISIBLE_SEG = 3

export function repairCutTiming(
  report: ForensicReport,
  minVisibleSeg = 0,
): { report: ForensicReport; ajustes: AjusteTiempo[] } {
  const cortes = report.cortes ?? []
  if (!cortes.length) return { report, ajustes: [] }

  const dur = cortes.map((c) => (Number.isFinite(c.duracionSeg) && c.duracionSeg > 0 ? c.duracionSeg : 0))
  const min = cortes.map((c, i) => Math.max((c.dialogo ?? '').length / CPS_MAX, Math.min(minVisibleSeg, dur[i])))

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

const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Verbos que hacen de un tramo un EVENTO (algo cambia), no un estado. */
const EVENTO = /\b(aplica|deja caer|suelta|vierte|deposita|echa|destapa|abre|desenrosca|saca|retira|extrae|cierra|tapa|enrosca|guarda|devuelve)\b/
/**
 * Un tramo que declara qué tiene una mano, no un movimiento: se hereda entre fragmentos.
 * "Sostiene el frasco con la derecha y APLICA una gota con la izquierda" NO lo es: es un
 * evento, y heredarlo como estado repetiría la aplicación en el clip siguiente.
 */
export const esEstadoDeManos = (t: string) => {
  const s = sinTildes(t.trim())
  return /^(sujeta|sostiene|mantiene|tiene)\b/.test(s) && /\bmano/.test(s) && !EVENTO.test(s)
}

/** Umbral de hueco entre hechos que se considera "sin cubrir" (s). */
const HUECO_SEG = 0.75

/**
 * Deja los `hechos` de cada corte ordenados, dentro de la ventana del corte y SIN HUECOS,
 * y deriva `accion` de ellos. Un hueco se rellena con el último estado de manos declarado
 * más "y habla a cámara" (o "sin gesto nuevo" en un corte mudo): es la lectura más
 * conservadora posible —no inventa un gesto— y se loguea para saber que el forense dejó
 * un tramo sin describir. Un corte sin `hechos` (análisis anterior) no se toca.
 */
export function normalizarHechos(report: ForensicReport): { report: ForensicReport; rellenos: string[] } {
  const rellenos: string[] = []
  const cortes = (report.cortes ?? []).map((c) => {
    if (!c.hechos?.length) return c
    const dur = Number.isFinite(c.duracionSeg) && c.duracionSeg > 0 ? c.duracionSeg : 0
    let hechos = c.hechos
      .filter((h) => h.texto.trim())
      .map((h) => ({ ...h, desde: Math.max(0, h.desde), hasta: Math.max(h.desde, h.hasta) }))
    // El modelo a veces cuenta desde el inicio del VIDEO y no del corte: si el último
    // `hasta` se pasa de largo y restando el inicio del corte entra, se corrige.
    const inicio = inicioDe(c.tiempo)
    if (dur && hechos.length && hechos[hechos.length - 1].hasta > dur * 1.2 && inicio > 0
      && hechos.every((h) => h.desde >= inicio - HUECO_SEG) && hechos[hechos.length - 1].hasta - inicio <= dur * 1.2) {
      hechos = hechos.map((h) => ({ ...h, desde: h.desde - inicio, hasta: h.hasta - inicio }))
    }
    hechos.sort((a, b) => a.desde - b.desde)
    if (dur) hechos = hechos.map((h) => ({ ...h, desde: Math.min(h.desde, dur), hasta: Math.min(h.hasta, dur) }))

    const relleno = (desde: number, hasta: number, previos: Hecho[]): Hecho => {
      const estado = [...previos].reverse().map((h) => h.texto).find(esEstadoDeManos)
      const texto = `${estado ?? 'mantiene la postura'}${c.dialogo?.trim() ? ' y habla a cámara' : ', sin gesto nuevo'}`
      rellenos.push(`corte ${c.n}: ${desde.toFixed(1)}–${hasta.toFixed(1)} s sin hecho → "${texto}"`)
      return { desde, hasta, texto }
    }
    const cubiertos: Hecho[] = []
    let cursor = 0
    for (const h of hechos) {
      if (h.desde - cursor > HUECO_SEG) cubiertos.push(relleno(cursor, h.desde, cubiertos))
      cubiertos.push(h)
      cursor = Math.max(cursor, h.hasta)
    }
    if (dur && dur - cursor > HUECO_SEG) cubiertos.push(relleno(cursor, dur, cubiertos))
    return { ...c, hechos: cubiertos, accion: cubiertos.map((h) => h.texto.replace(/[\s.;]+$/, '')).join('; ') + '.' }
  })
  return { report: { ...report, cortes }, rellenos }
}

/**
 * El REPARTO DEL DIÁLOGO entre cortes, verificado en código. El forense es estocástico y
 * un sorteo puede poner dos frases en una ventana de 4 s (indecible: `repairCutTiming` lo
 * tapa inflando el corte) o repetir la línea de la marca en dos cortes. Tres chequeos,
 * ninguno un juicio: diálogo repetido entre cortes; la suma de los diálogos que no
 * reconstruye `guionOriginal` (tolerancia del 10 %, el modelo mueve una coma); y diálogo
 * que no entra en su VENTANA (`tiempo`, nunca la duración ya reparada). Devuelve motivos.
 */
export function verificarDialogos(report: { cortes?: { n: number; tiempo: string; dialogo?: string }[]; guionOriginal?: string }): string[] {
  const cortes = report.cortes ?? []
  const out: string[] = []
  const vistos = new Map<string, number>()
  for (const c of cortes) {
    const clave = soloPalabras(c.dialogo ?? '')
    if (!clave) continue
    const antes = vistos.get(clave)
    if (antes !== undefined) out.push(`corte ${c.n}: repite el diálogo del corte ${antes}`)
    else vistos.set(clave, c.n)
  }
  const junto = soloPalabras(cortes.map((c) => c.dialogo ?? '').join(' '))
  const guion = soloPalabras(report.guionOriginal ?? '')
  if (guion && Math.abs(junto.length - guion.length) > guion.length * 0.1)
    out.push(`la suma de los diálogos no reconstruye el guion (${junto.length - guion.length > 0 ? '+' : ''}${junto.length - guion.length} caracteres)`)
  for (const c of cortes) {
    const ventana = segundosDeVentana(c.tiempo)
    const largo = (c.dialogo ?? '').length
    if (ventana && largo / ventana > CPS_MAX)
      out.push(`corte ${c.n}: ${largo} caracteres en una ventana de ${ventana.toFixed(1)} s = ${(largo / ventana).toFixed(1)} car/s`)
  }
  return out
}
const soloPalabras = (s: string) => sinTildes(s).replace(/[^a-z0-9ñ]+/g, ' ').trim()
/** Segundos que abarca una ventana `"00:04 - 00:10"`; 0 si no se puede leer. */
function segundosDeVentana(tiempo: string): number {
  const m = String(tiempo ?? '').match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/)
  if (!m) return 0
  const a = Number(m[1]) * 60 + Number(m[2]), b = Number(m[3]) * 60 + Number(m[4])
  return b > a ? b - a : 0
}

/** Segundo de inicio de un `tiempo` "MM:SS - MM:SS"; 0 si no se puede leer. */
function inicioDe(tiempo: string): number {
  const m = tiempo?.match(/(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

export function buildForensicInstruction(): string {
  return [
    'Actúa como analista forense experto en videos de respuesta directa.',
    'Analiza el VIDEO ORIGINAL completo.',
    '',
    'DIRECTRIZ PRINCIPAL — inspecciona el video CRONOLÓGICAMENTE y detecta:',
    '  audio · palabras · silencios · escenas · cortes · jump cuts · cambios de plano ·',
    '  zooms · movimientos · acciones · producto · objetos · textos · overlays ·',
    '  subtítulos · gestos · fondos · cambios visuales.',
    '',
    'REGLA DE CORTES — la más importante:',
    '  Registra una nueva escena/corte ÚNICAMENTE cuando exista un cambio visual real o un corte de edición identificable. NO dividas una toma continua solo porque cambia el diálogo. Una toma de 8 segundos con tres frases es UN corte, no tres.',
    '',
    // Los dieciocho puntos de la directriz no son campos nuevos: se reparten entre los
    // que ya existen, y decirlo evita que el modelo invente claves que el schema no
    // tiene. Un campo que solapa con otro ya contestado vuelve vacío — este repo lo
    // pagó cinco veces.
    'DÓNDE VA CADA COSA DE ESA LISTA: los silencios, los gestos, los movimientos y la',
    'manipulación del producto y de los objetos van en `hechos`; los zooms, los cambios',
    'de plano y los movimientos de cámara en `camara`; los cortes y jump cuts en',
    '`transicion`; los textos, overlays y subtítulos en `elementosGraficos` y en',
    '`textoOverlay`; las palabras en `dialogo` y en `guionOriginal`; los fondos en',
    '`fondo`. No inventes campos fuera del esquema.',
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
    'nunca dentro de `hechos` ni de `camara`.',
    '',
    'LOS `hechos` DE CADA CORTE SON COREOGRAFÍA, NO RESUMEN.',
    '',
    'ANTES QUE NADA: SI EL PRODUCTO TOCA EL CUERPO EN ESTE CORTE, ESE HECHO SE ESCRIBE',
    'PRIMERO Y COMPLETO — qué sale del envase, con qué, y sobre qué lado de qué zona:',
    '"suelta una gota con el cuentagotas sobre la mejilla izquierda". Acercar el envase a',
    'la cara, observarlo y retirarlo son las CONSECUENCIAS de ese hecho, no el hecho.',
    'Un corte descrito como el VIAJE de la mano ("lo acerca a la mejilla, lo aleja") se',
    'renderiza literalmente así: el envase pasea por delante de la cara y no se aplica',
    'nada — es el defecto más caro de esta tool, porque el anuncio entero existe para',
    'mostrar que el producto se usa. Ante la duda de si hubo contacto, míralo otra vez.',
    '',
    'LA COREOGRAFÍA VA EN `hechos`: una lista, UN HECHO POR ELEMENTO, cada uno con',
    '`desde` y `hasta` en SEGUNDOS CONTADOS DESDE EL INICIO DEL CORTE (el primer hecho',
    'empieza en 0) y `texto` con el hecho. "abre la tapa con el pulgar", "vierte una',
    'cucharada en el vaso" y "deja el envase sobre la mesa" son TRES hechos, tres',
    'elementos. La coma queda para lo que pertenece a un mismo hecho ("mira el producto y',
    'luego a cámara"). `accion` se deja vacía: se deriva de la lista.',
    'LOS HECHOS CUBREN EL CORTE ENTERO, SIN HUECOS: el `hasta` de uno es el `desde` del',
    'siguiente y el último termina en la duración del corte. Si durante seis segundos la',
    'persona solo sostiene el frasco y habla, ESO ES UN HECHO ("sostiene el frasco a la',
    'altura del pecho con la mano derecha y habla a cámara", 4.0–10.0). La quietud',
    'declarada es un dato; un segundo sin hecho es un segundo que el generador rellena',
    'con un gesto inventado. Un corte largo se parte en varios clips por sus tiempos, y',
    'cada clip recibe SOLO los hechos de su ventana.',
    '',
    'CADA CORTE ABRE DICIENDO QUÉ TIENE CADA MANO, NOMBRÁNDOLAS. El clip se renderiza sin',
    'memoria de lo que la toma anterior dejó en cada una, así que un gesto nuevo con una',
    'mano ocupada —señalar, saludar, tocarse la cara— exige escribir ANTES qué pasó con lo',
    'que tenía: lo soltó, lo pasó a la otra mano o lo dejó fuera de cuadro. Sin eso el',
    'modelo necesita una mano libre que no existe y le dibuja a la persona un brazo de',
    'más. "La mano libre" no describe nada: di "la izquierda", y di qué tiene.',
    'Y CIERRA DICIENDO DÓNDE QUEDÓ CADA PIEZA QUE SALIÓ DEL ENVASE —de vuelta en el',
    'frasco, en qué mano, o fuera de cuadro— y con qué termina cada mano. Un corte largo',
    'se parte en varios clips por una frontera que tiene que ser un estado cerrado: un',
    'cuentagotas que se usó y del que no se dice dónde terminó desaparece en el render.',
    '',
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
    '  - qué hace la otra mano mientras tanto y qué SIGUE sosteniendo',
    '    ("deja el frasco fuera de cuadro y señala con la izquierda");',
    '  - dónde termina cada pieza que se separa del producto: un cuentagotas o una tapa',
    '    que sale del envase tiene que volver a él, quedarse en una mano o salir del',
    '    cuadro — nunca desaparecer sin más;',
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
    'CORTES (`cortes`): uno por corte real, en orden. Para cada uno:',
    '  `tiempo` "MM:SS - MM:SS", `duracionSeg`, `hechos` (la lista de arriba, con',
    '  `desde`/`hasta`/`texto`; `accion` vacía), `camara`, `dialogo` (texto hablado',
    '  durante ese corte), `textoOverlay` (o "No aparece") y `transicion` (jump cut /',
    '  corte directo / continuidad / zoom digital).',
    '',
    '`camara` EMPIEZA POR EL MOVIMIENTO, SIEMPRE, y se mide, no se supone: "fija" si la',
    'cámara no se mueve en todo el corte; "en mano" si tiembla; "paneo a la derecha",',
    '"zoom in lento", "desplazamiento" si los hay. Después el encuadre por dónde corta',
    'el cuadro ("corta a la altura del pecho", "primer plano del rostro") y la posición',
    '(frontal, ángulo bajo). Un corte sin movimiento declarado se renderiza con la',
    'cámara que el generador invente, y un UGC grabado con el teléfono apoyado es fijo.',
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
    '  - No etiquetes al sujeto con una raza, una etnia ni un origen cultural: describe',
    '    lo que se ve (tono de piel, cabello, facciones). El personaje del anuncio nuevo',
    '    es OTRO —sale de la foto que sube el usuario— así que etiquetar a este no',
    '    aporta nada y es una lectura que no se puede sostener con el video.',
    '  - Si algo no se puede determinar con seguridad, dilo explícitamente en el',
    '    campo correspondiente en vez de inventarlo.',
    '',
    '`resumenParaUsuario` va en español neutro: se muestra en la interfaz.',
    'Todo el output va en español.',
  ].join('\n')
}
