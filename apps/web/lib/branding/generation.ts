/**
 * generation.ts — el brief → el prompt maestro y las piezas sueltas.
 * ---------------------------------------------------------------------------
 * EL PROMPT MAESTRO ES LA FUENTE DE VERDAD DE LA TOOL (usuario, 2026-08-06).
 * El trabajo del sistema es rellenar sus 6 casillas, no reinterpretarlo.
 *
 * ⚠️ LA LECCIÓN QUE COSTÓ UN REDISEÑO: menos instrucción = mejor board.
 * La primera versión mandaba el doble de texto (casillas largas generadas por
 * LLM, 8 slots, lista de 7 entregables, bloque de idioma de 44 palabras) y el
 * modelo devolvía un tablero denso de infografía en vez de un caso editorial.
 * Con el prompt corto el board sale limpio. Reglas al tocar esto:
 *   · Los bloques fijos (Generate / Style / Avoid) se copian TAL CUAL.
 *   · Los valores de las casillas se mantienen CORTOS. El input de referencia
 *     que funcionó era "A creatine powder product brand", no un párrafo.
 *   · Los colores van por NOMBRE, nunca por hex: el modelo elige mejores
 *     valores que los que uno le impone, y rotula la paleta él mismo.
 *   · No hay casilla de tipografía ni de estilo gráfico. El modelo decide.
 *   · El mockup se pide como EL PRODUCTO, nunca como su empaque, y el orden de
 *     las frases importa: la versión que abría con "PRIMARY CONTAINER" hizo que
 *     un cinturón saliera convertido en un bote. Ver la nota del mockup abajo.
 *
 * Motor: ráster PNG con gpt-image-2.
 * ---------------------------------------------------------------------------
 */

import type { Brief } from './brief'
import { feelWords } from './brief'

/** La identidad primero; las tres piezas sueltas se derivan de ella. */
export type Stage = 'identidad' | 'logo' | 'etiqueta' | 'mockup'
export const STAGE_SEQUENCE: Stage[] = ['identidad', 'logo', 'etiqueta', 'mockup']

export const STAGE_LABELS: Record<Stage, string> = {
  identidad: 'Identidad visual',
  logo: 'Logo',
  etiqueta: 'Etiqueta 360',
  mockup: 'Mockup',
}

/* ── Bloques fijos del prompt maestro ─────────────────────────────────────── */

const GENERATE = [
  'Generate:',
  '',
  '* Primary logo and logo variations',
  '* Product label design',
  '* Realistic product mockup',
].join('\n')

const STYLE =
  'Style: Premium, modern, minimalist, editorial product photography, clean layout, photorealistic.'

const AVOID =
  'Avoid: Generic AI aesthetics, clipart, cartoon graphics, visual clutter, excessive gradients, '
  + 'cheap effects, poor typography, low-resolution details, watermarks, and inconsistent branding.'

/**
 * Idioma y datos legales. Deliberadamente en una línea: la versión larga era
 * parte de lo que densificaba el board. El modelo suele escribir en español por
 * su cuenta, pero "suele" no es "siempre" y el empaque tiene que servir en Perú.
 */
const COPY_RULES = 'Packaging copy in Spanish (Peru). Do not invent company names, addresses or registration numbers.'

/* ── Las 6 casillas ───────────────────────────────────────────────────────── */

/** `**Etiqueta:** valor`, o nada si el valor está vacío. */
function slot(label: string, value: string | undefined): string {
  const v = (value ?? '').trim()
  return v ? `**${label}:** ${v}` : ''
}

export function buildIdentityPrompt(b: Brief): string {
  // Las casillas vacías se caen del bloque enteras (`filter`), no se dejan como
  // línea en blanco: ni `**Inspired from:**` colgando sin valor, ni un hueco en
  // medio de la lista cuando falta el eslogan.
  const slots = [
    slot('Brand name', b.brandName),
    slot('Tagline', b.tagline),
    slot('Brand description', b.productDescription),
    slot('Target audience', b.audience.join(', ')),
    slot('Brand feel', feelWords(b.feel)),
    slot('Inspired from', b.style.inspiration),
    slot('Colors', b.style.palette.filter(Boolean).join(', ')),
  ].filter(Boolean)

  return [
    'Create a complete visual identity for the brand below.',
    '',
    slots.join('\n'),
    '',
    GENERATE,
    '',
    STYLE,
    '',
    COPY_RULES,
    '',
    AVOID,
  ].join('\n').trim()
}

/**
 * Las piezas sueltas salen DE la identidad ya generada, que va como primera
 * imagen adjunta. Sin esa referencia cada llamada es una marca distinta.
 */
export function buildPiecePrompt(stage: Exclude<Stage, 'identidad'>, b: Brief): string {
  const same = [
    `The attached image is the finished visual identity for "${b.brandName}".`,
    'Reproduce its brand exactly: same logo, same letterforms, same colours, same graphic elements.',
    'Do not redesign anything and do not invent new elements.',
  ].join(' ')

  if (stage === 'logo') {
    return [
      same,
      'Output ONLY the primary logo, isolated and centred on a plain white background, at large size',
      'with generous margins. No packaging, no mockup, no board layout, no swatches, no specimen text,',
      'no shadow, no frame.',
    ].join(' ')
  }

  if (stage === 'etiqueta') {
    // ⚠️ El frente es REPRODUCCIÓN, no diseño. La versión anterior le dictaba un
    // layout completo ("solo el héroe, sin filas de iconos") que CONTRADECÍA la
    // etiqueta que ya vive en la identidad — y ante la contradicción el modelo
    // obedecía la spec y dibujaba una etiqueta nueva. El reparto frente/dorso sí
    // se mantiene: sin él la letra chica se amontona adelante (bug reportado).
    return [
      `The attached image is the finished visual identity for "${b.brandName}".`,
      'It already contains the product label design.',
      'Output THAT SAME label as flat printable 360° artwork (full wrap): two panels of equal width',
      'side by side, separated by a thin vertical fold line.',
      'FRONT panel (LEFT half) — reproduce the label design from the attached image exactly as it is:',
      'same layout, same composition, same colour blocks and graphic shapes, same brand lockup, same',
      'product name, same icons, same typography. Adapt only its proportions to fill the panel.',
      'Do not restyle it, do not rearrange its elements and do not invent new ones.',
      'BACK panel (RIGHT half) — the regulatory text that does not fit on the front, set in the same',
      'typography and the same colours: ingredients, directions of use, warnings, storage, net weight',
      'and a blank rectangle where a barcode would go.',
      COPY_RULES,
      'Where the manufacturer line would go, leave the neutral placeholder "Fabricado por: ____________".',
      'Flat 2D artwork seen straight on, as it would go to print — NOT applied to a container, no bottle,',
      'no jar, no 3D, no perspective, no mockup, no shadow. Sharp edges, print-ready, no watermark.',
    ].join(' ')
  }

  // ⚠️ Pedía "a product shot of its PACKAGING" y para todo lo que se vende en caja el modelo
  // devolvía la caja de cartón: el sérum de Lumina (sesión f401c346) salió como estuche, sin
  // frasco a la vista, aunque el board de identidad SÍ muestra el gotero al lado de la caja —
  // el dato estaba, lo pedido era otra cosa. La regla es general y no enumera productos.
  //
  // ⚠️ EL ORDEN DE LAS FRASES DECIDE EL RESULTADO, no la presencia de la excepción. La primera
  // versión del arreglo abría con "Output ONE product shot of the PRIMARY CONTAINER — the vessel
  // the product is used from" y cerraba con "si el producto no tiene envase, mostrá el objeto
  // desnudo". Con eso, el cinturón de Veltor (sesión 9f251df4) salió como UN BOTE con el logo:
  // el modelo se ancló en el sustantivo que abría la frase y le inventó un envase. Invertir el
  // orden —el PRODUCTO primero, el envase como el caso en que el producto no existe sin él—
  // arregló el cinturón sin romper los demás. Si vas a tocar esto, mové el arreglo, no agregues
  // otra excepción al final.
  //
  // Verificado sobre las cuatro sesiones reales que hay en la base: Lumina (sérum en estuche)
  // → frasco gotero; Linfitly (gotero herbal) → frasco; Veltor (cinturón, sin envase) → el
  // cinturón; Protón (proteína, el envase ES la unidad de venta) → el bote, igual que antes.
  return [
    same,
    'Output ONE photorealistic product shot of the product ITSELF, as the buyer holds it after unboxing:',
    'clean, out of any packaging, with the same artwork and the same copy.',
    'If the product only exists inside a container (a liquid, a cream, a powder), that container IS the',
    'product — show the one it is used from, the one carrying the printed artwork.',
    'If the product is a solid object, show the bare object and never invent a container for it.',
    'Never the outer retail packaging: no carton, box, sleeve, blister or wrapper, and never the product',
    'still inside one. If it would normally ship in an outer package, render only what comes out of it.',
    'Premium, modern, minimalist, editorial product photography, clean layout, photorealistic.',
    'Single product, centred, studio lighting, soft realistic shadow, clean uncluttered background,',
    'no people, no hands, no board layout, no swatches, no text other than what belongs on the container.',
  ].join(' ')
}

export function buildPrompt(stage: Stage, b: Brief): string {
  return stage === 'identidad' ? buildIdentityPrompt(b) : buildPiecePrompt(stage, b)
}

/**
 * La identidad y la etiqueta 360 son apaisadas, el logo cuadrado y el mockup
 * vertical. (`sizeFor` deriva el tamaño del ratio; gpt-image-2 no está limitado
 * a tres tamaños como decía esta nota — solo exige múltiplos de 16.)
 */
export function aspectFor(stage: Stage): string {
  if (stage === 'logo') return '1:1'
  return stage === 'mockup' ? '4:5' : '3:2'
}
