import { z } from 'zod'
import type { TomaFinal } from './adapt'
import type { MotionProfile, VoiceProfile } from './character'
import { KIE_PROMPT_MAX } from './kie'
import { nicheSpec } from './niches'
import { etiqueta, type Personaje } from './personajes'

/**
 * FASE 5 del prompt maestro — agrupación de tomas en lotes de generación.
 * ---------------------------------------------------------------------------
 * Esto es aritmética, no criterio: agrupar por duración y cortar en 15 s no necesita
 * un LLM, y pedírselo lo volvería no determinista justo donde importa que no lo sea
 * (el tope de 15 s es también el techo duro del modelo de KIE).
 *
 * ⚠️ EL TOPE LO PONE EL MODELO, NO EL SPEC. El spec dice 15 s; `veo3_fast` acepta
 * EXACTAMENTE 4, 6 u 8 segundos, así que el techo real es 8 y el 15 del spec ya no se
 * puede cumplir aunque se quiera. Consecuencia directa: un guión da ~2x lotes que con
 * grok, y cada lote es una llamada PAGADA. La duración final de cada lote la fija
 * `snapDuration` (kie.ts), que es donde se decide qué se pierde al ajustar.
 *
 * INVARIANTE QUE ESTE MÓDULO EXISTE PARA GARANTIZAR: ningún `Lote` devuelto por
 * `groupIntoLotes` puede tener `duracionSeg > LOTE_MAX_SEC`. Cada lote es una llamada
 * PAGADA a la API de video; uno inválido cuesta dinero y falla tarde (o peor, alguien
 * río abajo lo clampea y el audio sale cortado a mitad de frase). Todo lo de abajo
 * (saneo de duraciones, recursión en `splitLongToma`, comparación con epsilon en el
 * guard) está para que ese invariante se cumpla pase lo que pase con el input, no solo
 * en el caso feliz.
 */

export const LOTE_MAX_SEC = 8

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

export function groupIntoLotes(
  tomas: TomaFinal[],
  planoPorTiempo?: Map<string, string>,
  /** Cuántos encuadres distintos puede contener UN clip. 1 = el original manda el corte
   *  (máxima fidelidad, máximo costo). Ver la nota de costo en la cabecera. */
  maxPlanos = 1,
): Lote[] {
  // Renumeramos TODA la secuencia expandida en orden: si una toma se divide, sus
  // fragmentos no pueden compartir el `n` original (colisionarían al rotular "Toma N"
  // en el prompt de Task 5 — dos "Toma 1" en el mismo guión). Numerar secuencial y
  // global es la forma más simple de garantizar unicidad y orden sin inventar un
  // esquema paralelo (sufijos, decimales) que Task 5 tendría que aprender a leer.
  const expandidas = tomas.flatMap(splitLongToma).map((t, i) => ({ ...t, n: i + 1 }))
  const lotes: Lote[] = []
  let actual: TomaFinal[] = []
  let acumulado = 0

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
  }

  for (const t of expandidas) {
    // "Si agregar la siguiente Toma provoca que el lote supere 15.0 segundos: NO la
    // agregues. Esa Toma pasa automáticamente a ser la primera del siguiente Lote."
    // Nota: `t.duracionSeg` ya viene <= LOTE_MAX_SEC garantizado por `splitLongToma`
    // (recursivamente), así que una toma sola SIEMPRE entra en un lote propio aunque
    // el lote esté vacío — el guard de abajo solo protege la SUMA con lo ya acumulado.
    if (actual.length && excedeTope(acumulado + t.duracionSeg)) cerrar()
    // …y también si cambia el encuadre: el clip que sale de acá es continuo (ver la
    // cabecera). Solo se compara contra la toma anterior DEL LOTE ABIERTO, así que un
    // plano que vuelve más adelante abre su propio lote, igual que en el original.
    else if (actual.length && planoPorTiempo) {
      const ahora = planoPorTiempo.get(t.tiempoOriginal)
      if (ahora) {
        const yaEnLote = new Set(
          actual.map((x) => planoPorTiempo.get(x.tiempoOriginal)).filter(Boolean),
        )
        // Cierra si este encuadre es nuevo Y el lote ya llegó a su cupo. Con
        // `maxPlanos = 1` es "cierra en cuanto cambie el plano"; con 2 o 3 el clip
        // puede contener ese número de encuadres distintos.
        if (!yaEnLote.has(ahora) && yaEnLote.size >= maxPlanos) cerrar()
      }
    }
    actual.push(t)
    acumulado += t.duracionSeg
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
 * El párrafo que prohíbe overlay. Con grok existió en dos versiones —larga y comprimida—
 * porque los 4096 caracteres obligaban a elegir entre repetir la prohibición y describir
 * el movimiento. Veo acepta 60.000: se usa siempre la larga.
 */
const BLOQUE_OVERLAY = [
  'TEXTO / OVERLAY: NINGUNO.',
  'No generes captions, subtítulos, texto en pantalla, títulos, lower thirds, banners,',
  'stickers, emojis, flechas, callouts, gráficos, watermarks, interfaces ni elementos',
  'de UI. El plano queda visualmente limpio, centrado en el personaje y el producto.',
  'Solo puede aparecer el texto físicamente impreso en el producto o en objetos reales',
  'del escenario, como parte de su apariencia.',
  // La contraparte FÍSICA de la regla de overlay: lo de arriba prohíbe gráficos añadidos,
  // esto prohíbe el equipo con el que se grabó el original. Un micrófono en cuadro
  // delata que es una grabación y no un video casero, que es lo contrario del formato.
  'Tampoco aparece equipo de grabación: ni micrófonos de mano o corbateros, ni cañas,',
  'ni trípodes, ni aros de luz, ni cámaras o teléfonos a la vista.',
  'No inventes diálogo para rellenar: el clip termina cuando termina la locución.',
]

/**
 * Prompt de un lote. Es autosuficiente por obligación: el generador no recuerda el
 * lote anterior, así que personaje, producto, escenario, iluminación y cámara se
 * repiten completos en cada uno. Escribir "el mismo personaje" produciría otra
 * persona, que es exactamente el fallo que este diseño evita.
 *
 * PRESUPUESTO DE CARACTERES: el detalle forense de un lote real no siempre cabe en
 * `KIE_PROMPT_MAX` (AGENTS.md documenta ~6300 chars con ~11 beats, contra un tope de
 * 4096). Esta función es la única que conoce la estructura del prompt y por tanto el
 * único lugar que puede decidir QUÉ recortar sin perder información real — un caller
 * que reciba el string ya armado no tiene forma de saberlo. Por eso el presupuesto se
 * administra acá adentro, no en quien llama (Task 6): se prueban niveles de detalle
 * decrecientes y se devuelve el más detallado que entre. El guard de Task 6 antes de
 * `createTask` sigue existiendo, pero pasa a ser la última red, no el único control.
 */
export function buildLotePrompt(args: {
  lote: Lote
  consistencyBlock: string
  productDesc: string
  escenario: string
  camara: string
  voz: VoiceProfile
  /** Cómo se mueve. Null en sesiones anteriores a FASE 4.6: el bloque no se emite. */
  movimiento?: MotionProfile | null
  images: LoteImage[]
  /** Los cortes del forense, para poder decir QUÉ plano va con QUÉ toma (ver abajo). */
  cortes?: { tiempo: string; camara: string }[]
  /** Nicho de la sesión: en ropa/zapatos el producto se LLEVA PUESTO, y el bloque que
   *  lo describe como "un objeto" contradice al bloque de consistencia. Ver niches.ts. */
  niche?: unknown
  /** `frames`: las imágenes son el primer y el último fotograma del clip, no material de
   *  referencia — la leyenda `@image(n)` no aplica y confunde. Ver kie.ts. */
  mode?: 'frames' | 'reference'
  /** Todos los personajes del anuncio. Con uno solo (o sin la lista) el prompt sale
   *  exactamente igual que antes del soporte de varios. */
  personajes?: Personaje[]
  /** Quién habla en cada `tiempoOriginal` (ver `hablantesPorTiempo`). */
  quien?: Map<string, Personaje[]>
  /** Qué `tiempoOriginal` son VOZ EN OFF: se oye la narración pero nadie habla en cuadro. */
  vozEnOff?: Set<string>
}): string {
  const { lote, consistencyBlock, productDesc, escenario, camara, voz, movimiento, images, cortes } = args

  /**
   * VARIOS PERSONAJES. Quiénes salen en ESTE lote: la unión de los hablantes de sus
   * tomas. Con uno solo —o sin atribución, que es toda sesión anterior— el prompt se arma
   * exactamente como antes: un bloque PERSONAJE, uno de voz y uno de movimiento.
   */
  const quien = args.quien ?? new Map<string, Personaje[]>()
  const presentes: Personaje[] = []
  for (const t of lote.tomas) {
    for (const p of quien.get(t.tiempoOriginal) ?? []) {
      if (!presentes.some((x) => x.id === p.id)) presentes.push(p)
    }
  }
  const varios = presentes.length > 1
  const off = args.vozEnOff ?? new Set<string>()
  /**
   * ⚠️ EN VOZ EN OFF LA LÍNEA NO ES DE NADIE EN CUADRO. Rotularla `Locución:` o
   * `P1 dice:` hace que el modelo le mueva la boca a alguien; el original solo mostraba
   * el producto mientras una voz narraba por encima.
   */
  const dice = (t: { tiempoOriginal: string }) => {
    if (off.has(t.tiempoOriginal)) return 'VOZ EN OFF (nadie habla en cuadro)'
    const gente = quien.get(t.tiempoOriginal) ?? []
    return gente.length === 1 ? `${etiqueta(gente[0])} dice` : 'Locución'
  }
  /** El lote entero es narración por encima: ninguna de sus tomas se dice en cuadro. */
  const todoEnOff = lote.tomas.length > 0
    && lote.tomas.every((t) => !t.locucion || off.has(t.tiempoOriginal))
    && lote.tomas.some((t) => !!t.locucion)

  /** El bloque completo de un personaje: cómo se ve, cómo suena y cómo se mueve. */
  const bloqueDe = (p: Personaje) => [
    `PERSONAJE ${etiqueta(p)} — descripción completa, sin referencias externas:`,
    p.consistencyBlock ?? '',
    p.voiceProfile
      ? `  VOZ: ${p.voiceProfile.idioma} · ${p.voiceProfile.varianteRegional} · acento ${p.voiceProfile.acento} · ${p.voiceProfile.tono} · ${p.voiceProfile.timbre} · edad vocal ${p.voiceProfile.edadVocal} · ritmo ${p.voiceProfile.ritmo} · energía ${p.voiceProfile.energia} · estilo ${p.voiceProfile.estilo}`
      : '',
    p.motionProfile
      ? `  CÓMO SE MUEVE: ${p.motionProfile.calidadMovimiento} Manerismos: ${p.motionProfile.manerismos}`
      : '',
  ].filter(Boolean).join('\n')
  const spec = nicheSpec(args.niche)

  /**
   * EL PLANO, POR TOMA — solo cuando el lote mezcla más de uno.
   *
   * `camaraDeLote` deduplica y concatena los planos de las tomas del lote en UN string,
   * y esa línea es todo lo que el render sabía del encuadre. Con un solo plano alcanza;
   * con dos es ambigua por construcción. Caso real (`30ff55d6`, lote 1): las tomas 1–2
   * son "Plano medio frontal" y las 3–4 "Primer plano frontal del rostro y parte del
   * pecho", y al generador le llegaba `Plano medio frontal, estático. · Primer plano…`
   * sin ninguna forma de saber cuál corresponde a cuál. De ahí sale "no copió el plano
   * en el que aparece la persona".
   *
   * El emparejamiento va por `tiempoOriginal` y NO por `n`, por el mismo motivo que en
   * `camaraDeLote`: `groupIntoLotes` renumera después de `splitLongToma`.
   *
   * Dos recortes, los dos medidos, porque este presupuesto se lo quita a la coreografía
   * — que es la OTRA mitad de la misma queja ("que se copien los movimientos exactos"):
   *
   *  1. Solo si hay ≥2 planos distintos en el lote. Con uno solo la línea global
   *     `CÁMARA:` ya lo dice sin ambigüedad y repetirla por toma no agrega nada.
   *  2. Solo cuando el plano CAMBIA respecto de la toma anterior. Un shot list se lee
   *     así: el plano vale hasta que se anuncia otro. Medido sobre el lote 1 de
   *     `30ff55d6` (5 tomas, 2 planos), emitirlo en las cinco costaba ~285 caracteres y
   *     hundía la coreografía del 54 % al 33 %; emitirlo en los dos cambios cuesta ~115
   *     y conserva la misma información.
   *
   * Cuando se emite no se suelta en ningún nivel de degradación — es alineación, no
   * contenido, el mismo argumento que la línea `Locución:`.
   */
  const porTiempo = new Map((cortes ?? []).map((c) => [c.tiempo, c.camara.trim()]))
  const planos = lote.tomas.map((t) => porTiempo.get(t.tiempoOriginal) ?? '')
  const mezclaPlanos = new Set(planos.filter(Boolean)).size >= 2
  const planoPorToma = (i: number) =>
    mezclaPlanos && planos[i] && planos[i] !== planos[i - 1] ? planos[i] : ''

  // En modo `frames` las dos imágenes NO son referencias que el prompt cite: son los
  // fotogramas inicial y final que el modelo tiene que unir. Mandarles la leyenda
  // `@image(n)` le pide que las trate como material de consulta, que es otra cosa.
  const legend = args.mode === 'frames'
    ? [
        'La primera imagen es el PRIMER FOTOGRAMA del clip y la segunda es el ÚLTIMO.',
        'El movimiento va de una a la otra: interpólalo completo, continuo y natural,',
        'sin saltos ni poses congeladas. La persona, la ropa y el escenario de esos dos',
        'fotogramas son la verdad — la descripción de abajo solo explica qué ocurre entre ellos.',
      ].join('\n')
    : images.map((img, i) => `@image(${i + 1}) = ${img.role}`).join('\n')
  const locucionFinal = lote.tomas.map((t) => t.locucion).filter(Boolean).join(' ')

  /**
   * `t.personaje` y `t.producto` (FASE 3, preservados por Task 4 en `Lote.tomas`) NO
   * se leen acá a propósito. Son dato de shot list — lectura para el usuario en el
   * wizard, no instrucción para el modelo de video — y a nivel de render los
   * supersede el bloque de consistencia (`consistencyBlock`) y `productDesc`, que ya
   * cubren esa información una sola vez para todo el lote. Repetirlos por toma
   * duplicaría contenido y se comería justo el presupuesto que esta función
   * administra, sin agregar nada que el modelo no tenga ya.
   */
  const renderAcciones = () =>
    lote.tomas
      .map((t, i) => {
        const plano = planoPorToma(i)
        return [
          // r1: `duracionSeg` sale de un reparto proporcional y llegaba cruda al prompt
          // ("Toma 1 — 0.8854477611940298 s", medido). Es ruido, y además una precisión
          // que el render no tiene: `snapDuration` le pide a KIE 4, 6 u 8.
          `### Toma ${t.n} — ${r1(t.duracionSeg)} s`,
          plano ? `Cámara: ${plano}` : '',
          // ⚠️ COMPLETA, SIN TRUNCAR. Con grok esto se cortaba a mitad de palabra para
          // caber en 4096 (medido: 78 de 266 caracteres por toma, el 71 % del movimiento
          // tirado) y era la causa mecánica de "no copia los movimientos". Veo acepta
          // 60.000, así que ya no hay nada que recortar.
          t.accionVisual,
          // Esta línea es lo único que le dice al generador QUÉ FRASE va con QUÉ ACCIÓN
          // y en cuántos segundos: es la sincronización audio↔imagen, no una copia del
          // guion global. Con el tope viejo llegó a perderse en un lote y no en los
          // otros, y el resultado fue "una habla muy rápido y la otra muy lento".
          // ⚠️ Una toma muda tiene que DECLARARSE muda. El silencio por omisión es
          // ambiguo: el modelo genera audio, y ante una toma sin línea rellena con habla
          // inventada. Esto es la contraparte del marcador "No aparece" que el forense
          // metía en `dialogo` y que el render terminaba pronunciando (ver
          // `limpiarDialogo`): sacarlo no alcanza si después nadie dice que ahí no habla.
          t.locucion
            ? `${dice(t)}: “${t.locucion}”`
            : 'Sin diálogo: la persona NO habla en esta toma. Solo acción y sonido ambiente; no inventes frases ni muevas la boca como si hablara.',
          'Texto / Overlay: NINGUNO.',
        ].filter(Boolean).join('\n')
      })
      .join('\n\n')

  /** Un solo armado, sin niveles: con 60.000 caracteres no hay nada que recortar. */
  const render = () =>
    [
      `Video UGC vertical 9:16. Duración total del clip: ${lote.duracionSeg} segundos.`,
      '',
      legend,
      '',
      ...(varios
        ? [
            `EN ESTE CLIP SALEN ${presentes.length} PERSONAS. Son distintas entre sí y cada una`,
            'conserva su propia cara, voz y forma de moverse durante todo el clip. No las',
            'mezcles, no las intercambies y no le des a una la voz de otra.',
            '',
            ...presentes.map(bloqueDe),
          ]
        : ['PERSONAJE (descripción completa, sin referencias externas):', consistencyBlock]),
      '',
      spec.productBlock,
      productDesc,
      '',
      // "ESCENARIO E ILUMINACIÓN" y no "ESCENARIO" a secas porque el spec pide la
      // iluminación como bloque propio dentro de cada lote, y el `fondo` del forense ya
      // la trae dentro (su prompt la pide junto a paredes, superficies y profundidad).
      // Rotularla es gratis; sacarla a un campo aparte del forense costaría una
      // re-corrida del análisis —el paso caro— para cada sesión ya guardada.
      // ⚠️ EN MODO FRAMES EL ESCENARIO LO DEFINEN LOS DOS FOTOGRAMAS, NO ESTE TEXTO.
      //
      // `forensic.fondo` describe el VIDEO ENTERO, y ninguna limpieza de texto lo acota a
      // un clip de forma fiable: se probó filtrar los valores que empiezan describiendo
      // otro corte y sobrevivió igual —medido sobre la sesión `430c5961`, el campo
      // `texturas` decía "Paredes lisas, tela suave del sillón, baldosas pulidas", con el
      // sillón a mitad de frase. Mientras ese texto esté, el prompt le ofrece al modelo
      // muebles que no están en el clip, contra lo que promete `CONTINUIDAD`.
      //
      // Con keyframes el problema desaparece por construcción: la habitación, la luz y
      // los muebles son los que se ven en las dos imágenes. Describirlos otra vez en
      // palabras solo puede contradecirlas.
      args.mode === 'frames'
        ? 'ESCENARIO E ILUMINACIÓN: exactamente los del primer y el último fotograma. No agregues, quites ni cambies muebles, objetos, paredes ni luz.'
        : `ESCENARIO E ILUMINACIÓN: ${escenario}`,
      // ⚠️ NO digas "estable". Durante mucho tiempo esta línea inyectaba esa palabra en
      // todos los prompts mientras el formato UGC se define por lo contrario: teléfono
      // en mano o apoyado, ángulo bajo, micro-temblor. Era pedirle trípode a un lenguaje
      // visual que no lo tiene, y suma al aspecto de render que el usuario reportó.
      `CÁMARA: ${camara.replace(/\.\s*$/, '')}. Formato vertical 9:16, grabado con teléfono en mano`,
      'con micro-temblor natural, enfoque en el personaje y el producto.',
      // Bloque "Continuidad" del spec: qué NO puede cambiar dentro del clip. Una línea,
      // no un párrafo — todo lo que describe ya está arriba, acá solo se declara que es
      // invariante, y cada carácter que ocupa sale del presupuesto de la coreografía.
      //
      // Redactado SIN "el mismo personaje" / "igual que antes" a propósito: acá esas
      // palabras significarían "idéntico a lo largo de este clip", pero son
      // literalmente las frases que el spec prohíbe y que el test de referencias a
      // lotes anteriores vigila. Un generador que las lee no distingue las dos
      // intenciones — busca un contexto anterior que no existe y devuelve otra persona.
      // Una sola toma continua: el spec lo pide y la guía de UGC lo pone explícito ("no
      // cuts, one long continuous video"). `CONTINUIDAD` solo prometía que el ESCENARIO
      // no cambia, y un lote fusionado salió con tres sub-tomas y tres fondos distintos.
      'TOMA CONTINUA: un solo plano de principio a fin, sin cortes internos, sin jump',
      'cuts y sin cambios de escena dentro del clip.',
      'CONTINUIDAD: personaje, producto, vestuario, escenario e iluminación permanecen',
      'idénticos de principio a fin del clip, tal como se describen arriba. Lo único que',
      'avanza es la acción detallada abajo.',
      '',
      varios ? '' : 'PERFIL DE VOZ Y ACENTO:',
      varios ? '' : `  Idioma: ${voz.idioma} · Variante: ${voz.varianteRegional} · Acento: ${voz.acento}`,
      varios ? '' : `  Pronunciación: ${voz.pronunciacion} · Ritmo: ${voz.ritmo} · Velocidad: ${voz.velocidad}`,
      varios ? '' : `  Entonación: ${voz.entonacion} · Energía: ${voz.energia} · Pausas: ${voz.pausas}`,
      varios ? '' : `  Tono: ${voz.tono} · Timbre: ${voz.timbre} · Edad vocal: ${voz.edadVocal} · Estilo: ${voz.estilo}`,
      '',
      // ⚠️ Va SIEMPRE que exista, íntegro y en cada lote, por la misma REGLA DE CONTEXTO
      // ABSOLUTO que el bloque de consistencia: el generador no recuerda el lote
      // anterior, así que un personaje que se mueve distinto en el lote 3 que en el 1 es
      // el mismo fallo que uno que cambia de cara.
      //
      // `accionVisual` describe solo movimientos CON PROPÓSITO narrativo. Esto describe
      // lo otro: cómo se mueve el cuerpo entre gesto y gesto, que es lo que separa a una
      // persona de un maniquí ejecutando instrucciones.
      ...(movimiento && !varios
        ? [
            'CÓMO SE MUEVE (vale durante todo el clip, también entre gesto y gesto):',
            `  Calidad del movimiento: ${movimiento.calidadMovimiento}`,
            `  Manerismos: ${movimiento.manerismos}`,
            '',
          ]
        : []),
      ...(todoEnOff
        ? [
            'VOZ EN OFF: la narración se OYE pero quien la dice NO está en cuadro.',
            'NINGUNA boca se mueve en este clip, nadie mira a la cámara para hablar y no',
            'hay presentador: es el producto en pantalla mientras una voz narra por encima.',
            '',
          ]
        : []),
      'SECUENCIA DE ACCIONES VISUALES:',
      renderAcciones(),
      '',
      // El guion completo de una vez. Es lo PRIMERO que se suelta bajo presión de
      // presupuesto (antes era lo último): sale del mismo texto que las líneas
      // `Locución:` de cada toma, así que soltarlo no pierde ni una palabra — solo deja
      // de repetirlas juntas. La regla de diálogo del spec ("exacto: no resumir, no
      // extender…") se sigue cumpliendo, distribuida por toma, y de paso el modelo
      // conserva la correspondencia frase↔toma↔segundos que este bloque no da.
      todoEnOff
        ? 'GUION DE LA VOZ EN OFF (exacto: no resumir, no extender, no corregir, no añadir frases, no eliminar frases). Se oye sobre la imagen; nadie lo pronuncia en cuadro:'
        : 'GUION DE LOCUCIÓN FINAL (exacto: no resumir, no extender, no corregir, no añadir frases, no eliminar frases):',
      `“${locucionFinal}”`,
      '',
      ...BLOQUE_OVERLAY,
    ].join('\n')

  const prompt = render()
  // Última red, no un presupuesto. Con 60.000 caracteres esto no se dispara con contenido
  // real (el detalle forense de un lote llega a ~6.300), pero pasarse costaría un 422 con
  // la cuota ya gastada, así que se falla acá antes de llamar a KIE.
  if (prompt.length > KIE_PROMPT_MAX) {
    throw new Error(
      `El prompt del Lote ${lote.n} no entra en el tope de KIE (${prompt.length} de ` +
      `${KIE_PROMPT_MAX} caracteres). Crear la tarea así fallaría con 422 y la cuota ya gastada.`,
    )
  }
  return prompt
}
