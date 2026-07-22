/**
 * stylePresets.ts
 * ---------------------------------------------------------------------------
 * ADN visual de los 12 estilos del generador de marca/producto.
 *
 * Cada preset se derivó ANALIZANDO EN CONJUNTO las 5 imágenes de referencia de
 * su carpeta (branding_refs_60.zip). Las paletas son aproximaciones extraídas
 * visualmente de esas referencias: son un punto de partida afinable, no medidas
 * exactas de píxeles.
 *
 * Uso previsto: motor de generación de imágenes Nano Banana / Gemini.
 *   - `styleBlock` es el párrafo listo para inyectar en el prompt.
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
  /** posición 1..12 en la grid */
  index: number;
  /** nombre para mostrar (ES) */
  name: string;
  /** alma del estilo en una línea */
  essence: string;
  /** descriptores para inyección en prompt (orden = prioridad) */
  keywords: string[];
  /** paleta extraída de las referencias */
  palette: PaletteColor[];
  typography: Typography;
  /** sustratos y acabados típicos */
  materials: string[];
  /** lógica de composición / layout */
  composition: string;
  /** iluminación para renders y mockups */
  lighting: string;
  /** estados emocionales que evoca */
  mood: string[];
  /** recursos gráficos recurrentes */
  motifs: string[];
  /** anti-patrones: qué NO debe aparecer */
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

export const STYLE_PRESETS: Record<string, StylePreset> = {
  minimalista: {
    id: "minimalista",
    index: 1,
    name: "Minimalista",
    essence:
      "Silencio visual: mucho aire, un wordmark grueso y casi nada más.",
    keywords: [
      "minimal",
      "reductive",
      "negative space",
      "editorial",
      "matte",
      "understated premium",
    ],
    palette: [
      { hex: "#ECE7DD", name: "crema hueso", role: "background" },
      { hex: "#16130F", name: "tinta negra", role: "primary" },
      { hex: "#D8CDBA", name: "arena cálida", role: "secondary" },
      { hex: "#9A968D", name: "gris piedra", role: "neutral" },
      { hex: "#E8622A", name: "naranja pincelada", role: "accent" },
    ],
    typography: {
      primary: "grotesca sans gruesa, geométrica, muy espaciada",
      secondary: "sans pequeña en mayúsculas con tracking amplio",
      case: "mixed",
      detail:
        "un solo monograma o inicial grande; claims minúsculos casi ilegibles a modo de textura",
    },
    materials: [
      "cartón mate sin brillo",
      "botellas de plástico suave (soft-touch)",
      "etiquetas de papel no estucado",
    ],
    composition:
      "objeto centrado o en bodegón limpio sobre plinto; enormes márgenes vacíos; jerarquía de 1 palabra grande + micro-texto",
    lighting: "luz de estudio suave y difusa, sombras largas y limpias",
    mood: ["sereno", "sofisticado", "confiable", "moderno"],
    motifs: ["inicial/monograma", "línea divisoria fina", "bloque de color plano"],
    avoid: [
      "gradientes",
      "ilustración recargada",
      "más de dos colores dominantes",
      "texturas ruidosas",
      "efectos 3D exagerados",
    ],
    styleBlock:
      "Minimalist packaging design language: vast negative space, a single bold geometric sans-serif wordmark, a muted off-white and black palette with one restrained warm accent, matte uncoated materials, calm studio lighting with soft long shadows. Reductive, editorial and quietly premium — every element earns its place.",
    referenceFolder: "01_minimalista",
  },

  lujo: {
    id: "lujo",
    index: 2,
    name: "Lujo / Premium",
    essence:
      "Tonos joya profundos, foil dorado y detalle botánico: caro al tacto.",
    keywords: [
      "luxury",
      "premium",
      "jewel tones",
      "gold foil",
      "embossed",
      "botanical crest",
    ],
    palette: [
      { hex: "#452C57", name: "berenjena", role: "primary" },
      { hex: "#5E5F32", name: "oliva profundo", role: "secondary" },
      { hex: "#C7A24C", name: "oro foil", role: "accent" },
      { hex: "#0E0B10", name: "negro tinta", role: "neutral" },
      { hex: "#EFE9DE", name: "marfil", role: "background" },
    ],
    typography: {
      primary: "serif elegante de alto contraste o wordmark fino en capitales",
      secondary: "sans delicada muy espaciada, en dorado",
      case: "uppercase",
      detail: "monograma botánico/emblema, filetes finos, foil estampado",
    },
    materials: [
      "cajas rígidas soft-touch",
      "bolsas de tela con cordón",
      "foil metálico dorado",
      "relieve y hot-stamping",
    ],
    composition:
      "kit/lineup de packaging (caja, bolsa, tags, tarjetas) sobre superficie oscura reflejante; emblema centrado; márgenes generosos",
    lighting: "luz cálida y dramática, reflejos suaves sobre acabados oscuros",
    mood: ["opulento", "elegante", "íntimo", "atemporal"],
    motifs: ["emblema botánico", "filete dorado", "sello circular", "cinta/tag"],
    avoid: [
      "colores estridentes",
      "tipografía informal",
      "plástico barato",
      "desorden",
      "estética juvenil",
    ],
    styleBlock:
      "Luxury packaging design language: deep jewel tones (aubergine, deep olive, black) paired with real gold foil, a delicate botanical monogram or crest, elegant high-contrast serif or finely-spaced capitals, soft-touch rigid boxes with embossing. Warm dramatic lighting on dark reflective surfaces. Expensive, timeless and quietly indulgent.",
    referenceFolder: "02_lujo",
  },

  "vintage-retro": {
    id: "vintage-retro",
    index: 3,
    name: "Vintage / Retro",
    essence:
      "Nostalgia mid-century: crema, rojo tomate, mostaza y mascotas ilustradas.",
    keywords: [
      "vintage",
      "retro",
      "mid-century",
      "nostalgic",
      "illustrated mascot",
      "aged paper",
    ],
    palette: [
      { hex: "#F0E6CE", name: "crema envejecida", role: "background" },
      { hex: "#C8402B", name: "rojo tomate", role: "primary" },
      { hex: "#E0A231", name: "mostaza", role: "secondary" },
      { hex: "#2E7C6D", name: "teal retro", role: "accent" },
      { hex: "#24314F", name: "azul marino", role: "neutral" },
    ],
    typography: {
      primary: "display condensada o serif ornamental de época",
      secondary: "script retro o sans humanista con encanto antiguo",
      case: "mixed",
      detail:
        "insignias, banderolas, medias tintas (halftone), líneas de rayos de sol",
    },
    materials: [
      "cajas de cartón tipo cereal",
      "latas litografiadas",
      "envoltorios estilo caramelo",
      "papel con textura envejecida",
    ],
    composition:
      "frente de packaging cargado y simétrico, marco decorativo, mascota o bodegón ilustrado central, jerarquía tipográfica exuberante",
    lighting: "luz plana y pareja tipo estudio nostálgico o foto de producto vintage",
    mood: ["nostálgico", "cálido", "juguetón", "familiar"],
    motifs: ["mascota", "banderola/ribbon", "sunburst", "marco ornamental", "halftone"],
    avoid: [
      "minimalismo",
      "gradientes digitales modernos",
      "tipografía neo-grotesca fría",
      "acabados hi-tech",
    ],
    styleBlock:
      "Vintage / retro packaging design language: warm aged-paper cream with tomato red, mustard and retro teal, mid-century illustration and a friendly illustrated mascot, ornate condensed display type, banners, sunburst rays and halftone shading, litho-printed tins and cereal-box cartons. Nostalgic, warm and playful — like a lovingly restored product from the 1950s–60s.",
    referenceFolder: "03_vintage_retro",
  },

  "organico-eco": {
    id: "organico-eco",
    index: 4,
    name: "Orgánico / Eco",
    essence:
      "Kraft y verdes tierra con botánica lineal: natural, honesto, sostenible.",
    keywords: [
      "organic",
      "eco",
      "natural",
      "kraft",
      "botanical line art",
      "sustainable",
    ],
    palette: [
      { hex: "#B98D5F", name: "kraft", role: "background" },
      { hex: "#7C8B57", name: "verde salvia", role: "primary" },
      { hex: "#BE6A47", name: "terracota", role: "secondary" },
      { hex: "#EFE7D6", name: "crema natural", role: "neutral" },
      { hex: "#45532F", name: "verde hoja", role: "accent" },
    ],
    typography: {
      primary: "sans humanista suave o serif orgánica, cálida",
      secondary: "sans limpia en minúsculas, cómoda de leer",
      case: "title",
      detail: "sellos/badges 'eco', ilustración botánica de trazo fino",
    },
    materials: [
      "papel kraft reciclado",
      "doypacks/stand-up pouches",
      "tapas de madera",
      "acabados mate sin plastificar",
    ],
    composition:
      "familia de productos agrupada sobre superficie neutra con props naturales (hojas, piedras); botánica enmarcando el nombre; sellos de sostenibilidad",
    lighting: "luz de día suave y natural, sombras orgánicas",
    mood: ["natural", "honesto", "sereno", "saludable"],
    motifs: ["hoja/rama lineal", "sello circular eco", "textura de papel reciclado"],
    avoid: [
      "colores neón",
      "cromados/metálicos brillantes",
      "plástico evidente",
      "estética artificial o high-tech",
    ],
    styleBlock:
      "Organic / eco packaging design language: recycled kraft paper with earthy sage green, terracotta and cream, fine botanical line illustration, humanist type, eco stamps and badges, stand-up pouches and wood caps, matte uncoated finishes. Photographed in soft natural daylight with leaves and stones. Honest, wholesome and sustainable.",
    referenceFolder: "04_organico_eco",
  },

  "bold-maximalista": {
    id: "bold-maximalista",
    index: 5,
    name: "Bold / Maximalista",
    essence:
      "Choque de color saturado, patrón denso y energía sin espacio en blanco.",
    keywords: [
      "maximalist",
      "bold",
      "saturated color clash",
      "psychedelic pattern",
      "high energy",
      "pattern-wrapped",
    ],
    palette: [
      { hex: "#E4247C", name: "magenta", role: "primary" },
      { hex: "#2555C7", name: "azul eléctrico", role: "secondary" },
      { hex: "#6A2DAE", name: "violeta", role: "accent" },
      { hex: "#F26522", name: "naranja", role: "accent" },
      { hex: "#F5C518", name: "amarillo intenso", role: "accent" },
    ],
    typography: {
      primary: "display chunky y deformada, integrada en el patrón",
      secondary: "sans compacta en alto contraste sobre color",
      case: "uppercase",
      detail: "swirls, lunares, formas espirales, tipografía que se funde con el fondo",
    },
    materials: [
      "cajas y pouches totalmente impresos edge-to-edge",
      "acabados brillantes",
      "superficies cubiertas de patrón",
    ],
    composition:
      "superficie envuelta por completo en patrón; sin negativo; producto sobre fondo de color vibrante contrastante; máxima densidad visual",
    lighting: "luz de estudio nítida y saturada, colores punchy",
    mood: ["enérgico", "atrevido", "divertido", "irreverente"],
    motifs: ["swirl psicodélico", "lunares/polka", "espiral hipnótica", "clash cromático"],
    avoid: [
      "espacio en blanco",
      "paletas apagadas",
      "minimalismo",
      "sobriedad",
      "un solo color plano",
    ],
    styleBlock:
      "Bold maximalist packaging design language: clashing saturated colors (magenta, electric blue, violet, orange, yellow), dense psychedelic swirls, polka dots and hypnotic patterns wrapping every surface edge-to-edge, chunky distorted display type fused into the pattern, glossy finishes, product shot on a vivid contrasting background. Loud, high-energy and unapologetically busy.",
    referenceFolder: "05_bold_maximalista",
  },

  japandi: {
    id: "japandi",
    index: 6,
    name: "Japandi",
    essence:
      "Fusión japonés-escandinava: neutros salvia, paisajes en gradiente y calma.",
    keywords: [
      "japandi",
      "japanese scandinavian",
      "muted earth tones",
      "gradient landscape",
      "zen minimal",
      "tactile",
    ],
    palette: [
      { hex: "#8FA07C", name: "salvia", role: "primary" },
      { hex: "#CFC7B4", name: "greige cálido", role: "background" },
      { hex: "#EDE7D8", name: "crema", role: "neutral" },
      { hex: "#3B4A35", name: "verde bosque", role: "secondary" },
      { hex: "#B98E6E", name: "arcilla", role: "accent" },
    ],
    typography: {
      primary: "sans ligera y espaciada, a veces con caracteres japoneses",
      secondary: "sans fina, minimal, jerarquía suave",
      case: "mixed",
      detail: "gradientes de montaña/paisaje, formas abstractas orgánicas, mucho aire",
    },
    materials: [
      "tubos y cajas cilíndricas mate",
      "papel texturado",
      "linos y superficies táctiles",
    ],
    composition:
      "objeto único o pareja sobre superficie neutra texturada; motivo de paisaje/montaña degradado; equilibrio asimétrico y sereno",
    lighting: "luz natural tenue, sombras suaves, atmósfera cálida y quieta",
    mood: ["calmo", "equilibrado", "cálido", "contemplativo"],
    motifs: ["montaña/paisaje en gradiente", "círculo (enso)", "forma orgánica abstracta"],
    avoid: [
      "colores saturados",
      "patrón denso",
      "brillos metálicos",
      "tipografía agresiva",
      "desorden",
    ],
    styleBlock:
      "Japandi packaging design language: muted earthy neutrals (sage, greige, cream, forest green, clay), soft gradient mountain/landscape motifs, calm asymmetric balance, light spaced sans-serif sometimes with Japanese characters, matte cylindrical tubes and textured paper. Photographed in soft warm natural light. Zen, tactile and quietly balanced — where Japanese restraint meets Scandinavian warmth.",
    referenceFolder: "06_japandi",
  },

  "hand-drawn-artesanal": {
    id: "hand-drawn-artesanal",
    index: 7,
    name: "Hand-drawn / Artesanal",
    essence:
      "Tinta blanco y negro con ilustración a mano: indie, craft, con carácter.",
    keywords: [
      "hand drawn",
      "artisanal",
      "ink illustration",
      "black and white",
      "screen-print",
      "indie craft",
    ],
    palette: [
      { hex: "#1A1714", name: "tinta negra", role: "primary" },
      { hex: "#EFEADD", name: "crema papel", role: "background" },
      { hex: "#CFC9BC", name: "gris papel", role: "neutral" },
      { hex: "#B5452F", name: "rojo apagado", role: "accent" },
      { hex: "#2E2A26", name: "carbón", role: "secondary" },
    ],
    typography: {
      primary: "sans dibujada a mano o de bloque con imperfección de impresión",
      secondary: "monoespaciada/serif pequeña estilo etiqueta antigua",
      case: "uppercase",
      detail: "ilustración de tinta (animales, formas abstractas), trazo de serigrafía",
    },
    materials: [
      "botellas de vidrio con serigrafía directa",
      "cajas mate sin estucar",
      "etiquetas de papel craft blanco/crema",
    ],
    composition:
      "alto contraste blanco/negro; ilustración protagonista dibujada a mano; lineup limpio; texto de etiqueta al pie",
    lighting: "luz de estudio neutra, foco en el contraste gráfico",
    mood: ["artesanal", "auténtico", "indie", "con carácter"],
    motifs: ["ilustración de tinta a mano", "animal/emblema", "trazo de serigrafía", "líneas orgánicas"],
    avoid: [
      "gradientes",
      "colores saturados",
      "acabados hi-tech",
      "3D fotorrealista pulido en el grafismo",
      "tipografía corporativa fría",
    ],
    styleBlock:
      "Hand-drawn / artisanal packaging design language: high-contrast black and white with cream paper, expressive hand-inked illustration (animals, abstract linework) with a screen-print feel, hand-drawn or block lettering, direct screen-printed glass bottles and uncoated cartons, an occasional muted red accent. Indie, crafted and full of character.",
    referenceFolder: "07_hand_drawn_artesanal",
  },

  "moderno-tech": {
    id: "moderno-tech",
    index: 8,
    name: "Moderno Tech",
    essence:
      "Blanco/plata ultra-limpio con toques holográficos: preciso y futurista.",
    keywords: [
      "modern tech",
      "clean",
      "monochrome",
      "holographic iridescent accent",
      "precise grid",
      "product-launch",
    ],
    palette: [
      { hex: "#F4F5F7", name: "blanco frío", role: "background" },
      { hex: "#C7CBD1", name: "gris plata", role: "secondary" },
      { hex: "#202327", name: "grafito", role: "primary" },
      { hex: "#0C0D0F", name: "negro", role: "neutral" },
      { hex: "#A9C7E8", name: "iridiscente holográfico", role: "accent" },
    ],
    typography: {
      primary: "neo-grotesca fina y precisa, tracking neutro",
      secondary: "sans pequeña estilo ficha técnica, muy legible",
      case: "mixed",
      detail: "grids visibles, layouts tipo spec-sheet, acento holográfico sutil",
    },
    materials: [
      "cajas rígidas blancas/negras mate",
      "mailers metalizados",
      "foil holográfico/iridiscente",
      "superficies lisas premium",
    ],
    composition:
      "flat-lay ordenado o caja en ángulo con espacio negativo controlado; grid estricto; jerarquía minimal; detalle iridiscente como único color",
    lighting: "luz de estudio limpia y neutra, sombras suaves y precisas",
    mood: ["preciso", "futurista", "premium", "confiable"],
    motifs: ["grid/spec-sheet", "gradiente holográfico", "bloque monocromo"],
    avoid: [
      "ilustración manual",
      "colores cálidos saturados",
      "texturas rústicas",
      "ornamento",
      "desorden",
    ],
    styleBlock:
      "Modern tech packaging design language: ultra-clean monochrome white, silver and graphite with a single subtle holographic / iridescent accent, precise neo-grotesque type, visible grids and spec-sheet layouts, matte rigid boxes and metallized mailers, controlled negative space. Neutral studio lighting. Precise, premium and future-facing — like a flagship tech product launch.",
    referenceFolder: "08_moderno_tech",
  },

  "colorido-y2k": {
    id: "colorido-y2k",
    index: 9,
    name: "Colorido / Y2K",
    essence:
      "Gradientes vívidos, cromados y tipo burbuja: nostalgia glossy de los 2000s.",
    keywords: [
      "y2k",
      "vibrant gradient",
      "chrome",
      "bubbly rounded type",
      "glossy",
      "2000s nostalgia",
    ],
    palette: [
      { hex: "#F0399B", name: "rosa chicle", role: "primary" },
      { hex: "#37C6E8", name: "cian", role: "secondary" },
      { hex: "#9BE022", name: "lima", role: "accent" },
      { hex: "#7A3FF2", name: "violeta", role: "accent" },
      { hex: "#BFA9F0", name: "lila fondo", role: "background" },
    ],
    typography: {
      primary: "display redondeada tipo burbuja, gruesa y glossy",
      secondary: "sans redondeada compacta",
      case: "uppercase",
      detail: "gradientes arcoíris, cromados líquidos, formas blobby",
    },
    materials: [
      "pouches de mylar holográfico",
      "envases glossy brillantes",
      "acabados cromados/metalizados líquidos",
    ],
    composition:
      "producto sobre fondo pastel-a-vívido saturado; gradientes y cromados; formas blobby; energía pop y dulce",
    lighting: "luz brillante y saturada, reflejos glossy marcados",
    mood: ["divertido", "vibrante", "dulce", "nostálgico-pop"],
    motifs: ["gradiente arcoíris", "cromado líquido", "blob/estrella", "burbuja"],
    avoid: [
      "paletas apagadas",
      "acabados mate rústicos",
      "minimalismo austero",
      "seriedad corporativa",
    ],
    styleBlock:
      "Colorful Y2K packaging design language: vivid rainbow gradients and liquid chrome, bubbly rounded glossy display type, blobby shapes, holographic mylar pouches and high-gloss containers, candy colors (hot pink, cyan, lime, violet) on saturated backgrounds. Bright punchy lighting with glossy highlights. Fun, sweet and dripping with early-2000s nostalgia.",
    referenceFolder: "09_colorido_y2k",
  },

  "farmaceutico-clean": {
    id: "farmaceutico-clean",
    index: 10,
    name: "Farmacéutico / Clean",
    essence:
      "Pasteles suaves y blanco, clínico y amable: eficacia que inspira confianza.",
    keywords: [
      "clean clinical",
      "soft pastels",
      "dermatological",
      "gentle",
      "airy",
      "trustworthy",
    ],
    palette: [
      { hex: "#B9D4E8", name: "azul polvo", role: "primary" },
      { hex: "#F4D2CF", name: "blush", role: "secondary" },
      { hex: "#CBE7D8", name: "menta", role: "accent" },
      { hex: "#FBFCFE", name: "blanco", role: "background" },
      { hex: "#DDE3E8", name: "gris suave", role: "neutral" },
    ],
    typography: {
      primary: "sans limpia y ligera, médica pero amable",
      secondary: "sans pequeña muy legible, claims funcionales",
      case: "mixed",
      detail: "gradientes blush/azul suaves, mucho blanco, aire clínico",
    },
    materials: [
      "tubos suaves mate",
      "frascos con gotero",
      "cajas blancas limpias",
      "acabados soft-touch",
    ],
    composition:
      "lineup ordenado sobre plinto pastel; abundante blanco; gradiente sutil como único adorno; jerarquía funcional clara",
    lighting: "luz difusa y limpia, sombras muy suaves, sensación higiénica",
    mood: ["confiable", "suave", "clínico", "sereno"],
    motifs: ["gradiente blush/azul", "gota/burbuja abstracta", "plinto pastel"],
    avoid: [
      "colores saturados",
      "ornamento",
      "texturas rústicas",
      "estridencia",
      "estética juguetona",
    ],
    styleBlock:
      "Clean clinical / pharmaceutical packaging design language: soft pastels (powder blue, blush, mint) on abundant white, light gentle sans-serif, subtle blush-to-blue gradients as the only decoration, soft-touch tubes, dropper bottles and crisp white boxes, orderly lineup on a pastel plinth. Diffuse hygienic lighting. Gentle, effective and reassuringly trustworthy.",
    referenceFolder: "10_farmaceutico_clean",
  },

  "gold-foil-dorado": {
    id: "gold-foil-dorado",
    index: 11,
    name: "Gold Foil / Dorado",
    essence:
      "Oro metálico sobre negro y teal, con drips y emblemas: opulencia dramática.",
    keywords: [
      "gold foil",
      "metallic",
      "dramatic dark",
      "liquid gold drip",
      "opulent",
      "high contrast",
    ],
    palette: [
      { hex: "#C9A24B", name: "oro metálico", role: "primary" },
      { hex: "#0C0A08", name: "negro", role: "background" },
      { hex: "#17403B", name: "teal oscuro", role: "secondary" },
      { hex: "#F3F0E9", name: "blanco marfil", role: "neutral" },
      { hex: "#E6C98B", name: "arena dorada", role: "accent" },
    ],
    typography: {
      primary: "serif o sans fina en foil dorado, elegante",
      secondary: "sans espaciada en dorado o marfil",
      case: "uppercase",
      detail: "drips de oro líquido, emblemas, bordes ornamentales, hot-stamping",
    },
    materials: [
      "cajas negras/teal soft-touch",
      "foil dorado brillante",
      "frascos con gotero premium",
      "relieve metálico",
    ],
    composition:
      "objeto único con foco dramático; oro como acento sobre superficie oscura; contraste alto; centrado y ceremonioso",
    lighting: "iluminación dramática y oscura con destellos dorados especulares",
    mood: ["opulento", "dramático", "premium", "seductor"],
    motifs: ["drip de oro líquido", "emblema/sello dorado", "borde ornamental", "foil"],
    avoid: [
      "colores pastel",
      "estética informal",
      "planos sin contraste",
      "acabados mate apagados sin brillo metálico",
    ],
    styleBlock:
      "Gold foil / luxe packaging design language: shining metallic gold on deep black and dark teal, liquid-gold drip motifs, ornate emblems and borders, fine foil-stamped serif or sans lettering, soft-touch dark boxes and premium dropper bottles, high contrast. Dramatic dark lighting with specular gold highlights. Opulent, seductive and ceremonious.",
    referenceFolder: "11_gold_foil_dorado",
  },

  "flat-geometrico": {
    id: "flat-geometrico",
    index: 12,
    name: "Flat / Geométrico",
    essence:
      "Formas planas tipo Bauhaus en colores vivos: sistema modular y alegre.",
    keywords: [
      "flat geometric",
      "bauhaus",
      "modular shapes",
      "primary-ish bold colors",
      "vector",
      "systematic",
    ],
    palette: [
      { hex: "#2358B8", name: "azul cobalto", role: "primary" },
      { hex: "#E23B39", name: "rojo", role: "secondary" },
      { hex: "#F4C020", name: "amarillo", role: "accent" },
      { hex: "#4F9E57", name: "verde", role: "accent" },
      { hex: "#F0EBDD", name: "crema fondo", role: "background" },
    ],
    typography: {
      primary: "grotesca geométrica robusta, alineada al grid",
      secondary: "sans limpia funcional",
      case: "mixed",
      detail: "círculos, triángulos, arcos y semicírculos; composición modular plana",
    },
    materials: [
      "cajas y pouches impresos con vectores planos",
      "acabados mate o satinados",
      "superficies con patrón geométrico",
    ],
    composition:
      "frente construido con formas geométricas modulares que forman patrón o fruta/objeto; color plano sin gradientes; logo enmarcado; sistema replicable entre SKUs",
    lighting: "luz de estudio clara y pareja que respeta el color plano",
    mood: ["moderno", "alegre", "ordenado", "confiado"],
    motifs: ["círculo/triángulo/arco", "patrón modular", "composición Bauhaus", "color-block"],
    avoid: [
      "gradientes",
      "ilustración realista con volumen",
      "texturas ruidosas",
      "ornamento vintage",
      "degradados fotográficos",
    ],
    styleBlock:
      "Flat geometric / Bauhaus packaging design language: bright flat color-blocks (cobalt, red, yellow, green, teal on cream), modular circles, triangles, arcs and semicircles composing patterns or stylized objects, sturdy geometric grotesque type on a strict grid, no gradients, a repeatable system across SKUs. Clean even studio lighting. Modern, cheerful and systematic.",
    referenceFolder: "12_flat_geometrico",
  },
};

/** Lista ordenada por índice de grid (1..12). */
export const STYLE_LIST: StylePreset[] = Object.values(STYLE_PRESETS).sort(
  (a, b) => a.index - b.index,
);

/** Ids válidos como union type derivado. */
export type StyleId = keyof typeof STYLE_PRESETS;

/** Acceso seguro por id con error explícito. */
export function getPreset(id: string): StylePreset {
  const p = STYLE_PRESETS[id];
  if (!p) {
    throw new Error(
      `Estilo desconocido: "${id}". Válidos: ${Object.keys(STYLE_PRESETS).join(", ")}`,
    );
  }
  return p;
}
