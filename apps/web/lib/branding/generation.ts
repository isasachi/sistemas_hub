/**
 * generation.ts — brief → los 3 prompts del pipeline.
 * ---------------------------------------------------------------------------
 * Motor: ráster PNG con gpt-image-2 (decisión cerrada 2026-08-03 — no hay motor
 * híbrido, ni vector, ni Recraft). Por eso NO hay interfaz `ImageEngine` con
 * varias implementaciones: hay una sola llamada, `generateImage` de lib/gemini.
 *
 * Los prompts van en inglés (el motor responde mejor) y son largos y específicos,
 * que es como rinde gpt-image-2.
 *
 * La dirección visual sale del BRIEF, no de una lista cerrada (refactor 2026-08-05).
 * Antes eran 7 bloques `promptStyle` de 40 palabras que fijaban material, ornamento,
 * luz y composición de una vez: toda marca del mismo preset salía igual. Ahora son
 * las 1-3 palabras de actitud que eligió el usuario + su paleta y sus tipografías.
 * Material, luz y composición quedan SIN especificar a propósito — que el modelo
 * los varíe es lo que hace que dos marcas no se parezcan. Si algún resultado sale
 * flojo, la palanca es enriquecer la actitud, no volver a fijar bloques de estilo.
 * ---------------------------------------------------------------------------
 */

import { feelWords, type Brief, type Style } from './brief'

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

function paletteLine(s: Style): string {
  const { primary, secondary, accent, dark, light } = s.palette
  return `Palette — primary ${primary}, secondary ${secondary}, accent ${accent}, dark ${dark}, light ${light}. `
    + `Use these exact colours and no others.`
}

/**
 * La actitud, en inglés, más lo que el usuario haya escrito. Es TODA la dirección
 * de arte: deliberadamente corta.
 */
export function feelPrompt(b: Brief): string {
  const words = feelWords(b.feel)
  return words ? `Art direction — the brand must feel ${words}.` : ''
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

export function buildLogoPrompt(b: Brief): string {
  return [
    `Design a brand logo for a ${b.category} product: ${b.productDescription}.`,
    `It is a WORDMARK: the brand name as custom lettering, no slogan, no tagline, no product shot.`,
    exactName(b),
    `Typography direction: letterforms in the spirit of ${b.style.typography.display}.`,
    feelPrompt(b),
    paletteLine(b.style),
    audienceLine(b),
    `Flat vector-looking artwork, crisp edges, centred with generous margins, plain white background,`,
    `no mockup, no packaging, no shadow, no 3D, no frame, no watermark.`,
  ].filter(Boolean).join(' ')
}

export function buildMockupPrompt(b: Brief, ref: Ref): string {
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
    // Ya no hay moodboard: lo único adjunto es la pieza previa de la cascada. Una
    // frase sobre "the remaining attached images" sería mentira.
    feelPrompt(b),
    paletteLine(b.style),
    audienceLine(b),
    `Single product, centred, studio lighting, soft realistic shadow, clean uncluttered background,`,
    `no people, no hands, no extra props, no text other than what belongs on the packaging.`,
  ].filter(Boolean).join(' ')
}

export function buildLabelPrompt(b: Brief, ref: Ref): string {
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
    `Body text in the spirit of ${b.style.typography.body}; display text in the spirit of ${b.style.typography.display}.`,
    feelPrompt(b),
    paletteLine(b.style),
    `Sharp edges, print-ready, no watermark.`,
  ].filter(Boolean).join(' ')
}

export function buildPrompt(stage: Stage, b: Brief, ref: Ref): string {
  if (stage === 'logo') return buildLogoPrompt(b)
  if (stage === 'mockup') return buildMockupPrompt(b, ref)
  return buildLabelPrompt(b, ref)
}

/**
 * gpt-image-2 solo tiene 3 tamaños. Logo cuadrado, mockup vertical (foto de
 * producto) y etiqueta APAISADA: es un 360 de dos paneles, no cabe en vertical.
 */
export function aspectFor(stage: Stage): string {
  if (stage === 'logo') return '1:1'
  return stage === 'label' ? '3:2' : '4:5'
}
