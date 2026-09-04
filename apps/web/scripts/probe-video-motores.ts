/**
 * Prueba pequeña: mismo clip, tres primitives de generación.
 *
 * A = lote existente del pipeline Grok (no vuelve a renderizarse)
 * B = Kling 3.0 Motion Control vía KIE
 * C = xAI Video Edit directo
 *
 * IMPORTANTE: no hace llamadas pagadas sin PROBE_RUN=1.
 *
 * ✅ SONDEADO GRATIS ANTES DE GASTAR (`scripts/canary-motores.ts`):
 *   · xAI — `POST /v1/videos/edits` con `{model:'grok-imagine-video', prompt, video:{url}}`
 *     devuelve 200 con `request_id`, y `GET /v1/videos/{request_id}` devuelve `{status,
 *     error}`. El modelo SE VALIDA antes de despachar (un nombre inexistente da 404), así
 *     que ahí el canario gratis sí funciona. Lo que NO se pudo ver sin pagar es el string
 *     del estado de ÉXITO ni dónde vive la URL — el poller tolera varias formas.
 *   · Kling — `mode` toma RESOLUCIONES (`720p`), no los `std`/`pro` que dice la doc:
 *     medido, `std` vuelve *"mode is not within the range of allowed options"*. ⚠️ Y el
 *     canario de kling NO puede ir por un campo inválido, porque un campo VÁLIDO despacha:
 *     tiene que llevar un **asset inalcanzable**, que es lo que corta sin cobrar (medido:
 *     la tarea falló con *"Image fetch failed"* y `creditsConsumed: 0.0`).
 *
 * Desde apps/web:
 *   PROBE_RUN=1 XAI_API_KEY=... npx tsx --env-file=.env.local \
 *     scripts/probe-video-motores.ts <sessionId> 0 6 1
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import ffmpegPath from 'ffmpeg-static'
import { uploadToStorage } from '../lib/storage'
import { getTaskDetail } from '../lib/video-ads/kie'

const KIE_CREATE_URL = 'https://api.kie.ai/api/v1/jobs/createTask'
const XAI_BASE_URL = 'https://api.x.ai/v1/videos'
const HTTP_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 8_000
const POLL_TIMEOUT_MS = 20 * 60_000
const MIN_CLIP_SEC = 3
const MAX_CLIP_SEC = 8.7

type Arm = 'B' | 'C'
type ProbeStatus = 'success' | 'failed' | 'skipped'

interface StoredLote {
  n: number
  videoUrl: string | null
}

interface VideoSessionRow {
  id: string
  user_id: string | null
  reference_video_url: string | null
  avatar_url: string | null
  character_url: string | null
  product_url: string | null
  product_name: string | null
  product_scan: unknown
  character_prompt: string | null
  consistency_block: string | null
  lotes: StoredLote[] | null
}

interface ArmResult {
  arm: Arm
  status: ProbeStatus
  taskId?: string
  remoteUrl?: string
  file?: string
  frames?: string
  error?: string
}

function getDb() {
  return createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function usage(): string {
  return [
    'Uso: PROBE_RUN=1 XAI_API_KEY=... npx tsx --env-file=.env.local',
    '  scripts/probe-video-motores.ts <sessionId> [inicio=0] [fin=6] [lote=1]',
    '',
    'Opcionales: PROBE_ARMS=B,C PROBE_OUT=/ruta PROBE_KLING_ORIENTATION=video|image',
  ].join('\n')
}

function parseNumber(raw: string | undefined, fallback: number, label: string): number {
  const value = raw == null ? fallback : Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${label} debe ser un número`)
  return value
}

function selectedArms(): Set<Arm> {
  const raw = process.env.PROBE_ARMS ?? 'B,C'
  const values = raw.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean)
  const invalid = values.filter((x) => x !== 'B' && x !== 'C')
  if (invalid.length || !values.length) {
    throw new Error(`PROBE_ARMS inválido: ${raw}. Usa B, C o B,C.`)
  }
  return new Set(values as Arm[])
}

function orientation(): 'video' | 'image' {
  const value = process.env.PROBE_KLING_ORIENTATION ?? 'video'
  if (value !== 'video' && value !== 'image') {
    throw new Error('PROBE_KLING_ORIENTATION debe ser video o image')
  }
  return value
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(bin, args)
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', fail)
    child.on('close', (code) => {
      code === 0
        ? ok()
        : fail(new Error(`${bin} terminó con ${code}: ${stderr.slice(-1_000)}`))
    })
  })
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`No se pudo descargar ${url}: HTTP ${response.status}`)
  await writeFile(destination, Buffer.from(await response.arrayBuffer()))
}

async function createClip(source: string, output: string, start: number, duration: number): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg-static no resolvió un binario para esta plataforma')
  await run(ffmpegPath, [
    '-y', '-loglevel', 'error', '-i', source,
    '-ss', String(start), '-t', String(duration),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-movflags', '+faststart', output,
  ])
}

async function createStrip(video: string, output: string, duration: number): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg-static no resolvió un binario para esta plataforma')
  await run(ffmpegPath, [
    '-y', '-loglevel', 'error', '-i', video,
    '-vf', `fps=5/${duration},scale=240:-2,tile=5x1`,
    '-frames:v', '1', '-q:v', '2', output,
  ])
}

function sleep(ms: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, ms))
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function productDescription(session: VideoSessionRow): string {
  const scan = session.product_scan as Record<string, unknown> | null
  const description = scan && typeof scan.productDescription === 'string'
    ? scan.productDescription.trim()
    : ''
  return [session.product_name, description].filter(Boolean).join('. ') || 'el producto del usuario'
}

function characterDescription(session: VideoSessionRow): string {
  return session.consistency_block?.trim()
    || session.character_prompt?.trim()
    || 'el personaje del usuario'
}

async function kieKey(userId: string | null): Promise<string> {
  if (!userId) throw new Error('La sesión no tiene user_id; no se puede resolver la key BYOK de KIE')
  const { data, error } = await getDb().from('user_settings')
    .select('kie_api_key').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`No se pudo leer la key de KIE: ${error.message}`)
  const key = String(data?.kie_api_key ?? '').trim()
  if (!key) throw new Error('El usuario de la sesión no tiene kie_api_key guardada')
  return key
}

async function runKling(session: VideoSessionRow, clipUrl: string): Promise<{ taskId: string; url: string }> {
  if (!session.avatar_url) throw new Error('La sesión no tiene avatar_url para Kling Motion Control')
  const key = await kieKey(session.user_id)
  const response = await fetch(KIE_CREATE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kling-3.0/motion-control',
      input: {
        prompt: [
          'Transfer the complete motion from the input video to the person in the input image.',
          'Preserve hand laterality, action order, timing, hand-object-face contacts, gaze, expression, framing and camera motion.',
          'Do not simplify, reorder, omit or invent actions.',
        ].join(' '),
        input_urls: [session.avatar_url],
        video_urls: [clipUrl],
        // ⚠️ SON RESOLUCIONES, NO `std`/`pro`. La doc de KIE dice `std` (720p) y `pro`
        // (1080p) y es FALSA: medido contra la API, `std` vuelve *"mode is not within the
        // range of allowed options"* y `720p` se acepta y despacha.
        mode: '720p',
        character_orientation: orientation(),
        background_source: 'input_video',
      },
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  const json = await response.json().catch(() => null) as
    | { code?: number; msg?: string; data?: { taskId?: string } }
    | null
  const taskId = json?.data?.taskId
  if (!response.ok || !taskId) {
    throw new Error(`KIE createTask falló (${json?.code ?? response.status}): ${json?.msg ?? 'sin respuesta'}`)
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const detail = await getTaskDetail(taskId, key)
    if (detail.state === 'success') {
      if (!detail.videoUrl) throw new Error('KIE terminó sin URL de video')
      return { taskId, url: detail.videoUrl }
    }
    if (detail.state === 'fail') throw new Error(detail.failMsg ?? 'KIE reportó fallo sin detalle')
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`KIE excedió el timeout de ${POLL_TIMEOUT_MS / 60_000} minutos`)
}

async function xaiFetch(path: string, key: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${XAI_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
}

async function runXai(session: VideoSessionRow, clipUrl: string): Promise<{ taskId: string; url: string }> {
  const key = String(process.env.XAI_API_KEY ?? '').trim()
  if (!key) throw new Error('Falta XAI_API_KEY')
  const response = await xaiFetch('/edits', key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-imagine-video',
      prompt: [
        'Preserve the source video motion exactly: same hand laterality, cheek, action order, timing, hand-product-face contacts, gaze, facial performance, framing, background and camera movement.',
        `Change only the person so they match this description: ${characterDescription(session)}.`,
        `Replace the original product with this product while preserving every manipulation and contact: ${productDescription(session)}.`,
        'Do not add, remove, simplify, reorder or retime any action.',
      ].join(' '),
      video: { url: clipUrl },
    }),
  })
  const created = await response.json().catch(() => null) as { request_id?: string; error?: unknown } | null
  const taskId = created?.request_id
  if (!response.ok || !taskId) {
    throw new Error(`xAI edits falló (${response.status}): ${JSON.stringify(created?.error ?? created)}`)
  }

  // ⚠️ EL CANARIO GRATIS CONFIRMÓ LA CREACIÓN Y EL FALLO, NO EL ÉXITO. Verificado sin
  // gastar: `POST /v1/videos/edits` con `{model, prompt, video:{url}}` devuelve 200 con
  // `request_id`, y `GET /v1/videos/{id}` devuelve `{status:'failed', error:{...}}`. El
  // string del estado de ÉXITO y dónde vive la URL solo se pueden ver con una generación
  // pagada, así que acá se aceptan varias formas y —lo importante— **se imprime el cuerpo
  // crudo la primera vez que el estado no se reconoce**: adivinar mal significaría colgarse
  // veinte minutos y reportar "timeout" sobre un video que ya estaba listo.
  const LISTO = new Set(['done', 'completed', 'succeeded', 'success', 'ready'])
  const MUERTO = new Set(['failed', 'expired', 'cancelled', 'canceled', 'error'])
  const urlDe = (d: Record<string, unknown> | null): string | undefined => {
    const video = d?.video as { url?: string } | undefined
    const videos = d?.videos as { url?: string }[] | undefined
    return video?.url ?? (typeof d?.url === 'string' ? d.url : undefined) ?? videos?.[0]?.url
  }
  const desconocidos = new Set<string>()
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const poll = await xaiFetch(`/${encodeURIComponent(taskId)}`, key)
    const detail = await poll.json().catch(() => null) as Record<string, unknown> | null
    if (!poll.ok) throw new Error(`xAI poll falló (${poll.status}): ${JSON.stringify(detail)}`)
    const status = String(detail?.status ?? '')
    if (LISTO.has(status) || urlDe(detail)) {
      const url = urlDe(detail)
      if (!url) throw new Error(`xAI dice \`${status}\` y no trae URL: ${JSON.stringify(detail)}`)
      return { taskId, url }
    }
    if (MUERTO.has(status)) {
      throw new Error(`xAI terminó con estado ${status}: ${JSON.stringify(detail?.error ?? detail)}`)
    }
    if (status && !desconocidos.has(status)) {
      desconocidos.add(status)
      console.log(`  [xAI] estado no catalogado \`${status}\` — cuerpo: ${JSON.stringify(detail)}`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`xAI excedió el timeout de ${POLL_TIMEOUT_MS / 60_000} minutos`)
}

function evaluationMarkdown(sessionId: string, start: number, end: number, baseline: number): string {
  const rows = [
    'Mano correcta', 'Mejilla correcta', 'Orden de acciones', 'Timing',
    'Contactos mano/producto/cara', 'Producto', 'Identidad', 'Cámara',
    // ⚠️ LA VOZ ES CRITERIO ELIMINATORIO Y FALTABA. Medido en el brazo B: Kling Motion
    // Control ARRASTRA la pista del video fuente — la transcripción de su salida es
    // palabra por palabra la de la creadora original, con el guion de la OTRA marca. Un
    // clip así no se puede publicar por bueno que sea el movimiento, así que esta fila
    // vale 0 si la voz es la del original, sin importar el resto.
    'Voz (0 = es la del video original)',
  ]
  return [
    '# Evaluación: Grok vs Kling Motion Control vs xAI Video Edit',
    '',
    `Sesión: \`${sessionId}\`  `,
    `Segmento: \`${start.toFixed(3)}–${end.toFixed(3)} s\`  `,
    `Baseline: lote \`${baseline}\``,
    '',
    'Puntúa cada celda de 0 a 2 mirando el clip fuente y las tiras de fotogramas.',
    '',
    '| Criterio | A · Grok actual | B · Kling | C · xAI Edit |',
    '|---|---:|---:|---:|',
    ...rows.map((row) => `| ${row} |  |  |  |`),
    '| **Total / 18** |  |  |  |',
    '',
    '## Regla de decisión',
    '',
    '- Gana el mayor total.',
    '- Mano, orden, timing y contactos no pueden tener 0.',
    '- **La voz en 0 descalifica el brazo entero**: publicar la voz de la creadora',
    '  original con el guion de otra marca no es una opción, gane lo que gane en movimiento.',
    '- En empate, prioriza movimiento/contactos sobre identidad/producto.',
    '',
    'Decisión:  ',
    'Observaciones:  ',
  ].join('\n')
}

async function main(): Promise<void> {
  const sessionId = process.argv[2]
  if (!sessionId) throw new Error(usage())
  const start = parseNumber(process.argv[3], 0, 'inicio')
  const end = parseNumber(process.argv[4], 6, 'fin')
  const baseline = parseNumber(process.argv[5], 1, 'lote baseline')
  const duration = end - start
  if (start < 0 || end <= start) throw new Error('El rango debe cumplir 0 <= inicio < fin')
  if (duration < MIN_CLIP_SEC || duration > MAX_CLIP_SEC) {
    throw new Error(`El clip debe durar entre ${MIN_CLIP_SEC} y ${MAX_CLIP_SEC} s; recibido ${duration}`)
  }
  if (!Number.isInteger(baseline) || baseline < 1) throw new Error('El lote baseline debe ser un entero >= 1')
  const arms = selectedArms()
  orientation()

  if (process.env.PROBE_RUN !== '1') {
    throw new Error(`Guardia de seguridad activa: define PROBE_RUN=1 para ejecutar.\n\n${usage()}`)
  }

  const { data, error } = await getDb().from('video_sessions').select([
    'id', 'user_id', 'reference_video_url', 'avatar_url', 'character_url',
    'product_url', 'product_name', 'product_scan', 'character_prompt',
    'consistency_block', 'lotes',
  ].join(',')).eq('id', sessionId).single()
  if (error) throw new Error(`No se pudo cargar la sesión: ${error.message}`)
  const session = data as unknown as VideoSessionRow
  if (!session.reference_video_url) throw new Error('La sesión no tiene reference_video_url')
  const lote = session.lotes?.find((item) => item.n === baseline)
  if (!lote?.videoUrl) throw new Error(`El lote baseline ${baseline} no tiene videoUrl existente`)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputDir = resolve(process.env.PROBE_OUT ?? join('probe-video-motores', `${sessionId}-${start}-${end}-${stamp}`))
  await mkdir(outputDir, { recursive: true })

  const sourceOriginal = join(outputDir, 'source-original.mp4')
  const sourceClip = join(outputDir, 'source-clip.mp4')
  const baselineFile = join(outputDir, 'A-grok-actual.mp4')
  await download(session.reference_video_url, sourceOriginal)
  await createClip(sourceOriginal, sourceClip, start, duration)
  await download(lote.videoUrl, baselineFile)

  const clipUrl = await uploadToStorage(
    sessionId,
    await readFile(sourceClip),
    'video/mp4',
    `probe-motion-${start}-${end}`.replace(/\./g, '_'),
  )

  const sourceFrames = join(outputDir, 'source-clip-frames.jpg')
  const baselineFrames = join(outputDir, 'A-grok-actual-frames.jpg')
  await Promise.all([
    createStrip(sourceClip, sourceFrames, duration),
    createStrip(baselineFile, baselineFrames, duration),
  ])

  const jobs: Promise<ArmResult>[] = []
  if (arms.has('B')) {
    jobs.push((async () => {
      try {
        const generated = await runKling(session, clipUrl)
        const file = join(outputDir, 'B-kling-motion-control.mp4')
        const frames = join(outputDir, 'B-kling-motion-control-frames.jpg')
        await download(generated.url, file)
        await createStrip(file, frames, duration)
        return { arm: 'B', status: 'success', taskId: generated.taskId, remoteUrl: generated.url, file, frames }
      } catch (error) {
        return { arm: 'B', status: 'failed', error: errorText(error) }
      }
    })())
  }
  if (arms.has('C')) {
    jobs.push((async () => {
      try {
        const generated = await runXai(session, clipUrl)
        const file = join(outputDir, 'C-xai-video-edit.mp4')
        const frames = join(outputDir, 'C-xai-video-edit-frames.jpg')
        await download(generated.url, file)
        await createStrip(file, frames, duration)
        return { arm: 'C', status: 'success', taskId: generated.taskId, remoteUrl: generated.url, file, frames }
      } catch (error) {
        return { arm: 'C', status: 'failed', error: errorText(error) }
      }
    })())
  }
  const results = await Promise.all(jobs)
  for (const arm of ['B', 'C'] as Arm[]) {
    if (!arms.has(arm)) results.push({ arm, status: 'skipped' })
  }
  results.sort((a, b) => a.arm.localeCompare(b.arm))

  const relative = (file: string | undefined) => file ? file.slice(outputDir.length + 1) : undefined
  const manifest = {
    createdAt: new Date().toISOString(),
    sessionId,
    range: { start, end, duration },
    baselineLot: baseline,
    source: { referenceVideoUrl: session.reference_video_url, clipUrl, file: 'source-clip.mp4', frames: 'source-clip-frames.jpg' },
    A: { status: 'existing', remoteUrl: lote.videoUrl, file: 'A-grok-actual.mp4', frames: 'A-grok-actual-frames.jpg' },
    arms: results.map((result) => ({ ...result, file: relative(result.file), frames: relative(result.frames) })),
    config: { arms: [...arms], klingOrientation: orientation(), outputDir },
    decisionRule: {
      highestTotalWins: true,
      nonZeroRequired: ['mano correcta', 'orden de acciones', 'timing', 'contactos mano/producto/cara'],
      tieBreak: 'movimiento/contactos sobre identidad/producto',
    },
  }
  await Promise.all([
    writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(join(outputDir, 'evaluacion.md'), evaluationMarkdown(sessionId, start, end, baseline)),
  ])

  console.log(`Prueba terminada: ${outputDir}`)
  for (const result of results) {
    console.log(`${result.arm}: ${result.status}${result.error ? ` — ${result.error}` : ''}`)
  }
}

main().catch((error) => {
  console.error(errorText(error))
  process.exitCode = 1
})
