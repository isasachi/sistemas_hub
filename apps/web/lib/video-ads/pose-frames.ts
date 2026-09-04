import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'

/**
 * Saca fotogramas del video ORIGINAL en instantes dados.
 *
 * ⚠️ PARA QUÉ: el timeline trae `referenceFrameMs` por beat —el instante que mejor muestra
 * ese tramo— y hasta ahora nadie lo leía. Con él, el ancla de un lote deja de generarse
 * desde una descripción de texto y pasa a copiar la POSE REAL del original: dónde están las
 * manos, dónde está el producto, a qué altura, con qué encuadre. Es la única palanca de
 * esta tool que cambia de MODALIDAD en vez de reescribir la misma orden, y este repo tiene
 * medido cinco veces que **la imagen le gana al texto**.
 *
 * ⚠️ EL VIDEO SE BAJA UNA VEZ Y SE LEE DE DISCO — no se le pasa la URL a ffmpeg.
 * Darle la URL con `-ss` delante parecía lo barato (baja solo lo que necesita), y está
 * MEDIDO que no funciona: `ffmpeg-static` 7.0.2 **segfaultea (SIGSEGV, rc 139)** con una
 * entrada https, en cuanto se le pide el primer fotograma. El mismo binario y el mismo
 * comando sobre el archivo local devuelven el cuadro sin chistar. Y de paso el reparto es
 * mejor: son 5-6 anclas por sesión, así que una descarga gana a seis búsquedas remotas.
 * El video ya viene topado a `MAX_VIDEO_MB` desde que se sube, así que el tamaño está
 * acotado por construcción.
 *
 * ⚠️ NO LANZA NUNCA: sin fotograma el ancla se genera como antes (solo desde el texto),
 * que es una degradación y no un error. Misma jerarquía que el resto de este eje — una
 * escena sin ancla se apoya en la descripción, no rompe el render.
 */
export async function extraerFotogramas(videoUrl: string, instantesMs: number[]): Promise<(Buffer | null)[]> {
  const vacio = instantesMs.map(() => null)
  if (!instantesMs.length) return []
  const tmp = join(tmpdir(), `pose-${randomUUID()}.mp4`)
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) return vacio
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()))
    return await Promise.all(instantesMs.map((ms) => unFotograma(tmp, ms)))
  } catch {
    return vacio
  } finally {
    await rm(tmp, { force: true })
  }
}

/** ⚠️ `-ss` ANTES del `-i`: así busca y decodifica un cuadro, en vez de decodificar desde 0. */
function unFotograma(archivo: string, ms: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg as unknown as string, [
      '-ss', Math.max(0, ms / 1000).toFixed(3), '-i', archivo,
      '-frames:v', '1', '-f', 'mjpeg', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] })
    const trozos: Buffer[] = []
    p.stdout.on('data', (d: Buffer) => trozos.push(d))
    p.on('error', () => resolve(null))
    p.on('close', (code) => {
      const bytes = Buffer.concat(trozos)
      resolve(code === 0 && bytes.length > 0 ? bytes : null)
    })
  })
}
