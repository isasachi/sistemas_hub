import { z } from 'zod'
import type { TomaFinal } from './adapt'
import type { VoiceProfile } from './character'
import { KIE_PROMPT_MAX } from './kie'
import { CPS_MAX, esEstadoDeManos, verificarDialogos, type Hecho } from './forensic'

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
  VERBOS_TRAMO.has(sinTildes(clausula.trim()).replace(/^se\s+/, '').split(/\s+/)[0] ?? '')

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
        // ", luego guarda el gotero" es un hecho nuevo: el conector no tapa el verbo.
        const sinConector = parte.replace(/^(y\s+)?(luego|despu[eé]s|entonces|posteriormente|finalmente|a continuaci[oó]n|seguidamente)\s+/i, '')
        if (out.length && !abreHecho(sinConector)) out[out.length - 1] += ', ' + parte
        else out.push(out.length ? sinConector : parte)
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
  // Límites iniciales: reparto proporcional a la duración, por resto mayor. Es el camino
  // de un análisis SIN `hechos` con tiempo; con ellos, `repartirPorTiempo`.
  const cuota = cuotas(tramos.length, duraciones)
  const limites: number[] = []
  for (let k = 0, desde = 0; k < cuota.length; k++) { limites.push(desde); desde += cuota[k] }
  return andamiar(tramos, limites)
}

/**
 * Reparto POR TIEMPO: cada hecho cae en el fragmento cuya ventana (fracción de la toma)
 * contiene su punto medio. `tramos` son los hechos ya reescritos por FASE 3 (el producto
 * renombrado) y `hechos` los del forense con su ventana: se emparejan por índice, así que
 * SOLO se usa cuando cuentan lo mismo; si no, el caller cae a `repartirAccion`.
 */
export function repartirPorTiempo(tramos: string[], hechos: Hecho[], ventanas: [number, number][]): string[] {
  const span = Math.max(...hechos.map((h) => h.hasta), 1e-9)
  const limites = ventanas.map(([a]) => {
    const i = hechos.findIndex((h) => (h.desde + h.hasta) / 2 / span >= a)
    return i < 0 ? hechos.length : i
  })
  limites[0] = 0
  for (let k = 1; k < limites.length; k++) limites[k] = Math.max(limites[k], limites[k - 1])
  // Un hecho SOSTENIDO que cruza la frontera (masajea 18 s, sostiene y habla) sigue
  // ocurriendo en el fragmento siguiente: se arrastra como su primer hecho. Un EVENTO
  // (aplica, destapa, cierra) no: ocurre una vez, donde cae su punto medio.
  const arrastre = ventanas.map(([a, b], k) => {
    if (k === 0) return null
    const i = limites[k] - 1
    const h = hechos[i]
    // "se aplica el serum con los dedos" es masaje sostenido, no un evento: lo que ocurre una
    // vez es sacar el aplicador (apertura, que incluye aplicar CON el gotero) o cerrarlo.
    if (!h || esApertura(h.texto) || esCierre(h.texto)) return null
    const solape = Math.min(h.hasta / span, b) - Math.max(h.desde / span, a)
    return solape * span >= 1 ? i : null
  })
  return andamiar(tramos, limites, arrastre)
}

/**
 * LA FRONTERA ENTRE FRAGMENTOS ES UN ESTADO CERRADO, y cada fragmento abre y cierra
 * declarándolo. Los fragmentos caen en clips distintos y cada clip se renderiza sin
 * memoria del anterior, así que una frontera con el cuentagotas FUERA del envase es un
 * objeto que el clip siguiente no sabe que existe: desaparece de la mano o se dibuja de
 * nuevo. Si en la frontera el aplicador está fuera y más adelante el corte lo cierra, la
 * frontera se corre hasta después del cierre — abrir, aplicar y cerrar quedan en el mismo
 * clip. Si el corte nunca lo cierra (el forense no lo dijo), se cierra al final del
 * fragmento que lo abrió: es la única forma de que el siguiente arranque con el envase
 * cerrado en la mano, que es lo que el original muestra cuando la otra mano trabaja.
 */
function andamiar(tramos: string[], limites: number[], arrastre: (number | null)[] = []): string[] {
  // Solo el camino CON tiempos (`repartirPorTiempo`) trae `arrastre`: ahí la ventana del
  // hecho dice si se prolonga. En el reparto proporcional no se sabe, y un fragmento sin
  // hecho declara quietud en vez de repetir (vacío es recuperable, duplicado no).
  const conTiempo = arrastre.length > 0
  const originales = [...limites]
  for (let k = 1; k < limites.length; k++) {
    if (!aplicadorFuera(tramos.slice(0, limites[k]))) continue
    const cierre = tramos.findIndex((t, i) => i >= limites[k] && esCierre(t))
    if (cierre < 0) continue
    limites[k] = cierre + 1
    for (let j = k + 1; j < limites.length; j++) limites[j] = Math.max(limites[j], limites[k])
  }

  const pieza = piezaDe(tramos)
  return limites.map((ini, k) => {
    const fin = k + 1 < limites.length ? limites[k + 1] : tramos.length
    const previos = tramos.slice(0, ini)
    // Si la frontera se corrió hasta después de un cierre y este fragmento quedó sin
    // hechos, CONTINÚA la última acción sostenida de antes del cierre (el masaje sigue
    // mientras habla): repetir un hecho declarado no inventa nada; dejarlo vacío deja al
    // generador rellenar 7 s a su gusto.
    const movida = conTiempo && limites[k] !== originales[k]
    const continua = !conTiempo ? null
      : !movida ? arrastre[k] ?? null
      : ini >= fin ? [...previos.keys()].reverse().find((i) => !esApertura(tramos[i]) && !esCierre(tramos[i]) && !esEstadoDeManos(tramos[i])) ?? null
      : null
    const arrastrado = continua != null ? [tramos[continua]] : []
    const trozo = [...arrastrado, ...tramos.slice(ini, fin)]
    const ultimo = k === limites.length - 1
    if (k === 0 && ultimo) return trozo.join('. ') + '.'

    // Un fragmento que no es el primero arranca A MITAD del corte: hay que decirle qué
    // tiene cada mano, que el envase está cerrado y que el producto ya está en la piel.
    // Nada de esto inventa coreografía: el estado es el que el forense declaró, y la
    // transferencia ya ocurrió en un fragmento anterior. Medido en el lote 3 de
    // `00471f8a`: sin esto, grok inventó el dispensado entero para tener suero que
    // extender, y el frasco desapareció de las manos.
    const estado = [...previos].reverse().find(esEstadoDeManos)
    const lado = estado ? manoDe(estado) : null
    const apertura = k === 0 ? [] : [
      ...(estado && !trozo.includes(estado) ? [estado] : []),
      ...(previos.some(esApertura) ? [`el envase está cerrado, con ${pieza} dentro`] : []),
      ...(lado === 'derecha' ? ['la mano izquierda está libre'] : lado === 'izquierda' ? ['la mano derecha está libre'] : []),
      ...(previos.some(esTransferencia) && !trozo.some(esTransferencia) ? [YA_APLICADO] : []),
    ]
    // Y uno que no es el último CIERRA: el aplicador vuelve al envase si nadie lo dijo, y
    // se declara con qué termina. Es el estado con el que abre el clip siguiente. Solo
    // los tramos PROPIOS: en la frontera anterior el aplicador ya quedó cerrado.
    const hasta = tramos.slice(0, fin)
    const estadoFin = [...hasta].reverse().find(esEstadoDeManos)
    const ladoFin = estadoFin ? manoDe(estadoFin) : null
    const cierre = ultimo || !ladoFin ? [] : [`termina con el envase en ${ladoFin === 'ambas' ? 'ambas manos' : `la mano ${ladoFin}`}${hasta.some(esApertura) ? ', cerrado' : ''}`]
    // El cierre sintético va JUSTO DESPUÉS del último hecho que dejó el aplicador fuera,
    // no al final del fragmento: el lote 2 de `493a486d` emitía "aplica con el cuentagotas
    // en la izquierda → masajea con los dedos de la izquierda → vuelve a poner el
    // cuentagotas", o sea la misma mano masajeando con el gotero todavía en ella. En el
    // original se cierra y recién entonces la mano libre trabaja sobre la cara.
    const cuerpo = [...trozo]
    if (!ultimo && aplicadorFuera(trozo)) {
      const i = cuerpo.reduce((acc, t, k) => (esApertura(t) ? k : acc), -1)
      cuerpo.splice(i + 1, 0, `vuelve a poner ${pieza} en el envase y lo cierra`)
    }
    // LA ACCIÓN VA PRIMERO Y EL ESTADO DESPUÉS. Está medido sobre grok que lo escrito al
    // principio del prompt ocurre al principio del clip: el lote 3 de `493a486d` abría con
    // cuatro líneas de estado antes de "masajea la mejilla" y el clip arrancó echándose
    // suero en la mano (sin destapar: "el envase está cerrado" sí lo obedeció) y recién
    // después masajeó. Un fragmento que arranca a mitad de una acción SOSTENIDA la emite
    // primero y el contexto detrás. Si arranca con un evento (destapa, aplica), el estado
    // se queda delante: describe lo que hay ANTES del evento.
    const sostenida = cuerpo.length > 0 && !esApertura(cuerpo[0]) && !esCierre(cuerpo[0]) && !esTransferencia(cuerpo[0]) && !esEstadoDeManos(cuerpo[0])
    const lineas = sostenida ? [cuerpo[0], ...apertura, ...cuerpo.slice(1), ...cierre] : [...apertura, ...cuerpo, ...cierre]
    return lineas.length ? lineas.join('. ') + '.' : ''
  })
}

/** Estado del aplicador en el instante `t` (segundos dentro del corte), según `hechos`. */
export function aplicadorFueraEn(hechos: Hecho[], t: number): boolean {
  const antes = hechos.filter((h) => h.hasta <= t + 1e-9).map((h) => h.texto)
  const encima = hechos.find((h) => h.desde < t && t < h.hasta)
  return aplicadorFuera(antes) || (!!encima && esApertura(encima.texto))
}

// Vocabulario CERRADO del estado de los objetos, sobre la prosa del forense. Se amplía
// agregando verbos acá —visible en el diff—, no aflojando los patrones.
/** El producto llegó al cuerpo en este tramo. */
const esTransferencia = (t: string) => /\b(aplica|deja caer|suelta|vierte|deposita|echa|usa)\b/i.test(t) && /\b(gota|suero|serum|producto|crema|mejilla|frente|rostro|cara|piel|cuello|ment[oó]n|p[oó]mulo)\b/i.test(t)
const PIEZAS = /\b(cuentagotas|gotero|pipeta|tapa|tapón|cuchara|aplicador)\b/i
/** El aplicador sale del envase: se destapa, se saca, o se usa fuera (aplicar CON el gotero). */
const esApertura = (t: string) =>
  /\b(destapa|abre|desenrosca)\b/i.test(t)
  || (/\b(saca|retira|extrae|sostiene|sujeta|levanta)\b/i.test(t) && PIEZAS.test(t))
  || (esTransferencia(t) && /\b(cuentagotas|gotero|pipeta|cuchara)\b/i.test(t))
/** El aplicador vuelve al envase. */
const esCierre = (t: string) =>
  /\b(lo|la)\s+(tapa|cierra|enrosca)\b/i.test(t)
  || /\b(tapa|cierra|enrosca)\s+(el|la)\s+(envase|frasco|botella|bote|tubo|tarro|producto|cuentagotas|gotero|pipeta|tapa|tapón|aplicador)\b/i.test(t)
  || (/\b(vuelve a (poner|colocar|meter|introducir|insertar|enroscar)|coloca|guarda|devuelve|introduce|inserta|mete|enrosca)\b/i.test(t) && PIEZAS.test(t))

/**
 * DEFECTOS ESTRUCTURALES de un análisis forense: los que el pipeline puede detectar en
 * código y que, persistidos, cuestan un render entero. El forense es ESTOCÁSTICO —el
 * mismo video da tres sorteos distintos— y el prompt no es garantía, así que esto decide
 * si un sorteo se acepta o se vuelve a tirar. Devuelve un motivo por corte defectuoso.
 *  1. Colapso: un corte de más de 8 s con un solo hecho (varias acciones adentro).
 *  2. Trayectoria sin evento: el aplicador sale y vuelve al envase sin que el producto
 *     llegue al cuerpo — "sostiene el cuentagotas sobre la mejilla" → "vuelve a
 *     introducirlo". Grok ejecuta lo que lee: destapa y tapa, y la gota nunca cae.
 *  3. El reparto del diálogo: repetido entre cortes, que no reconstruye el guion, o que
 *     no entra en su ventana (`verificarDialogos`).
 *  4. Conflicto de manos: una mano ocupada que masajea o "ambas manos" sin haber soltado
 *     (`conflictosDeManos`) — el frasco desaparece en el render.
 */
export function defectosDelForense(report: { cortes?: { n: number; tiempo: string; duracionSeg: number; dialogo?: string; hechos?: Hecho[] }[]; guionOriginal?: string }): string[] {
  const out: string[] = verificarDialogos(report)
  const cortes = report.cortes ?? []
  const siguientes = new Map(cortes.map((c, i) => [c.n, cortes[i + 1] ? expandirHechos(cortes[i + 1].hechos ?? []).map((h) => h.texto) : undefined]))
  for (const c of cortes) {
    const hechos = c.hechos ?? []
    if (!hechos.length) continue // análisis anterior a los hechos: no se juzga
    // El colapso se juzga DESPUÉS de expandir: un hecho con tres acciones separadas por
    // "posteriormente" es tres hechos para el reparto, no uno.
    const textos = expandirHechos(hechos).map((h) => h.texto)
    if (c.duracionSeg > 8 && textos.length < 2) out.push(`corte ${c.n}: ${c.duracionSeg.toFixed(1)} s con un solo hecho`)
    if (textos.some(esApertura) && textos.some(esCierre) && !textos.some(esTransferencia))
      out.push(`corte ${c.n}: el aplicador sale y vuelve al envase sin que el producto llegue al cuerpo`)
    for (const m of conflictosDeManos(textos)) out.push(`corte ${c.n}: ${m}`)
    // La gota que cae sobre la piel se EXTIENDE, y ese hecho viene inmediatamente después
    // (en este corte o abriendo el siguiente). El forense de `493a486d` escribió la gota en
    // el corte 1 y en el corte 2 "sostiene el frasco frente al pecho con ambas manos": el
    // original extiende con las yemas a los 3,3 s y el render no masajeó nunca. Un salto
    // de la gota al gesto siguiente es un hecho que el modelo se saltó, no una elección.
    // Cerrar el envase o declarar las manos entre la gota y el masaje es legítimo: se salta.
    // Un estado con un gesto adentro ("sostiene el frasco… señalando la etiqueta") no.
    const estadoPuro = (t: string) => esEstadoDeManos(t) && !/\b(señal|senal|gesticul|muestr|acerc|alej|gir|levant|toc|apunt)/i.test(t)
    const i = textos.findIndex(esTransferenciaEnPiel)
    if (i >= 0) {
      const siguiente = [...textos.slice(i + 1), ...(siguientes.get(c.n) ?? [])].find((t) => !esCierre(t) && !estadoPuro(t))
      if (siguiente !== undefined && !esExtension(siguiente)) out.push(`corte ${c.n}: el producto cae sobre la piel y el hecho siguiente no lo extiende ("${siguiente}")`)
    }
  }
  return out
}
/** El producto llega a una zona de la PIEL (no a un vaso ni a una cuchara). */
const esTransferenciaEnPiel = (t: string) => esTransferencia(t) && /\b(mejilla|frente|rostro|cara|piel|cuello|ment[oó]n|p[oó]mulo|nariz|p[aá]rpado)\b/i.test(t)
/** La mano trabaja el producto sobre la piel. Vocabulario cerrado. */
const esExtension = (t: string) =>
  /\b(masajea|extiende|esparce|distribuye|reparte|difumina|frota|movimientos circulares|da (toques|golpecitos))\b/i.test(t)
  || (/\b(presiona|toca(ndo)?)\b/i.test(t) && /\b(mejilla|frente|rostro|cara|piel|cuello|ment[oó]n|p[oó]mulo|nariz|p[aá]rpado)\b/i.test(t))
/** Estado del aplicador al final de una secuencia de tramos: fuera (true) o en el envase. */
function aplicadorFuera(seq: string[]): boolean {
  let fuera = false
  for (const t of seq) { if (esCierre(t)) fuera = false; else if (esApertura(t)) fuera = true }
  return fuera
}
function piezaDe(tramos: string[]): string {
  const m = tramos.map((t) => t.match(PIEZAS)?.[1]?.toLowerCase()).find(Boolean)
  return { cuentagotas: 'el cuentagotas', gotero: 'el gotero', pipeta: 'la pipeta', tapa: 'la tapa', 'tapón': 'el tapón', cuchara: 'la cuchara' }[m ?? ''] ?? 'el aplicador'
}
function manoDe(estado: string): 'derecha' | 'izquierda' | 'ambas' | null {
  if (/ambas manos/i.test(estado)) return 'ambas'
  const m = estado.match(/(?:mano|con la|en la)\s+(derecha|izquierda)\b/i)
  return m ? (m[1].toLowerCase() as 'derecha' | 'izquierda') : null
}

/** La otra mano. `ambas` o sin dato no dejan ninguna libre que nombrar. */
const manoLibre = (ocupada: ReturnType<typeof manoDe>) =>
  ocupada === 'derecha' ? ('izquierda' as const) : ocupada === 'izquierda' ? ('derecha' as const) : null

const VALOR_NUMERO: Record<string, number> = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  primero: 1, segundo: 2, tercero: 3, cuarto: 4, quinto: 5,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
}
/** Como lo escribiría una persona: "levanta UN dedo", no "levanta uno dedos". */
const DEDOS = ['', 'un dedo', 'dos dedos', 'tres dedos', 'cuatro dedos', 'cinco dedos']

// Un ÍTEM de lista nombra el sustantivo ANTES del número ("número dos", "razón tres"), o
// es un ordinal al arrancar una cláusula ("Segundo, ..."). Nunca un numeral pelado: en la
// sesión `c32d229a` "tomar CINCO gramos al día" y "TRES razones para tomar" (que anuncia
// la lista, no un ítem) son los dos falsos positivos que esto tiene que rechazar.
const ITEM_CON_SUSTANTIVO = /\b(numero|razon|punto|paso|tip|consejo|motivo|beneficio|clave)\s+(uno|dos|tres|cuatro|cinco|[1-5])\b/
const ITEM_ORDINAL = /(?:^|[.;,:]\s*)(?:[ye]\s+)?(primero|segundo|tercero|cuarto|quinto)\b/

/**
 * El número que la locución enuncia COMO ÍTEM de una lista (1–5), o `undefined`.
 *
 * ⚠️ EXISTE PORQUE GROK CUENTA CON LOS DEDOS AUNQUE NADIE SE LO PIDA, Y CUENTA MAL.
 * Reportado sobre la sesión `c32d229a` (una listicle de "tres razones"): el avatar dice un
 * número y la mano libre hace otro. Verificado clip por clip, el gesto no tiene NINGUNA
 * relación con el número dicho — y la toma 3 gesticulaba con la izquierda mientras su
 * propio prompt decía que esa mano "permanece fuera de cuadro". O sea el estado declarado
 * PERDIÓ contra el número hablado, que es la asimetría que AGENTS.md ya mide: a un modelo
 * de difusión una prohibición le llega débil y una cantidad declarada es un dato.
 *
 * Por eso el único gate es la enumeración de la LOCUCIÓN, no lo que el forense dijo de la
 * mano: la primera versión condicionaba a que hubiera un gesto vago declarado y hacía
 * exactamente lo contrario de lo buscado — le agregaba el conteo a la toma que ya salía
 * bien (la mano fuera de cuadro) y se lo saltaba a la que producía el defecto.
 *
 * El tope es 5 porque se cuenta con UNA mano.
 */
export function numeroEnunciado(locucion: string): number | undefined {
  const s = sinTildes(locucion)
  const m = ITEM_CON_SUSTANTIVO.exec(s) ?? ITEM_ORDINAL.exec(s)
  if (!m) return undefined
  const n = VALOR_NUMERO[m[m.length - 1]]
  return n >= 1 && n <= 5 ? n : undefined
}

/**
 * Quita del hecho la cláusula que manda la mano LIBRE fuera de cuadro. Solo se aplica en
 * una toma que enumera, donde esa mano va a mostrar el número: dejar las dos órdenes en el
 * mismo prompt es el modo de fallo que este repo ya registra seis veces. Acote angosto (la
 * forma contigua, que es la que `partirEnTramos` deja como cláusula suelta) y fail-safe:
 * si al limpiar no queda nada, se devuelve el hecho intacto.
 */
function sinManoFueraDeCuadro(hecho: string, libre: 'derecha' | 'izquierda'): string {
  const re = new RegExp(`,?\\s*(?:y\\s+)?(?:la|su)\\s+mano\\s+${libre}\\s+(?:permanece|queda|se mantiene|sigue)[^,.;]*fuera de cuadro`, 'i')
  const limpio = hecho.replace(re, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').replace(/^[,;\s]+/, '').trim()
  return limpio || hecho
}

/**
 * CONFLICTO DE MANOS dentro de un corte: una mano que sostiene el envase o el aplicador y
 * que, sin soltarlo, masajea, señala o gesticula — o "ambas manos" haciendo algo mientras
 * una sigue ocupada. Grok resuelve la contradicción como puede: el frasco desaparece
 * (lote 3 de `493a486d`: "sostiene el frasco con la derecha, cuentagotas con la izquierda"
 * → "masajea con ambas manos") o le crece un brazo. Vocabulario cerrado; devuelve motivos.
 */
export function conflictosDeManos(textos: string[]): string[] {
  const out: string[] = []
  const ocupa: Record<'derecha' | 'izquierda', string | null> = { derecha: null, izquierda: null }
  const suelta = (mano: 'derecha' | 'izquierda') => { ocupa[mano] = null }
  for (const t of textos) {
    const s = t.toLowerCase()
    // qué sostiene cada mano, según el propio tramo
    for (const m of s.matchAll(/(?:sostiene|sujeta|mantiene|tiene|sosteniendo|sujetando|manteniendo)\s+(?:el|la|un|una)?\s*(frasco|envase|botella|producto|cuentagotas|gotero|pipeta|tapa)\s+(?:[^,;]*?\s)?con\s+la\s+(?:mano\s+)?(derecha|izquierda)\b/g)) ocupa[m[2] as 'derecha' | 'izquierda'] = m[1]
    for (const m of s.matchAll(/(?:la\s+)?(?:mano\s+)?(derecha|izquierda)\s+(?:sostiene|sujeta|mantiene)\s+(?:el|la|un|una)?\s*(frasco|envase|botella|producto|cuentagotas|gotero|pipeta|tapa)\b/g)) ocupa[m[1] as 'derecha' | 'izquierda'] = m[2]
    for (const m of s.matchAll(/(cuentagotas|gotero|pipeta)\s+con\s+la\s+(?:mano\s+)?(derecha|izquierda)\b/g)) ocupa[m[2] as 'derecha' | 'izquierda'] = m[1]
    if (/ambas manos/.test(s) && /(?:sostiene|sujeta)\s+(?:el|la)?\s*(frasco|envase|botella|producto)/.test(s)) { ocupa.derecha = 'frasco'; ocupa.izquierda = 'frasco' }
    // lo que se suelta: cierre del aplicador, o dejar / apoyar / pasar el envase
    if (esCierre(t)) for (const mano of ['derecha', 'izquierda'] as const) if (/cuentagotas|gotero|pipeta|tapa/.test(ocupa[mano] ?? '')) suelta(mano)
    if (/\b(deja|suelta|apoya|coloca)\b[^;]*\b(frasco|envase|botella|producto)\b|\bfuera de cuadro\b/.test(s)) { suelta('derecha'); suelta('izquierda') }
    // el conflicto: una acción corporal con "ambas manos" o con la mano ocupada
    const accion = /\b(masajea|extiende|frota|toca|acaricia|se\s+toca|gesticula|señala|senala|aplica)\b/.test(s)
    if (!accion) continue
    if (/ambas manos/.test(s) && !/(?:sostiene|sujeta)\s+(?:el|la)?\s*(frasco|envase|botella|producto)/.test(s)) {
      const libre = (['derecha', 'izquierda'] as const).filter((m) => ocupa[m]).map((m) => `${ocupa[m]} en la ${m}`)
      if (libre.length) out.push(`"${t}" con ambas manos mientras sigue ${libre.join(' y ')}`)
      continue
    }
    // la mano de la acción es la que va DESPUÉS del verbo: en "sostiene el frasco con la
    // izquierda y se toca el mentón con la derecha" la izquierda sostiene, no toca.
    const desde = s.search(/\b(masajea|extiende|frota|toca|acaricia|se\s+toca|gesticula|señala|senala|aplica)\b/)
    // y solo dentro de SU cláusula: "masajea con las yemas, sosteniendo el frasco con la
    // izquierda" — la izquierda sostiene, no masajea.
    const clausula = s.slice(desde).split(/,|;|\bmientras\b|\bsosteniendo\b|\bsujetando\b|\by\s+(?:sostiene|sujeta|mantiene)\b/)[0]
    const m = clausula.match(/\bcon\s+(?:las?\s+(?:yemas|dedos)\s+(?:de\s+)?(?:los\s+dedos\s+de\s+)?)?la\s+(?:mano\s+)?(derecha|izquierda)\b|\bcon\s+(?:los\s+dedos\s+de\s+)?la\s+(?:mano\s+)?(derecha|izquierda)\b/)
    const lado = m?.[1] ?? m?.[2]
    if (lado) {
      const mano = lado as 'derecha' | 'izquierda'
      // "aplica con el cuentagotas en la izquierda" es el uso del aplicador, no un conflicto
      if (ocupa[mano] && !/cuentagotas|gotero|pipeta/.test(ocupa[mano]!)) out.push(`"${t}" con la ${mano} mientras sigue ${ocupa[mano]} en la ${mano}`)
    }
  }
  return out
}
// En positivo y describiendo el ESTADO de arranque, no prohibiendo el gesto: la forma
// negativa ("no vuelve a dispensar") se renderizó igual sacando el gotero y soltando una
// gota antes de extender (lote 3 de `00471f8a`, 1 de 1). A un modelo de difusión una
// prohibición le llega débil; un estado declarado es un dato.
const YA_APLICADO = 'el producto ya está sobre la piel desde el inicio'
/** Las líneas que el reparto agrega en las fronteras: solo tienen sentido entre LOTES. */
const esAndamioDeFrontera = (h: string) =>
  h === YA_APLICADO || /^(el envase está cerrado|la mano (derecha|izquierda) está libre|termina con el envase)/i.test(h)

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
  // `groupIntoLotes` la sume anula el epsilon de `excedeTope`.
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

/**
 * CORTE POR TIEMPO, EN ESTADO CERRADO. Los puntos de corte legales son los finales de
 * frase de la locución (un clip no puede partir una frase); cada uno cae en un instante
 * de la toma proporcional a los caracteres. Se avanza tomando la frontera MÁS LEJANA que
 * deja el trozo dentro de 15 s y cuyo instante es un estado cerrado (el aplicador dentro
 * del envase, sin una transferencia a medias); si ninguna lo es, la más lejana que entra
 * — y `andamiar` cierra el envase en esa frontera. Devuelve los trozos con su ventana
 * como fracción de la toma, que es lo que `repartirPorTiempo` necesita.
 */
function trozosPorTiempo(t: TomaFinal, hechos: Hecho[]): { toma: TomaFinal; ventana: [number, number] }[] {
  const dur = sanearDuracion(t.duracionSeg)
  const partes = t.locucion.split(/(?<=[.!?])\s+/).filter((s) => s.trim())
  if (dur <= LOTE_MAX_SEC || partes.length < 2) {
    return splitLongToma(t).map((toma, i, arr) => {
      const antes = arr.slice(0, i).reduce((n, x) => n + x.duracionSeg, 0)
      return { toma, ventana: [antes / dur, (antes + toma.duracionSeg) / dur] as [number, number] }
    })
  }
  const total = partes.reduce((n, p) => n + p.length, 0) || 1
  const span = Math.max(...hechos.map((h) => h.hasta), dur)
  // fin de cada frase, como fracción de la toma
  const fines: number[] = []
  for (let i = 0, acc = 0; i < partes.length; i++) { acc += partes[i].length; fines.push(acc / total) }

  const out: { toma: TomaFinal; ventana: [number, number] }[] = []
  let desde = 0 // índice de la primera frase del trozo actual
  let a = 0     // fracción donde arranca el trozo actual
  while (desde < partes.length) {
    // candidatos: fines de frase j >= desde tales que el trozo [a, fin_j] entra en 15 s
    const cabe = (j: number) => (fines[j] - a) * dur <= LOTE_MAX_SEC + EPS
    let ultimoQueCabe = desde
    for (let j = desde; j < partes.length && cabe(j); j++) ultimoQueCabe = j
    let corte = ultimoQueCabe
    if (ultimoQueCabe < partes.length - 1) {
      // no es el último trozo: preferir la frontera más lejana en estado cerrado
      for (let j = ultimoQueCabe; j >= desde; j--) {
        if (!aplicadorFueraEn(hechos, fines[j] * span)) { corte = j; break }
      }
    }
    const b = fines[corte]
    const toma: TomaFinal = { ...t, duracionSeg: r1((b - a) * dur), locucion: partes.slice(desde, corte + 1).join(' ') }
    // una frase sola que no entra en 15 s se parte como siempre (sin puntos → uniforme)
    for (const sub of splitLongToma(toma)) {
      const prev = out.length ? out[out.length - 1].ventana[1] : a
      out.push({ toma: sub, ventana: [prev, Math.min(b, prev + sub.duracionSeg / dur)] })
    }
    out[out.length - 1].ventana[1] = b
    desde = corte + 1
    a = b
  }
  return out
}

/**
 * Parte una toma larga y REPARTE su coreografía entre los fragmentos. Con `hechos` del
 * forense (análisis nuevos) el corte es por tiempo y en estado cerrado; sin ellos, por
 * frases y proporcional (análisis anteriores).
 */
/**
 * Un hecho del forense que trae VARIAS cláusulas ("retira el gotero, deja caer una gota y
 * vuelve a insertarlo", 0–3.4 s) se parte en una por cláusula, repartiendo su ventana en
 * proporción a los caracteres. Es la firma del techo semántico del modelo (un corte largo
 * vuelve con un solo hecho aunque el prompt pida uno por elemento), y sin esto el corte
 * por tiempo se apagaba justo en los cortes que más lo necesitan. Es la MISMA suposición
 * proporcional que hace el reparto sin tiempos, aplicada dentro del hecho.
 */
export function expandirHechos(hechos: Hecho[]): Hecho[] {
  return hechos.flatMap((h) => {
    const partes = partirEnTramos(h.texto)
    if (partes.length < 2) return [h]
    const total = partes.reduce((n, x) => n + x.length, 0) || 1
    let t = h.desde
    return partes.map((texto) => {
      const desde = t
      t = Math.min(h.hasta, desde + ((h.hasta - h.desde) * texto.length) / total)
      return { desde, hasta: t, texto }
    })
  })
}

function partirToma(t: TomaFinal, hechosCrudos: Hecho[] = []): TomaFinal[] {
  const tramos = partirEnTramos(sinEscenaDeFoto(t.accionVisual))
  const hechos = expandirHechos(hechosCrudos)
  if (hechos.length >= 2 && tramos.length === hechos.length) {
    const trozos = trozosPorTiempo(t, hechos)
    if (trozos.length < 2) return trozos.map((x) => x.toma)
    const acciones = repartirPorTiempo(tramos, hechos, trozos.map((x) => x.ventana))
    return trozos.map((x, i) => ({ ...x.toma, accionVisual: acciones[i] }))
  }
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

export function groupIntoLotes(tomas: TomaFinal[], cortes: { tiempo: string; hechos?: Hecho[] }[] = []): Lote[] {
  // Los `hechos` con tiempo del forense, por `tiempoOriginal` (nunca por `n`): son lo
  // que permite cortar una toma larga por tiempo y en estado cerrado.
  const hechosDe = new Map(cortes.map((c) => [c.tiempo, c.hechos ?? []]))
  // Renumeramos TODA la secuencia expandida en orden: si una toma se divide, sus
  // fragmentos no pueden compartir el `n` original (colisionarían al rotular "Toma N"
  // en el prompt de Task 5 — dos "Toma 1" en el mismo guión). Numerar secuencial y
  // global es la forma más simple de garantizar unicidad y orden sin inventar un
  // esquema paralelo (sufijos, decimales) que Task 5 tendría que aprender a leer.
  const expandidas = tomas.flatMap((t) => partirToma(t, hechosDe.get(t.tiempoOriginal))).map((t, i) => ({ ...t, n: i + 1 }))
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
      // Las líneas de FRONTERA que agrega `repartirAccion` (estado heredado, envase cerrado,
      // mano libre, ya aplicado, "termina con") existen porque cada LOTE se renderiza sin
      // memoria. Entre dos fragmentos del MISMO corte que caen en el MISMO lote el clip es
      // continuo y esas líneas son ruido: se quitan.
      const mismoCorteAntes = i > 0 && lote.tomas[i - 1].tiempoOriginal === t.tiempoOriginal
      const mismoCorteDespues = i < lote.tomas.length - 1 && lote.tomas[i + 1].tiempoOriginal === t.tiempoOriginal
      const previos = new Set(mismoCorteAntes ? partirEnTramos(sinEscenaDeFoto(lote.tomas[i - 1].accionVisual)) : [])
      // UN HECHO POR LÍNEA, con los mismos cortes que usa el reparto (`partirEnTramos`).
      // El prompt del wizard que este repo verificó fotograma a fotograma escribe cada
      // hecho en su renglón (`Holding gotero in right hand.` / `Gently releasing one
      // clear drop onto her left cheek.`); el nuestro los metía todos en un renglón, y
      // ahí el modelo los resuelve como UN gesto — de ahí la gota que "aparece" en la
      // mejilla sin que el gotero llegue nunca. El texto es el MISMO, cambia dónde corta.
      const hechos = partirEnTramos(sinEscenaDeFoto(t.accionVisual))
        .filter((h) => !(mismoCorteAntes && ((previos.has(h) && esEstadoDeManos(h)) || (esAndamioDeFrontera(h) && !/^termina/i.test(h)))))
        .filter((h) => !(mismoCorteDespues && /^termina con el envase/i.test(h)))
      // EL NÚMERO QUE SE DICE ES EL NÚMERO QUE SE VE. Una locución que enumera hace que
      // grok cuente con la mano libre lo pida el prompt o no, y el conteo sale arbitrario:
      // en `c32d229a` el avatar dice "número dos" y la mano abre la palma entera. La
      // cantidad se DERIVA de las palabras que ya está diciendo (`numeroEnunciado`), así
      // que no inventa un gesto nuevo — le pone el número correcto al que va a ocurrir.
      // Va en la ÚLTIMA línea, pegada a la locución que contiene el número.
      const enunciado = numeroEnunciado(t.locucion ?? '')
      // ponytail: la mano ocupada sale de `esEstadoDeManos`, que está anclado al ARRANQUE
      // del hecho. Medido sobre las 27 sesiones guardadas, de 15 tomas que enumeran se
      // emiten 4: el resto nombra la mano a mitad de frase ("La mujer sostiene la botella
      // con la izquierda", "inicia el video sosteniendo...") o no nombra ninguna. El
      // fail-safe es el correcto —sin mano que nombrar no se inventa una—, y NO se afloja
      // el detector compartido: lo leen también el reparto, el andamiaje de frontera y los
      // dos guards del forense. Si hace falta subir la cobertura, el upgrade es una
      // lectura propia (la mano que va después del verbo de sostener, dentro de SU
      // cláusula, como ya hace `conflictosDeManos`) más un guard que no pise una mano
      // libre con acción declarada — no ensanchar `esEstadoDeManos`.
      const libre = manoLibre(manoDe(hechos.find(esEstadoDeManos) ?? ''))
      // Una mano libre que ya tiene una PIEZA declarada tiene trabajo propio: ahí el
      // conteo pediría una tercera mano. Sin mano libre que nombrar tampoco se emite —
      // "la mano libre" a secas no describe nada, y es el término que el forense tiene
      // prohibido por nombre.
      const conPieza = libre !== null && hechos.some((h) => PIEZAS.test(h) && manoDe(h) === libre)
      const conteo = enunciado && libre && !conPieza ? `levanta ${DEDOS[enunciado]} con la mano ${libre}` : null
      const finales = conteo ? [...hechos.map((h) => sinManoFueraDeCuadro(h, libre!)), conteo] : hechos
      // El plano se anuncia solo cuando CAMBIA respecto de la toma anterior: un shot
      // list se lee así, el plano vale hasta que se anuncia otro.
      const plano = multiPlano ? planoDe.get(t.tiempoOriginal) : undefined
      const anterior = multiPlano ? planoDe.get(lote.tomas[lote.tomas.indexOf(t) - 1]?.tiempoOriginal ?? '') : undefined
      const rotuloPlano = plano && plano !== anterior ? ` — ${plano}` : ''
      return [
        ...(lote.tomas.length > 1 ? [`Toma ${t.n} (${r1(t.duracionSeg)} s)${rotuloPlano}:`] : []),
        ...(!finales.length ? [SIN_HECHO_NUEVO]
          : unaLinea ? [`${finales.join('. ')}.`]
          : finales.map((h) => `  - ${h[0].toUpperCase()}${h.slice(1)}.`)),
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
  // LA CÁMARA NUNCA SE SUPONE. El micro-temblor solo va si el forense dijo "en mano":
  // agregarlo por defecto puso a moverse una cámara que en el original es fija (lote 3 de
  // `00471f8a`), y con "fija" en la misma línea eran dos órdenes opuestas. Sin cámara
  // (ningún corte empareja) la línea no se emite: la imagen decide el encuadre.
  const temblor = /\ben mano\b|temblor|handheld/i.test(camara) ? ' Grabado con teléfono en mano, con micro-temblor natural.' : ''
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
    // Entre hechos no se inventa nada: es lo único que el prompt permite entre uno y el
    // siguiente. Con los hechos cubriendo el clip, la quietud ya viene declarada. En el
    // escalón corrido (el piso del presupuesto) se suelta: ahí lo que manda es entrar.
    ...(unaLinea ? [] : ['Entre hechos sostiene lo que tiene y sigue hablando; ningún gesto fuera de la lista.', '']),
    ...(multiPlano
      ? [`CÁMARA: la de cada toma, anunciada arriba.${temblor}`]
      : camara.trim() ? [`CÁMARA: ${camara.replace(/\s*\.\s*$/, '')}.${temblor}`] : []),
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
