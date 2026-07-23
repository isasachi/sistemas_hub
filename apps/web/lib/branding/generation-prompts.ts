/**
 * generationPrompts.ts
 * ---------------------------------------------------------------------------
 * CORE del flujo del motor de generación de marca y producto (pipeline
 * SECUENCIAL, migración jul 2026: identidad fija de 7 estilos, sin overrides).
 *
 * Fusiona BrandBrief (lo que aporta el usuario) + StylePreset (el ADN visual,
 * ya resuelto por `resolveEffectivePreset`) + el esqueleto de layout
 * (`label-layouts.ts`) + los pares de contraste legal (`contrast.ts`) en un
 * PROMPT en lenguaje natural, uno por artefacto, en orden:
 *
 *   1. LOGO (`buildLogoPrompt`) — mark limpio, aislado, en la identidad del estilo.
 *   2. ETIQUETA (`buildLabelPrompt`) — recibe el LOGO ya generado + el WIREFRAME
 *      de layout + los pares de contraste, e inserta el logo en la etiqueta con
 *      equilibrio y legibilidad (nunca perdido ni chocando con el fondo).
 *   3. MOCKUP (`buildMockupPrompt`) — recibe la ETIQUETA ya generada y la aplica
 *      fotorrealista sobre el envase.
 *
 * Cada paso es una generación independiente y sus artefactos se encadenan
 * pasándose como IMAGEN adjunta (ver `effective-preset.ts` `imageRefParts`),
 * no re-derivados de un compuesto — así el logo insertado en la etiqueta es
 * pixel-el-mismo que el logo standalone, y la etiqueta aplicada al mockup es
 * pixel-la-misma que la etiqueta standalone.
 *
 * Por qué así:
 *  - Nano Banana / Gemini responde mejor a lenguaje natural descriptivo que a
 *    listas de parámetros.
 *  - Gemini renderiza texto con fidelidad: por eso el nombre de marca se pasa
 *    ENTRECOMILLADO y con instrucción de ortografía exacta.
 *  - Gemini es fuerte usando imágenes de referencia y respeta el ORDEN de los
 *    adjuntos: la etiqueta adjunta `[logo, ...identityRefs, wireframe]` (logo
 *    PRIMERO — "the first attached image is the logo"; wireframe ÚLTIMO —
 *    "the final attached image is a skeleton"); el mockup adjunta
 *    `[label, ...identityRefs]` (etiqueta PRIMERO). Ver `effective-preset.ts`.
 * ---------------------------------------------------------------------------
 */

import { StylePreset, paletteToText } from "./style-presets";
import { REF_MANIFEST } from "./ref-manifest";
import { getLayout, layoutToPrompt, type LabelLayout } from "./label-layouts";
import { contrastToPrompt } from "./contrast";

/** Datos que aporta el usuario para una marca/producto concreto. */
export interface BrandBrief {
  /** Nombre de marca — se renderiza literal en el LOGO (asset). */
  brandName: string;
  /** Nombre de producto — el wordmark HERO de la etiqueta/mockup (no el logo). */
  productName?: string;
  /** Qué es el producto: "serum facial", "café en grano", "barra energética". */
  productType: string;
  /** Posicionamiento corto o claim ("hidratación 24h", "tueste artesanal"). */
  descriptor?: string;
  /** Tagline opcional a renderizar en etiqueta/mockup. */
  tagline?: string;
  /** Tipo de envase para el mockup: "frasco con gotero", "doypack", "caja", "tubo". */
  containerType?: string;
  /** Pista de color si el usuario quiere sesgar la paleta del preset. */
  keyColorHint?: string;
  /** Notas libres extra que se anexan al final del prompt. */
  extraNotes?: string;
}

/* --------------------------------------------------------------------------
 * Helpers de composición de prompt
 * ------------------------------------------------------------------------ */

/** Rutas de las refs del estilo (para adjuntar a Gemini), leídas de REF_MANIFEST. */
export function attachStyleRefs(preset: StylePreset): string[] {
  const files = REF_MANIFEST[preset.referenceFolder] ?? [];
  return files.map((f) => `${preset.referenceFolder}/${f}`);
}

/** Bloque de paleta legible para el prompt. */
function paletteLine(preset: StylePreset, brief: BrandBrief): string {
  const base = `Color palette: ${paletteToText(preset.palette)}.`;
  return brief.keyColorHint
    ? `${base} Bias the palette toward ${brief.keyColorHint} while staying within the style.`
    : base;
}

/** Instrucción de texto exacto (Gemini es fiel al lettering). */
function exactText(label: string, value?: string): string {
  if (!value) return "";
  return ` Render the ${label} exactly as "${value}", spelled correctly.`;
}

/* --------------------------------------------------------------------------
 * Pipeline SECUENCIAL (2026-07): logo → etiqueta (con el logo insertado) →
 * mockup (con la etiqueta aplicada). Cada paso es una generación independiente
 * que recibe como imagen adjunta el artefacto del paso anterior — no se
 * derivan retrospectivamente de un compuesto, así quedan pixel-consistentes.
 * ------------------------------------------------------------------------ */

// Logo aislado, en la identidad del estilo — primer artefacto de la cadena.
export function buildLogoPrompt(brief: BrandBrief, preset: StylePreset): string {
  const bg = preset.palette.find((c) => c.role === "background")?.name ?? "neutral";
  return [
    `Design a clean, professional brand LOGO / wordmark for "${brief.brandName}", a ${brief.productType}.`,
    preset.styleBlock,
    `Typography: ${preset.typography.primary}; ${preset.typography.detail}.`,
    paletteLine(preset, brief),
    `The logo is a scalable mark — a wordmark and/or a simple emblem — legible at small sizes, presented ISOLATED and centered on a plain flat ${bg} background with generous margins. ${brief.descriptor ? `It should feel: ${brief.descriptor}.` : `Capture the mood: ${preset.mood.join(", ")}.`}`,
    exactText("brand name", brief.brandName).trim(),
    `Avoid: ${preset.avoid.join(", ")}. High-resolution, sharp, no watermark, no stray or misspelled text.`,
  ].filter(Boolean).join(" ");
}

// Etiqueta plana: recibe el LOGO como primera imagen adjunta y el WIREFRAME
// como última (ver effective-preset.ts identityRefParts/wireframeRefParts) —
// inserta el logo generado con equilibrio y legibilidad, siguiendo el
// esqueleto de layout y los pares de contraste legal del estilo.
export function buildLabelPrompt(brief: BrandBrief, preset: StylePreset, layout: LabelLayout): string {
  // El wordmark HERO de la etiqueta es el NOMBRE DE PRODUCTO (no el logo de marca,
  // que es un asset aparte). Si no hay nombre de producto, cae al de marca.
  const wordmark = brief.productName?.trim() || brief.brandName;
  return [
    `Design the FLAT front label / packaging panel artwork for the product "${wordmark}", a ${brief.productType}. This is flat 2D label artwork — front-on, NO 3D packaging, NO perspective, NO product body, NO background scene — print-ready, filling the frame.`,
    preset.styleBlock,
    paletteLine(preset, brief),
    contrastToPrompt(preset),
    `Build a fresh TYPOGRAPHIC WORDMARK for the product name "${wordmark}" — set it in the label's own typography and place it at: ${layout.logoPlacement}. It is the hero of the panel: give it prominence, balanced contrast, scale and spacing so it reads clearly and is NEVER lost in the artwork or clashing with what is behind it. Do NOT paste or reuse a separate logo mark — construct the wordmark from the product name as the style and this layout require.`,
    layoutToPrompt(layout),
    `Text hierarchy: the product name "${wordmark}"${brief.descriptor ? `, the descriptor "${brief.descriptor}"` : ""}${brief.tagline ? `, the tagline "${brief.tagline}"` : ""}, plus small realistic legal / net-weight / ingredient microtext (microtext MUST use the highest-contrast pairing).`,
    `The FINAL attached image is a LAYOUT SKELETON, not a style reference. Follow its spatial arrangement of zones exactly; ignore its colors and treat it as structure only.`,
    exactText("product name", wordmark).trim(),
    exactText("tagline", brief.tagline).trim(),
    `Avoid: ${[...preset.avoid, ...layout.avoidLayout].join(", ")}. High-resolution, sharp, no watermark, no stray or misspelled text.`,
  ].filter(Boolean).join(" ");
}

// Mockup fotorrealista: recibe la ETIQUETA como primera imagen adjunta y la
// aplica al envase — último artefacto de la cadena.
export function buildMockupPrompt(brief: BrandBrief, preset: StylePreset): string {
  const container = brief.containerType ?? "product packaging";
  const wordmark = brief.productName?.trim() || brief.brandName;
  return [
    `Create a photorealistic product mockup: a ${container} for the product "${wordmark}", a ${brief.productType}.`,
    `The FIRST attached image is the finished FLAT LABEL artwork — apply it realistically onto the ${container} surface with correct label wrapping, material and finish (${preset.materials.join(", ")}), preserving the label's design, wordmark, colors and text EXACTLY.`,
    preset.styleBlock,
    `Studio product photography: ${preset.lighting}. Scene: ${preset.composition}. Mood: ${preset.mood.join(", ")}. Realistic reflections, soft contact shadow, believable depth of field.`,
    exactText("product name on the packaging", wordmark).trim(),
    `Avoid: ${preset.avoid.join(", ")}. High-resolution, professional commercial quality, sharp focus, no watermark, no stray or misspelled text.`,
  ].filter(Boolean).join(" ");
}
