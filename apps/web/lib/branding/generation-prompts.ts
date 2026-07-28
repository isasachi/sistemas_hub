/**
 * generationPrompts.ts
 * ---------------------------------------------------------------------------
 * CORE del flujo del motor de generación de marca y producto (pipeline
 * SECUENCIAL, migración jul 2026: identidad fija de 7 estilos, sin overrides).
 *
 * Fusiona BrandBrief (lo que aporta el usuario) + BrandDna (el ADN visual,
 * ya resuelto por `resolveBrandDna`, en `dna-source.ts`) + el esqueleto de layout
 * (`label-layouts.ts`) + los pares de contraste legal (`contrast.ts`) en un
 * PROMPT en lenguaje natural, uno por artefacto, en orden:
 *
 *   1. LOGO (`buildLogoPrompt`) — mark limpio, aislado, en la identidad del estilo.
 *   2. ETIQUETA (`buildLabelPrompt`) — construye su PROPIO wordmark tipográfico
 *      con el nombre de producto (el logo de marca es un asset aparte y NO se
 *      inserta acá). Recibe el WIREFRAME de layout y los pares de contraste.
 *      Adjuntos: [refDeIdentidad, wireframe] — el wireframe SIEMPRE último.
 *   3. MOCKUP (`buildMockupPrompt`) — recibe la ETIQUETA ya generada y la aplica
 *      fotorrealista sobre el envase.
 *
 * Cada paso es una generación independiente y sus artefactos se encadenan
 * pasándose como IMAGEN adjunta (ver `dna-source.ts` `imageRefParts`),
 * no re-derivados de un compuesto — así la etiqueta aplicada al mockup es
 * pixel-la-misma que la etiqueta standalone. (El logo NO sigue este camino:
 * es un asset aparte que nunca se inserta en la etiqueta — ver punto 2.)
 *
 * Por qué así:
 *  - Nano Banana / Gemini responde mejor a lenguaje natural descriptivo que a
 *    listas de parámetros.
 *  - Gemini renderiza texto con fidelidad: por eso el nombre de marca se pasa
 *    ENTRECOMILLADO y con instrucción de ortografía exacta.
 *  - Gemini es fuerte usando imágenes de referencia y respeta el ORDEN de los
 *    adjuntos: la etiqueta adjunta `[...identityRefs, wireframe]` (wireframe
 *    ÚLTIMO — "the final attached image is a skeleton"); el mockup adjunta
 *    `[label, ...identityRefs]` (etiqueta PRIMERO). Ver `dna-source.ts`.
 * ---------------------------------------------------------------------------
 */

import type { BrandDna, ExtractedLayout } from "./types";
import { paletteToText, layoutToPrompt } from "./types";
import { StylePreset } from "./style-presets";
import { REF_MANIFEST } from "./ref-manifest";
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
  /** true = el producto del usuario ES el de la referencia → clonar. false → traspasar el ADN. */
  sameProduct: boolean;
  /** qué producto es la plantilla — sólo se usa en la rama de traspaso. */
  referenceProductType?: string;
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
function paletteLine(dna: BrandDna, brief: BrandBrief): string {
  const base = `Color palette: ${paletteToText(dna.palette)}.`;
  return brief.keyColorHint
    ? `${base} Bias the palette toward ${brief.keyColorHint} while staying within the style.`
    : base;
}

/** Instrucción de texto exacto (Gemini es fiel al lettering). */
function exactText(label: string, value?: string): string {
  if (!value) return "";
  return ` Render the ${label} exactly as "${value}", spelled correctly.`;
}

/**
 * El bloque que le dice a Gemini QUÉ hacer con la imagen de referencia adjunta.
 *
 * Es la única diferencia entre las dos formas de usar una plantilla:
 *  - `sameProduct` → el producto del usuario ES el de la referencia: se clona
 *    la composición y sólo cambian marca, copy y paleta.
 *  - si no → se traspasa el LENGUAJE de diseño a otra anatomía de producto.
 *
 * En las dos ramas se exige UN elemento distintivo propio, para que el
 * resultado sea la marca del usuario y no una copia de la referencia. Ese
 * elemento se enumera como el ÚLTIMO cambio pedido (nunca como una frase
 * suelta después de un "ONLY" ya cerrado) — así no compite con la lista de
 * cambios permitidos, es parte de ella.
 *
 * `target` separa QUÉ propiedades de la referencia se piden reproducir/
 * traspasar, porque `buildLabelPrompt` y `buildMockupPrompt` son pedidos de
 * naturaleza distinta: la etiqueta es arte plano 2D (composición, jerarquía
 * tipográfica, color) — nada de "finish"/"lighting"/"materials", que son
 * propiedades fotográficas del mockup, no del arte imprimible. El mockup, al
 * revés, ya recibe el wordmark y la paleta resueltos por la etiqueta (primera
 * imagen adjunta) — la foto de referencia ahí gobierna sólo la forma física
 * del envase y la fotografía (materiales, finish, luz, escena, encuadre).
 */
export function referenceBlock(brief: BrandBrief, target: 'label' | 'mockup'): string {
  const wordmark = brief.productName?.trim() || brief.brandName;
  // Sólo el CONTENIDO del elemento distintivo (sin verbo ni cierre) — se
  // enmarca distinto según el target: en 'label' se pide INTRODUCIRLO (recién
  // se está diseñando); en 'mockup' ya viene resuelto por la etiqueta (primera
  // imagen adjunta) y sólo se pide PRESERVARLO al aplicar el envase.
  const element =
    `a graphic mark, a rule, a compositional device derived from the brand "${brief.brandName}"` +
    `${brief.descriptor ? ` and its positioning "${brief.descriptor}"` : ''}`;

  // En 'label' la foto de referencia es la única imagen adjunta que no es el
  // wireframe, así que puede nombrarse directo. En 'mockup' hay DOS imágenes
  // adjuntas (la etiqueta ya generada, primero, y esta foto, después) y el
  // prompt del mockup ya llama a la etiqueta "the FIRST attached image" — así
  // que acá hay que nombrar la foto como la adjunta DISTINTA y POSTERIOR, o
  // "wordmark"/"colour" quedan gobernados por dos instrucciones a la vez.
  const referenceSubject =
    target === 'label'
      ? `The attached reference photograph`
      : `The reference photograph attached AFTER the label (a separate, later image)`;

  if (brief.sameProduct) {
    if (target === 'label') {
      return (
        `${referenceSubject} IS this same product. Reproduce its composition, front-panel layout, typographic ` +
        `hierarchy, graphic devices and colour placement faithfully. Change: the wordmark to "${wordmark}", the ` +
        `copy text, the colour palette to the one specified above, and — as the one deliberate departure from the ` +
        `reference — ONE distinctive signature element of your own (${element}), so the result is recognisably ` +
        `its own brand and not a copy of the reference. Everything not listed above must match the reference.`
      );
    }
    return (
      `${referenceSubject} IS this same product's packaging. Its wordmark and colours are already fixed by the ` +
      `FIRST attached image (the finished label), so this reference governs only the physical container and the ` +
      `photography: reproduce its packaging structure, form, materials, finish, lighting, scene and camera ` +
      `framing faithfully, preserving on the packaging the label's ONE distinctive signature element (${element}) ` +
      `exactly as applied, so the physical result still reads as this brand and not a copy of the reference.`
    );
  }

  const from = brief.referenceProductType ?? 'the reference product';
  if (target === 'label') {
    return (
      `${referenceSubject} is a DIFFERENT product (${from}). Transfer its design LANGUAGE to ` +
      `a ${brief.productType}${brief.containerType ? ` in a ${brief.containerType}` : ''}: keep its typographic ` +
      `system, its palette logic and its layout grammar, but re-architect them for the real anatomy of a ` +
      `${brief.productType}'s front panel — and, as the one deliberate departure from that transferred language, ` +
      `introduce ONE distinctive signature element of your own (${element}), so the result is recognisably its ` +
      `own brand and not a copy of the reference. Do not copy the silhouette, the container or the physical form ` +
      `of the reference.`
    );
  }
  return (
    `${referenceSubject} is a DIFFERENT product (${from}). Its wordmark and colours are already fixed by the ` +
    `FIRST attached image (the finished label), so this reference governs only the physical container and the ` +
    `photography: transfer its material treatment, finish, lighting, scene and camera framing to ` +
    `a ${brief.productType}${brief.containerType ? ` in a ${brief.containerType}` : ''}, re-architected for the ` +
    `real physical form of a ${brief.productType}, preserving on the packaging the label's ONE distinctive ` +
    `signature element (${element}) exactly as applied. Do not copy the silhouette, the container or the ` +
    `physical form of the reference.`
  );
}

/* --------------------------------------------------------------------------
 * Pipeline SECUENCIAL (2026-07): logo → etiqueta (con el logo insertado) →
 * mockup (con la etiqueta aplicada). Cada paso es una generación independiente
 * que recibe como imagen adjunta el artefacto del paso anterior — no se
 * derivan retrospectivamente de un compuesto, así quedan pixel-consistentes.
 * ------------------------------------------------------------------------ */

// Logo aislado, en la identidad del estilo — primer artefacto de la cadena.
export function buildLogoPrompt(brief: BrandBrief, dna: BrandDna): string {
  const bg = dna.palette.find((c) => c.role === "background")?.name ?? "neutral";
  return [
    `Design a clean, professional brand LOGO / wordmark for "${brief.brandName}", a ${brief.productType}.`,
    dna.styleBlock,
    `Typography: ${dna.typography.primary}; ${dna.typography.detail}.`,
    paletteLine(dna, brief),
    `The logo is a scalable mark — a wordmark and/or a simple emblem — legible at small sizes, presented ISOLATED and centered on a plain flat ${bg} background with generous margins. ${brief.descriptor ? `It should feel: ${brief.descriptor}.` : `Capture the mood: ${dna.mood.join(", ")}.`}`,
    exactText("brand name", brief.brandName).trim(),
    `Avoid: ${dna.avoid.join(", ")}. High-resolution, sharp, no watermark, no stray or misspelled text.`,
  ].filter(Boolean).join(" ");
}

// Etiqueta plana: construye su PROPIO wordmark tipográfico (el logo de marca
// es un asset aparte y NO se inserta acá). Recibe [...identityRefs, wireframe]
// (ver dna-source.ts identityRefParts/wireframeRefParts, wireframe
// SIEMPRE último), siguiendo el esqueleto de layout y los pares de contraste
// legal del estilo.
export function buildLabelPrompt(brief: BrandBrief, dna: BrandDna, layout: ExtractedLayout): string {
  // El wordmark HERO de la etiqueta es el NOMBRE DE PRODUCTO (no el logo de marca,
  // que es un asset aparte). Si no hay nombre de producto, cae al de marca — ahí
  // el brand name Y el hero wordmark son el MISMO string (`brandIsHero` abajo):
  // no hay dos elementos que ubicar en el panel, hay uno solo.
  const wordmark = brief.productName?.trim() || brief.brandName;
  // Bug real de probe (Task 9, belleza/serum-facial, brand="Aurelia" product=
  // "Lúmina"): el prompt nunca mencionaba brief.brandName como elemento del
  // panel — sólo establecía el hero (nombre de producto) y prohibía pegar el
  // logo aparte. El modelo, viendo una banda de marca chica en la referencia Y
  // en el wireframe pero sin instrucción de qué poner ahí, la llenaba con el
  // único nombre prominente que tenía — el de producto, duplicado — y la marca
  // desaparecía del envase por completo (sólo sobrevivía en el logo, un asset
  // aparte que nunca se inserta acá). `layout.logoPlacement` describe, en las
  // seis plantillas del catálogo, siempre la MISMA franja chica de arriba que
  // `anatomy[0]` ("banda de marca ~10-20%") — es la ubicación de la MARCA, no
  // la del hero (que vive más abajo, en la zona de producto, mucho más grande
  // per anatomy[1]). Por eso acá se reasigna: el hero ya no se ancla a esa
  // franja (su escala/posición la gobierna `layoutToPrompt` vía la lista de
  // anatomy completa), la marca sí.
  const brandIsHero = wordmark === brief.brandName;
  const brandLine = brandIsHero
    ? `The brand name "${brief.brandName}" IS this hero wordmark — no separate product name was given, so do NOT print the brand name a second time anywhere else on the panel; one instance of the word is enough.`
    : `Separately from the hero, set the brand name "${brief.brandName}" as its own smaller element, placed at: ${layout.logoPlacement} — this is the panel's brand band, distinct from and above the hero wordmark. Set it in the identity's supporting typography (not the hero's own), clearly smaller in scale, so it reads as a second, subordinate element rather than a repeat of the hero. Do NOT paste or reuse the separate logo mark image for this — build it as fresh TYPE, the same way the hero is built from the product name.`;
  return [
    `Design the FLAT front label / packaging panel artwork for the product "${wordmark}", a ${brief.productType}. This is flat 2D label artwork — front-on, NO 3D packaging, NO perspective, NO product body, NO background scene — print-ready, filling the frame.`,
    dna.styleBlock,
    paletteLine(dna, brief),
    contrastToPrompt(dna),
    referenceBlock(brief, 'label'),
    `Build a fresh TYPOGRAPHIC WORDMARK for the product name "${wordmark}" — set it in the label's own typography. It is the hero of the panel: give it prominence, balanced contrast, scale and spacing so it reads clearly and is NEVER lost in the artwork or clashing with what is behind it. Do NOT paste or reuse a separate logo mark — construct the wordmark from the product name as the style and this layout require.`,
    brandLine,
    layoutToPrompt(layout),
    `Text hierarchy: the brand name "${brief.brandName}" (small, supporting${brandIsHero ? ", same word as the hero — shown once" : ", above the hero"})${brandIsHero ? "" : `, the product name "${wordmark}" (hero)`}${brief.descriptor ? `, the descriptor "${brief.descriptor}"` : ""}${brief.tagline ? `, the tagline "${brief.tagline}"` : ""}, plus small realistic microtext of the kind a real ${brief.productType} package carries — legal notices, net weight or capacity, technical specs, materials or contents as appropriate for this product (the microtext MUST use the highest-contrast pairing).`,
    // Dos imágenes adjuntas hablan del layout del panel: la foto de referencia
    // (arriba, vía referenceBlock — "front-panel layout"/"layout grammar") y
    // este skeleton. No compiten: para una plantilla el skeleton se renderiza
    // determinísticamente desde el MISMO layout extraído de esa foto (ver
    // seed-branding-templates.ts `renderWireframePng(dna.layout, ...)`), así
    // que son dos vistas de una sola fuente — pero sin una precedencia
    // explícita el modelo no sabe cuál manda en caso de lectura ambigua. El
    // skeleton gobierna la geometría/proporción de zonas; la referencia
    // gobierna todo lo demás del panel (tratamiento tipográfico, grafismos,
    // color, textura).
    `The FINAL attached image is a LAYOUT SKELETON, not a style reference: it governs the panel's zone geometry and proportion only — follow its spatial arrangement of zones exactly, ignore its colors, treat it as structure only. The reference photograph governs everything else about the panel: typographic treatment, graphic devices, colour placement and texture.`,
    exactText("brand name", brief.brandName).trim(),
    exactText("product name", wordmark).trim(),
    exactText("tagline", brief.tagline).trim(),
    `Avoid: ${[...dna.avoid, ...layout.avoidLayout].join(", ")}. High-resolution, sharp, no watermark, no stray or misspelled text.`,
  ].filter(Boolean).join(" ");
}

/**
 * La línea `Scene:` para el mockup. `dna.composition` es la escena FOTOGRÁFICA
 * del producto de la referencia (ver `style-extract.ts`: "ONLY the photographic
 * scene — product placement, backdrop, surface"), no una propiedad de puesta
 * en escena abstracta. En `sameProduct` describe al mismo producto que se está
 * clonando — reproducirla es correcto y consistente con `referenceBlock`.
 * En traspaso describiría el envase AJENO de la referencia (p.ej. "frosted
 * glass dropper bottle centred on a pale surface" para una rodillera), lo que
 * reafirmaría justo lo que `referenceBlock` acaba de prohibir tres frases
 * antes ("Do not copy ... the physical form of the reference"). Ahí la
 * composición de la referencia se pide como LENGUAJE de puesta en escena a
 * imitar (superficie, fondo, ángulo, distancia, espacio negativo) — el modelo
 * ve la foto adjunta y puede leer esas cualidades directo de ella sin que el
 * texto necesite nombrar el objeto de la referencia.
 */
function sceneLine(brief: BrandBrief, dna: BrandDna, container: string): string {
  if (brief.sameProduct) {
    return `Scene: ${dna.composition}.`;
  }
  return (
    `Scene: stage the real ${container} using the reference photograph's staging and framing language — ` +
    `surface, backdrop, camera angle, distance and negative space — rather than reproducing the reference's ` +
    `own product or its arrangement.`
  );
}

// Mockup fotorrealista: recibe la ETIQUETA como primera imagen adjunta y la
// aplica al envase — último artefacto de la cadena.
export function buildMockupPrompt(brief: BrandBrief, dna: BrandDna): string {
  const container = brief.containerType ?? "product packaging";
  const wordmark = brief.productName?.trim() || brief.brandName;
  return [
    `Create a photorealistic product mockup: a ${container} for the product "${wordmark}", a ${brief.productType}.`,
    `The FIRST attached image is the finished FLAT LABEL artwork — apply it realistically onto the ${container} surface with correct label wrapping, material and finish (${dna.materials.join(", ")}), preserving the label's design, wordmark, colors and text EXACTLY.`,
    // Bug real de probe (Task 9, dos de tres generaciones): con la frase de
    // arriba nomás ("preserving ... text EXACTLY" + el "no stray or misspelled
    // text" del cierre), el modelo re-TIPOGRAFIÓ el microtexto del panel al
    // componerlo sobre el envase en vez de warpear el pixel del label adjunto:
    // "PROTECCIÓN" salió "PROTTECIÓN" en un mockup, y en otro una banda entera
    // de microtexto salió ESPEJADA. El wordmark grande sobrevivió intacto en
    // los dos casos — la firma es re-lettering a escala chica, no un fallo de
    // ortografía genérico, así que ninguna de las dos frases viejas lo nombra:
    // ni dicen que re-dibujar texto es la operación prohibida, ni nombran el
    // mirroring. Esta línea lo hace explícito y da la salida correcta cuando
    // la curvatura del envase haría el texto ilegible (rotar o dejarlo fuera
    // de cuadro, nunca re-dibujarlo).
    `The label is finished artwork, not a draft to re-create: geometrically warp and wrap that exact image onto the surface — do not re-typeset, re-letter or re-flow any of its text. Every character must remain identical to the label, including the smallest legal and ingredient microtext. Text must never appear mirrored, reversed, upside-down or otherwise transformed beyond the natural perspective and curvature of the surface it sits on. Where curvature would make text illegible, rotate the package slightly or let that text fall out of view around the curve — never re-draw it.`,
    dna.styleBlock,
    referenceBlock(brief, 'mockup'),
    `Studio product photography: ${dna.lighting}. ${sceneLine(brief, dna, container)} Mood: ${dna.mood.join(", ")}. Realistic reflections, soft contact shadow, believable depth of field.`,
    exactText("product name on the packaging", wordmark).trim(),
    `Avoid: ${dna.avoid.join(", ")}. High-resolution, professional commercial quality, sharp focus, no watermark, no stray or misspelled text.`,
  ].filter(Boolean).join(" ");
}
