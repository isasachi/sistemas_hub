/**
 * stylePresets.ts
 * ---------------------------------------------------------------------------
 * ADN visual de los 7 estilos de identidad fija del generador de marca/producto.
 *
 * Migración (fase 3, jul 2026): de 12 presets "estilo genérico" a 7 presets de
 * IDENTIDAD FIJA. Cada uno tiene una paleta validada por contraste (ver
 * `contrast.ts`) — los hex y roles NO se derivan de referencias visuales como
 * en la v1, son fijos y contrast-críticos: no se cambian sin re-validar.
 *
 * Uso previsto: motor de generación de imágenes Nano Banana / Gemini.
 *   - `styleBlock` es el párrafo listo para inyectar en el prompt.
 *   - `composition` es SOLO escena fotográfica (el layout de etiqueta vive en
 *     `label-layouts.ts`, que se concatena aparte en el prompt).
 *   - `referenceFolder` apunta a la carpeta de refs para adjuntarlas como
 *     imágenes de estilo (Gemini es muy fuerte usando referencias visuales).
 * ---------------------------------------------------------------------------
 */

export type ArtifactType = "logo" | "label" | "mockup";

export type ColorRole =
  | "primary"
  | "secondary"
  | "accent"
  | "neutral"
  | "background";

export interface PaletteColor {
  hex: string;
  name: string;
  role: ColorRole;
}

export interface Typography {
  /** Estilo del wordmark / titular */
  primary: string;
  /** Texto de apoyo (claims, ingredientes, legal) */
  secondary: string;
  /** Caja tipográfica dominante */
  case: "uppercase" | "lowercase" | "title" | "mixed";
  /** Detalle distintivo del lettering */
  detail: string;
}

export interface StylePreset {
  /** id estable en kebab/lower, usado como clave del motor */
  id: string;
  /** posición 1..7 en la grid */
  index: number;
  /** nombre para mostrar (ES) */
  name: string;
  /** versión de identidad; sube al afinar paleta/styleBlock de un preset en prod */
  version: number;
  /** alma del estilo en una línea */
  essence: string;
  /** descriptores para inyección en prompt (orden = prioridad) */
  keywords: string[];
  /** paleta extraída de las referencias */
  palette: PaletteColor[];
  typography: Typography;
  /** sustratos y acabados típicos */
  materials: string[];
  /** escena fotográfica (NO layout de etiqueta — eso vive en label-layouts.ts) */
  composition: string;
  /** iluminación para renders y mockups */
  lighting: string;
  /** estados emocionales que evoca */
  mood: string[];
  /** recursos gráficos recurrentes */
  motifs: string[];
  /** anti-patrones estilísticos: qué NO debe aparecer (layout vive en LabelLayout.avoidLayout) */
  avoid: string[];
  /** párrafo natural listo para inyectar en Gemini/Nano Banana */
  styleBlock: string;
  /** carpeta de imágenes de referencia (para adjuntar como style refs) */
  referenceFolder: string;
}

/** Une nombre + hex de la paleta en un fragmento de texto para prompts. */
export function paletteToText(palette: PaletteColor[]): string {
  return palette.map((c) => `${c.name} (${c.hex}, ${c.role})`).join(", ");
}

export const STYLE_PRESETS = {
  "neo-apotecario": {
    id: "neo-apotecario",
    index: 1,
    name: "Neo Apotecario",
    version: 1,
    essence:
      "Botica moderna: serif de alto contraste, sello circular y simetría total.",
    keywords: [
      "apothecary",
      "modern pharmacy",
      "high-contrast serif",
      "emblem seal",
      "framed symmetry",
      "amber glass",
      "small caps",
      "timeless",
    ],
    palette: [
      { hex: "#F4EDE0", name: "crema hueso", role: "background" },
      { hex: "#2B2420", name: "tinta parda", role: "primary" },
      { hex: "#C0492F", name: "terracota", role: "accent" },
      { hex: "#2E6B5E", name: "verde botica", role: "secondary" },
    ],
    typography: {
      primary: "high-contrast transitional/didone serif, spaced small-caps",
      secondary: "small sans in spaced small-caps",
      case: "uppercase",
      detail: "circular emblem/seal, fine rules, framed border",
    },
    materials: [
      "papel no estucado",
      "vidrio ámbar de boticario",
      "etiqueta enmarcada",
    ],
    composition:
      "amber apothecary glass bottle centered on a wood or marble surface",
    lighting: "warm soft diffused",
    mood: ["confiable", "artesanal", "curativo", "atemporal"],
    motifs: ["sello circular", "filete rectangular", "emblema central", "regla horizontal"],
    avoid: [
      "colores neón",
      "tipografía informal o redondeada",
      "asimetría",
      "gradientes digitales",
      "acabados plásticos brillantes",
    ],
    styleBlock:
      "Neo-apothecary packaging design language: a modern pharmacy reinterpreted with a high-contrast transitional serif in spaced small-caps, a circular emblem or seal anchoring total symmetry, fine rules and a framed rectangular border enclosing the panel. Amber apothecary glass on wood or marble, warm soft diffused lighting. Trustworthy, artisanal, healing and timeless — precision with a human hand.",
    referenceFolder: "01_neo_apotecario",
  },

  "citrico-max": {
    id: "citrico-max",
    index: 2,
    name: "Cítrico Max",
    version: 1,
    essence:
      "Maximalismo cítrico: color a sangre, fruta gigante y display enorme.",
    keywords: [
      "citrus maximalist",
      "bleed color",
      "oversized display",
      "juicy",
      "high energy",
      "saturated",
      "cut fruit",
      "loud",
    ],
    palette: [
      { hex: "#FF7A00", name: "naranja", role: "primary" },
      { hex: "#FFD400", name: "amarillo cítrico", role: "background" },
      { hex: "#B6E600", name: "lima", role: "secondary" },
      { hex: "#FF3D6E", name: "magenta", role: "accent" },
      { hex: "#111111", name: "negro tinta", role: "neutral" },
    ],
    typography: {
      primary: "ultra-bold condensed display grotesque, huge",
      secondary: "bold sans",
      case: "uppercase",
      detail: "color pills/ribbons, thick outlines",
    },
    materials: ["lata de aluminio", "film brillante", "plástico brillante"],
    composition:
      "aluminum can or bottle against a saturated solid-color backdrop with citrus splashes",
    lighting: "hard punchy studio light",
    mood: ["energético", "jugoso", "ruidoso", "divertido"],
    motifs: ["fruta cítrica cortada", "pastilla de color", "cinta/ribbon", "contorno grueso"],
    avoid: [
      "espacio en blanco vacío",
      "paletas apagadas o pastel",
      "tipografía delicada",
      "minimalismo",
      "acabados mate",
    ],
    styleBlock:
      "Citrus-max packaging design language: full-bleed saturated orange, citrus yellow, lime and magenta, an ultra-bold huge condensed display grotesque, thick outlines and color-pill ribbons, an oversized cut-citrus splash crashing into the frame. Aluminum can or glossy bottle under hard punchy studio light. Energetic, juicy, loud and unapologetically fun.",
    referenceFolder: "02_citrico_max",
  },

  "clinical-performance": {
    id: "clinical-performance",
    index: 3,
    name: "Clinical Performance",
    version: 1,
    essence:
      "Nutrición deportiva clínica: ficha técnica al frente y verde señal.",
    keywords: [
      "sports nutrition",
      "clinical",
      "neo-grotesque",
      "data-forward",
      "hero figure",
      "precise",
      "signal green",
      "performance",
    ],
    palette: [
      { hex: "#FFFFFF", name: "blanco", role: "background" },
      { hex: "#F2F4F5", name: "gris niebla", role: "neutral" },
      { hex: "#2A2E33", name: "grafito", role: "primary" },
      { hex: "#00E676", name: "verde señal", role: "accent" },
    ],
    typography: {
      primary: "bold neo-grotesque sans, uppercase",
      secondary: "mono or sans for data",
      case: "uppercase",
      detail: "data pills, thin rules, oversized hero figure",
    },
    materials: ["bote HDPE mate", "aluminio", "film mate"],
    composition:
      "matte HDPE tub or shaker on a clean light-gray surface",
    lighting: "neutral even diffused, soft shadow",
    mood: ["preciso", "potente", "confiable", "científico"],
    motifs: ["cifra heroica", "pastilla de dato", "ficha técnica en grid", "filete fino"],
    avoid: [
      "ilustración decorativa",
      "tipografía script o serif ornamental",
      "colores cálidos saturados",
      "texturas rústicas",
      "desorden",
    ],
    styleBlock:
      "Clinical-performance packaging design language: a bold uppercase neo-grotesque sans, a visible data fiche with an oversized hero figure and thin rules, signal green accenting a graphite-on-white system. Matte HDPE tub or shaker on a clean light-gray surface under neutral even diffused lighting with soft shadow. Precise, powerful, trustworthy and scientific.",
    referenceFolder: "03_clinical_performance",
  },

  "rich-not-snobby": {
    id: "rich-not-snobby",
    index: 4,
    name: "Rich Not Snobby",
    version: 1,
    essence:
      "Premium cálido y táctil, sin ostentación: faja estrecha y foil discreto.",
    keywords: [
      "quiet luxury",
      "warm premium",
      "narrow band",
      "soft-touch",
      "understated foil",
      "tactile",
      "negative space",
      "intimate",
    ],
    palette: [
      { hex: "#EDE3D4", name: "arena clara", role: "background" },
      { hex: "#3A2A22", name: "cacao oscuro", role: "primary" },
      { hex: "#B5623F", name: "terracota tostada", role: "secondary" },
      { hex: "#C9A24B", name: "oro suave", role: "accent" },
    ],
    typography: {
      primary: "fine medium-contrast serif or elegant spaced sans, small",
      secondary: "fine spaced sans",
      case: "uppercase",
      detail: "wide tracking, discreet foil, centered narrow band",
    },
    materials: ["envase soft-touch mate", "foil sutil", "vidrio esmerilado"],
    composition:
      "soft-touch matte vessel on a warm neutral surface, lots of negative space",
    lighting: "soft directional side light",
    mood: ["cálido", "íntimo", "premium", "sereno"],
    motifs: ["faja centrada estrecha", "wordmark espaciado", "foil discreto"],
    avoid: [
      "ostentación o dorado excesivo",
      "tipografía gruesa o gritona",
      "panel impreso a sangre completa",
      "colores estridentes",
      "desorden visual",
    ],
    styleBlock:
      "Rich-not-snobby packaging design language: a warm cacao and sand palette with a soft toasted-terracotta and gold accent, a small finely-spaced serif or elegant sans wordmark centered in a narrow printed band, discreet foil, soft-touch matte vessel with generous unprinted negative space above and below. Soft directional side light on a warm neutral surface. Warm, intimate, premium and serene — never loud.",
    referenceFolder: "04_rich_not_snobby",
  },

  botanico: {
    id: "botanico",
    index: 5,
    name: "Botánico",
    version: 1,
    essence:
      "Botánico kraft: doypack con ventana, ilustración lineal y sellos de certificación.",
    keywords: [
      "botanical kraft",
      "doypack window",
      "line illustration",
      "certification seals",
      "natural",
      "honest",
      "earthy",
      "sustainable",
    ],
    palette: [
      { hex: "#D8CBB4", name: "kraft", role: "background" },
      { hex: "#3B3A2E", name: "oliva tinta", role: "primary" },
      { hex: "#7C8A5B", name: "salvia", role: "secondary" },
      { hex: "#D89B3A", name: "ocre", role: "accent" },
    ],
    typography: {
      primary: "humanist serif or organic sans",
      secondary: "clean sans",
      case: "title",
      detail: "botanical illustration, monogram, circular certification seals",
    },
    materials: ["kraft mate", "doypack", "ventana transparente", "tinta de soja"],
    composition:
      "standing kraft doypack on wood or linen with a few leaves",
    lighting: "warm natural daylight",
    mood: ["natural", "honesto", "terroso", "fresco"],
    motifs: ["ilustración botánica lineal", "ventana de producto", "sello circular de certificación"],
    avoid: [
      "colores neón",
      "cromados o metálicos brillantes",
      "plástico evidente",
      "tipografía geométrica fría",
      "acabados hi-tech",
    ],
    styleBlock:
      "Botanical-kraft packaging design language: a humanist serif or organic sans title centered above a real or simulated product window, fine botanical line illustration framing the name, circular certification seals aligned along the base, uncoated kraft doypack with a soy-ink print. Warm natural daylight on wood or linen with a few leaves. Natural, honest, earthy and fresh.",
    referenceFolder: "05_botanico",
  },

  editorial: {
    id: "editorial",
    index: 6,
    name: "Editorial",
    version: 1,
    essence:
      "Tipográfico suizo: grilla visible, asimetría deliberada, navy y amarillo señal.",
    keywords: [
      "swiss editorial",
      "visible grid",
      "deliberate asymmetry",
      "international typographic style",
      "navy",
      "signal yellow",
      "confident",
      "precise",
    ],
    palette: [
      { hex: "#F2F1EC", name: "hueso", role: "background" },
      { hex: "#101B3A", name: "azul tinta", role: "primary" },
      { hex: "#F5C400", name: "amarillo señal", role: "accent" },
    ],
    typography: {
      primary: "large international-style neo-grotesque (Helvetica-like)",
      secondary: "same grotesque, smaller",
      case: "mixed",
      detail: "visible grid, thin rule, vertical metadata",
    },
    materials: ["papel mate no estucado", "cartón", "impresión offset"],
    composition:
      "object or box in asymmetric composition on a flat solid backdrop",
    lighting: "clean even studio light",
    mood: ["sofisticado", "preciso", "editorial", "seguro"],
    motifs: ["grilla visible", "color-block plano", "metadato vertical", "regla fina"],
    avoid: [
      "composición centrada o simétrica",
      "ornamento",
      "gradientes",
      "tipografía script o serif ornamental",
      "desorden",
    ],
    styleBlock:
      "Editorial packaging design language: the international typographic style with a visible grid, a large confident neo-grotesque (Helvetica-like) wordmark set deliberately asymmetric against a flat navy or signal-yellow color-block, a thin rule and a vertical metadata column as the system's signature. Clean even studio light on a flat solid backdrop. Sophisticated, precise, editorial and self-assured.",
    referenceFolder: "06_editorial",
  },

  "future-nostalgia": {
    id: "future-nostalgia",
    index: 7,
    name: "Future Nostalgia",
    version: 1,
    essence:
      "Y2K cromado: gradiente holográfico, blobs y wordmark burbuja 3D.",
    keywords: [
      "y2k chrome",
      "holographic gradient",
      "3d bubble wordmark",
      "starburst",
      "glossy",
      "nostalgic future",
      "playful",
      "vibrant",
    ],
    palette: [
      { hex: "#C7CCD1", name: "cromo claro", role: "background" },
      { hex: "#FF5CC8", name: "rosa neón", role: "primary" },
      { hex: "#4DD8E6", name: "cian", role: "secondary" },
      { hex: "#C6FF3D", name: "lima ácida", role: "accent" },
      { hex: "#14121A", name: "casi negro", role: "neutral" },
    ],
    typography: {
      primary: "3D chrome bubble display",
      secondary: "rounded sans",
      case: "uppercase",
      detail: "chrome, starbursts, color capsules, gradient",
    },
    materials: ["film holográfico", "cromo", "plástico brillante"],
    composition:
      "chrome vessel against a holographic gradient backdrop with sparkles",
    lighting: "bright glossy light with strong reflections",
    mood: ["nostálgico", "lúdico", "futurista", "vibrante"],
    motifs: ["wordmark burbuja cromado", "starburst", "blob orgánico", "cápsula de color"],
    avoid: [
      "paletas apagadas o mate",
      "minimalismo austero",
      "seriedad corporativa",
      "tipografía plana sin volumen",
      "texturas rústicas",
    ],
    styleBlock:
      "Future-nostalgia packaging design language: a 3D chrome bubble wordmark with real volume and reflections floating in front of a holographic gradient backdrop, starbursts and organic blobs layered behind it, neon pink, cyan and acid-lime color capsules over a near-black anchor. Bright glossy light with strong reflections on a chrome vessel. Nostalgic, playful, futuristic and vibrant.",
    referenceFolder: "07_future_nostalgia",
  },
} satisfies Record<string, StylePreset>;

/** Lista ordenada por índice de grid (1..7). */
export const STYLE_LIST: StylePreset[] = Object.values(STYLE_PRESETS).sort(
  (a, b) => a.index - b.index,
);

/** Ids válidos como union type derivado. */
export type StyleId = keyof typeof STYLE_PRESETS;

/** Acceso seguro por id con error explícito. */
export function getPreset(id: string): StylePreset {
  const p = (STYLE_PRESETS as Record<string, StylePreset>)[id];
  if (!p) {
    throw new Error(
      `Estilo desconocido: "${id}". Válidos: ${Object.keys(STYLE_PRESETS).join(", ")}`,
    );
  }
  return p;
}
