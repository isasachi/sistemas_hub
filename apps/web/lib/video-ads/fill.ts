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
  /**
   * Todo lo que el usuario entregó (inputs + etiqueta del envase). Cuando se pasa, un
   * valor que afirma algo que no está en ninguna fuente se descarta.
   *
   * Existe por una medición: con una etiqueta que solo dice "Kukamonga" y "90 mg de
   * melatonina", una corrida entregó "extracto de valeriana", "vitamina B6" y "ácido
   * gamma-aminobutírico (GABA)" — un guión RENDERIZABLE, con 0 pendientes, afirmando una
   * composición falsa. `ungrounded` ya vigilaba eso, pero solo en `acceptRewrite`, y ahí
   * llega tarde por partida doble: los valores inventados entran igual por
   * `fillTemplate`, y además se pasan como `fuentes` de la reescritura, así que un
   * ingrediente inventado se respalda a sí mismo.
   *
   * ⚠️ Rechaza también las traducciones de la etiqueta ("dormir" por "Fall Asleep"), que
   * el prompt pide expresamente. Se acepta ese costo: lo rechazado queda pendiente y lo
   * escribe el usuario, mientras que un ingrediente inventado en un anuncio publicado es
   * una declaración falsa de composición. La regla 9 del spec no admite grises.
   */
  fuentes?: string[],
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

    const sinRespaldo = fuentes?.length ? ungrounded(v, fuentes) : null
    const malo =
      !!sinRespaldo ||
      v.length > MAX_VALOR ||
      norm(v).join(' ').includes(norm(s.nombre).join(' ')) ||
      [...ngramas(norm(v), 3)].some((g) => andamio.get(s.toma)?.has(g))

    if (malo) rechazados.push(s.id)
    // La puntuación final se recorta acá y no se le pide al modelo: la frase ya trae la
    // suya, y un valor que termina en punto produce ".." en el guión. Caso real:
    // "andas muy cansada por las mañanas..". Es más fiable un `replace` que una regla
    // de prompt que hay que acertar en cada pasada.
    else limpios[s.id] = v.replace(/[.,;:]+$/, '').trim()
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
/**
 * Variantes de un fragmento de andamiaje por CONTRACCIÓN del español.
 *
 * `al` = a+el y `del` = de+el. Cuando el hueco se lleva el artículo, la contracción
 * desaparece y el modelo escribe la forma suelta — que es lo gramaticalmente correcto:
 * el original dice "ayuda AL equilibrio hormonal" y la plantilla queda "ayuda A
 * [beneficio]". Exigir copia byte a byte lee eso como "el modelo no copió" y descarta
 * la toma entera. Caso real: 2 de 7 tomas marcadas como desalineadas por esto.
 */
function conContraccion(lit: string): string[] {
  const out = [lit]
  if (/\ba(\s+)$/.test(lit)) out.push(lit.replace(/\ba(\s+)$/, 'al$1'))
  if (/\bde(\s+)$/.test(lit)) out.push(lit.replace(/\bde(\s+)$/, 'del$1'))
  return out
}

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
      let encontrado = -1
      for (const v of conContraccion(antes)) {
        const k = dialogo.indexOf(v, pos)
        if (k >= 0) { encontrado = k + v.length; break }
      }
      if (encontrado < 0) return null
      pos = encontrado
    }
    const sig = literales[i + 1]
    let fin = dialogo.length
    if (sig) {
      fin = -1
      for (const v of conContraccion(sig)) {
        const k = dialogo.indexOf(v, pos)
        if (k >= 0) { fin = k; break }
      }
    }
    if (fin < 0) return null
    huecos.push({ nombre: nombres[i], original: dialogo.slice(pos, fin) })
    pos = fin
  }
  return { literales, huecos }
}

/**
 * Qué decía el ORIGINAL en cada hueco, indexado por el `id` de `extractSlots`.
 * ---------------------------------------------------------------------------
 * Es el contexto que el spec tiene gratis y esta implementación no tenía: cuando el
 * PROMPT MAESTRO corre de una sola pasada, el modelo ve el guión original al lado de la
 * plantilla, así que sabe que en ese hueco iba un NOMBRE COMERCIAL de dos palabras y no
 * la categoría del producto. Acá la FASE 3 elegía el valor mirando solo la etiqueta del
 * hueco y sus palabras vecinas — y con esa información "gomitas de melatonina" es una
 * respuesta correcta para `[producto]`, aunque el original dijera "Gomi Energy".
 *
 * Es un EXTRA, no la base: `alignSlots` devuelve `null` cuando el modelo parafraseó, y
 * justo las sesiones de una sola toma larga son las que más fallan la alineación. Lo que
 * no puede faltar nunca es el diálogo completo del corte, que va al prompt sin depender
 * de esto.
 */
export function slotOriginals(
  t: ScriptTemplate,
  cortes: { n: number; dialogo: string }[],
): Record<string, string> {
  const porN = new Map(cortes.map((c) => [c.n, c.dialogo]))
  const slots = extractSlots(t)
  const cuantos = (s: string) => (s.match(HUECO) ?? []).length
  const out: Record<string, string> = {}

  // Se avanza sobre `slots` con un cursor en vez de filtrar por `toma.n`: el `n` viene
  // del forense y nada garantiza que sea único, así que filtrar mezclaría los huecos de
  // dos tomas homónimas. `extractSlots` recorre en este mismo orden, por construcción.
  let k = 0
  for (const toma of t.tomas) {
    const propios = slots.slice(k, k + cuantos(toma.locucion))
    k += cuantos(toma.locucion) + cuantos(toma.accionVisual)

    const dialogo = porN.get(toma.n)
    const al = dialogo ? alignSlots(dialogo, toma.locucion) : null
    if (!al) continue
    al.huecos.forEach((h, i) => {
      const texto = h.original.trim()
      if (propios[i] && texto) out[propios[i].id] = texto
    })
  }
  return out
}

/**
 * "Este es el X de la marca Y y se llama Z" son TRES datos distintos —categoría, marca y
 * nombre comercial— y la FASE 2 los marcaba los tres como `[Producto]`. Con la misma
 * etiqueta tres veces, la FASE 3 les pone el mismo valor: "el suero de la marca suero y
 * se llama suero".
 *
 * El prompt ya pide los tres nombres por separado; esto es el respaldo para cuando no
 * obedece. Renombra por lo que hay INMEDIATAMENTE ANTES del hueco, que en español es
 * inequívoco: detrás de "de la marca" solo puede venir una marca. Es angosto a
 * propósito — dos marcadores, no un clasificador — y solo pisa nombres genéricos, así
 * que un hueco que el modelo ya nombró bien nunca se toca.
 */
const ROL_POR_ANTECEDENTE: [RegExp, string][] = [
  [/\bde\s+(?:la\s+)?marca\s*$/i, 'nombre de la marca'],
  [/\bse\s+llama\s*$/i, 'nombre del producto'],
]
const NOMBRES_GENERICOS = new Set([
  'producto', 'categoría del producto', 'categoria del producto', 'tipo de producto',
])

function rolPorContexto(nombre: string, antes: string): string {
  if (!NOMBRES_GENERICOS.has(nombre.toLowerCase())) return nombre
  for (const [re, rol] of ROL_POR_ANTECEDENTE) if (re.test(antes)) return rol
  return nombre
}

export interface SlotCapReport {
  antes: number
  despues: number
  /** Tomas cuyo andamiaje no coincide con su corte: el modelo no copió. */
  desalineadas: number[]
  /** Huecos genéricos renombrados a su rol real: `Producto → Marca`. */
  renombrados: string[]
  /** Huecos que compartían nombre siendo datos distintos, ahora numerados. */
  numerados: string[]
}

/**
 * Corrige los nombres de hueco genéricos que la FASE 2 no supo distinguir.
 * ---------------------------------------------------------------------------
 * `Este es el X de la marca Y y se llama Z` son TRES datos distintos, y el modelo tiende
 * a etiquetarlos los tres igual. Con la misma etiqueta, la FASE 3 les pone el mismo
 * valor: "el suero de la marca suero y se llama suero". Acá se deduce el rol por lo que
 * hay INMEDIATAMENTE ANTES del hueco, que en español es inequívoco.
 *
 * ⚠️ ESTA FUNCIÓN LLEGÓ A HACER DOS COSAS MÁS Y AMBAS ESTABAN AL REVÉS. Desmarcaba los
 * huecos cuyo original era un número y fusionaba las enumeraciones del mismo nombre en
 * uno solo, todo para bajar el conteo hacia un "entre 5 y 8" que YO inventé y que el
 * spec nunca pidió. La plantilla de referencia que escribió el dueño del repo para el
 * mismo video de prueba tiene 23 huecos, marca `casi a punto de entrar a los 30` como
 * `[situación personal / edad / hito]` y mantiene los tres ingredientes como
 * `[ingrediente 1..3]` numerados — exactamente lo contrario de lo que esto hacía.
 *
 * El razonamiento correcto va en la otra dirección y ya estaba escrito acá mismo:
 * desmarcar un hueco deja su palabra ORIGINAL en el guión, así que marcar de MENOS es lo
 * peligroso. "en cara y en cuello" sin marcar es falso para un champú; "de día y de
 * noche" es falso para una mascarilla semanal; "todo tipo de piel" es una afirmación
 * sobre un producto que nadie validó. Más huecos = menos texto ajeno colado en el
 * anuncio del usuario. No reintroduzcas el recorte por conteo.
 */
export function normalizeSlots(
  t: ScriptTemplate,
  cortes: { n: number; dialogo: string }[],
): { template: ScriptTemplate; reporte: SlotCapReport } {
  const porN = new Map(cortes.map((c) => [c.n, c.dialogo]))
  const reporte: SlotCapReport = { antes: extractSlots(t).length, despues: 0, desalineadas: [], renombrados: [], numerados: [] }

  const tomas = t.tomas.map((toma) => {
    const dialogo = porN.get(toma.n)
    if (!dialogo) return toma
    const al = alignSlots(dialogo, toma.locucion)
    // Sin alineación no se puede reescribir sin riesgo de corromper el texto: se deja
    // la locución como está y se reporta, que es lo único honesto que se puede hacer.
    if (!al) { reporte.desalineadas.push(toma.n); return toma }

    const { literales, huecos } = al
    let out = literales[0]
    for (let i = 0; i < huecos.length; i++) {
      const rol = rolPorContexto(huecos[i].nombre, literales[i])
      if (rol !== huecos[i].nombre) reporte.renombrados.push(`${huecos[i].nombre} → ${rol}`)
      out += `[${rol}]${literales[i + 1] ?? ''}`
    }
    return { ...toma, locucion: out }
  })

  // SEGUNDA PASADA — nombres repetidos para datos DISTINTOS.
  // El mismo nombre en dos huecos hace que la FASE 3 les ponga el mismo valor: es el
  // fallo de los tres `[Producto]`, y reaparece entre tomas — en una sesión real
  // `[beneficio 1]` salió en tres tomas para tres beneficios distintos. Acá se puede
  // decidir en código porque `alignSlots` recupera QUÉ decía el original en cada hueco:
  // si dos huecos de la misma familia tienen texto original distinto, son datos
  // distintos y se numeran; si coincide (el producto nombrado tres veces) NO se tocan,
  // porque las tres apariciones tienen que recibir la misma palabra.
  //
  // Se agrupa por FAMILIA (el nombre sin su número final) y no por nombre exacto: el
  // modelo ya numera a veces, y mal — repetir `beneficio 1` tres veces es precisamente
  // el caso a arreglar, así que saltarse los nombres que ya llevan dígito dejaba fuera
  // el defecto. Renumerar la familia entera evita además chocar con un `beneficio 2`
  // que ya existiera.
  const familia = (n: string) => n.replace(/\s+\d+$/, '')
  const alineadas = new Map<number, ReturnType<typeof alignSlots>>()
  const porFamilia = new Map<string, string[]>()
  for (const toma of tomas) {
    const dialogo = porN.get(toma.n)
    const al = dialogo ? alignSlots(dialogo, toma.locucion) : null
    alineadas.set(toma.n, al)
    for (const h of al?.huecos ?? []) {
      const f = familia(h.nombre)
      const vistos = porFamilia.get(f) ?? []
      const clave = h.original.trim().toLowerCase()
      if (!vistos.includes(clave)) vistos.push(clave)
      porFamilia.set(f, vistos)
    }
  }
  const multiples = new Set([...porFamilia].filter(([, v]) => v.length > 1).map(([k]) => k))

  const numeradas = !multiples.size ? tomas : tomas.map((toma) => {
    const al = alineadas.get(toma.n)
    if (!al) return toma
    let out = al.literales[0]
    al.huecos.forEach((h, i) => {
      const f = familia(h.nombre)
      let nombre = h.nombre
      if (multiples.has(f)) {
        const idx = porFamilia.get(f)!.indexOf(h.original.trim().toLowerCase()) + 1
        nombre = `${f} ${idx}`
        if (nombre !== h.nombre) reporte.numerados.push(`${h.nombre} → ${nombre} ("${h.original.trim()}")`)
      }
      out += `[${nombre}]${al.literales[i + 1] ?? ''}`
    })
    return { ...toma, locucion: out }
  })

  const template = { ...t, tomas: numeradas, guionFillInBlank: numeradas.map((x) => x.locucion).join(' ') }
  reporte.despues = extractSlots(template).length
  return { template, reporte }
}

/**
 * Resuelve el id de hueco que devolvió un modelo contra los ids reales de la plantilla.
 *
 * Los ids llevan el nombre del hueco dentro (`situación personal / edad / hito#1`), y un
 * modelo que los reescribe pierde detalles: en una corrida real devolvió
 * `situacion personal / edad / hito#1` —sin tilde— y `ingrediente 4` —sin el `#1`—. Con
 * una búsqueda exacta esas dos correcciones se aplicaban a NADA y el log decía que sí:
 * el fallo más caro de todos, porque se reporta como éxito.
 *
 * Se compara normalizado (sin acentos, sin mayúsculas, espacios colapsados) y con `#1`
 * por defecto cuando falta el sufijo. Devuelve `null` si no hay match, para que el
 * caller pueda reportarlo en vez de tragárselo.
 */
export function resolveSlotId(slots: Slot[], id: string): string | null {
  const clave = (x: string) => {
    const t = x.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
    return t.includes('#') ? t : `${t}#1`
  }
  const objetivo = clave(id)
  return slots.find((s) => clave(s.id) === objetivo)?.id ?? null
}

/**
 * ¿Es aceptable este ajuste de andamiaje?
 * ---------------------------------------------------------------------------
 * El andamiaje —el texto fuera de los corchetes— lo copia código, y esa es LA garantía
 * del sistema: fidelidad del 100% por construcción, no por obediencia. Esta función
 * abre la única excepción, y existe porque hay frases donde NINGÚN valor cabe: el
 * original dice "andas muy ___" y el producto nuevo no tiene ningún adjetivo que poner
 * ahí. Con el andamiaje congelado, ese hueco no tiene solución posible.
 *
 * El spec lo contempla — la directiva crítica 13 permite "pequeños ajustes gramaticales
 * exclusivamente para: género; número; concordancia; tiempos verbales; naturalidad
 * mínima indispensable". Esto es esa licencia, acotada en código.
 *
 * ⚠️ Solo se aplica al guión ADAPTADO. La plantilla sigue siendo copia literal del
 * original: es el artefacto que tiene que espejar la referencia, y no se toca nunca.
 *
 * Los topes son deliberadamente flojos en palabras y duros en DATOS. Se probó un tope
 * estricto de palabras contra el caso real y rechazaba justamente el arreglo que esto
 * viene a permitir: "andas muy no puedo dormir por las noches" → "andas sin poder dormir
 * por las noches" cambia 5 de 8 palabras. Lo que no puede pasar es que el modelo escriba
 * OTRO anuncio, y eso se vigila por lo que tiene que sobrevivir intacto: los valores ya
 * rellenados, los pendientes y el largo.
 */
export function acceptScaffoldFix(args: {
  original: string
  propuesta: string
  /**
   * Valores sustituidos en esa toma que tienen que sobrevivir al ajuste. NO incluye el
   * del hueco que motivó el cambio: ese es precisamente el que no cabía, y exigir que
   * siga ahí rechazaría el único caso para el que esta excepción existe. El caller lo
   * excluye (ver `adapt-script/route.ts`).
   */
  valores: string[]
}): { ok: true } | { ok: false; motivo: string } {
  const { original, propuesta, valores } = args
  const p = propuesta.trim()
  if (!p) return { ok: false, motivo: 'vacío' }
  if (p === original.trim()) return { ok: false, motivo: 'no cambia nada' }

  // Un anuncio nuevo no se disfraza de ajuste: el largo se mueve poco.
  const ratio = p.length / (original.length || 1)
  if (ratio < 0.65 || ratio > 1.35)
    return { ok: false, motivo: `el largo cambia demasiado (${Math.round(ratio * 100)}% del original)` }

  // Los datos ya rellenados no se pueden perder ni reescribir.
  const faltante = valores.find((v) => v.trim() && !p.includes(v.trim()))
  if (faltante) return { ok: false, motivo: `pierde el valor "${faltante}"` }

  // Un pendiente no se resuelve por la puerta de atrás: lo escribe el usuario.
  const pendientes = original.match(/\[PENDIENTE:[^\]]*\]/gi) ?? []
  const perdido = pendientes.find((m) => !p.includes(m))
  if (perdido) return { ok: false, motivo: `hace desaparecer ${perdido}` }

  // Ni corchetes nuevos que nadie pidió.
  const antes = (original.match(HUECO) ?? []).length
  if ((p.match(HUECO) ?? []).length > antes) return { ok: false, motivo: 'introduce marcadores nuevos' }

  // Y por debajo de la mitad de las palabras compartidas ya no es un ajuste, es otra frase.
  const wo = norm(original), wp = new Set(norm(p))
  const conservadas = wo.filter((w) => wp.has(w)).length
  const pct = wo.length ? conservadas / wo.length : 1
  if (pct < 0.5) return { ok: false, motivo: `solo conserva el ${Math.round(pct * 100)}% de las palabras` }

  return { ok: true }
}

/**
 * Fracción del ANDAMIAJE de la plantilla que sobrevive en un texto reescrito.
 * El andamiaje es lo de fuera de los corchetes: las palabras que vienen del video de
 * referencia. Conservarlas ES la promesa del producto ("el guión es el del original").
 */
export function scaffoldFidelity(plantilla: string, texto: string): number {
  const andamio = norm(plantilla.replace(HUECO, ' '))
  if (!andamio.length) return 1
  const presentes = new Set(norm(texto))
  return andamio.filter((w) => presentes.has(w)).length / andamio.length
}

/**
 * Piso de fidelidad para aceptar que el MODELO reescriba una locución en vez de que la
 * arme `fillTemplate`.
 *
 * El número no es arbitrario: cuando se le pedía al modelo escribir el guión adaptado sin
 * ninguna verificación, conservaba entre el 66% y el 71% de las palabras del original —
 * ese era el nivel de deriva que hizo abandonar el enfoque. 0.85 está cómodamente por
 * encima de eso, así que una reescritura que pase este filtro no es de las que derivaban.
 */
export const FIDELIDAD_MIN = 0.85

/**
 * Primera palabra de contenido del texto que no aparece en ninguna fuente, o `null` si
 * todas están respaldadas.
 *
 * Se miran solo las palabras de 5+ letras: las cortas son andamiaje gramatical y no
 * afirman nada sobre el producto. La comparación es por PREFIJO de 5 para tolerar la
 * flexión ("ayuda"/"ayudan"/"ayudarte" comparten raíz), que es justo la libertad
 * gramatical que la reescritura viene a ganar — sin eso, cada conjugación nueva se
 * leería como invención.
 */
/**
 * Secuencia de palabras que aparece dos veces SEGUIDAS, o `null`.
 *
 * El eco es la firma de que la redacción pegó un valor que ya contenía las palabras del
 * andamiaje. `rejectBadValues` lo vigila en los valores, pero la reescritura es texto
 * libre y no pasa por ahí: caso real, "estás en mis veintitantos como yo como yo".
 */
function repeticionInmediata(texto: string): string | null {
  const w = norm(texto)
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + 2 * n <= w.length; i++) {
      const a = w.slice(i, i + n).join(' ')
      if (a === w.slice(i + n, i + 2 * n).join(' ')) return a
    }
  }
  return null
}

function ungrounded(texto: string, fuentes: string[]): string | null {
  const pool = norm(fuentes.join(' ')).map((w) => w.slice(0, 5))
  const respaldada = new Set(pool)
  for (const w of norm(texto)) {
    if (w.length < 5) continue
    if (!respaldada.has(w.slice(0, 5))) return w
  }
  return null
}

/**
 * ¿Se acepta la locución que reescribió el modelo, o se cae al relleno determinista?
 * ---------------------------------------------------------------------------
 * Este es el cambio de garantía CONSTRUCTIVA a garantía VERIFICADA. `fillTemplate`
 * garantiza el andamiaje por construcción —copia y pega— pero por eso mismo nadie
 * escribe la frase, y las costuras salen rotas: "andas muy no puedo dormir por las
 * noches", "te ayuda a ayudarte a dormir". El spec no tiene ese problema porque su
 * modelo REDACTA el guión con el original delante, como haría una persona.
 *
 * La razón por la que ahora se puede permitir y antes no: antes no había forma de
 * detectar la deriva. Ahora se mide contra el andamiaje de la plantilla, y lo que no
 * pasa el filtro cae al relleno determinista, que sigue siendo el piso. Nunca se queda
 * peor que hoy — como mucho, igual.
 */
export function acceptRewrite(args: {
  /** Locución de la PLANTILLA, con sus corchetes: de ahí sale el andamiaje. */
  plantilla: string
  /** Relleno determinista de esa toma: el piso al que se cae si esto se rechaza. */
  piso: string
  propuesta: string
  /**
   * Todo lo que el usuario entregó: inputs, texto de la etiqueta y los valores elegidos.
   *
   * ponytail: hoy NO se usa — alimentaba el guard de invención que se quitó arriba. Se
   * conserva el parámetro (opcional) para no tocar los dos call sites ni los tests, y
   * porque es el enganche natural si algún día hace falta un guard acotado (por ejemplo,
   * solo contra premios y avales médicos, que el prompt sí sigue prohibiendo).
   */
  fuentes?: string[]
}): { ok: true; fidelidad: number } | { ok: false; motivo: string; fidelidad: number } {
  const { plantilla, piso, propuesta } = args
  const t = propuesta.trim()
  const fidelidad = scaffoldFidelity(plantilla, t)
  if (!t) return { ok: false, motivo: 'vacía', fidelidad }

  const ratio = t.length / (piso.length || 1)
  if (ratio < 0.6 || ratio > 1.4)
    return { ok: false, motivo: `el largo se va (${Math.round(ratio * 100)}% del relleno)`, fidelidad }

  // Un pendiente MENOS que el piso significa que el modelo rellenó por su cuenta algo
  // que el paso de valores dejó vacío — y `extractPending` es lo que bloquea el render,
  // así que eso abriría la puerta con contenido inventado.
  const marcador = /\[PENDIENTE:/gi
  if ((t.match(marcador) ?? []).length < (piso.match(marcador) ?? []).length)
    return { ok: false, motivo: 'resuelve por su cuenta un hueco que quedó pendiente', fidelidad }

  if (fidelidad < FIDELIDAD_MIN)
    return { ok: false, motivo: `conserva el ${Math.round(fidelidad * 100)}% del andamiaje`, fidelidad }

  const eco = repeticionInmediata(t)
  if (eco) return { ok: false, motivo: `repite "${eco}" dos veces seguidas`, fidelidad }

  // ⚠️ ACÁ HABÍA UN GUARD DE INVENCIÓN (`ungrounded`) Y SE QUITÓ A PROPÓSITO
  // (2026-08-24, decisión del dueño del repo). Rechazaba toda palabra de contenido que
  // no estuviera ya en la plantilla, los inputs, los valores o la etiqueta — o sea,
  // exactamente lo que ahora se le PIDE al modelo: autocompletar los huecos deduciendo
  // del contexto y, si no alcanza, aproximando. Dejarlo puesto habría hecho que cada
  // reescritura autocompletada cayera al relleno determinista y el guión volviera a
  // salir con `[PENDIENTE: …]`: la función nueva no haría nada y el síntoma sería
  // "no cambió nada", que es el peor modo de fallo posible.
  //
  // Lo que NO se quitó, porque es la otra mitad de la orden ("la plantilla no se
  // inventa"): `FIDELIDAD_MIN` sobre el andamiaje, el eco y el conteo de pendientes.
  // Es el andamiaje lo que tiene que sobrevivir intacto, no el vocabulario.

  return { ok: true, fidelidad }
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
