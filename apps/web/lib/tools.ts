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
    ratio?: "9/16" | "2/3" | "1/1" | "4/3" | "3/2" | "16/10";
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
      "Elige una categoría y la herramienta te muestra productos físicos que se están pautando ahora mismo en LATAM, agrupados por cantidad de anuncios activos. Ves un rango a la vez y entras a la Biblioteca de Anuncios de cada anunciante con un clic.",
    icon: "PackageSearch",
    stage: "investigar",
    tag: "Nuevo",
    tagStyle: "new",
    status: "live",
    pitch: "Lo que más se está pautando en LATAM, por categoría.",
    preview: { kind: "image", ratio: "4/3" },
    stats: [
      { value: "8,900+", label: "productos analizados" },
      // 6 países LATAM: MX, CO, CL, AR, EC y PE (`COUNTRIES`, @ph/shared
      // keywords.ts). Decía "5" y además "validación LATAM", que prometía una
      // verificación de competencia que el serving actual no hace.
      { value: "6 países", label: "cobertura LATAM" },
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
      // gpt-image-2 mide 38-55 s (ver AGENTS.md); "~40s" era el piso, no el rango.
      { value: "~50s", label: "por creativo" },
    ],
  },
  {
    name: "Generador de Video Ads",
    slug: "generador-video-ads",
    description:
      "Sube un video que ya funciona y te devolvemos los clips con tu producto, con la estructura del original.",
    longDescription:
      "Empieza con un video de referencia vertical. Lo desglosamos corte por corte —qué se ve, qué se dice, cómo está encuadrado, cuánto dura cada toma— y sacamos el esqueleto de su guión: una plantilla con espacios que se completan con tu producto, tu ángulo y tu público. Con ese guión renderizamos el video en clips verticales que descargas por separado.",
    icon: "Video",
    stage: "crear",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
    pitch: "Un video que ya vende, rehecho con tu producto.",
    preview: { kind: "video", ratio: "9/16" },
    stats: [
      { value: "1 referencia", label: "video vertical obligatorio" },
      // ponytail: literal y no `LOTE_MAX_SEC` importado. Este archivo no tiene NINGÚN
      // import y su único consumidor es un componente `'use client'`; traer
      // `lib/video-ads/lotes.ts` (zod + kie + niches + personajes) al bundle del
      // navegador por un string de marketing no compensa. Si el tope del modelo
      // cambia, cambia también acá — decía 15s desde la migración a Veo, que es
      // cuando pasó a 8.
      { value: "clips de 8s", label: "descargables por separado" },
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
    // 3/2 y no 9/16: el asset pasó de un mockup vertical al board de identidad
    // (LUMINA, 1536x1024). El ratio tiene que describir el archivo — de él
    // salen el ancho del tile del marquee y el encuadre del frame.
    preview: { kind: "image", ratio: "3/2" },
    stats: [
      { value: "340+", label: "marcas creadas" },
      { value: "4 logos", label: "por dirección" },
    ],
  },
  {
    name: "Calculadora de Costos",
    slug: "calculadora-costos",
    description:
      "Proyecta el P&G completo de tu campaña de e-commerce y exporta el análisis a Excel.",
    longDescription:
      "Responde unas preguntas sobre tus costos, tu embudo (leads o mensajes) y tus ofertas. La calculadora arma tu estado de resultados completo — utilidad neta, márgenes, ROAS, ROI, CPA máximo y capital mínimo — y te deja exportar todo a un Excel idéntico al modelo.",
    icon: "DollarSign",
    stage: "investigar",
    tag: "Nuevo",
    tagStyle: "new",
    status: "live",
    pitch: "Descubre si tu campaña es rentable antes de gastar el primer sol.",
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
      "Genera tu landing page de conversión sección por sección, como imágenes listas para publicar.",
    longDescription:
      "Con tu producto, tus fotos y tu público, derivamos la identidad visual de la marca —paleta, materiales y talento— y con ella generamos cada sección de la landing como una imagen: hero, oferta, beneficios, testimonios, preguntas frecuentes, garantía y llamado final. Las revisas una por una, regeneras la que no te convenza y las descargas.",
    icon: "LayoutTemplate",
    stage: "crear",
    tag: "IA Real",
    tagStyle: "new",
    status: "live",
    pitch: "Una landing de conversión completa, sección por sección.",
    // 2:3 = el formato nativo del asset; en un marco 9:16 el cover le comía
    // los lados y partía el titular del hero.
    preview: { kind: "image", ratio: "2/3" },
    stats: [
      { value: "600+", label: "landings armadas" },
      // 8 es el CATÁLOGO de secciones (SECTION_LABELS); el usuario elige cuáles.
      { value: "8", label: "secciones para elegir" },
    ],
  },
];

// Destino de la card de un proyecto en el historial del dashboard.
// ponytail: branding nunca tuvo /sesion/[id] — su pantalla de detalle es la de
// resultado, que ya carga la sesión por ?s=. Sin esta rama la card daba 404.
// `lib/tools.test.ts` comprueba contra app/ que los cinco destinos existan.
export function sessionHref(slug: string, id: string): string {
  return slug === "generador-branding"
    ? `/tools/generador-branding/nuevo/resultado?s=${id}`
    : `/tools/${slug}/sesion/${id}`;
}

export function getToolBySlug(slug: string): Tool | undefined {
  return tools.find((t) => t.slug === slug);
}
