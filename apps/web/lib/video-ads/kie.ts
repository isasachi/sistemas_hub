/**
 * Cliente de KIE AI (Grok Imagine 1.5) para el render de video.
 *
 * KIE es ASÍNCRONO: createTask devuelve un taskId al instante (200 ≠ terminado) y el
 * resultado se consulta con recordInfo. Por eso el render NO usa el patrón SSE del
 * generador de anuncios: la ruta crea la tarea y responde, y el cliente hace polling.
 *
 * Restricciones reales de la API que este módulo blinda
 * (docs.kie.ai/market/grok-imagine/1-5-preview):
 *   - `duration` es INTEGER, entre 1 y 15 (default 8). Ojo: el otro modelo del
 *     marketplace, `grok-imagine/image-to-video`, usa STRING 6–30 y SÍ acepta `mode`.
 *     Son contratos distintos: cambiar de modelo obliga a revisar este bloque entero,
 *     los tests y el rango que expone el wizard.
 *   - `input` es additionalProperties:false → mandar `mode` rompe la validación.
 *   - `aspect_ratio` default es `auto` → hay que forzar 9:16 para UGC vertical, PERO
 *     "This parameter is invalid if it is a single image": con una sola imagen manda
 *     el ratio del origen → ver `vertical.ts`.
 *   - `resolution: "1080p"` SOLO admite una imagen; acá va 720p fijo igual.
 *   - `prompt` topa en 4096 caracteres (el otro modelo daba 5000 — es MENOS margen
 *     para el detalle forense, ver el armado por niveles de buildVideoPrompt).
 *   - Las imágenes se referencian en el prompt como @image(1), @image(2)… en el mismo
 *     orden del array. Sin esa leyenda Grok mezcla los sujetos.
 *   - Máximo 7 imágenes, 20 MB c/u, y deben ser URLs públicas.
 */

import type { ForensicAnalysis, ScriptBeat, VideoDirection } from './types'

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs'
const MODEL = 'grok-imagine-video-1-5-preview'

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
}

export const MIN_DURATION = 1
export const MAX_DURATION = 15

/** Tope de `input.prompt` en KIE. Pasarse = 422 con la cuota ya gastada. */
export const KIE_PROMPT_MAX = 4096

/**
 * Clamp al rango de Grok 1.5: entero 1–15 s (default 8). Un solo clamp para los dos
 * consumidores —el guión y el render—: dos se desincronizan y la duración fuera de
 * rango solo aparecería al crear la tarea, con la cuota ya gastada.
 */
export function clampDuration(sec: number): number {
  if (!Number.isFinite(sec)) return 8
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(sec)))
}

/**
 * 720p fijo en las tres líneas. 1080p solo existe con UNA imagen (o sea, solo la
 * línea `video-ref`), así que subirlo ahí encarece el render más caro del hub a
 * cambio de una calidad desigual entre líneas que en un feed vertical no se nota.
 * ponytail: un solo tier; si algún día hace falta 1080p, vuelve el parámetro.
 */
export function resolutionFor(): '720p' {
  return '720p'
}

/** Cuerpo exacto del POST. Puro y exportado para poder verificarlo sin API key. */
export function buildTaskBody(input: VideoTaskInput) {
  return {
    model: MODEL,
    input: {
      image_urls: input.images.map((i) => i.url),
      prompt: input.prompt,
      duration: clampDuration(input.durationSec),
      resolution: resolutionFor(),
      aspect_ratio: '9:16',
      nsfw_checker: true,
    },
  }
}

/**
 * Prompt de video. Junta la leyenda de imágenes, la dirección y el guión beat a beat.
 * El diálogo va SIEMPRE en español neutro: Grok genera el audio sincronizado y el
 * hub es para el mercado peruano (misma regla que SPANISH_RULE en las imágenes).
 */
/** Normaliza para comparar texto: sin puntuación, sin dobles espacios, minúsculas. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()
}

/**
 * ¿El texto en pantalla es solo el diálogo repetido? Entonces es la pista de
 * SUBTÍTULOS de la referencia, no un gráfico. Emitirla como "On-screen graphic"
 * contradice la instrucción de no quemar subtítulos, y el render obedecía a la línea
 * concreta antes que a la prohibición genérica.
 *
 * El análisis nuevo ya no las captura, pero las sesiones ya guardadas sí las tienen:
 * este filtro las limpia en el momento de armar el prompt, sin migrar datos.
 */
export function isCaptionEcho(dialogue: string, onScreenText: string): boolean {
  if (!onScreenText || !dialogue) return false
  const a = norm(dialogue)
  const b = norm(onScreenText)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

const PLATFORM_FURNITURE = /tiktok|reels?\b|shorts\b|watermark|marca de agua|@[\w.]+|follow button|logo (?:is|and|are) visible/i

/**
 * Saca de una descripción visual las frases que hablan de la interfaz de la
 * plataforma. El forense de la referencia describía "The TikTok logo and '@handle'
 * are visible in the top left" y eso viajaba al render como algo A REPRODUCIR — por
 * eso el video salía con marca de agua de TikTok.
 */
export function stripPlatformFurniture(text: string): string {
  if (!text) return ''
  const kept = text
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !PLATFORM_FURNITURE.test(sentence))
  return kept.join(' ').trim()
}

export function buildVideoPrompt(opts: {
  images: VideoImage[]
  direction: VideoDirection
  beats: ScriptBeat[]
  productName: string
  /**
   * Solo en la línea `video-ref`. Sin esto el render descarta TODO el análisis: el
   * casting, el escenario y el trabajo de cámara segundo a segundo. Era la causa de
   * que una referencia de morena latina saliera rubia y de que el encuadre no se
   * pareciera en nada al original.
   */
  forensic?: ForensicAnalysis | null
}): string {
  const legend = opts.images.map((img, i) => `@image(${i + 1}) = ${img.role}`).join('\n')

  // Los beats del guión y los del forense comparten número y orden (el esqueleto lo
  // impone), pero un LLM puede desviarse y las otras dos líneas no traen forense: se
  // anota por índice hasta donde alcance y el resto va sin anotación.
  const fb = opts.forensic?.beats ?? []
  let anyGraphic = false

  // El detalle forense por beat no cabe en los 4096 chars de KIE: con ~11 beats, el
  // análisis completo llega a ~6300. Se arma por niveles y se manda el más detallado
  // que entre. Primero se suelta `visual`, que es lo que más se solapa con `action`;
  // después la cámara se abrevia; recién al final se suelta. La cámara es lo que
  // sostiene la fidelidad de encuadre —el motivo de todo el análisis forense— así
  // que abreviarla siempre gana contra perderla.
  const buildScript = (detail: Detail) =>
    opts.beats
      .map((b, i) => {
        const lines = [`[${b.t}] ${stripPlatformFurniture(b.action) || b.action}`]
        if (b.dialogue) lines.push(`  Dialogue (spoken aloud): "${b.dialogue}"`)
        if (b.onScreenText && !isCaptionEcho(b.dialogue, b.onScreenText)) {
          anyGraphic = true
          lines.push(`  On-screen graphic: "${b.onScreenText}"`)
        }
        if (detail !== 'none' && fb[i]?.camera) lines.push(`  Camera: ${fb[i].camera}`)
        if (detail === 'full') {
          const visual = stripPlatformFurniture(fb[i]?.visual ?? '')
          if (visual) lines.push(`  Framing/staging to reproduce: ${visual}`)
        }
        return lines.join('\n')
      })
      .join('\n')

  const buildCasting = (detail: Detail) => {
    const f = opts.forensic
    if (!f) return ''
    return [
      '',
      'CASTING — the person on camera must plausibly be the same casting as the reference:',
      `  ${stripPlatformFurniture(f.subject) || f.subject}`,
      '  Match apparent age, skin tone, hair colour and how it is worn, eye colour and',
      '  build. This is a casting brief, not a costume note: a different ethnicity or a',
      '  different hair colour is a failed render.',
      `Setting: ${f.setting}`,
      // `productHandling` es un resumen de cómo se manipula el producto — que es
      // exactamente lo que ya dicen los `action` de los beats, uno por uno. Es lo
      // primero que sobra cuando el prompt no entra.
      detail === 'full' || detail === 'camera-only' ? `Product handling: ${f.productHandling}` : '',
    ].filter(Boolean).join('\n')
  }

  const assemble = (script: string) => [
    'Create a UGC ad video.',
    '',
    legend,
    `The product is "${opts.productName}" and must stay visually identical to its reference image — same shape, label, colors and text. Never redesign it.`,
    casting,
    '',
    `Accent: ${opts.direction.accent}`,
    `Vibe/Mood: ${opts.direction.vibe}`,
    `Camera Motion: ${opts.direction.cameraMotion}`,
    `Eye Direction: ${opts.direction.eyeDirection}`,
    'Aspect Ratio: 9:16',
    '',
    'Script (timed beats). Follow this structure beat by beat — same order, same pacing,',
    'same shot for each beat. The video ENDS when the last beat ends:',
    script,
    '',
    // La referencia venía de una descarga de TikTok: subtítulos quemados, marca de agua
    // y placa de cierre. El render los copió los tres. El análisis ya no los captura,
    // esto es la segunda barrera.
    'NEVER RENDER, no matter what the reference did:',
    '  - Subtitles or captions. Do not burn the dialogue into the frame as text.',
    '  - Any social-platform watermark, logo, @handle or UI overlay (TikTok, Reels, Shorts).',
    '  - An end card, outro plate, logo sting or "follow me" screen. The video ends on the',
    '    last beat of the script — no closing card, no trailing filler.',
    anyGraphic
      ? '  - Any on-screen text other than the "On-screen graphic" lines listed above.'
      : '  - Any on-screen text at all. Keep the frame completely clean of text.',
    '',
    'Do not invent extra dialogue to fill time. If the script ends before the clip does,',
    'hold the last beat naturally — silence is correct, invented lines are not.',
    '',
    'MANDATORY: all spoken dialogue is in neutral Latin-American Spanish, delivered naturally with real pauses — never robotic, never dubbed. Real human motion and micro-movements, no plastic skin, no morphing hands, no warping product.',
  ].filter(Boolean).join('\n')

  for (const detail of ['full', 'camera-only', 'camera-short', 'none'] as const) {
    const out = assemble(buildScript(detail))
    if (out.length <= KIE_PROMPT_MAX || detail === 'none') return out
  }
  /* istanbul ignore next — el for siempre retorna en 'none' */
  return assemble(buildScript('none'))
}

function apiKey(): string {
  const key = process.env.KIE_API_KEY
  if (!key) throw new Error('KIE_API_KEY no está configurada')
  return key
}

/** Crea la tarea de render. Devuelve el taskId; NO espera al video. */
export async function createVideoTask(input: VideoTaskInput): Promise<string> {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTaskBody(input)),
  })
  const json = (await res.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: { taskId?: string } }
    | null
  if (!res.ok || !json?.data?.taskId) {
    throw new Error(`KIE createTask falló (${res.status}): ${json?.msg ?? 'sin respuesta'}`)
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
 * Normaliza la respuesta de recordInfo. `resultJson` viene como STRING con JSON
 * adentro (`{"resultUrls":["…"]}`) — hay que parsearlo aparte. Puro para testear.
 */
export function parseTaskDetail(data: unknown): TaskDetail {
  const d = (data ?? {}) as Record<string, unknown>
  const state = (typeof d.state === 'string' ? d.state : 'waiting') as KieState
  let videoUrl: string | null = null
  if (typeof d.resultJson === 'string' && d.resultJson) {
    try {
      const parsed = JSON.parse(d.resultJson) as { resultUrls?: unknown }
      const urls = parsed.resultUrls
      if (Array.isArray(urls) && typeof urls[0] === 'string') videoUrl = urls[0]
    } catch {
      /* resultJson corrupto → tratamos como sin resultado todavía */
    }
  }
  return {
    state,
    progress: typeof d.progress === 'number' ? d.progress : 0,
    videoUrl,
    failMsg: typeof d.failMsg === 'string' && d.failMsg ? d.failMsg : null,
  }
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail> {
  const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  })
  const json = (await res.json().catch(() => null)) as { data?: unknown; msg?: string } | null
  if (!res.ok) throw new Error(`KIE recordInfo falló (${res.status}): ${json?.msg ?? ''}`)
  return parseTaskDetail(json?.data)
}
