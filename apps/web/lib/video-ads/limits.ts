/**
 * Tope del video de referencia: por encima, Gemini no lo acepta inline (el base64
 * infla 4/3 el tamaño) y habría que ir a la Files API. Vive en su propio módulo
 * (no en `upload-client.ts`, que es 'use client') para que el guard del browser
 * (`Section0Reference`, vía `upload-client.ts`) y el guard del servidor
 * (`analyze-reference/route.ts`) lean el mismo número — un solo lugar, dos capas.
 * El chequeo del browser es solo UX (se puede saltear editando el request), así
 * que el servidor lo vuelve a exigir antes de bufferear el archivo en memoria.
 */
export const MAX_VIDEO_MB = 14
