import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { toVerticalCanvas, VERTICAL_WIDTH, VERTICAL_HEIGHT } from './vertical'

// Esto prueba que la IMAGEN sale 9:16, que es lo que Grok mira cuando el array trae
// una sola. NO prueba que el video salga vertical ni que el modelo no anime las
// bandas — eso solo lo dice un render en vivo.

async function solid(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer()
}

describe('toVerticalCanvas', () => {
  it('enlienza una foto apaisada a 1080x1920', async () => {
    const out = await toVerticalCanvas(await solid(1600, 900))
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(VERTICAL_WIDTH)
    expect(meta.height).toBe(VERTICAL_HEIGHT)
  })

  it('también normaliza una que ya es vertical pero de otro ratio', async () => {
    const out = await toVerticalCanvas(await solid(1024, 1536)) // 2:3, lo que da gpt-image-2
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(VERTICAL_WIDTH)
    expect(meta.height).toBe(VERTICAL_HEIGHT)
  })

  it('no recorta: el contenido entra completo y el resto es relleno', async () => {
    // Una franja apaisada 1600x100 escalada a 1080 de ancho ocupa ~68px de alto.
    // Si en vez de padding hubiera un cover-crop, el rojo llenaría todo el lienzo.
    const out = await toVerticalCanvas(await solid(1600, 100))
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels
      return [data[i], data[i + 1], data[i + 2]]
    }
    expect(px(VERTICAL_WIDTH / 2, VERTICAL_HEIGHT / 2)[0]).toBeGreaterThan(150) // rojo al centro
    expect(px(VERTICAL_WIDTH / 2, 20)).toEqual([255, 255, 255]) // banda blanca arriba
  })

  it('sale JPEG (el mimeType que se le pasa a uploadToStorage debe coincidir)', async () => {
    const meta = await sharp(await toVerticalCanvas(await solid(800, 800))).metadata()
    expect(meta.format).toBe('jpeg')
  })
})
