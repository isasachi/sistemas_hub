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
  // preview: qué sneak peek renderiza <ToolPreview>. Todos son mini-renders
  // HTML/SVG con datos de muestra (assets del sistema de diseño — no JPGs),
  // uno por tool: anuncio · branding · landing · buscador · calculadora.
  preview?: {
    kind: "anuncio" | "branding" | "landing" | "buscador" | "calculadora";
    ratio?: "9/16" | "1/1" | "4/3";
  };
  // stats: chips hardcodeados por tool. TODO wire: ver lib/home/stats.ts
  stats?: { value: string; label: string }[];
}

export const tools: Tool[] = [
  {
    name: "Buscador de Productos",
    slug: "buscador-productos",
    description:
      "Encuentra productos ganadores validados en LATAM que aún no están saturados en Perú.",
    longDescription:
      "Escribe un nicho y la herramienta te muestra productos que ya están funcionando en México, Colombia, Chile, Argentina y Ecuador, con su situación de competencia real en Perú y señales de validación (anuncios activos, días corriendo).",
    icon: "PackageSearch",
    stage: "investigar",
    tag: "Nuevo",
    tagStyle: "new",
    status: "live",
    pitch: "Productos que ya venden en LATAM y aún nadie pauta en Perú.",
    preview: { kind: "buscador" },
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
    preview: { kind: "anuncio", ratio: "9/16" },
    stats: [
      { value: "1,200+", label: "anuncios generados" },
      { value: "~40s", label: "por creativo" },
    ],
  },
  {
    name: "Generador de Video Ads",
    slug: "generador-video-ads",
    description:
      "Scripts y estructura para video ads que convierten en redes sociales.",
    longDescription:
      "Crea scripts profesionales para videos publicitarios con gancho, desarrollo y llamada a la acción optimizados para cada plataforma.",
    icon: "Video",
    stage: "crear",
    tag: "Pronto",
    tagStyle: "neutral",
    status: "soon",
    pitch: "Scripts con gancho, desarrollo y CTA para tus video ads.",
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
    preview: { kind: "branding", ratio: "1/1" },
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
    preview: { kind: "calculadora" },
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
    preview: { kind: "landing", ratio: "9/16" },
    stats: [
      { value: "600+", label: "landings armadas" },
      { value: "8", label: "secciones por página" },
    ],
  },
];

export function getToolBySlug(slug: string): Tool | undefined {
  return tools.find((t) => t.slug === slug);
}
