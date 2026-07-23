/**
 * generationPrompts.ts
 * ---------------------------------------------------------------------------
 * CORE del flujo del motor de generación de marca y producto (compose-first,
 * migración fases 5-7 jul 2026: identidad fija de 7 estilos, sin overrides).
 *
 * Fusiona BrandBrief (lo que aporta el usuario) + StylePreset (el ADN visual,
 * ya resuelto por `resolveEffectivePreset`) + el esqueleto de layout
 * (`label-layouts.ts`) + los pares de contraste legal (`contrast.ts`) en un
 * único PROMPT en lenguaje natural para el MOCKUP COMPUESTO (envase con logo Y
 * etiqueta integrados); la etiqueta plana y el logo aislado se DERIVAN de ese
 * mockup elegido (`labelFromMockupPrompt`/`logoFromMockupPrompt`), no se
 * generan por separado — así quedan consistentes entre sí.
 *
 * Por qué así:
 *  - Nano Banana / Gemini responde mejor a lenguaje natural descriptivo que a
 *    listas de parámetros.
 *  - Gemini renderiza texto con fidelidad: por eso el nombre de marca se pasa
 *    ENTRECOMILLADO y con instrucción de ortografía exacta.
 *  - Gemini es fuerte usando imágenes de referencia: `preset.referenceFolder`
 *    apunta a las refs del estilo (ver `attachStyleRefs`), y el wireframe del
 *    estilo se adjunta como última ref (ver `effective-preset.ts`
 *    `styleRefParts`) — el prompt lo referencia explícitamente como esqueleto
 *    de layout, no como referencia de estilo.
 * ---------------------------------------------------------------------------
 */

import { StylePreset, paletteToText } from "./style-presets";
import { REF_MANIFEST } from "./ref-manifest";
import { getLayout, layoutToPrompt } from "./label-layouts";
import { contrastToPrompt } from "./contrast";

/** Datos que aporta el usuario para una marca/producto concreto. */
export interface BrandBrief {
  /** Nombre de marca — se renderiza literal en el arte. */
  brandName: string;
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
 * Pipeline compose-first (2026-07): mockup master → derivar etiqueta + logo.
 * En vez de generar los 3 artefactos por separado (logo perdido/incongruente
 * con la etiqueta), se genera el MOCKUP COMPUESTO completo (envase con logo Y
 * etiqueta integrados) primero; el usuario elige una variante; de ESE diseño
 * se derivan la etiqueta plana y el logo aislado — consistentes entre sí.
 * ------------------------------------------------------------------------ */

// Master compuesto: mockup fotorrealista con etiqueta Y logo integrados coherentemente.
// El logo NO debe quedar perdido ni incongruente con la etiqueta. Inyecta el
// esqueleto de layout (label-layouts.ts), los pares de contraste legal
// (contrast.ts) y la instrucción del wireframe adjunto (última ref, ver
// effective-preset.ts styleRefParts) para que la composición sea consistente
// entre generaciones del mismo estilo.
export function buildComposedMockupPrompt(brief: BrandBrief, preset: StylePreset): string {
  const container = brief.containerType ?? "product packaging";
  const layout = getLayout(preset.id);
  return [
    `Create a photorealistic product mockup: a ${container} for "${brief.brandName}", a ${brief.productType}, with its COMPLETE packaging design fully applied — as one cohesive professional brand system.`,
    preset.styleBlock,
    paletteLine(preset, brief),
    contrastToPrompt(preset),
    `The packaging must show BOTH elements, integrated coherently as a single deliberate design: (1) a clear brand LOGO / wordmark for "${brief.brandName}" — prominent, legible and well-placed, NOT lost in the artwork and NOT clashing with the label; and (2) the full front label with${brief.descriptor ? ` the descriptor "${brief.descriptor}",` : ""}${brief.tagline ? ` the tagline "${brief.tagline}",` : ""} plus small realistic legal / net-weight / ingredient microtext.`,
    layoutToPrompt(layout),
    `The final attached image is a LAYOUT SKELETON, not a style reference. Follow its spatial arrangement of elements exactly; ignore its colors and treat it as structure only.`,
    `Materials & finish: ${preset.materials.join(", ")}.`,
    `Studio product photography: ${preset.lighting}. Scene: ${preset.composition}. Mood: ${preset.mood.join(", ")}. Realistic reflections, soft contact shadow, believable depth of field.`,
    exactText("brand name on the packaging", brief.brandName).trim(),
    `Avoid: ${[...preset.avoid, ...layout.avoidLayout].join(", ")}. High-resolution, professional commercial quality, sharp focus, no watermark, no stray or misspelled text.${brief.extraNotes ? ` ${brief.extraNotes}` : ""}`,
  ].filter(Boolean).join(" ");
}

// Derivación: se pasa el mockup compuesto como imagen a generateImage + este texto.
// NO usar editWithPrompt (su framing "cambio mínimo pixel-idéntico" pelea con una transformación).
export function labelFromMockupPrompt(brief: BrandBrief): string {
  return [
    `The attached image is a product mockup. Reproduce its FRONT LABEL as standalone FLAT 2D artwork:`,
    `exactly the printed label panel seen on the packaging — same logo, brand name "${brief.brandName}", colors, typography, graphics and text hierarchy — but rendered front-on and flattened,`,
    `with NO 3D packaging, NO perspective, NO product body, NO background scene. Just the flat label design filling the frame, print-ready. Keep every visible word spelled exactly as on the mockup.`,
  ].join(" ");
}
export function logoFromMockupPrompt(brief: BrandBrief): string {
  return [
    `The attached image is a product mockup. Extract and reproduce ONLY the brand LOGO / wordmark for "${brief.brandName}"`,
    `exactly as it appears on the packaging — same letterforms, weight, colors and mark — as a clean, isolated, high-resolution logo`,
    `centered on a plain solid white/neutral background with generous margins. No packaging, no product, no scenery, no extra text — just the logo, crisp and reusable.`,
  ].join(" ");
}
