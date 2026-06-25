export interface Tool {
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  icon: string; // Lucide icon name
  tag: string;
  tagStyle: "brand" | "new" | "utility" | "neutral";
  status: "live" | "soon"; // "soon" = muestra <ComingSoon> al abrir su view
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
    tag: "Nuevo",
    tagStyle: "new",
    status: "live",
  },
  {
    name: "Generador de Anuncios",
    slug: "generador-anuncios",
    description:
      "Replica cualquier anuncio con tu producto usando IA real. Sube una referencia y la IA genera tu imagen al instante.",
    longDescription:
      "Carga un anuncio de referencia y la foto de tu producto. La IA analiza la composición, estilo y copy, luego genera un nuevo anuncio con tu marca — fiel al original pero 100% tuyo.",
    icon: "ImagePlus",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
  },
  {
    name: "Generador de Video Ads",
    slug: "generador-video-ads",
    description:
      "Scripts y estructura para video ads que convierten en redes sociales.",
    longDescription:
      "Crea scripts profesionales para videos publicitarios con gancho, desarrollo y llamada a la acción optimizados para cada plataforma.",
    icon: "Video",
    tag: "Pronto",
    tagStyle: "neutral",
    status: "soon",
  },
  {
    name: "Generador de Branding",
    slug: "generador-branding",
    description:
      "Crea la identidad de tu marca: dirección, logo, etiqueta y mockup del producto final.",
    longDescription:
      "Cuéntanos tu negocio y la IA define una dirección de marca (paleta + tipografía + concepto), genera opciones de logo para elegir, diseña tu etiqueta y la monta en el envase para mostrarte el producto terminado.",
    icon: "Sparkles",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
  },
  {
    name: "Calculadora de Costos",
    slug: "calculadora-costos",
    description:
      "Proyecta el P&G completo de tu campaña e-com y exporta el análisis a Excel.",
    longDescription:
      "Responde unas preguntas sobre tus costos, embudo (leads o mensajes) y ofertas. La calculadora arma tu estado de resultados completo — profit, márgenes, ROAS, ROI, CPA máximo y capital mínimo — y te deja exportar todo a un Excel idéntico al modelo.",
    icon: "DollarSign",
    tag: "Nuevo",
    tagStyle: "new",
    status: "live",
  },
  {
    name: "Generador de Landing Pages",
    slug: "generador-landing",
    description:
      "Genera el copy y estructura completa de tu landing page de conversión.",
    longDescription:
      "Crea el contenido y la estructura de una landing page optimizada para convertir: hero, beneficios, testimonios, FAQ y CTA.",
    icon: "LayoutTemplate",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
  },
];

export function getToolBySlug(slug: string): Tool | undefined {
  return tools.find((t) => t.slug === slug);
}
