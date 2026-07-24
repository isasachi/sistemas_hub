/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og'
import type { ReactElement } from 'react'
import type { SatoriFont } from './fonts'

// Compone la capa de texto/UI (Satori) sobre la escena de Gemini. La escena es solo píxeles
// (sin texto); TODO el texto sale del layout. Salida JPEG (peso) vía sharp.
//
// Gotchas de Satori que este helper encapsula:
//  · la escena entra como data URI en un <img> — Satori no acepta Buffer crudo en src.
//  · ImageResponse ES un Response, no bytes → arrayBuffer() → sharp.
//  · el nombre de familia de las fuentes debe matchear EXACTO el fontFamily del layout.
// Detecta el tipo real de la escena por magic bytes. Gemini/OpenAI devuelven PNG, pero etiquetarla
// mal (p.ej. image/jpeg) hace que el decodificador de @vercel/og tire "Offset is outside the bounds
// of the DataView" al parsear PNG como JPEG → la escena no se dibuja → root transparente → JPEG NEGRO.
// (Ese era el bug de cta-final: única sección con composite de lockup.) Default seguro: PNG.
export function sniffImageMime(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return 'image/png'
}

export async function renderComposite(
  scene: Buffer | string, // escena de Gemini (Buffer o base64 sin prefijo)
  layout: ReactElement,   // JSX del layout de la sección (texto + devices)
  opts: { fonts: SatoriFont[]; width?: number; height?: number; mime?: string },
): Promise<Buffer> {
  const { fonts, width = 1080, height = 1920, mime } = opts
  const buf = typeof scene === 'string' ? Buffer.from(scene, 'base64') : scene
  const b64 = buf.toString('base64')
  // El MIME de la escena se SNIFEA (no se asume): un mismatch rompe el decodificador y deja la
  // imagen negra. `opts.mime` solo se respeta si el caller lo fuerza explícitamente.
  const sceneMime = mime ?? sniffImageMime(buf)

  const root = (
    <div style={{ display: 'flex', position: 'relative', width, height }}>
      <img src={`data:${sceneMime};base64,${b64}`} width={width} height={height}
        style={{ position: 'absolute', top: 0, left: 0, width, height, objectFit: 'cover' }} />
      {layout}
    </div>
  )

  const res = new ImageResponse(root, { width, height, fonts })
  const png = Buffer.from(await res.arrayBuffer())
  const sharp = (await import('sharp')).default
  return sharp(png).jpeg({ quality: 92 }).toBuffer()
}

// Glass sandwich (Camino B): versión pre-desenfocada de la escena como data URI. Cada card la
// embebe con offset negativo igual a su posición absoluta → el recorte borroso coincide EXACTO
// con lo que hay detrás = glass real (Satori no soporta backdrop-filter). Se blurea UNA vez.
export async function blurToDataUri(scene: Buffer | string, sigma = 22): Promise<string> {
  const sharp = (await import('sharp')).default
  const buf = typeof scene === 'string' ? Buffer.from(scene, 'base64') : scene
  const out = await sharp(buf).resize(1080, 1920, { fit: 'cover' }).blur(sigma).modulate({ brightness: 1.06 }).jpeg({ quality: 72 }).toBuffer()
  return `data:image/jpeg;base64,${out.toString('base64')}`
}
