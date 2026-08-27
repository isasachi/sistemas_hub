import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

/**
 * LOS N CLIPS EN UN SOLO MP4.
 * ---------------------------------------------------------------------------
 * El entregable de esta tool son N clips independientes porque el spec reparte el render en
 * lotes, pero lo que el usuario pidió —y lo que se sube a una red social— es UN video.
 *
 * ⚠️ **EL MOTIVO QUE ESTE REPO REPETÍA PARA NO HACERLO ERA FALSO.** Durante mucho tiempo se
 * dijo "no hay ffmpeg en `apps/web` (Vercel)", describiendo el límite viejo de 250 MB de
 * serverless que nadie volvió a revisar: `vercel.json` tiene `"fluid": true`, o sea Fluid
 * Compute, donde el paquete llega a **5 GB** y `ffmpeg-static` pesa ~80 MB.
 *
 * ⚠️ **`-c copy`, SIN RE-ENCODE, y eso está medido, no supuesto.** Los tres clips reales
 * comprobados salen todos de grok con parámetros idénticos —h264 720x1280 yuv420p 24 fps,
 * aac 48 kHz estéreo— así que el demuxer `concat` los pega sin tocar un solo fotograma.
 * Importa por el costo: Vercel cobra **Active CPU**, y un re-encode de medio minuto de video
 * lo consumiría de verdad mientras que `-c copy` es esencialmente E/S.
 *
 * ⚠️ **EL `-map` EXPLÍCITO NO ES DECORACIÓN.** Los mp4 de grok traen un TERCER stream
 * (`mjpeg`, la miniatura) además de video y audio. Sin `-map 0:v:0 -map 0:a:0` el resultado
 * depende de qué elija el demuxer, y el modo de fallo de un concat mal mapeado es un archivo
 * corrupto —no un error—, que es exactamente lo que nadie mira antes de publicar.
 */

/** Un lote que ya terminó de renderizar, en el orden en que va el video. */
export type ClipListo = { videoUrl: string }

export class SinClips extends Error {}

/**
 * Baja los clips y los pega en un mp4. Devuelve los bytes.
 *
 * ⚠️ Se PEGA EN ORDEN DEL ARRAY: `lotes` ya está ordenado por el reparto, así que quien
 * llame no debe reordenar ni filtrar los fallidos hacia el final — un lote caído se salta,
 * y saltarlo cambia el guión, cosa que la ruta tiene que decirle al usuario.
 */
export async function concatenarClips(clips: ClipListo[]): Promise<Buffer> {
  if (!clips.length) throw new SinClips('No hay ningún clip renderizado todavía')
  if (!ffmpegPath) throw new Error('ffmpeg-static no resolvió un binario en esta plataforma')

  const dir = await mkdtemp(join(tmpdir(), 'video-ads-concat-'))
  try {
    const rutas: string[] = []
    for (const [i, c] of clips.entries()) {
      const res = await fetch(c.videoUrl, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`No se pudo bajar el clip ${i + 1}: ${res.status}`)
      const ruta = join(dir, `clip-${i}.mp4`)
      await writeFile(ruta, Buffer.from(await res.arrayBuffer()))
      rutas.push(ruta)
    }

    // El formato de la lista del demuxer escapa la comilla simple como '\''.
    const lista = join(dir, 'lista.txt')
    await writeFile(lista, rutas.map((r) => `file '${r.replace(/'/g, "'\\''")}'`).join('\n'))

    const salida = join(dir, 'final.mp4')
    await correr(ffmpegPath, [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', lista,
      '-map', '0:v:0', '-map', '0:a:0',
      '-c', 'copy',
      // Mueve el índice al principio: sin esto el video no empieza a reproducirse hasta
      // haberse descargado entero, que es lo que hace parecer roto un mp4 que está bien.
      '-movflags', '+faststart',
      salida,
    ])
    return await readFile(salida)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function correr(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args)
    let err = ''
    p.stderr.on('data', (d) => { err += String(d) })
    p.on('error', reject)
    p.on('close', (code) => {
      code === 0 ? resolve() : reject(new Error(`ffmpeg salió con ${code}: ${err.slice(0, 500)}`))
    })
  })
}
