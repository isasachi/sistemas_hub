/**
 * Constructores de prompt del generador de video ads. Viven acá (no en las rutas)
 * porque Next solo admite handlers y config como exports de un route.ts.
 */

import type { CharacterBrief, ForensicAnalysis, ScriptTemplate, ProductScan } from './types'

/** Aplana el brief al formato de pedido que usa el equipo para un UGC influencer. */
export function buildCharacterPrompt(brief: CharacterBrief, precision = ''): string {
  return [
    'Create a UGC influencer photo — a real person filming themselves, not a studio shot.',
    `Gender : ${brief.gender}`,
    `Age : ${brief.age}`,
    `Ethnicity : ${brief.ethnicity}`,
    `Background : ${brief.background}`,
    `Style : ${brief.style}`,
    `Camera Placement : ${brief.cameraPlacement}`,
    `Coverage : ${brief.coverage}`,
    'Aspect Ratio : 9:16',
    `Additional Details : ${brief.additionalDetails || 'No plastic skin'}`,
    '',
    'Photorealistic, natural skin texture and lighting, amateur phone-camera feel.',
    'No text, no logos, no watermarks, no product in frame.',
    precision ? `Ajuste pedido: ${precision}` : '',
  ].filter(Boolean).join('\n')
}

export interface ProductContext {
  productName: string
  whatItDoes: string
  targetAudience: string
  scan: ProductScan | null
}

function productBlock(p: ProductContext): string {
  return [
    `Product: ${p.productName} — ${p.whatItDoes}`,
    `Target audience: ${p.targetAudience}`,
    p.scan?.productDescription ? `Product description: ${p.scan.productDescription}` : '',
  ].filter(Boolean).join('\n')
}

/**
 * Paso 1 de la rama con referencia: el guión de la referencia → ESQUELETO.
 *
 * Esto es el sistema de plantillas del generador de anuncios llevado al guión: no se
 * reescribe nada, se marcan con [corchetes] SOLO las palabras de contenido que cambian
 * al mudar de producto. El resto —estructura, números, conectores, muletillas— queda
 * literal, porque es lo que hace que el guión funcione.
 */
export function buildTemplateInstruction(forensic: ForensicAnalysis): string {
  return [
    'Below is a beat-by-beat forensic transcript of a video ad that works.',
    'Turn its script into a REUSABLE TEMPLATE — a fill-in-the-blank skeleton.',
    '',
    JSON.stringify(forensic.beats),
    '',
    'RULES:',
    '  - One slot per beat, same order, same count. Never merge or drop beats.',
    '  - `pattern` is the beat\'s dialogue copied VERBATIM, with only the content words',
    '    that are product-specific replaced by [a bracketed label naming what goes there].',
    '  - Keep sentence structure, word order, punctuation, numbers, filler words and',
    '    connectors EXACTLY as in the original. You are punching holes, not rewriting.',
    '  - Between 1 and 3 blanks per beat. A beat with nothing product-specific gets zero',
    '    blanks and is copied literally.',
    '  - Label the blanks by ROLE, not by the original word: [producto común],',
    '    [padecimiento], [tiempo de uso], [resultado].',
    '  - `blanks` lists the labels used in that pattern, without brackets.',
    '',
    'Example of the transformation, for calibration:',
    '  Original: "5 razones por las cuales los jugos sin azúcar generan diabetes y no lo sabías"',
    '  Pattern:  "5 razones por las cuales los [producto común] generan [padecimiento] y no lo sabías"',
    '  Refilled: "5 razones por las cuales la creatina genera aumento de peso y no lo sabías"',
    '',
    'Patterns stay in the original language of the transcript.',
    '`summaryForUser` explains the skeleton in one sentence, in neutral Latin-American Spanish.',
  ].join('\n')
}

/**
 * Paso 2 de la rama con referencia: rellenar el esqueleto con el producto del usuario.
 * Contrato A/B idéntico al de `generate-copy` en el generador de anuncios: mismo número
 * de beats, mismo orden, la B es la A con sustituciones quirúrgicas de palabras.
 */
export function buildFillInstruction(
  forensic: ForensicAnalysis,
  template: ScriptTemplate,
  product: ProductContext,
): string {
  return [
    'Fill this script skeleton with the user\'s product. Output two versions.',
    '',
    `Skeleton: ${JSON.stringify(template.slots)}`,
    `Reference delivery (for pacing and tone): ${JSON.stringify(forensic.beats)}`,
    `Persuasive logic of the reference: ${forensic.persuasiveLogic}`,
    '',
    productBlock(product),
    '',
    'VERSION A — Fill every blank with the most direct, literal wording for this product.',
    'VERSION B — Same skeleton, blanks filled with the wording the AUDIENCE would use:',
    '  the everyday phrasing of the target audience, their own words for the pain.',
    '  Version B is NOT a rewrite of A. Only the blanks differ.',
    '',
    'RULES:',
    '  - Both versions have the EXACT SAME number of beats, in the EXACT SAME order as the skeleton.',
    '  - Everything outside the blanks is copied verbatim from the pattern. Do not "improve" it.',
    '  - `t` is copied from the skeleton slot.',
    '  - `action` describes what the person does on camera in that beat (in English, it drives',
    '    the video model). `dialogue` and `onScreenText` go in neutral Latin-American Spanish.',
    '  - Never invent reviews, figures, medical claims or guarantees.',
    '  - `direction` mirrors the reference: accent (a neutral Latin-American Spanish variant),',
    '    vibe, camera motion and eye direction, inferred from the forensic analysis.',
  ].join('\n')
}

/**
 * Rama sin referencia (líneas 2 y 3): guión desde cero a partir de personaje + producto.
 * Mismo contrato A/B, pero acá la B sí cambia de ángulo (no hay esqueleto que respetar).
 */
export function buildFromScratchInstruction(product: ProductContext, durationSec: number): string {
  return [
    `Write a ${durationSec}-second UGC video ad script. Image 1 is the person who will`,
    'speak on camera — match the script to how they look and where they are.',
    '',
    productBlock(product),
    '',
    'STRUCTURE: hook in the first 3 seconds, then the problem in the audience\'s own words,',
    'then the product as the turn, then proof of use, then a plain call to action.',
    `Split it into beats of 2-4 seconds that add up to about ${durationSec} seconds.`,
    '',
    'VERSION A — testimonial angle: first person, "I used it and this happened".',
    'VERSION B — problem angle: opens on the frustration before naming the product.',
    'Both versions cover the same beats count and structure.',
    '',
    'RULES:',
    '  - `dialogue` and `onScreenText` in neutral Latin-American Spanish, spoken like a real',
    '    person: contractions, natural pauses, no ad-copy voice, no exclamation stacking.',
    '  - `action` describes what the person does on camera, in English (it drives the video model).',
    '  - `t` is the beat range, e.g. "0:00–0:03".',
    '  - Never invent reviews, figures, medical claims or guarantees.',
    '  - `direction`: accent, vibe, camera motion and eye direction that fit the person shown.',
  ].join('\n')
}
