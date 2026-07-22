/**
 * generationPrompts.ts
 * ---------------------------------------------------------------------------
 * CORE del flujo del motor de generación de marca y producto.
 *
 * Define, por cada ARTEFACTO (logo, etiqueta, mockup), una función `build`
 * que fusiona:
 *      BrandBrief (lo que aporta el usuario)  +  StylePreset (el ADN visual)
 * y devuelve un PROMPT en lenguaje natural listo para Nano Banana / Gemini.
 *
 * Por qué así:
 *  - Nano Banana / Gemini responde mejor a lenguaje natural descriptivo que a
 *    listas de parámetros. Cada build() produce un brief de diseño legible.
 *  - Gemini renderiza texto con fidelidad: por eso el nombre de marca se pasa
 *    ENTRECOMILLADO y con instrucción de ortografía exacta.
 *  - Gemini es fuerte usando imágenes de referencia: `preset.referenceFolder`
 *    apunta a las 5 refs del estilo para adjuntarlas como style-refs (opcional
 *    pero recomendado — ver `attachStyleRefs`).
 * ---------------------------------------------------------------------------
 */

import {
  ArtifactType,
  StylePreset,
  getPreset,
  paletteToText,
} from "./style-presets";

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

/** Configuración de salida por artefacto. */
export interface ArtifactSpec {
  artifact: ArtifactType;
  /** Relación de aspecto sugerida (Gemini la respeta como instrucción). */
  aspectRatio: string;
  /** Para qué sirve el artefacto dentro del flujo. */
  intent: string;
  /** Genera el prompt final natural-language. */
  build: (brief: BrandBrief, preset: StylePreset) => string;
}

/** Resultado empaquetado de un prompt listo para enviar al motor. */
export interface GeneratedPrompt {
  artifact: ArtifactType;
  styleId: string;
  aspectRatio: string;
  prompt: string;
  /** rutas de refs a adjuntar como imágenes de estilo (relativas al zip de refs) */
  styleReferences: string[];
}

/* --------------------------------------------------------------------------
 * Helpers de composición de prompt
 * ------------------------------------------------------------------------ */

const N_REFS = 5;

/** Rutas de las 5 imágenes de referencia del estilo (para adjuntar a Gemini). */
export function attachStyleRefs(preset: StylePreset): string[] {
  return Array.from(
    { length: N_REFS },
    (_, i) => `${preset.referenceFolder}/`.concat(`ref_${i + 1}`),
  );
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

/** Cierre común: qué evitar + notas + calidad. */
function tail(preset: StylePreset, brief: BrandBrief): string {
  const avoid = `Avoid: ${preset.avoid.join(", ")}.`;
  const notes = brief.extraNotes ? ` ${brief.extraNotes}` : "";
  return `${avoid} High-resolution, professional commercial quality, sharp focus, no watermark, no stray or misspelled text.${notes}`;
}

/* --------------------------------------------------------------------------
 * Especificaciones por artefacto
 * ------------------------------------------------------------------------ */

export const ARTIFACTS: Record<ArtifactType, ArtifactSpec> = {
  logo: {
    artifact: "logo",
    aspectRatio: "1:1",
    intent:
      "Marca/wordmark reutilizable, sobre fondo neutro, listo para colocar en packaging.",
    build: (brief, preset) => {
      return [
        `Design a professional brand logo for "${brief.brandName}", a ${brief.productType}.`,
        preset.styleBlock,
        `Typography: ${preset.typography.primary}; ${preset.typography.detail}.`,
        paletteLine(preset, brief),
        `The logo must be a clean, scalable mark — a wordmark and/or a simple emblem — that reads clearly at small sizes and works printed on packaging.`,
        brief.descriptor
          ? `The brand feels: ${brief.descriptor}.`
          : `Capture the mood: ${preset.mood.join(", ")}.`,
        `Present it centered on a plain, uncluttered background (flat ${preset.palette.find((c) => c.role === "background")?.name ?? "neutral"} or white), with generous margins, as a crisp logo presentation.`,
        exactText("brand name", brief.brandName).trim(),
        tail(preset, brief),
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  label: {
    artifact: "label",
    aspectRatio: "4:5",
    intent:
      "Arte plano del panel frontal / etiqueta del producto (dieline-friendly), con jerarquía de texto.",
    build: (brief, preset) => {
      return [
        `Design the front label / packaging panel artwork for "${brief.brandName}", a ${brief.productType}.`,
        `This is FLAT label artwork (front-on, no 3D packaging, no perspective) suitable for print on a dieline.`,
        preset.styleBlock,
        `Layout & composition: ${preset.composition}.`,
        `Typography: brand name in ${preset.typography.primary}; supporting copy in ${preset.typography.secondary}; ${preset.typography.case} emphasis.`,
        paletteLine(preset, brief),
        `Graphic motifs to use: ${preset.motifs.join(", ")}.`,
        `Include a clear text hierarchy: the brand name "${brief.brandName}"${
          brief.descriptor ? `, the descriptor "${brief.descriptor}"` : ""
        }${
          brief.tagline ? `, the tagline "${brief.tagline}"` : ""
        }, plus small placeholder legal / net-weight / ingredient microtext for realism.`,
        exactText("brand name", brief.brandName).trim(),
        exactText("tagline", brief.tagline).trim(),
        tail(preset, brief),
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  mockup: {
    artifact: "mockup",
    aspectRatio: "4:5",
    intent:
      "Render fotorrealista del producto físico con el packaging aplicado, calidad foto comercial.",
    build: (brief, preset) => {
      const container = brief.containerType ?? "product packaging";
      return [
        `Create a photorealistic product mockup: a ${container} for "${brief.brandName}", a ${brief.productType}, with its packaging fully designed in the following style.`,
        preset.styleBlock,
        paletteLine(preset, brief),
        `The ${container} shows the brand name "${brief.brandName}"${
          brief.descriptor ? ` and the descriptor "${brief.descriptor}"` : ""
        } applied realistically on the surface, with correct label wrapping, material and finish (${preset.materials.join(", ")}).`,
        `Studio product photography: ${preset.lighting}. Composition: ${preset.composition}.`,
        `Mood: ${preset.mood.join(", ")}. Realistic reflections, soft contact shadow, believable depth of field.`,
        exactText("brand name on the packaging", brief.brandName).trim(),
        tail(preset, brief),
      ]
        .filter(Boolean)
        .join(" ");
    },
  },
};

/* --------------------------------------------------------------------------
 * API del flujo
 * ------------------------------------------------------------------------ */

/**
 * Construye un prompt para un artefacto + un StylePreset YA RESUELTO (p.ej. el
 * efectivo de `resolveEffectivePreset`, que fusiona overrides de modo B/paso 3).
 * Preferir esta función sobre `buildPrompt` cuando el preset no es el crudo por id.
 */
export function buildPromptFromPreset(
  artifact: ArtifactType,
  preset: StylePreset,
  brief: BrandBrief,
): GeneratedPrompt {
  const spec = ARTIFACTS[artifact];
  return {
    artifact,
    styleId: preset.id,
    aspectRatio: spec.aspectRatio,
    prompt: spec.build(brief, preset),
    styleReferences: attachStyleRefs(preset),
  };
}

/** Construye un prompt para un artefacto + estilo (por id) + brief. */
export function buildPrompt(
  artifact: ArtifactType,
  styleId: string,
  brief: BrandBrief,
): GeneratedPrompt {
  return buildPromptFromPreset(artifact, getPreset(styleId), brief);
}

/**
 * Kit de marca completo: los 3 artefactos para un estilo elegido.
 * Este es el "core" que el motor invoca una vez el usuario elige su estilo base.
 */
export function buildBrandKit(
  styleId: string,
  brief: BrandBrief,
): GeneratedPrompt[] {
  return (Object.keys(ARTIFACTS) as ArtifactType[]).map((a) =>
    buildPrompt(a, styleId, brief),
  );
}

/** Orden canónico del flujo de generación. */
export const GENERATION_FLOW: ArtifactType[] = ["logo", "label", "mockup"];

/* --------------------------------------------------------------------------
 * Ejemplo de uso (borrar o mover a un test):
 *
 *   import { buildBrandKit } from "./generationPrompts";
 *
 *   const kit = buildBrandKit("gold-foil-dorado", {
 *     brandName: "AURELIA",
 *     productType: "serum facial de noche",
 *     descriptor: "regeneración nocturna",
 *     tagline: "Despierta renovada",
 *     containerType: "frasco de vidrio con gotero",
 *   });
 *
 *   kit.forEach(p => {
 *     console.log(`[${p.artifact} · ${p.aspectRatio}]`);
 *     console.log(p.prompt, "\n");
 *     // enviar p.prompt + adjuntar p.styleReferences a Nano Banana / Gemini
 *   });
 * ------------------------------------------------------------------------ */
