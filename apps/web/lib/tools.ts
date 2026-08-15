export interface Tool {
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  icon: string; // Lucide icon name
  tag: string;
  tagStyle: "brand" | "new" | "utility" | "neutral";
  status: "live" | "soon"; // "soon" = muestra <ComingSoon> al abrir su view
  // stage: etapa del flujo del operador. Agrupa el dashboard (no es una
  // secuencia obligatoria — cada tool se usa suelta). "investigar" = descubrir/
  // validar antes de invertir; "crear" = producir los activos de campaña.
  stage: "investigar" | "crear";

  // ── Landing showcase (opcional) ──────────────────────────────
  // pitch: one-liner de venta para la card grande (si falta, usa description)
  pitch?: string;
  // preview: sneak peek que renderiza <ToolPreview> — imagen generada con
  // Gemini en /public/showcase/<slug>.jpg (asset del sistema de diseño),
  // enmarcada en el spec-card con metadata mono. `ratio` = formato nativo.
  // `kind: "video"` = clip real en /public/showcase/<slug>.mp4 (autoplay/loop/
  // mudo). Mismo marco y mismo recorte que la imagen.
  preview?: {
    kind: "image" | "video";
    ratio?: "9/16" | "1/1" | "4/3" | "16/10";
  };
  // stats: chips hardcodeados por tool. TODO wire: ver lib/home/stats.ts
  stats?: { value: string; label: string }[];
}

export const tools: Tool[] = [
  {
    name: "Buscador de Productos",
    slug: "buscador-productos",
    description:
      "Encuentra productos físicos que se están pautando en LATAM, agrupados por volumen de anuncios.",
    longDescription:
      "Escribe un nicho y la herramienta te muestra productos físicos que se están pautando ahora mismo en LATAM, agrupados por cantidad de anuncios activos y verificados como el producto principal de su anunciante.",
    icon: "PackageSearch",
    stage: "investigar",
    tag: "Nuevo",
    tagStyle: "new",
    status: "live",
    pitch: "Productos que ya venden en LATAM y aún nadie pauta en Perú.",
    preview: { kind: "image", ratio: "4/3" },
    stats: [
      { value: "8,900+", label: "productos analizados" },
      { value: "5 países", label: "validación LATAM" },
    ],
  },
  {
    name: "Generador de Anuncios",
    slug: "generador-anuncios",
    description:
      "Replica cualquier anuncio con tu producto usando IA real. Sube una referencia y la IA genera tu imagen al instante.",
    longDescription:
      "Carga un anuncio de referencia y la foto de tu producto. La IA analiza la composición, estilo y copy, luego genera un nuevo anuncio con tu marca — fiel al original pero 100% tuyo.",
    icon: "ImagePlus",
    stage: "crear",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
    pitch: "Sube un anuncio que funciona y recíbelo con tu producto.",
    preview: { kind: "image", ratio: "9/16" },
    stats: [
      { value: "1,200+", label: "anuncios generados" },
      { value: "~40s", label: "por creativo" },
    ],
  },
  {
    name: "Generador de Video Ads",
    slug: "generador-video-ads",
    description:
      "Sube un video que ya funciona y te devolvemos su ADN de guión, listo para rellenar con tu producto.",
    longDescription:
      "Empieza con un video de referencia vertical. Lo desglosamos corte por corte —qué se ve, qué se dice, cómo está encuadrado, cuánto dura cada toma— y sacamos el esqueleto de su guión: la plantilla Fill in the Blank que rellenas con tu producto, tu ángulo y tu público.",
    icon: "Video",
    stage: "crear",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
    pitch: "El guión de un video que ya vende, listo para tu producto.",
    preview: { kind: "video", ratio: "9/16" },
    stats: [
      { value: "1 referencia", label: "video vertical obligatorio" },
      { value: "corte a corte", label: "análisis del original" },
    ],
  },
  {
    name: "Generador de Branding",
    slug: "generador-branding",
    description:
      "Crea la identidad de tu marca: dirección, logo, etiqueta y mockup del producto final.",
    longDescription:
      "Cuéntanos tu negocio y la IA define una dirección de marca (paleta + tipografía + concepto), genera opciones de logo para elegir, diseña tu etiqueta y la monta en el envase para mostrarte el producto terminado.",
    icon: "Sparkles",
    stage: "crear",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
    pitch: "De una idea a logo, etiqueta y mockup del producto final.",
    preview: { kind: "image", ratio: "9/16" },
    stats: [
      { value: "340+", label: "marcas creadas" },
      { value: "4 logos", label: "por dirección" },
    ],
  },
  {
    name: "Calculadora de Costos",
    slug: "calculadora-costos",
    description:
      "Proyecta el P&G completo de tu campaña e-com y exporta el análisis a Excel.",
    longDescription:
      "Responde unas preguntas sobre tus costos, embudo (leads o mensajes) y ofertas. La calculadora arma tu estado de resultados completo — profit, márgenes, ROAS, ROI, CPA máximo y capital mínimo — y te deja exportar todo a un Excel idéntico al modelo.",
    icon: "DollarSign",
    stage: "investigar",
    tag: "Nuevo",
    tagStyle: "new",
    status: "live",
    pitch: "Sabe si tu campaña es rentable antes de gastar el primer sol.",
    preview: { kind: "image", ratio: "16/10" },
    stats: [
      { value: "P&G", label: "en 2 minutos" },
      { value: "Excel", label: "listo para exportar" },
    ],
  },
  {
    name: "Generador de Landing Pages",
    slug: "generador-landing",
    description:
      "Genera el copy y estructura completa de tu landing page de conversión.",
    longDescription:
      "Crea el contenido y la estructura de una landing page optimizada para convertir: hero, beneficios, testimonios, FAQ y CTA.",
    icon: "LayoutTemplate",
    stage: "crear",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
    pitch: "Una landing de conversión completa, sección por sección.",
    preview: { kind: "image", ratio: "9/16" },
    stats: [
      { value: "600+", label: "landings armadas" },
      { value: "8", label: "secciones por página" },
    ],
  },
];

export function getToolBySlug(slug: string): Tool | undefined {
  return tools.find((t) => t.slug === slug);
}
