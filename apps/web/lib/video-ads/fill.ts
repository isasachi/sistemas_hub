import type { ScriptTemplate } from './template'

/**
 * Sustitución determinista del Fill in the Blank.
 * ---------------------------------------------------------------------------
 * Rellenar la plantilla NO es trabajo de un modelo. Es reemplazo de cadenas: se copia
 * todo lo que está fuera de los corchetes y se cambia lo de dentro. Pedírselo a un LLM
 * costó cuatro rondas de ajuste de prompt con el mismo resultado — conservaba entre el
 * 66% y el 71% de las palabras del original y cada empujón en una dirección rompía otra
 * cosa: se tragaba preposiciones, cambiaba "mi cara" por "la cara", escribía el nombre
 * del hueco ("Este es el tipo de producto de la marca Pure") o metía el valor de una
 * variable en el hueco de otra.
 *
 * Acá el copiado lo hace código, así que la fidelidad fuera de los corchetes es del
 * 100% por construcción, no por obediencia. Al modelo le queda lo que sí necesita
 * criterio: elegir el valor de cada hueco.
 *
 * La unidad canónica son las locuciones de las tomas, no `guionFillInBlank`: en la
 * plantilla real las locuciones reconstruyen el guión carácter por carácter, y tenerlas
 * como única fuente evita que el mismo hueco exista dos veces (una en el guión y otra
 * en su toma) y reciba dos valores distintos.
 */

const HUECO = /\[[^\]]+\]/g

export interface Slot {
  /** Identificador estable: `nombre#n`, con n contando apariciones de ese nombre. */
  id: string
  /** El nombre del hueco, sin corchetes: `parte del cuerpo`. */
  nombre: string
  /** Dónde aparece, para que el modelo pueda elegir un valor coherente. */
  contexto: string
  /** `locucion` = lo que se dice; `accion` = lo que el cuerpo hace. */
  campo: 'locucion' | 'accion'
  /** Número de toma. */
  toma: number
}

/** Recorre la plantilla SIEMPRE en el mismo orden: por toma, primero locución y luego acción. */
function* recorrer(t: ScriptTemplate): Generator<{ toma: number; campo: Slot['campo']; texto: string }> {
  for (const toma of t.tomas) {
    yield { toma: toma.n, campo: 'locucion', texto: toma.locucion }
    yield { toma: toma.n, campo: 'accion', texto: toma.accionVisual }
  }
}

/**
 * Los huecos de la plantilla, numerados. Dos apariciones del mismo nombre son slots
 * distintos: en un guión real `[parte del cuerpo]` sale una vez por "cara" y otra por
 * "cuello", y colapsarlas daba "en la piel y en la piel".
 */
export function extractSlots(t: ScriptTemplate): Slot[] {
  const vistos = new Map<string, number>()
  const out: Slot[] = []
  for (const { toma, campo, texto } of recorrer(t)) {
    for (const m of texto.matchAll(HUECO)) {
      const nombre = m[0].slice(1, -1).trim()
      const n = (vistos.get(nombre) ?? 0) + 1
      vistos.set(nombre, n)
      const i = m.index ?? 0
      out.push({
        id: `${nombre}#${n}`,
        nombre,
        contexto: `…${texto.slice(Math.max(0, i - 45), i)}⟦${nombre}⟧${texto.slice(i + m[0].length, i + m[0].length + 45)}…`,
        campo,
        toma,
      })
    }
  }
  return out
}

/**
 * Un valor de hueco es una palabra o un sintagma corto. Más largo que esto y no es un
 * valor: es una frase, y meterla dentro de una frase que ya existe produce el engendro
 * que motivó este guard.
 */
const MAX_VALOR = 60

const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)

/** Todas las secuencias de `n` palabras consecutivas. */
function ngramas(palabras: string[], n: number): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + n <= palabras.length; i++) out.add(palabras.slice(i, i + n).join(' '))
  return out
}

/**
 * Descarta los valores que no pueden ser valores, ANTES de sustituirlos.
 * ---------------------------------------------------------------------------
 * `fillTemplate` copia literalmente lo que se le da, que es justo su virtud: no
 * interpreta. Eso convierte un mal valor del modelo en texto imposible. Caso real, con
 * la plantilla `Este es el [Producto] de la marca [Producto] y se llama [Producto].`:
 * el modelo devolvió como valor del primer hueco la ORACIÓN ENTERA ya rellenada ("Este
 * es el suero de la marca La Roche-Posay y se llama Suero de niacinamida"), y al
 * sustituirla dentro de la frase que ya la contenía salió esto —
 *
 *   "Este es el Este es el suero de la marca La Roche-Posay y se llama Suero de
 *    niacinamida de la marca Suero de niacinamida de la marca La Roche-Posay y se
 *    llama Suero de niacinamida. y se llama…"
 *
 * — que es lo que el usuario llamó "un monstruo de Frankenstein". Cuatro rondas de
 * prompt no lo evitaron; el prompt PEOR aún lo causaba, porque el ejemplo que le daba
 * al modelo de "esto salió mal" tenía forma de valor y se lo copiaba. Verificarlo en
 * código sí lo evita, pase lo que pase con el texto del prompt.
 *
 * Tres criterios, todos por la misma razón (un valor no es una frase):
 *  1. más largo que `MAX_VALOR`;
 *  2. contiene el nombre del propio hueco ("el tipo de producto de la marca…");
 *  3. repite tres palabras seguidas del texto que rodea al hueco en su toma — la firma
 *     exacta del eco: el valor trae "este es el" y la plantilla ya dice "Este es el".
 *
 * Lo descartado se devuelve como hueco vacío, así que `fillTemplate` deja su marcador
 * `[PENDIENTE: …]` y el usuario lo escribe él. Es el mismo desenlace que un valor que el
 * modelo no supo rellenar: preferible a texto ilegible dentro de un lote pagado.
 */
export function rejectBadValues(
  t: ScriptTemplate,
  valores: Record<string, string>,
): { valores: Record<string, string>; rechazados: string[] } {
  // El andamiaje de cada toma: su texto CON los huecos quitados. Es lo que el valor no
  // puede repetir, porque ya está escrito alrededor de él.
  const andamio = new Map<number, Set<string>>()
  for (const toma of t.tomas) {
    andamio.set(toma.n, ngramas(norm(toma.locucion.replace(HUECO, ' ')), 3))
  }

  const limpios: Record<string, string> = {}
  const rechazados: string[] = []
  for (const s of extractSlots(t)) {
    const v = valores[s.id]?.trim()
    if (!v) continue

    const malo =
      v.length > MAX_VALOR ||
      norm(v).join(' ').includes(norm(s.nombre).join(' ')) ||
      [...ngramas(norm(v), 3)].some((g) => andamio.get(s.toma)?.has(g))

    if (malo) rechazados.push(s.id)
    else limpios[s.id] = v
  }
  return { valores: limpios, rechazados }
}

/**
 * Reconstruye qué texto del diálogo original ocupaba cada hueco.
 *
 * Se puede porque el andamiaje —lo que está FUERA de los corchetes— es idéntico carácter
 * por carácter al diálogo del corte; es la regla de copia que la FASE 2 tiene que
 * cumplir. Entonces lo que hay entre dos trozos literales consecutivos, en el diálogo, es
 * exactamente lo que el modelo reemplazó por el corchete.
 *
 * Devuelve `null` si un trozo literal no aparece en el diálogo en su orden: eso significa
 * que el modelo NO copió, y entonces no hay forma segura de reescribir esa locución.
 */
export function alignSlots(
  dialogo: string,
  locucion: string,
): { literales: string[]; huecos: { nombre: string; original: string }[] } | null {
  const literales = locucion.split(HUECO)
  const nombres = [...locucion.matchAll(HUECO)].map((m) => m[0].slice(1, -1).trim())
  const huecos: { nombre: string; original: string }[] = []
  let pos = 0
  for (let i = 0; i < nombres.length; i++) {
    const antes = literales[i]
    if (antes) {
      const k = dialogo.indexOf(antes, pos)
      if (k < 0) return null
      pos = k + antes.length
    }
    const sig = literales[i + 1]
    const fin = sig ? dialogo.indexOf(sig, pos) : dialogo.length
    if (fin < 0) return null
    huecos.push({ nombre: nombres[i], original: dialogo.slice(pos, fin) })
    pos = fin
  }
  return { literales, huecos }
}

/**
 * Un hueco cuyo texto original es UNIVERSAL no debía marcarse: cualquier anuncio de
 * cualquier producto puede decir esa palabra igual, así que convertirla en variable solo
 * fabrica un agujero que alguien tiene que rellenar a mano.
 *
 * La lista se limita a NÚMEROS a propósito, y es el caso que se vio de verdad: en la
 * sesión real la plantilla marcó `[Problema]` sobre el "30" de "casi a punto de entrar a
 * los 30 como yo" — una edad, que el prompt de FASE 2 ya nombra textualmente como
 * ejemplo de lo que NO se marca. Ensanchar esto a un léxico de palabras "genéricas" es
 * justo cómo se empieza a desmarcar cosas que sí importan: desmarcar un hueco deja la
 * palabra ORIGINAL en el guión, así que equivocarse acá con "propóleo" publica un
 * ingrediente falso.
 */
const universal = (texto: string) => /^\s*\d+([.,]\d+)?\s*$/.test(texto)

/** Entre dos huecos del mismo nombre, solo puntuación o conjunción: es una enumeración. */
const SEPARADOR_ENUM = /^[\s,;]*(?:y|e|o|u)?[\s,;]*$/i

export interface SlotCapReport {
  antes: number
  despues: number
  /** Textos originales que se devolvieron al guión por ser universales. */
  desmarcados: string[]
  /** Huecos que desaparecieron al fusionar enumeraciones. */
  fusionados: number
  /** Tomas cuyo andamiaje no coincide con su corte: el modelo no copió. */
  desalineadas: number[]
}

/**
 * Acota los huecos de la plantilla, en código, después de que el modelo la devuelve.
 * ---------------------------------------------------------------------------
 * En la sesión real la FASE 2 marcó 17 huecos sobre un guión de 11 tomas, incluidos 5
 * `[Producto]` y un `[Problema]` sobre una edad. El prompt ya pide moderación y ya nombra
 * ese caso; cuatro rondas de redacción no lo consiguieron, así que se acota acá.
 *
 * Hace DOS cosas, las dos seguras:
 *
 *  1. **Desmarca los universales.** El hueco vuelve a ser la palabra original. Nada se
 *     pierde: esa palabra sirve igual para cualquier producto, que es la definición de
 *     universal.
 *  2. **Fusiona enumeraciones del mismo nombre.** `[Ingrediente], [Ingrediente] y
 *     [Ingrediente]` pasa a ser UN hueco que cubre la lista entera. Tres blancos que
 *     pedían tres datos se vuelven uno que pide una lista — menos trabajo para quien
 *     escribe, y no se pierde nada porque la enumeración es una sola pieza de
 *     información.
 *
 * Lo que NO hace, y es deliberado: no baja el conteo hasta un número objetivo. Desmarcar
 * un hueco deja su palabra ORIGINAL en el guión, así que recortar hasta 8 en el caso real
 * obligaría a desmarcar `propóleo`, `niacinamida` y `Apivita` — y el anuncio del usuario
 * afirmaría que SU producto contiene los ingredientes y la marca del producto del video
 * de referencia. Es exactamente la clase de declaración falsa que la regla de no inventar
 * existe para impedir, solo que entrando por la puerta de atrás. El conteo que queda se
 * reporta; no se disfraza de objetivo cumplido.
 */
export function capSlots(
  t: ScriptTemplate,
  cortes: { n: number; dialogo: string }[],
): { template: ScriptTemplate; reporte: SlotCapReport } {
  const porN = new Map(cortes.map((c) => [c.n, c.dialogo]))
  const reporte: SlotCapReport = { antes: extractSlots(t).length, despues: 0, desmarcados: [], fusionados: 0, desalineadas: [] }

  const tomas = t.tomas.map((toma) => {
    const dialogo = porN.get(toma.n)
    if (!dialogo) return toma
    const al = alignSlots(dialogo, toma.locucion)
    // Sin alineación no se puede reescribir sin riesgo de corromper el texto: se deja
    // la locución como está y se reporta, que es lo único honesto que se puede hacer.
    if (!al) { reporte.desalineadas.push(toma.n); return toma }

    const { literales, huecos } = al
    let out = literales[0]
    let i = 0
    while (i < huecos.length) {
      // Extiende la corrida mientras el siguiente hueco se llame igual y entre medio
      // solo haya coma o conjunción.
      let j = i
      while (
        j + 1 < huecos.length &&
        huecos[j + 1].nombre === huecos[i].nombre &&
        SEPARADOR_ENUM.test(literales[j + 1])
      ) j++

      if (j > i) {
        reporte.fusionados += j - i
        out += `[${huecos[i].nombre}]`
      } else if (universal(huecos[i].original)) {
        reporte.desmarcados.push(huecos[i].original.trim())
        out += huecos[i].original
      } else {
        out += `[${huecos[i].nombre}]`
      }
      out += literales[j + 1] ?? ''
      i = j + 1
    }
    return { ...toma, locucion: out }
  })

  const template = { ...t, tomas, guionFillInBlank: tomas.map((x) => x.locucion).join(' ') }
  reporte.despues = extractSlots(template).length
  return { template, reporte }
}

export interface FilledTemplate {
  guionFinal: string
  tomas: { n: number; locucion: string; accionVisual: string; duracionSeg: number }[]
}

/**
 * Sustituye cada hueco por su valor. Un hueco sin valor queda como
 * `[PENDIENTE: nombre]` — el mismo marcador que el wizard ya sabe pedirle al usuario.
 *
 * El recorrido es idéntico al de `extractSlots`, así que la numeración coincide sin
 * necesidad de guardar nada entre las dos llamadas.
 */
export function fillTemplate(t: ScriptTemplate, valores: Record<string, string>): FilledTemplate {
  const vistos = new Map<string, number>()
  const sustituir = (texto: string) =>
    texto.replace(HUECO, (bruto) => {
      const nombre = bruto.slice(1, -1).trim()
      const n = (vistos.get(nombre) ?? 0) + 1
      vistos.set(nombre, n)
      const v = valores[`${nombre}#${n}`]?.trim()
      return v || `[PENDIENTE: ${nombre}${n > 1 ? ` ${n}` : ''}]`
    })

  const tomas = t.tomas.map((toma) => ({
    n: toma.n,
    // El orden importa: locución antes que acción, igual que en `recorrer`.
    locucion: sustituir(toma.locucion),
    accionVisual: sustituir(toma.accionVisual),
    duracionSeg: toma.duracionSeg,
  }))

  // Las locuciones son una partición del guión, así que unirlas lo reconstruye.
  return { guionFinal: tomas.map((x) => x.locucion).join(' '), tomas }
}

/**
 * Comprueba que la plantilla sirva para rellenar antes de gastar la llamada siguiente.
 *
 * Existe por un fallo real: la FASE 2 devolvió las nueve tomas con
 * `locucion: "[Texto de locución]"` —el nombre del campo en vez del texto— y como las
 * locuciones son la fuente canónica del guion, el resultado fue un guion compuesto solo
 * de marcadores. El usuario vio nueve campos vacíos que pedían "Texto de locución" y el
 * resto del guion borrado.
 *
 * Devuelve el motivo si la plantilla no sirve, o null si está bien.
 */
export function validateTemplate(t: ScriptTemplate): string | null {
  // Defensivo aunque el schema exija min(1): este guard existe justamente para el
  // caso en que la plantilla venga mal, así que no puede ser él quien tire un 500.
  if (!Array.isArray(t.tomas) || !t.tomas.length) return 'La plantilla no tiene tomas.'

  const soloHueco = t.tomas.filter((x) => /^\s*\[[^\]]*\]\s*$/.test(x.locucion))
  if (soloHueco.length)
    return `${soloHueco.length} de ${t.tomas.length} tomas traen un marcador en vez de la locución (por ejemplo "${soloHueco[0].locucion}").`

  // Las locuciones son una partición del guion: si suman mucho menos, se perdió texto.
  const sumadas = t.tomas.map((x) => x.locucion).join(' ').length
  if (t.guionFillInBlank.length > 0 && sumadas < t.guionFillInBlank.length * 0.7)
    return `Las locuciones de las tomas suman ${sumadas} caracteres y el guion tiene ${t.guionFillInBlank.length}: falta texto en las tomas.`

  return null
}

/**
 * Arma la plantilla a partir de lo único que el modelo decide (dónde van los huecos)
 * y de lo que ya existe (los cortes del análisis forense).
 *
 * Las tomas NO se le piden al modelo: son los cortes, uno a uno, con su duración y su
 * acción observada. Pedírselas produjo frases partidas a la mitad, oraciones enteras
 * dentro de un corchete y tomas cuyo texto era el nombre del campo — tres formas
 * distintas del mismo error, que es pedirle a un modelo algo que ya está calculado.
 *
 * Un corte sin locución devuelta cae a su diálogo crudo: sin huecos no se podrá
 * adaptar esa frase, pero el guion no pierde el texto.
 */
export function assembleTemplate(
  draft: { locuciones: { n: number; texto: string }[]; escenario: ScriptTemplate['escenario']; edicion: ScriptTemplate['edicion']; resumenParaUsuario: string },
  cortes: { n: number; dialogo: string; duracionSeg: number; accion: string }[],
): ScriptTemplate {
  // Defensivo aunque el schema exija cortes.min(1): si el forense viniera vacío, el
  // error tiene que salir por `validateTemplate` con su motivo, no como un 500 pelado.
  // El modelo a veces devuelve la locución envuelta en las comillas con que se le
  // mostró el diálogo, o con restos de JSON pegados. Eso terminaba leyéndose en voz
  // alta en el video, así que se limpia acá en vez de confiar en que no lo haga.
  const limpiar = (x: string) =>
    x.replace(/^[\s"'«»`]+|[\s"'«»`]+$/g, '').replace(/\}\s*,\s*\{/g, ' ').trim()
  const porN = new Map((draft.locuciones ?? []).map((l) => [l.n, limpiar(l.texto)]))
  const tomas = (cortes ?? []).map((c) => ({
    n: c.n,
    locucion: porN.get(c.n)?.trim() || c.dialogo,
    // La acción va cruda: la FASE 3 la adapta contra el corte original, no contra esto.
    accionVisual: c.accion,
    duracionSeg: c.duracionSeg,
  }))
  return {
    guionFillInBlank: tomas.map((t) => t.locucion).join(' '),
    escenario: draft.escenario,
    tomas,
    edicion: draft.edicion,
    resumenParaUsuario: draft.resumenParaUsuario,
  }
}
