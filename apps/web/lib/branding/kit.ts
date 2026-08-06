import JSZip from 'jszip'
import { brandSlug, type Style } from './brief'
import { logoVariant } from './variants'

/**
 * El .zip de entrega.
 *
 *   <brand-slug>/
 *     identidad.png                       la imagen del prompt maestro
 *     logo/logo.png · logo-negro.png · logo-blanco.png
 *     etiqueta-360.png                    plana, lista para imprenta
 *     mockup.png
 *     marca.txt
 *
 * Las 3 variantes de logo salen de UNA generación: la principal viene del modelo
 * y las de negro y blanco se derivan con sharp (umbral + canal alfa). Es $0, y
 * sobre todo garantiza que las tres tengan LA MISMA forma — tres llamadas al
 * modelo darían tres logos parecidos pero distintos, que es lo contrario de un
 * sistema de identidad.
 */

export interface KitInput {
  brandName: string
  tagline?: string
  productDescription: string
  audience: string[]
  feel: string[]
  style: Style
  identidad: Buffer | null
  logo: Buffer | null
  etiqueta: Buffer | null
  mockup: Buffer | null
}

export function marcaText(input: KitInput): string {
  return [
    input.brandName,
    input.tagline ?? '',
    input.productDescription,
    '',
    input.feel.length ? `ACTITUD\n${input.feel.join(' · ')}` : '',
    '',
    input.style.palette.length ? `COLORES\n${input.style.palette.join(' · ')}` : '',
    '',
    input.style.inspiration ? `INSPIRACIÓN\n${input.style.inspiration}` : '',
    '',
    input.audience.length ? `PÚBLICO\n${input.audience.join(' · ')}` : '',
    '',
    'Los valores exactos de color y el nombre de las tipografías los eligió el modelo:',
    'están rotulados dentro de identidad.png.',
    '',
    'Generado con JR AI Hub.',
  ].join('\n').replace(/\n{3,}/g, '\n\n')
}

export async function buildKit(input: KitInput): Promise<{ zip: Buffer; filename: string }> {
  const slug = brandSlug(input.brandName)
  const zip = new JSZip()
  const root = zip.folder(slug)!

  if (input.identidad) root.file('identidad.png', input.identidad)
  if (input.logo) {
    const logo = root.folder('logo')!
    logo.file('logo.png', input.logo)
    logo.file('logo-negro.png', await logoVariant(input.logo, 'negro'))
    logo.file('logo-blanco.png', await logoVariant(input.logo, 'blanco'))
  }
  if (input.etiqueta) root.file('etiqueta-360.png', input.etiqueta)
  if (input.mockup) root.file('mockup.png', input.mockup)
  root.file('marca.txt', marcaText(input))

  return { zip: await zip.generateAsync({ type: 'nodebuffer' }), filename: `${slug}.zip` }
}
