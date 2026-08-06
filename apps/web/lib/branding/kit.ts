import JSZip from 'jszip'
import { brandSlug, type Style } from './brief'

/**
 * El .zip de entrega.
 *
 *   <brand-slug>/
 *     brandbook.png        el board completo (1536x1024)
 *     logo.png             el logo aislado, derivado del board
 *     empaque.png          la foto de producto, derivada del board
 *     colores-y-estilo.txt
 *
 * Cero llamadas al modelo y cero post-proceso: las tres imágenes ya vienen
 * generadas. Se fue el brandboard en pdf-lib (el modelo genera un board mucho
 * mejor) y se fueron las variantes negro/blanco por umbral (no hay un logo suelto
 * que umbralizar: el logo del board es a color y con su forma propia).
 */

export interface KitInput {
  brandName: string
  tagline?: string
  productDescription: string
  audience: string[]
  feel: string[]
  style: Style
  brandbook: Buffer | null
  logo: Buffer | null
  empaque: Buffer | null
}

export function colorsAndStyleText(input: KitInput): string {
  const s = input.style
  return [
    input.brandName,
    input.tagline ?? '',
    input.productDescription,
    '',
    input.feel.length ? `ACTITUD\n${input.feel.join(' · ')}` : '',
    '',
    'COLORES',
    ...s.palette.map((c) => `${c.name.padEnd(20)} ${c.hex.toUpperCase()}`),
    '',
    s.inspiration ? `INSPIRACIÓN\n${s.inspiration}` : '',
    '',
    s.graphicStyle ? `ESTILO GRÁFICO\n${s.graphicStyle}` : '',
    '',
    s.products ? `PIEZAS\n${s.products}` : '',
    '',
    input.audience.length ? `PÚBLICO\n${input.audience.join(' · ')}` : '',
    '',
    'Las tipografías del brandbook las eligió el modelo: mira la sección Typography',
    'de brandbook.png para su nombre exacto.',
    '',
    'Generado con JR AI Hub.',
  ].join('\n').replace(/\n{3,}/g, '\n\n')
}

export async function buildKit(input: KitInput): Promise<{ zip: Buffer; filename: string }> {
  const slug = brandSlug(input.brandName)
  const zip = new JSZip()
  const root = zip.folder(slug)!

  if (input.brandbook) root.file('brandbook.png', input.brandbook)
  if (input.logo) root.file('logo.png', input.logo)
  if (input.empaque) root.file('empaque.png', input.empaque)
  root.file('colores-y-estilo.txt', colorsAndStyleText(input))

  return { zip: await zip.generateAsync({ type: 'nodebuffer' }), filename: `${slug}.zip` }
}
