import { z } from 'zod'
import type { CreativeTemplate, TemplateSlot } from './templates'
import { slotsDelModelo } from './templates'

/**
 * EL LOTE — el eje B del spec (§14-§23): una plantilla y N anuncios conceptualmente distintos.
 *
 * ⚠️ EL PRINCIPIO, y es lo único que distingue esto de llamar N veces al generador: "genera 6
 * anuncios" NO significa "genera un anuncio seis veces". Significa DISEÑAR SEIS CONCEPTOS y
 * ejecutarlos dentro de la misma familia visual.
 *
 * Este repo ya pagó la lección con n=2: las versiones A y B del flujo clásico salían
 * byte-idénticas mientras B era "A con 2-5 palabras sustituidas", y solo se separaron cuando cada
 * una recibió un TRABAJO genuinamente distinto. `Section4Copy` todavía carga el detector de "las
 * dos salieron iguales" por eso. Si hizo falta a n=2, es obligatorio a n=10.
 */

// ─── El plan del lote ────────────────────────────────────────────────────────

export const PlanVarianteSchema = z.object({
  /** El mecanismo que esta variante ejecuta: "errores", "mitos", "hábitos", "objeción". */
  concepto: z.string(),
  /** Por dónde entra: el dolor, deseo u objeción concreto que ataca. Es lo que la separa. */
  angulo: z.string(),
  /** La idea que el copy tiene que ejecutar. El QUÉ, antes de escribir el CÓMO (§10). */
  mensaje: z.string(),
})
export type PlanVariante = z.infer<typeof PlanVarianteSchema>

export const PlanLoteSchema = z.object({ variantes: z.array(PlanVarianteSchema).min(1) })

/** Lo que devuelve el escritor para UNA variante. */
export const CopyVarianteSchema = z.object({
  slots: z.array(z.object({ slot: z.string(), texto: z.string() })).min(1),
})
export type CopyVariante = z.infer<typeof CopyVarianteSchema>

// ─── Normalización, compartida por las dos verificaciones ────────────────────

function palabras(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

// ─── §12 · Validación de layout ──────────────────────────────────────────────

/**
 * Qué slots se pasaron de largo. Devuelve sus ids, no un booleano: el reintento tiene que poder
 * NOMBRARLOS.
 *
 * ⚠️ EL TOPE NO VIAJA COMO `maxLength` DEL SCHEMA, y esa es la parte que hay que respetar.
 * Medido en landing: OpenAI aplica `maxLength` AL DECODIFICAR, así que no devuelve un texto largo
 * que se pueda reintentar — devuelve el texto CORTADO exactamente en el tope, a mitad de frase
 * ("…¡No te quedes a"), y zod lo acepta porque 90 ≤ 90. Gemini hace lo contrario: lo ignora. Un
 * `.max()` en el schema del modelo cambia un texto largo por un muñón, que es peor.
 *
 * Con holgura del 20 %: los topes son un presupuesto de layout, no una regla ortográfica, y
 * rechazar un titular por una palabra quema un reintento por nada.
 */
export const HOLGURA_SLOT = 1.2

export function slotsLargos(
  slots: { slot: string; texto: string }[],
  definiciones: TemplateSlot[]
): string[] {
  const tope = new Map(definiciones.map((d) => [d.id, d.maxPalabras]))
  return slots
    .filter((s) => {
      const max = tope.get(s.slot)
      return max !== undefined && palabras(s.texto).length > Math.ceil(max * HOLGURA_SLOT)
    })
    .map((s) => s.slot)
}

/**
 * La corrección que se agrega al prompt del reintento.
 *
 * ⚠️ EXISTE PORQUE UN REINTENTO CIEGO NO SIRVE. Medido en landing con este mismo modo de fallo:
 * reintentar con el MISMO prompt devuelve lo mismo, porque el modelo nunca se entera de que se
 * pasó. Nombrar los campos es lo que hace que el segundo intento sea distinto del primero.
 */
export function correccionDeSlots(ids: string[], definiciones: TemplateSlot[]): string {
  const tope = new Map(definiciones.map((d) => [d.id, d.maxPalabras]))
  const detalle = ids.map((id) => `${id} (máximo ${tope.get(id) ?? '?'} palabras)`).join(', ')
  return (
    `Estos huecos se pasaron de largo y no entran en el diseño: ${detalle}. ` +
    `Reescríbelos MÁS CORTOS diciendo lo mismo. No los cortes a la mitad: una frase entera y breve, ` +
    `nunca una frase larga truncada.`
  )
}

// ─── §22 · Duplicados semánticos ─────────────────────────────────────────────

/**
 * Pares de variantes demasiado parecidas entre sí.
 *
 * Determinista y a propósito: el spec dice explícitamente que no hay que sobreingenierizar esto,
 * y una segunda llamada a un LLM para juzgar lo que el planificador acaba de escribir es
 * preguntarle dos veces lo mismo. Lo que de verdad previene el duplicado es que el planificador
 * vea las N variantes EN UNA SOLA LLAMADA (mismo argumento por el que las identidades de varios
 * personajes de video se resuelven juntas: llamadas separadas devuelven N variantes de lo mismo).
 * Esto es la red que verifica que haya funcionado.
 *
 * ponytail: solo REPORTA. El usuario revisa los conceptos antes de gastar una sola imagen, así
 * que la salida barata es que vuelva a planificar — el mismo botón "no me convence" que ya existe
 * en video-ads. Si se mide que se dispara seguido, el upgrade es reemplazar solo los duplicados.
 */
/** Dos ángulos que se parecen tanto son el mismo, aunque el concepto se llame distinto. */
export const SIMILITUD_MAX = 0.6
/** Compartiendo concepto alcanza con que los ángulos se rocen para que sean la misma variante. */
export const SIMILITUD_MISMO_CONCEPTO = 0.25

/**
 * ⚠️ SON DOS SEÑALES Y NO UNA, y la primera versión de esto (Jaccard sobre concepto+ángulo
 * juntos) fallaba su propio caso: "errores / las manchas siguen volviendo" contra "errores /
 * las manchas vuelven siempre" daba 0,43 y se colaba. Meter el concepto en la misma bolsa que
 * el ángulo lo DILUYE — es una o dos palabras contra ocho.
 *
 * Separadas, cada umbral dice algo interpretable: compartir concepto hace sospechoso un roce
 * del ángulo, y un ángulo casi calcado es duplicado aunque el concepto se llame distinto. Dos
 * variantes con el mismo concepto pero ángulos genuinamente distintos (dos objeciones
 * diferentes) NO se marcan — un detector ruidoso enseña a ignorarlo.
 */
export function conceptosDuplicados(variantes: { concepto: string; angulo: string }[]): [number, number][] {
  const conceptos = variantes.map((v) => palabras(v.concepto).join(' '))
  const angulos = variantes.map((v) => new Set(palabras(v.angulo)))
  const pares: [number, number][] = []
  for (let i = 0; i < variantes.length; i++) {
    for (let j = i + 1; j < variantes.length; j++) {
      const roce = jaccard(angulos[i], angulos[j])
      const mismoConcepto = conceptos[i] === conceptos[j]
      if (roce > SIMILITUD_MAX || (mismoConcepto && roce > SIMILITUD_MISMO_CONCEPTO))
        pares.push([i, j])
    }
  }
  return pares
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let comunes = 0
  for (const w of a) if (b.has(w)) comunes++
  return comunes / (a.size + b.size - comunes)
}

// ─── Los prompts ─────────────────────────────────────────────────────────────

export interface ContextoLote {
  template: CreativeTemplate
  productName: string
  whatItIs: string | null
  whatItDoes: string
  targetAudience: string
  brandingDescription: string | null
  productDescription: string
  comments: string
}

/**
 * EL PLANIFICADOR DEL LOTE (§16). Una sola llamada que ve las N variantes juntas.
 *
 * ⚠️ VER LAS N JUNTAS ES EL MECANISMO, no una optimización. N llamadas sueltas de "genera otro
 * anuncio diferente" producen variación superficial — el propio spec lo ejemplifica ("3 razones
 * para usar X" / "3 motivos para usar X" / "3 razones por las que necesitas X"): técnicamente
 * distintas, el mismo concepto. Un modelo que ve el lote entero puede repartir.
 */
export function buildPlanPrompt(ctx: ContextoLote, n: number): string {
  const { template: t } = ctx
  return [
    `Eres el director creativo de una campaña. Vas a diseñar ${n} CONCEPTOS publicitarios distintos`,
    `para un mismo producto, todos dentro de la misma plantilla visual.`,
    ``,
    `=== LA PLANTILLA (fija, no se discute) ===`,
    `Nombre: ${t.nombre} — ${t.descripcion}`,
    `Mecanismo creativo: ${t.blueprint.creativeConcept}`,
    `Lógica persuasiva: ${t.blueprint.persuasiveLogic}`,
    `Huecos de texto que hay que llenar: ${slotsDelModelo(t).map((s) => `${s.id} (${s.etiqueta})`).join(', ')}`,
    ``,
    `=== EL PRODUCTO ===`,
    `Nombre: ${ctx.productName}`,
    `Qué es: ${ctx.whatItIs ?? 'no especificado'}`,
    `Qué hace: ${ctx.whatItDoes}`,
    `Público: ${ctx.targetAudience}`,
    `Descripción del envase: ${ctx.productDescription}`,
    `Texto impreso en la etiqueta: ${ctx.brandingDescription ?? 'no disponible'}`,
    ``,
    `=== LA VOZ DE LA AUDIENCIA (comentarios reales de TikTok) ===`,
    ctx.comments,
    ``,
    `=== TU TRABAJO ===`,
    `Devuelve EXACTAMENTE ${n} variantes. Cada una es un anuncio con una razón estratégica DISTINTA`,
    `para existir, no una forma distinta de decir lo mismo.`,
    ``,
    `Reparte los ${n} conceptos entre estas dimensiones, sin repetir la combinación:`,
    `  - de qué DOLOR, DESEO u OBJECIÓN parte (sácalos de los comentarios: cada variante ataca una`,
    `    preocupación REAL distinta de las que aparecen ahí);`,
    `  - qué ESTRATEGIA usa (error que comete, mito que cree, hábito que repite, causa que ignora,`,
    `    ingrediente que no conoce, comparación con lo que ya usa, objeción que la frena,`,
    `    resultado que quiere);`,
    `  - en qué NIVEL DE CONCIENCIA está quien lo lee (no sabe que tiene el problema / sabe el`,
    `    problema pero no la solución / conoce la solución pero duda del producto).`,
    ``,
    `⚠️ Dos variantes que se puedan resumir con la misma frase son UNA sola variante. Si dos de las`,
    `tuyas comparten dolor Y estrategia, cambia una: el lote entero se juzga por cuánto se`,
    `diferencian entre sí, no por lo bien que suena cada una.`,
    ``,
    `Para cada variante devuelve:`,
    `  concepto: el mecanismo, en una o dos palabras ("errores", "mitos", "objeción de precio").`,
    `  angulo: el dolor, deseo u objeción concreto del que parte, en las palabras de la audiencia.`,
    `  mensaje: la idea que el anuncio tiene que dejar. Una oración. Es el QUÉ, no el texto final:`,
    `  todavía NO escribas el copy.`,
    ``,
    `Todo en español peruano neutro, con tuteo. Nunca voseo (sos, vos, tenés, querés) ni`,
    `regionalismos de otras variedades (che, güey, parcero, chévere, vosotros).`,
    `Nunca inventes cifras, plazos, avales, certificaciones ni reseñas.`,
  ].join('\n')
}

/**
 * EL ESCRITOR (§10: primero se decide la lógica, después se redacta).
 *
 * Una llamada POR VARIANTE, en paralelo. No es simetría con el planificador: el planificador
 * tiene que ver el lote junto para repartir, y el escritor tiene que ver UNA para concentrarse.
 * Y en paralelo el fallo queda aislado — una variante caída no tumba el lote (§29).
 */
export function buildCopyPrompt(ctx: ContextoLote, v: PlanVariante, correccion?: string): string {
  const { template: t } = ctx
  const slots = slotsDelModelo(t)
  return [
    `Escribe el texto de UN anuncio. La plantilla y el concepto ya están decididos: tu trabajo es`,
    `llenar sus huecos, no elegir otro camino.`,
    ``,
    `=== EL CONCEPTO DE ESTE ANUNCIO (no lo cambies) ===`,
    `Concepto: ${v.concepto}`,
    `Ángulo: ${v.angulo}`,
    `Mensaje que tiene que dejar: ${v.mensaje}`,
    ``,
    `=== EL PRODUCTO ===`,
    `Nombre: ${ctx.productName}`,
    `Qué es: ${ctx.whatItIs ?? 'no especificado'}`,
    `Qué hace: ${ctx.whatItDoes}`,
    `Público: ${ctx.targetAudience}`,
    `Texto impreso en la etiqueta: ${ctx.brandingDescription ?? 'no disponible'}`,
    ``,
    `=== LA VOZ DE LA AUDIENCIA ===`,
    ctx.comments,
    ``,
    `⚠️ Los comentarios son de dónde sacas el VOCABULARIO —cómo nombran su problema, qué esperan—,`,
    `nunca texto para pegar. No cites un comentario, no cosas dos, y no metas una frase que no`,
    `concuerde gramaticalmente con la oración que la rodea. Un comentario escrito en otra variedad`,
    `de español es una puerta de entrada al voseo y a regionalismos ajenos: toma la idea, no las`,
    `palabras.`,
    ``,
    `=== LOS HUECOS (devuelve uno por cada uno, con su id exacto) ===`,
    ...slots.map((s) => `  ${s.id} — ${s.etiqueta}. Máximo ${s.maxPalabras} palabras. Tono: ${s.tono}.`),
    ``,
    `=== REGLAS DE ESTA PLANTILLA ===`,
    ...t.reglasCopy.map((r) => `  - ${r}`),
    ``,
    `=== REGLAS GENERALES ===`,
    `  - Español peruano neutro, con tuteo. Nunca voseo ni regionalismos de otras variedades.`,
    `  - Los topes de palabras son de DISEÑO: un texto más largo no entra en el anuncio y se`,
    `    imprime cortado. Escribe corto de entrada, no largo y luego recortado.`,
    `  - Nunca inventes precio, descuento, número de reseñas, calificación, ingrediente, mecanismo,`,
    `    garantía, política de devolución, certificación, aval médico ni plazo que el usuario no`,
    `    haya dado. Si la etiqueta no lo dice, no existe.`,
    `  - El anuncio completo se lee como escrito por UNA sola persona: los huecos se encadenan, no`,
    `    se repiten entre sí ni repiten la misma palabra clave en todos.`,
    correccion ? `\n⚠️ ${correccion}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
