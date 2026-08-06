import JSZip from 'jszip'
import { brandSlug, type Style } from './brief'
import { logoVariant, frontPanel } from './variants'

/**
 * El .zip de entrega (spec 6.5), sin SVG ni isotipo: el motor es ráster y de un
 * wordmark no se extrae un isotipo por código (decisiones del 2026-08-03).
 *
 *   <brand-slug>/
 *     brandboard.pdf
 *     logo/logo.png · logo-negro.png · logo-blanco.png
 *     etiqueta/etiqueta-360.png · etiqueta-frontal.png
 *     mockups/mockup.png
 *     colores-y-tipografias.txt
 *
 * Cero llamadas al modelo: las variantes son sharp y el PDF es pdf-lib.
 */

export interface KitInput {
  brandName: string
  productDescription: string
  audience: string[]
  style: Style
  feel: string[]
  logo: Buffer | null
  mockup: Buffer | null
  label: Buffer | null
  brandboard: Buffer | null
}

export function colorsAndTypeText(input: KitInput): string {
  const { palette, typography } = input.style
  return [
    input.brandName,
    input.productDescription,
    '',
    input.feel.length ? `Estilo: ${input.feel.join(' · ')}` : '',
    '',
    'COLORES',
    `Primario    ${palette.primary}`,
    `Secundario  ${palette.secondary}`,
    `Acento      ${palette.accent}`,
    `Oscuro      ${palette.dark}`,
    `Claro       ${palette.light}`,
    '',
    'TIPOGRAFÍAS',
    `Títulos: ${typography.display}`,
    `Texto:   ${typography.body}`,
    '',
    input.audience.length ? `PÚBLICO\n${input.audience.join(' · ')}` : '',
    '',
    'Generado con JR AI Hub.',
  ].join('\n')
}

export async function buildKit(input: KitInput): Promise<{ zip: Buffer; filename: string }> {
  const slug = brandSlug(input.brandName)
  const zip = new JSZip()
  const root = zip.folder(slug)!

  if (input.brandboard) root.file('brandboard.pdf', input.brandboard)

  if (input.logo) {
    const logo = root.folder('logo')!
    logo.file('logo.png', input.logo)
    logo.file('logo-negro.png', await logoVariant(input.logo, 'negro'))
    logo.file('logo-blanco.png', await logoVariant(input.logo, 'blanco'))
  }
  if (input.label) {
    // El 360 completo (lo que va a imprenta) y el frente recortado (lo que se ve
    // en el envase). El recorte es sharp, no otra generación.
    const etiqueta = root.folder('etiqueta')!
    etiqueta.file('etiqueta-360.png', input.label)
    etiqueta.file('etiqueta-frontal.png', await frontPanel(input.label))
  }
  if (input.mockup) root.folder('mockups')!.file('mockup.png', input.mockup)

  root.file('colores-y-tipografias.txt', colorsAndTypeText(input))

  return { zip: await zip.generateAsync({ type: 'nodebuffer' }), filename: `${slug}.zip` }
}
