import sharp from 'sharp'

/**
 * Etapa 4 del pipeline: variantes del logo en negro y en blanco.
 * ---------------------------------------------------------------------------
 * SIN llamadas al modelo — es un umbral y un canal alfa (el spec lo exige, y
 * además regenerar el logo en otro color no daría la MISMA forma).
 *
 * El logo llega como arte oscuro sobre fondo blanco: se binariza, y la máscara
 * resultante se usa como alfa sobre un lienzo del color pedido. Salen PNG con
 * transparencia, que es lo que sirve para montarlos sobre cualquier fondo.
 *
 * ponytail: umbral fijo (230). Un logo casi-blanco sobre blanco saldría vacío;
 * si aparece, el arreglo es un umbral por luminancia media, no un modelo.
 */
const THRESHOLD = 230

/**
 * La etiqueta se genera como 360 de dos paneles (frente a la IZQUIERDA, dorso a
 * la derecha — lo fija `buildLabelPrompt`). El mockup y el kit necesitan el
 * frente solo: es un recorte, no otra generación.
 */
export async function frontPanel(label: Buffer): Promise<Buffer> {
  const meta = await sharp(label).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height) return label
  return sharp(label).extract({ left: 0, top: 0, width: Math.floor(width / 2), height }).png().toBuffer()
}

export type VariantColor = 'negro' | 'blanco'

export async function logoVariant(png: Buffer, color: VariantColor): Promise<Buffer> {
  const meta = await sharp(png).metadata()
  const width = meta.width ?? 1024
  const height = meta.height ?? 1024

  // Opaco donde hay tinta: binarizar y negar (el arte es oscuro sobre blanco).
  const alpha = await sharp(png)
    .flatten({ background: '#ffffff' })
    .greyscale()
    .threshold(THRESHOLD)
    .negate()
    .raw()
    .toBuffer()

  const rgb = color === 'negro' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
  const base = await sharp({ create: { width, height, channels: 3, background: rgb } }).raw().toBuffer()

  return sharp(base, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer()
}
