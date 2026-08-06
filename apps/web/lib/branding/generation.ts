/**
 * generation.ts — el brief → el prompt maestro del brandbook.
 * ---------------------------------------------------------------------------
 * ESTE PROMPT ES LA FUENTE DE VERDAD DE LA TOOL (decisión del usuario,
 * 2026-08-06). No es una plantilla entre varias: es *el* prompt con el que se
 * generan brandbooks con identidad firme, y el trabajo del sistema es
 * automatizar el llenado de sus casillas, no reinterpretarlo.
 *
 * Reglas al tocarlo:
 *  · Los bloques fijos (sistema de identidad, fotografía, avoid, board final)
 *    se copian TAL CUAL. No se "mejoran" ni se resumen.
 *  · Las 8 casillas se rellenan con el brief. Una casilla vacía se omite entera
 *    en vez de mandar un placeholder: `[Visual Inspiration]` literal dentro del
 *    prompt es ruido que el modelo dibuja.
 *  · No hay casilla de tipografía a propósito. El modelo elige la suya (en el
 *    board de referencia eligió Neue Haas Grotesk); fijarla desde un catálogo de
 *    Google Fonts le quita libertad y baja el techo.
 *  · Las dos únicas adiciones al prompt original son las decisiones del usuario:
 *    el eslogan cuando lo escribe, y el idioma del empaque (español peruano, sin
 *    inventar datos legales).
 *
 * Motor: ráster PNG con gpt-image-2. El board sale en 3:2 = 1536x1024, que es
 * exactamente el tamaño del board de referencia.
 * ---------------------------------------------------------------------------
 */

import type { Brief, Style } from './brief'
import { feelWords } from './brief'

/** El board primero; las piezas sueltas se derivan de él. */
export type Stage = 'brandbook' | 'logo' | 'empaque'
export const STAGE_SEQUENCE: Stage[] = ['brandbook', 'logo', 'empaque']

export const STAGE_LABELS: Record<Stage, string> = {
  brandbook: 'Brandbook',
  logo: 'Logo',
  empaque: 'Empaque',
}

/* ── Los bloques fijos del prompt maestro ─────────────────────────────────── */

const IDENTITY_SYSTEM = [
  '**The identity system should include:**',
  '',
  '* Primary logo',
  '* Logo variations',
  '* Color palette',
  '* Typography',
  '* Graphic elements',
  '* Product and packaging mockups',
  '* Any additional branded materials if specified',
].join('\n')

const PHOTOGRAPHY =
  '**Photography style:** Editorial product photography, premium studio lighting, photorealistic, '
  + 'clean composition, luxury branding presentation.'

const AVOID =
  '**Avoid:** Generic AI aesthetics, clipart, cartoon graphics, visual clutter, excessive gradients, '
  + 'cheap mockups, poor typography, inconsistent branding, outdated design trends, stock-looking layouts, '
  + 'low-resolution details, watermarks, fake UI elements, random decorative elements, overly busy '
  + 'compositions, plastic-looking materials unless intentionally specified.'

const FINAL_IMAGE =
  'The final image should be a single premium brand identity board with a modern editorial layout, '
  + 'strong visual hierarchy, generous white space, and the quality of a professional Behance branding case study.'

/**
 * Idioma del empaque. El prompt original no lo dice y el modelo escribe en inglés
 * ("DIETARY SUPPLEMENT", "NET WT."); el mercado es peruano. De paso cierra el
 * agujero de los datos legales: esta tool ya inventó una razón social mexicana
 * para una marca peruana.
 */
const COPY_RULES =
  '**Packaging copy:** All text printed on the packaging must be in Spanish as used in Peru '
  + '(e.g. "SUPLEMENTO DIETARIO", "CONT. NETO 300 g", "60 porciones"). '
  + 'Do NOT invent legal or company data: no made-up company name, address, city, country, '
  + 'registration number, phone or website.'

/* ── Las 8 casillas ───────────────────────────────────────────────────────── */

function paletteText(palette: Style['palette']): string {
  return palette.map((c) => `${c.name} ${c.hex}`).join(', ')
}

/** `**Etiqueta:** valor`, o nada si el valor está vacío. */
function slot(label: string, value: string | undefined): string {
  const v = (value ?? '').trim()
  return v ? `**${label}:** ${v}` : ''
}

export function buildBrandbookPrompt(b: Brief): string {
  return [
    'Create a complete brand identity concept for a brand whose details are specified below.',
    '',
    slot('Brand name', b.brandName),
    slot('Tagline', b.tagline),
    slot('Brand description', b.productDescription),
    slot('Target age group', b.audience.join(', ')),
    slot('Brand feel', feelWords(b.feel)),
    slot('Inspired from', b.style.inspiration),
    slot('Products and packaging', b.style.products),
    slot('Colors', paletteText(b.style.palette)),
    slot('Graphic style', b.style.graphicStyle),
    '',
    IDENTITY_SYSTEM,
    '',
    PHOTOGRAPHY,
    '',
    COPY_RULES,
    '',
    AVOID,
    '',
    FINAL_IMAGE,
    // Una casilla vacía deja una línea en blanco que este collapse se lleva; así
    // el prompt nunca contiene un `**Inspired from:**` colgando sin valor.
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Las piezas sueltas se sacan DEL BOARD ya generado, que va como primera imagen
 * adjunta. Sin esa referencia cada llamada es una interpretación distinta y el
 * logo del zip no sería el logo del board.
 */
export function buildPiecePrompt(stage: 'logo' | 'empaque', b: Brief): string {
  const common = [
    `The attached image is the finished brand identity board for "${b.brandName}".`,
    'Reproduce its brand exactly: same logo, same letterforms, same colours, same graphic elements.',
    'Do not redesign anything and do not invent new elements.',
  ]
  if (stage === 'logo') {
    return [
      ...common,
      `Output ONLY the primary logo from that board, isolated and centred on a plain white background,`,
      'at large size with generous margins.',
      'No packaging, no mockup, no board layout, no swatches, no specimen text, no shadow, no frame.',
    ].join(' ')
  }
  return [
    ...common,
    `Output ONE photorealistic product shot of the main packaging piece from that board`,
    b.style.products.trim() ? `(${b.style.products.trim()})` : '',
    '— the same packaging, with the same printed artwork and the same copy.',
    PHOTOGRAPHY.replace('**Photography style:** ', 'Photography: '),
    'Single product, centred, clean uncluttered background, no people, no hands, no board layout,',
    'no swatches, no text other than what belongs on the packaging.',
  ].filter(Boolean).join(' ')
}

export function buildPrompt(stage: Stage, b: Brief): string {
  return stage === 'brandbook' ? buildBrandbookPrompt(b) : buildPiecePrompt(stage, b)
}

/**
 * gpt-image-2 solo tiene 3 tamaños. El board es apaisado (1536x1024, el mismo del
 * board de referencia); el logo cuadrado y el empaque vertical, que es como se
 * fotografía un producto.
 */
export function aspectFor(stage: Stage): string {
  if (stage === 'brandbook') return '3:2'
  return stage === 'logo' ? '1:1' : '4:5'
}
