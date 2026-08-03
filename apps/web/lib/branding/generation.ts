/**
 * generation.ts — brief + preset → los 3 prompts del pipeline.
 * ---------------------------------------------------------------------------
 * Motor: ráster PNG con gpt-image-2 (decisión cerrada 2026-08-03 — no hay motor
 * híbrido, ni vector, ni Recraft). Por eso NO hay interfaz `ImageEngine` con
 * varias implementaciones: hay una sola llamada, `generateImage` de lib/gemini.
 *
 * Los prompts van en inglés (el motor responde mejor) y son largos y específicos,
 * que es como rinde gpt-image-2. La dirección visual sale ENTERA del preset
 * (`promptStyle` + paleta + tipografías): el usuario no elige nada de eso.
 * ---------------------------------------------------------------------------
 */

import type { Brief } from './brief'
import type { Preset } from './presets'

export type Stage = 'logo' | 'mockup' | 'label'

/**
 * Orden fijo, en cascada: cada pieza MONTA sobre la anterior.
 *   logo → etiqueta (lleva el logo) → mockup (aplica la etiqueta al envase)
 *
 * `mockup_first` se probó y perdió (2026-08-03): naciendo dentro de un envase el
 * wordmark sale aguado y lo que se extrae después arrastra eso. Y con el mockup
 * al final, lo que se ve montado es la MISMA etiqueta que se entrega, no una
 * reinterpretación.
 */
export const STAGE_SEQUENCE: Stage[] = ['logo', 'label', 'mockup']

export const STAGE_LABELS: Record<Stage, string> = {
  logo: 'Logo',
  mockup: 'Mockup del producto',
  label: 'Etiqueta',
}

function paletteLine(p: Preset): string {
  const { primary, secondary, accent, dark, light } = p.palette
  return `Palette — primary ${primary}, secondary ${secondary}, accent ${accent}, dark ${dark}, light ${light}. `
    + `Use these exact colours and no others.`
}

function audienceLine(b: Brief): string {
  return b.audience.length ? `The buyer is: ${b.audience.join(', ')}.` : ''
}

/** El nombre va entrecomillado y con instrucción de ortografía: el motor es fiel al lettering. */
function exactName(b: Brief): string {
  return `Render the brand name EXACTLY as "${b.brandName}" — same spelling, same accents, no extra words.`
}

/** Qué pieza ya generada se adjunta como referencia (la primera de los adjuntos). */
export type Ref = 'none' | 'logo' | 'label'

/** El envase pedido, o la fórmula para que lo elija el motor según el estilo. */
function containerLine(b: Brief): string {
  return b.containerType
    ? `The container MUST be: ${b.containerType}.`
    : `Choose the packaging format that best fits ${b.productDescription}.`
}

export function buildLogoPrompt(b: Brief, p: Preset): string {
  return [
    `Design a brand logo for a ${b.category} product: ${b.productDescription}.`,
    `It is a WORDMARK: the brand name as custom lettering, no slogan, no tagline, no product shot.`,
    exactName(b),
    `Typography direction: letterforms in the spirit of ${p.typography.display}.`,
    `Style — ${p.promptStyle}`,
    paletteLine(p),
    audienceLine(b),
    `Flat vector-looking artwork, crisp edges, centred with generous margins, plain white background,`,
    `no mockup, no packaging, no shadow, no 3D, no frame, no watermark.`,
  ].filter(Boolean).join(' ')
}

export function buildMockupPrompt(b: Brief, p: Preset, ref: Ref): string {
  return [
    `Photorealistic product shot of ${b.productDescription} for the brand "${b.brandName}".`,
    containerLine(b),
    ref === 'label'
      ? `The FIRST attached image is the FRONT panel of the finished label: apply it to the container`
        + ` as the real printed label — same text, same colours, same layout, wrapped and lit to follow`
        + ` the surface. Do not redesign it and do not add text that is not on it. Show the product`
        + ` from the front: the back panel must NOT be visible.`
      : ref === 'logo'
      ? `The FIRST attached image is the finished logo: place it on the packaging exactly as it is —`
        + ` same letterforms, same spelling, same proportions. Do not redraw it.`
      : exactName(b),
    `The remaining attached images are style references for finish, packaging and lighting — copy their`
      + ` mood, never their brand names or their text.`,
    `Style — ${p.promptStyle}`,
    paletteLine(p),
    audienceLine(b),
    `Single product, centred, studio lighting, soft realistic shadow, clean uncluttered background,`,
    `no people, no hands, no extra props, no text other than what belongs on the packaging.`,
  ].filter(Boolean).join(' ')
}

export function buildLabelPrompt(b: Brief, p: Preset, ref: Ref): string {
  return [
    `Design the flat printable 360° LABEL artwork (full wrap) for ${b.productDescription},`,
    `brand "${b.brandName}".`,
    // El reparto front/back es LEY: el mockup recorta la mitad izquierda y la aplica
    // al envase. Sin este reparto el motor amontona la letra chica en el frente.
    `Lay it out as TWO panels of equal width side by side, separated by a thin vertical`,
    `fold line: the FRONT panel on the LEFT half, the BACK panel on the RIGHT half.`,
    `FRONT panel — only the hero: brand lockup, product name, a short descriptor and the net`,
    `content. Generous empty space; nothing else, no paragraphs, no lists, no icons rows.`,
    `BACK panel — everything else, small and orderly: ingredients, directions of use,`,
    `warnings, storage, net weight and a blank rectangle where a barcode would go.`,
    `This is where the dense text belongs.`,
    // El motor inventaba razón social y dirección (una fábrica mexicana para una
    // marca peruana). Datos legales = del usuario, no del modelo.
    `Do NOT invent legal or company data: no made-up company name, address, city,`,
    `country, registration number, phone or website. Where the manufacturer line would`,
    `go, leave the neutral placeholder "Fabricado por: ____________".`,
    ref === 'logo'
      ? `The FIRST attached image is the finished logo: place it on the label exactly as it is, as the`
        + ` brand lockup. Do not redraw it.`
      : exactName(b),
    `Flat 2D artwork seen straight on, as it would go to print — NOT applied to a container, no bottle,`,
    `no jar, no 3D, no perspective, no mockup, no shadow.`,
    b.containerType ? `It will be printed for this container: ${b.containerType} — use its proportions.` : '',
    `Body text in the spirit of ${p.typography.body}; display text in the spirit of ${p.typography.display}.`,
    `Style — ${p.promptStyle}`,
    paletteLine(p),
    `Sharp edges, print-ready, no watermark.`,
  ].filter(Boolean).join(' ')
}

export function buildPrompt(stage: Stage, b: Brief, p: Preset, ref: Ref): string {
  if (stage === 'logo') return buildLogoPrompt(b, p)
  if (stage === 'mockup') return buildMockupPrompt(b, p, ref)
  return buildLabelPrompt(b, p, ref)
}

/**
 * gpt-image-2 solo tiene 3 tamaños. Logo cuadrado, mockup vertical (foto de
 * producto) y etiqueta APAISADA: es un 360 de dos paneles, no cabe en vertical.
 */
export function aspectFor(stage: Stage): string {
  if (stage === 'logo') return '1:1'
  return stage === 'label' ? '3:2' : '4:5'
}
