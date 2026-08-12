import sharp from 'sharp'

/**
 * Enlienzado a 9:16 para el render de una sola imagen.
 * ---------------------------------------------------------------------------
 * Grok 1.5 IGNORA `aspect_ratio` cuando el array trae una sola imagen: el video
 * hereda el ratio del origen. En la línea `video-ref` el producto es la única
 * imagen, así que una foto apaisada saldría en video horizontal por más que el
 * body pida 9:16.
 *
 * Es PADDING, no recorte: un `cover` sobre una foto 16:9 conserva ~un tercio del
 * ancho y le corta los bordes al producto, lo que contradice la regla que el
 * propio prompt le impone a Grok ("must stay visually identical … same shape,
 * label, colors and text"). Perder producto es peor que ganar bandas.
 *
 * ponytail: fondo blanco liso. Si en el output las bandas leen como objeto (una
 * foto de fondo oscuro es el caso malo), el upgrade es blur-extend — la misma
 * imagen escalada a cubrir y desenfocada de fondo, en vez del color plano.
 */

export const VERTICAL_WIDTH = 1080
export const VERTICAL_HEIGHT = 1920

export async function toVerticalCanvas(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(VERTICAL_WIDTH, VERTICAL_HEIGHT, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 },
    })
    .jpeg({ quality: 92 })
    .toBuffer()
}
