import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import type { Lote } from './lotes'

/**
 * DE QUÉ TRAMO DEL VIDEO ORIGINAL SALE EL CLIP DE REFERENCIA DE CADA LOTE.
 * ---------------------------------------------------------------------------
 * Wan toma el movimiento de un video de referencia, y ésa es la palanca que grok no tenía
 * (ver "EL EXPERIMENTO DE MOTORES" en AGENTS.md: B, C y D copian la coreografía, A no la
 * logró en ~15 renders). Pero mandarle el original ENTERO a cada lote sería pedirle 45 s de
 * coreografía dentro de un clip de 10 — la misma instrucción imposible que la coreografía
 * duplicada de `repartirAccion`, con otra modalidad. Cada lote recibe SU tramo.
 *
 * 🔴 LA TRAMPA ES LA TOMA PARTIDA, Y ESTÁ EN LOS DATOS REALES. `splitLongToma` corre ANTES
 * de `groupIntoLotes` y los fragmentos **comparten `tiempoOriginal`**: en la sesión
 * `520c9169` los lotes 3 y 4 apuntan los DOS a la ventana `16-35s`. Derivando el tramo de
 * esa marca a secas, los dos reciben el MISMO clip de 19 s — o sea el lote 4 pide movimiento
 * que ya ocurrió y el 3 pide movimiento que todavía no ocurre. Por eso el reparto es
 * PROPORCIONAL y se calcula sobre TODOS los lotes a la vez: desde un lote suelto es
 * imposible saber cuánto de su ventana ya se llevó un hermano de otro lote.
 *
 * ⚠️ Y esa misma ventana de 19 s viola los dos topes de Wan al mismo tiempo (15 s por clip,
 * `entrada + salida <= 30`), así que sin repartir tampoco entraría.
 */

/** Tope por clip de referencia que publica Wan. */
export const REF_MAX_SEC = 15
/** `duración de entrada + duración de salida` no puede pasar de esto. */
export const PRESUPUESTO_SEC = 30
/** Piso de Wan por clip de referencia. Un tramo más corto no se puede mandar. */
export const REF_MIN_SEC = 1

export type Tramo = { iniSeg: number; finSeg: number }

/** "00:16 - 00:35" → [16, 35]. Cualquier otra cosa devuelve null: sin ventana no hay tramo,
 *  y un tramo inventado es peor que ninguno (el lote sale como render sin referencia). */
export function parseVentana(tiempo: string): [number, number] | null {
  const partes = String(tiempo ?? '').split('-')
  if (partes.length < 2) return null
  const seg = (s: string) => {
    const m = /(\d+)\s*:\s*(\d+)/.exec(s)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const a = seg(partes[0])
  const b = seg(partes.slice(1).join('-'))
  if (a === null || b === null || b <= a) return null
  return [a, b]
}

/**
 * El tramo de cada lote, en el orden de `lotes`. `null` = ese lote va sin referencia
 * (ventana ilegible o más corta que el piso de Wan): degrada a un render solo-texto, que es
 * exactamente el comportamiento de grok, no un fallo.
 *
 * `salidaSeg` es la duración que se le va a pedir al modelo (la de `clampDuration`, no la
 * del lote): el presupuesto se mide contra lo que se manda, no contra lo que se planeó.
 */
export function tramosDeLotes(lotes: Lote[], salidaSeg: (lote: Lote) => number): (Tramo | null)[] {
  // Cuánta duración de lote existe en total por cada ventana original. Es el denominador
  // del reparto: sin él, un fragmento no sabe qué fracción de su ventana le toca.
  const total = new Map<string, number>()
  for (const lote of lotes) {
    for (const t of lote.tomas) total.set(t.tiempoOriginal, (total.get(t.tiempoOriginal) ?? 0) + t.duracionSeg)
  }

  const usado = new Map<string, number>()
  return lotes.map((lote) => {
    let ini = Infinity
    let fin = -Infinity
    for (const t of lote.tomas) {
      const ventana = parseVentana(t.tiempoOriginal)
      const antes = usado.get(t.tiempoOriginal) ?? 0
      usado.set(t.tiempoOriginal, antes + t.duracionSeg)
      if (!ventana) continue
      const [a, b] = ventana
      const denom = total.get(t.tiempoOriginal) || t.duracionSeg || 1
      const escala = (b - a) / denom
      ini = Math.min(ini, a + antes * escala)
      fin = Math.max(fin, a + (antes + t.duracionSeg) * escala)
    }
    if (!Number.isFinite(ini) || !Number.isFinite(fin)) return null

    // ponytail: un lote que cruza dos ventanas se lleva UN tramo de la primera a la última.
    // Las ventanas del forense encadenan sin huecos ni solapes (medido sobre 33 sesiones en
    // AGENTS.md), así que ese tramo es continuo; si algún día dejaran de encadenar, acá
    // habría que mandar varios clips (Wan acepta hasta 5).
    const tope = Math.min(REF_MAX_SEC, PRESUPUESTO_SEC - salidaSeg(lote))
    // Se recorta por el FINAL: el tramo empieza donde empieza el contenido del lote, y
    // perder el arranque es perder el gesto que abre el clip.
    const largo = Math.min(fin - ini, tope)
    if (largo < REF_MIN_SEC) return null
    return { iniSeg: r2(ini), finSeg: r2(ini + largo) }
  })
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Recorta de UNA sola bajada del original el tramo de cada lote, MUDO. `null` donde no
 * había tramo derivable.
 *
 * ⚠️ El original se baja UNA vez (13 MB en la sesión de prueba): bajarlo por lote son cinco
 * descargas del mismo archivo dentro del `maxDuration` de la ruta.
 *
 * ⚠️ `-an` NO ES OPCIONAL. Medido en el experimento de motores: con la pista del original
 * puesta, la locución generada copia las palabras de la creadora (cobertura 86 % → 98 % al
 * mutear). Es la misma clase de contaminación que descalificó a Kling y a xAI Edit.
 *
 * ⚠️ Y se RE-ENCODA (no `-c copy`) a propósito, al revés que `concat.ts`: un corte por copia
 * empieza en el keyframe anterior, así que el clip arrancaría antes del gesto que se quiere
 * copiar. Acá el fotograma exacto es el punto.
 */
export async function cortarTramos(videoUrl: string, tramos: (Tramo | null)[]): Promise<(Buffer | null)[]> {
  if (!tramos.some(Boolean)) return tramos.map(() => null)
  if (!ffmpegPath) throw new Error('ffmpeg-static no resolvió un binario en esta plataforma')

  const dir = await mkdtemp(join(tmpdir(), 'video-ads-tramo-'))
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`No se pudo bajar el video de referencia: ${res.status}`)
    const fuente = join(dir, 'original.mp4')
    await writeFile(fuente, Buffer.from(await res.arrayBuffer()))

    const salida: (Buffer | null)[] = []
    for (const [i, t] of tramos.entries()) {
      if (!t) { salida.push(null); continue }
      const ruta = join(dir, `tramo-${i}.mp4`)
      await correr(ffmpegPath, [
        '-y', '-loglevel', 'error', '-i', fuente,
        '-ss', String(t.iniSeg), '-t', String(r2(t.finSeg - t.iniSeg)),
        '-map', '0:v:0', '-an',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', ruta,
      ])
      salida.push(await readFile(ruta))
    }
    return salida
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function correr(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (c) => { err += String(c) })
    p.on('error', fail)
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg salió ${code}: ${err.trim().slice(0, 400)}`))))
  })
}
