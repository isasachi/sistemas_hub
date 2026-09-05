import { CPS_MAX, CPS_MIN } from './forensic'

/**
 * Cliente de KIE AI para el render de video. DOS MOTORES, UN SOLO TRANSPORTE.
 *
 * KIE es ASÍNCRONO: createTask devuelve un taskId al instante (200 ≠ terminado) y el
 * resultado se consulta con recordInfo. Por eso el render NO usa el patrón SSE del
 * generador de anuncios: la ruta crea la tarea y responde, y el cliente hace polling.
 *
 * 🔴 EL MOTOR ACTIVO ES **`wan/3-0-video`** (ver `MOTOR`, abajo). `grok` se queda entero
 * porque volver es una línea. Lo de abajo describe a los dos: el endpoint, el polling y el
 * parser son idénticos, y lo único que cambia es el cuerpo del POST (`buildTaskBody`).
 *
 * ✅ CONTRATO DE WAN, MEDIDO CON EL CANARIO GRATIS (`scripts/canary-wan.ts`, 2026-09-04) —
 * Wan también valida ANTES de despachar, así que el truco del campo inválido sirve igual:
 *   - `prompt`: **20.000** caracteres exactos (20.001 se rechaza por largo). 4,9× grok.
 *   - `resolution`: **SENSIBLE A LA CAJA**. `720P` pasa; `720p` devuelve *"resolution is
 *     not within the range of allowed options"*. Es el error más fácil de cometer copiando
 *     el cuerpo de grok, y falla ruidoso — que es la parte buena.
 *   - `aspect_ratio`: `9:16` válido. `duration`: entero 2–30 (999 fuera de rango).
 *   - `reference_video_urls`: hasta 5 clips, 1–15 s cada uno, ≤15 s en total, ≤100 MB.
 *     Y además **duración de entrada + duración de salida ≤ 30 s**.
 *   - `audio`: booleano, default true. `nsfw_checker`: default **false** = filtro APAGADO.
 *
 * 🔴 **EL NOMBRE DEL CAMPO DE IMÁGENES NO SE VALIDA, Y NINGÚN CANARIO PUEDE CAZARLO.**
 * Medido: `reference_image_urls`, `image_urls` y hasta un campo inventado devuelven todos
 * la misma queja (la del campo inválido que se mandó a propósito), o sea KIE IGNORA en
 * silencio lo que no conoce. Con el nombre equivocado la tarea se crea, termina en
 * `success` y devuelve un video hecho SOLO desde el prompt — la misma trampa que
 * `kie-image.ts` documenta para gpt-image-2 vs nano-banana-2. Lo único que lo fija es el
 * test del cuerpo de cada motor.
 *
 * ⚠️ EL COBRO ES `precio × (entrada + salida)` CUANDO HAY VIDEO DE REFERENCIA — verificado
 * con un render real: 10 s de salida + 10 s de referencia a 720P costaron **320 créditos**
 * exactos (20 × 16), no 160. Es el mismo modelo de cobro que ya se había medido para
 * Seedance. **Un anuncio se factura como el doble de su duración**, y ése es el número con
 * el que hay que presupuestar.
 *
 * ---------------------------------------------------------------------------
 * LO QUE SIGUE ES EL CONTRATO DE **GROK**, que sigue vivo detrás de `MOTOR`:
 *
 * ⚠️ VUELTA AL PROMPT MAESTRO Y A `grok-imagine-video-1-5-preview` (2026-09-03, decisión
 * del dueño del repo). Su palabra: *"todo el sistema de video está contaminado después de
 * tantas iteraciones para tratar de arreglarlo"*. La fuente de verdad vuelve a ser
 * `PROMPT_MAESTRO_VIDEO_UGC_ACTUALIZADO.md`, y el prompt que llega a grok vuelve a su forma
 * —bloques rotulados y una secuencia de acciones NUMERADA por toma— en vez de la plantilla
 * en telegrama que fue creciendo a fuerza de parches.
 *
 * ⚠️ ES OTRO MODELO QUE `grok-imagine/image-to-video`, y el contrato cambia con él.
 *
 * ✅ MEDIDO CON EL CANARIO GRATIS (2026-09-03), que es lo único que vale acá: la validación
 * de KIE corre ANTES de despachar, así que un campo inválido vuelve sin `taskId` y sin
 * cobrar. Mandando siempre UN campo inválido se comprueba el resto de balde.
 *   - `prompt`: **4.096** caracteres. 4.097 devuelve *"The text length cannot exceed the
 *     maximum limit"* y 4.096 pasa. Son 904 MENOS que el modelo anterior, así que el
 *     presupuesto del prompt vuelve a ser un problema real.
 *   - `image_urls`: **7 aceptadas** (probado con 3 y con 7).
 *   - `aspect_ratio`: se valida contra una lista cerrada —un valor basura devuelve
 *     *"aspect_ratio is not within the range of allowed options"*— y `9:16` la pasa.
 *   - `duration`: entero. 0 y 999 devuelven *"Value must be within the specified range"*;
 *     el rango de la ficha del modelo es 1–15. Acepta number y también string.
 *   - `mode` y `nsfw_checker`: aceptados.
 *
 * ⚠️ EL RANGO EXACTO DE `duration` NO SE PUDO AISLAR GRATIS, y conviene saber por qué: el
 * único canario disponible enmascara al siguiente (con `aspect_ratio` basura la API se
 * queja de eso y ya no evalúa la duración; con el prompt largo, del largo). Lo que sí está
 * medido son los extremos rechazados. Todo lote nuestro cae dentro de 1–15 por la REGLA
 * MÁXIMA DE 15 SEGUNDOS del spec, así que el rango no se ejercita en los bordes.
 *
 * Contrato (marketplace: `/api/v1/jobs/createTask` + `recordInfo`, `state` string y
 * `resultJson` como STRING con JSON adentro):
 *   - `resolution`: `480p` (default) | `720p` | `1080p`. Va 720p.
 *   - `aspect_ratio`: `9:16`. ⚠️ Sigue siendo inválido con UNA sola imagen — ver
 *     `vertical.ts`, el salvavidas documentado para ese caso.
 *   - `nsfw_checker`: ⚠️ el default de la API es **false**, y false DESACTIVA el filtro.
 *     Acá va **true** a propósito: queremos el filtro puesto.
 *   - Las imágenes se citan en el prompt como @image(1), @image(2)… en el orden del
 *     array. Sin esa leyenda el modelo mezcla los sujetos.
 *
 * ⚠️ LOS ERRORES VIENEN EN HTTP 200 CON `code: 500` ADENTRO (no 422, y no en el status).
 * Mirar solo `res.ok` deja pasar el fallo como éxito y el polling espera para siempre un
 * taskId que no existe. Por eso `createVideoTask` exige `data.taskId`.
 */

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs'

/**
 * EL MOTOR DE RENDER. Los dos viven en el MISMO endpoint del marketplace
 * (`createTask` + `recordInfo`, `state` string y `resultJson` como string con JSON
 * adentro), así que lo único que cambia entre ellos es el CUERPO del POST — el parser de
 * abajo y el polling son los mismos. Por eso esto es una constante y no dos clientes.
 *
 * 🔴 WAN ES LA PRIMITIVE DE MOVIMIENTO, y ése es el motivo del cambio, no el precio.
 * Toma un video de REFERENCIA (`reference_video_urls`) y copia la coreografía; grok solo
 * recibe texto e imágenes, y AGENTS.md tiene medido que con ~15 renders de esta rama nunca
 * llegó a ejecutar la aplicación del producto sobre la piel. El experimento de motores
 * (2026-09-04) ya lo había aislado: la representación en TEXTO del movimiento era el techo.
 *
 * ⚠️ Y NO ES GRATIS: 16 créditos/s a 720P contra los ~4,3 medidos de grok, o sea ~3,7× por
 * segundo de clip. La resolución es decisión del dueño del repo (720P por calidad).
 *
 * ⚠️ `grok` SE QUEDA ENTERO, no comentado: es la vuelta atrás de una línea si Wan decepciona,
 * y su cuerpo está fijado por test para que un cambio en el de Wan no lo arrastre.
 */
export type Motor = 'grok' | 'wan'
export const MOTOR: Motor = 'wan'

/**
 * Lo que cada motor publica como tope. Todo esto está MEDIDO contra la API con el canario
 * gratis (`scripts/canary-wan.ts`), no leído de la doc:
 *
 *  - `promptMax` de Wan es exactamente **20.000** (20.001 → *"The text length cannot exceed
 *    the maximum limit"*). Es 4,9× el de grok, así que la escalera de degradación de
 *    `buildLotePrompt` queda inerte — se conserva porque es lo que sostiene a grok.
 *  - `minDur` de Wan es 2, no 1.
 *  - `imagenes` se queda en **7 para los dos** aunque Wan acepte 10: ese número es el
 *    presupuesto de ANCLAS (`anchors.ts` topa en `MAX_IMAGES - 2`) y cada ancla es una
 *    imagen PAGADA POR EL HUB. Subirlo es una decisión de costo, no de transporte.
 */
const CONTRATO = {
  grok: { model: 'grok-imagine-video-1-5-preview', promptMax: 4096, minDur: 1 },
  wan: { model: 'wan/3-0-video', promptMax: 20_000, minDur: 2 },
} as const

export type KieState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'

export interface VideoImage {
  /** URL pública (Supabase storage). Ojo: uploadToStorage le añade `?v=<ts>`. */
  url: string
  /** Cómo se nombra en el prompt: "la persona", "el producto". */
  role: string
}

export interface VideoTaskInput {
  images: VideoImage[]
  prompt: string
  durationSec: number
  /** Caracteres de la locución del lote: decide si la duración deja decirla. */
  locucionChars?: number
  /** Cuántas tomas trae el lote. >1 desactiva el techo blando — ver `clampDuration`. */
  tomas?: number
  /**
   * El tramo del video ORIGINAL que le toca a este lote (`tramo.ts`), ya recortado y MUDO.
   * Solo lo lee Wan; grok lo ignora porque no tiene dónde ponerlo.
   *
   * ⚠️ TIENE QUE IR SIN AUDIO. Medido en el experimento de motores: con la pista del
   * original puesta, la locución generada se contamina con las palabras de la creadora
   * (cobertura 86 % → 98 % al mutear) y hasta cambia las palabras del guion.
   *
   * Opcional a propósito: un lote cuya ventana no se pudo derivar se renderiza sin
   * referencia — degradado, no roto.
   */
  referenceVideoUrl?: string | null
}

/** Rango legal de `duration` en el motor activo. Entero.
 *  ⚠️ El techo se queda en 15 aunque Wan acepte 30: es `LOTE_MAX_SEC`, y además con
 *  referencia rige `entrada + salida <= 30`, así que 15 + 15 es el reparto que deja
 *  el tramo más largo posible (ver `tramo.ts`). */
export const MIN_DURATION: number = CONTRATO[MOTOR].minDur
export const MAX_DURATION = 15

/**
 * Cuántas imágenes acepta el modelo por tarea. Es el techo del sistema de anclas:
 * avatar + producto + los fotogramas ancla que haga falta generar.
 */
export const MAX_IMAGES = 7

/** Tope de `input.prompt` del motor activo, CONFIRMADO con el canario. Pasarse = rechazo. */
export const KIE_PROMPT_MAX: number = CONTRATO[MOTOR].promptMax

/**
 * Ajusta la duración de un lote al rango legal, sin perder ninguna de las dos lecciones
 * que ya estaban medidas cuando el rango era el conjunto discreto {4, 6, 8} de Veo.
 *
 * Con un rango CONTINUO 6–30 esto se vuelve un clamp entre dos cotas en vez de una
 * búsqueda sobre un conjunto, pero las cotas son las mismas:
 *
 *  1. PISO DURO (`>= chars / CPS_MAX`): el texto tiene que poder decirse. Violarlo corta
 *     el diálogo a mitad de frase.
 *  2. TECHO BLANDO (`<= chars / CPS_MIN`): el texto no puede quedar tan suelto que el
 *     modelo rellene. ⚠️ Medido en su momento: 23 caracteres en 6 s (3,8 car/s) hicieron
 *     que el generador dijera la frase DOS VECES para llenar el audio. El techo blando
 *     nunca puede quedar por debajo del piso duro — si chocan, manda el piso.
 *
 * Dentro de esa banda se elige la duración ORIGINAL de la toma, que es lo que conserva
 * el ritmo del anuncio de referencia.
 *
 * Una toma MUDA no tiene techo blando: sin habla no hay nada que repetir, y su duración
 * es un beat visual que conviene respetar tal cual.
 *
 * ⚠️ EL TECHO BLANDO SOLO APLICA A UN CLIP DE UNA SOLA ESCENA, y ese acote es
 * obligatorio con el cap de 30 s. La medición que lo justifica es de un clip de 6 s con
 * UNA línea de 23 caracteres: ahí el modelo no tenía nada más que hacer y repitió la
 * frase. Un clip de 30 s con varias tomas es otra cosa — cada toma trae su propia
 * `accionVisual`, y el silencio entre escenas es la textura que se está copiando del
 * original, no aire muerto.
 *
 * Sin este acote el techo blando recorta el clip a la duración que "merece" su texto y
 * se lleva puestas las escenas de más: medido con estos mismos números, un lote de 30 s
 * con 200 caracteres caía a 22 s y uno con 120 caracteres a **13 s** — o sea 17
 * segundos de shot list descartados en silencio, justo los que tienen su imagen ancla
 * ya generada y pagada.
 *
 * ⚠️ El piso de la API es 1 s, así que ya no infla ningún lote: con el modelo anterior era
 * 6 s y eso metía holgura —que grok rellena inventando— en toda toma corta. La toma de 3 s
 * del spec se renderiza como 3 s.
 */
export function clampDuration(sec: number, locucionChars = 0, tomas = 1): number {
  const objetivo = Number.isFinite(sec) && sec > 0 ? Math.round(sec) : MIN_DURATION
  const piso = Math.max(MIN_DURATION, Math.ceil(locucionChars / CPS_MAX))
  // El techo blando solo existe si hay UNA escena y algo que decir, y jamás por debajo
  // del piso duro: si chocan, manda el piso (el texto tiene que poder decirse).
  const techo = locucionChars > 0 && tomas <= 1
    ? Math.min(MAX_DURATION, Math.max(piso, Math.floor(locucionChars / CPS_MIN)))
    : MAX_DURATION
  return Math.min(techo, Math.max(piso, objetivo))
}

/**
 * 720p FIJO, y NO es un pendiente de parametrizar — está medido (2026-09-04). Ver AGENTS.md.
 *
 * ✅ Canario gratis: `480p`, `720p` y `1080p` los tres PASAN la validación de la API (con una
 * `duration` inválida solo se queja la duración); un valor inventado se rechaza por nombre.
 * O sea 480p existe y es elegible.
 *
 * ⚠️ Y CUESTA 33 % MENOS: medido con un render real del mismo lote, **30 créditos a 480p
 * contra 45,1 a 720p**. Lo que compra ese descuento es lo que el anuncio vende: 480p
 * devuelve **416x752** (no 480x854) y la etiqueta del frasco deja de leerse — justo el
 * observable que el A/B de la cita de imagen acababa de mejorar.
 *
 * ⚠️ Y NO SE PARAMETRIZA porque no hay quién encienda el dial: no hay UI, no hay columna y
 * ningún caller pasaría otra cosa. Además `concat.ts` pega con `-c copy`, que exige
 * parámetros idénticos entre clips, así que la resolución solo podría ser por SESIÓN y
 * nunca por lote. Un parámetro con un solo llamador y un solo valor es la interfaz con una
 * implementación que este repo evita en otros lados.
 *
 * 1080p además exige UNA sola imagen, y el render manda siempre avatar + producto.
 */
export function resolutionFor(): '720p' {
  return '720p'
}

/**
 * Cuerpo exacto del POST. Puro y exportado para poder verificarlo sin API key.
 *
 * ⚠️ CADA MOTOR NOMBRA DISTINTO EL CAMPO DE REFERENCIAS Y EQUIVOCARSE NO FALLA RUIDOSO —
 * la misma trampa que `kie-image.ts` ya documenta para gpt-image-2 contra nano-banana-2, y
 * confirmada con el canario para Wan: mandando `image_urls` en vez de
 * `reference_image_urls`, KIE **crea la tarea igual**, la termina en `success` y entrega un
 * video generado SOLO desde el prompt. Ningún canario puede cazarlo (el campo desconocido
 * se ignora en silencio, no se rechaza), así que lo que lo fija es el test de este cuerpo.
 *
 * `motor` es parámetro para poder fijar los dos cuerpos con un test; en producción siempre
 * es el activo.
 */
export function buildTaskBody(input: VideoTaskInput, motor: Motor = MOTOR): { model: string; input: Record<string, unknown> } {
  const duration = clampDuration(input.durationSec, input.locucionChars, input.tomas)
  if (motor === 'grok') {
    return {
      model: CONTRATO.grok.model,
      input: {
        image_urls: input.images.map((i) => i.url),
        prompt: input.prompt,
        // Entero, que es lo que dice la ficha de este modelo (acepta string también).
        duration,
        resolution: resolutionFor(),
        aspect_ratio: '9:16',
        mode: 'normal',
        // true = filtro de contenido ACTIVADO (el default de la API es false, que lo apaga).
        nsfw_checker: true,
      },
    }
  }
  return {
    model: CONTRATO.wan.model,
    input: {
      prompt: input.prompt,
      reference_image_urls: input.images.map((i) => i.url),
      // Sin tramo derivado no se manda el campo: un array vacío es una forma más de
      // decirle a la API algo que no queremos decirle.
      ...(input.referenceVideoUrl ? { reference_video_urls: [input.referenceVideoUrl] } : {}),
      duration,
      // ⚠️ MAYÚSCULA: medido con el canario, `720p` devuelve *"resolution is not within the
      // range of allowed options"* y `720P` pasa. Este enum es sensible a la caja.
      resolution: '720P',
      aspect_ratio: '9:16',
      // Wan genera el audio: sin esto no hay locución, que es medio entregable.
      audio: true,
      // true = filtro de contenido ACTIVADO (el default de la API es false, que lo apaga).
      nsfw_checker: true,
    },
  }
}

export const SIN_KEY =
  'Para generar video necesitas tu propia API key de KIE. Cárgala en Mi cuenta y vuelve a intentarlo.'

/**
 * La key con la que se llama a KIE. BYOK ESTRICTO: el render lo paga el usuario con
 * SU cuenta, así que la key sale de `user_settings` y se pasa por parámetro.
 *
 * ⚠️ YA NO HAY KEY GLOBAL. Hasta 2026-08-24 esto caía a `process.env.KIE_API_KEY`
 * cuando el usuario no había cargado la suya: el hub terminaba pagando renders
 * ajenos sin que nada lo reportara. El fallback se quitó entero —también para dev—
 * porque un respaldo silencioso es exactamente el modo de fallo que hay que evitar:
 * si la key falta, se ve.
 *
 * ⚠️ Se resuelve por parámetro y no leyendo la sesión acá adentro para que este
 * módulo siga siendo el cliente HTTP puro que ya era — testeable sin cookies.
 */
export function resolveKey(userKey?: string | null): string {
  const key = (userKey ?? '').trim()
  if (!key) throw new Error('Falta tu API key de KIE: cárgala en Mi cuenta.')
  return key
}

/**
 * Tope por petición HTTP. Crear una tarea o consultar su estado son respuestas JSON
 * chicas: si una tarda más que esto, está colgada, no lenta.
 */
export const KIE_HTTP_TIMEOUT_MS = 30_000

/**
 * `fetch` con timeout. NO es una precaución teórica: `fetch` en Node no tiene timeout por
 * defecto, y una conexión que el proveedor deja abierta sin responder cuelga el await
 * para siempre.
 *
 * ⚠️ Lo rompió de verdad. El bucle de polling de la generación de imagen comprobaba su
 * presupuesto DESPUÉS del `await fetch`, así que un fetch colgado impedía que el tope se
 * evaluara nunca: el dev server quedó bloqueado con 0 % de CPU y una conexión ESTAB a
 * api.kie.ai. En Vercel el síntoma sería distinto y peor de diagnosticar — la función
 * muere en `maxDuration` con las tareas ya creadas y pagadas.
 */
export async function fetchKie(url: string, init: RequestInit = {}, timeoutMs = KIE_HTTP_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`KIE no respondió en ${Math.round(timeoutMs / 1000)} s (${url.split('?')[0]})`)
    }
    throw err
  }
}

/** Crea la tarea de render. Devuelve el taskId; NO espera al video. */
export async function createVideoTask(input: VideoTaskInput, userKey?: string | null): Promise<string> {
  const res = await fetchKie(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resolveKey(userKey)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTaskBody(input)),
  })
  const json = (await res.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: { taskId?: string } }
    | null
  // ⚠️ KIE devuelve HTTP 200 con `code` de error adentro en los fallos de validación, así
  // que mirar solo `res.ok` deja pasar el fallo como éxito y después el polling espera
  // para siempre un taskId que no existe.
  if (!res.ok || !json?.data?.taskId) {
    throw new Error(`KIE createTask falló (${json?.code ?? res.status}): ${json?.msg ?? 'sin respuesta'}`)
  }
  return json.data.taskId
}

export interface TaskDetail {
  state: KieState
  progress: number
  videoUrl: string | null
  failMsg: string | null
}

/**
 * Normaliza la respuesta de recordInfo del MARKETPLACE.
 *
 * ⚠️ Distinto de Veo en las dos cosas que importan: el estado es un `state` STRING (no un
 * `successFlag` numérico) y `resultJson` viene como STRING con JSON adentro
 * (`{"resultUrls":["…"]}`), no como objeto. Mezclar los dos parsers deja el polling
 * esperando para siempre un video que ya está listo.
 */
export function parseTaskDetail(data: unknown): TaskDetail {
  const d = (data ?? {}) as Record<string, unknown>
  const estados: KieState[] = ['waiting', 'queuing', 'generating', 'success', 'fail']
  const bruto = typeof d.state === 'string' ? d.state : ''
  const state: KieState = (estados as string[]).includes(bruto) ? (bruto as KieState) : 'waiting'

  let videoUrl: string | null = null
  if (typeof d.resultJson === 'string' && d.resultJson) {
    try {
      const urls = (JSON.parse(d.resultJson) as { resultUrls?: unknown }).resultUrls
      if (Array.isArray(urls) && typeof urls[0] === 'string') videoUrl = urls[0]
    } catch {
      /* resultJson corrupto → todavía sin resultado, no un fallo duro */
    }
  }

  return {
    state,
    progress: typeof d.progress === 'number' ? d.progress : state === 'success' ? 1 : 0,
    videoUrl,
    failMsg: typeof d.failMsg === 'string' && d.failMsg ? d.failMsg : null,
  }
}

/** Consulta el estado de una tarea. */
export async function getTaskDetail(taskId: string, userKey?: string | null): Promise<TaskDetail> {
  const res = await fetchKie(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${resolveKey(userKey)}` },
  })
  const json = (await res.json().catch(() => null)) as { data?: unknown } | null
  if (!res.ok) throw new Error(`KIE recordInfo falló (${res.status})`)
  return parseTaskDetail(json?.data)
}
