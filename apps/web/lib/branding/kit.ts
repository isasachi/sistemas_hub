import JSZip from 'jszip'
import { brandSlug } from './brief'
import { logoVariant } from './variants'
import type { Preset } from './presets'

/**
 * El .zip de entrega (spec 6.5), sin SVG ni isotipo: el motor es ráster y de un
 * wordmark no se extrae un isotipo por código (decisiones del 2026-08-03).
 *
 *   <brand-slug>/
 *     brandboard.pdf
 *     logo/logo.png · logo-negro.png · logo-blanco.png
 *     etiqueta/etiqueta.png
 *     mockups/mockup.png
 *     colores-y-tipografias.txt
 *
 * Cero llamadas al modelo: las variantes son sharp y el PDF es pdf-lib.
 */

export interface KitInput {
  brandName: string
  productDescription: string
  audience: string[]
  preset: Preset
  logo: Buffer | null
  mockup: Buffer | null
  label: Buffer | null
  brandboard: Buffer | null
}

export function colorsAndTypeText(input: KitInput): string {
  const p = input.preset
  return [
    input.brandName,
    input.productDescription,
    '',
    `Estilo: ${p.label} — ${p.signature}`,
    '',
    'COLORES',
    `Primario    ${p.palette.primary}`,
    `Secundario  ${p.palette.secondary}`,
    `Acento      ${p.palette.accent}`,
    `Oscuro      ${p.palette.dark}`,
    `Claro       ${p.palette.light}`,
    '',
    'TIPOGRAFÍAS',
    `Títulos: ${p.typography.display}`,
    `Texto:   ${p.typography.body}`,
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
  if (input.label) root.folder('etiqueta')!.file('etiqueta.png', input.label)
  if (input.mockup) root.folder('mockups')!.file('mockup.png', input.mockup)

  root.file('colores-y-tipografias.txt', colorsAndTypeText(input))

  return { zip: await zip.generateAsync({ type: 'nodebuffer' }), filename: `${slug}.zip` }
}
