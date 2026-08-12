'use client'

/**
 * Subida directa del browser al bucket. El body de una función serverless de Vercel
 * está topado en 4.5 MB, así que el video de referencia NO puede pasar por una ruta:
 * pedimos una URL firmada, hacemos PUT del archivo, y a la ruta le mandamos solo la
 * URL pública resultante.
 */
export async function uploadDirect(
  sessionId: string,
  name: 'reference-video' | 'character',
  file: File,
): Promise<string> {
  const signRes = await fetch(`/api/generador-video-ads/sessions/${sessionId}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: file.type }),
  })
  const signed = (await signRes.json()) as { signedUrl?: string; publicUrl?: string; error?: string }
  if (!signRes.ok || !signed.signedUrl || !signed.publicUrl)
    throw new Error(signed.error ?? 'No se pudo preparar la subida')

  const put = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!put.ok) throw new Error('Falló la subida del archivo')

  return signed.publicUrl
}

/** Tope del video de referencia: por encima, Gemini no lo acepta inline. */
export const MAX_VIDEO_MB = 14

/**
 * Mide el asset en el browser para exigir que sea vertical.
 * ---------------------------------------------------------------------------
 * El output es 9:16: una referencia apaisada produce un guión con encuadres que
 * no caben, y un personaje apaisado entra al render con la cabeza recortada.
 *
 * El criterio es `alto > ancho`, NO 9:16 exacto: la línea `character-gen` genera
 * al personaje con gpt-image-2, que solo hace 1024x1536 (2:3). Un gate estricto
 * rechazaría el propio output de la tool. No lo aprietes.
 *
 * ponytail: devuelve null si no se pudo medir (HEIC, códec raro) y el caller deja
 * pasar. Bloquear ahí dejaría al usuario sin salida por un formato que el browser
 * no sabe decodificar, que es peor que un video horizontal.
 */
export async function measureAsset(file: File): Promise<{ w: number; h: number } | null> {
  if (file.type.startsWith('video/')) {
    return new Promise((resolve) => {
      const el = document.createElement('video')
      const url = URL.createObjectURL(file)
      const done = (v: { w: number; h: number } | null) => {
        URL.revokeObjectURL(url)
        resolve(v)
      }
      el.onloadedmetadata = () => done({ w: el.videoWidth, h: el.videoHeight })
      el.onerror = () => done(null)
      el.preload = 'metadata'
      el.src = url
    })
  }
  try {
    const bmp = await createImageBitmap(file)
    const dims = { w: bmp.width, h: bmp.height }
    bmp.close()
    return dims
  } catch {
    return null
  }
}

export function isPortrait(dims: { w: number; h: number } | null): boolean {
  return !dims || dims.h > dims.w
}
