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
