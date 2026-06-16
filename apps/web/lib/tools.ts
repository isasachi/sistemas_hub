export interface Tool {
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  icon: string; // Lucide icon name
  accentColor: string;
  tag: string;
  tagStyle: "brand" | "new" | "utility" | "neutral";
  featured?: boolean;
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
    accentColor: "#ff9c4d",
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
    accentColor: "#ff9c4d",
    tag: "IA Real",
    tagStyle: "new",
    featured: true,
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
    accentColor: "#ff9c4d",
    tag: "Pronto",
    tagStyle: "neutral",
    status: "soon",
  },
  {
    name: "Generador de Branding",
    slug: "generador-branding",
    description:
      "Paleta de colores, naming, voz de marca y guías visuales para tu negocio.",
    longDescription:
      "Define la identidad visual y verbal de tu marca: nombre, colores, tipografía, tono de comunicación y guía de estilo completa.",
    icon: "Sparkles",
    accentColor: "#ff9c4d",
    tag: "Pronto",
    tagStyle: "neutral",
    status: "soon",
  },
  {
    name: "Calculadora de Costos",
    slug: "calculadora-costos",
    description:
      "Estima tu presupuesto de campañas y proyecta el ROI esperado.",
    longDescription:
      "Calcula el presupuesto óptimo para tus campañas digitales y proyecta métricas clave como CPC, CPM, conversiones y retorno esperado.",
    icon: "DollarSign",
    accentColor: "#ff9c4d",
    tag: "Pronto",
    tagStyle: "neutral",
    status: "soon",
  },
  {
    name: "Generador de Landing Pages",
    slug: "generador-landing",
    description:
      "Genera el copy y estructura completa de tu landing page de conversión.",
    longDescription:
      "Crea el contenido y la estructura de una landing page optimizada para convertir: hero, beneficios, testimonios, FAQ y CTA.",
    icon: "LayoutTemplate",
    accentColor: "#ff9c4d",
    tag: "Pronto",
    tagStyle: "neutral",
    status: "soon",
  },
];

export function getToolBySlug(slug: string): Tool | undefined {
  return tools.find((t) => t.slug === slug);
}
