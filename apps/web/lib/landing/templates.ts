// Catálogo de plantillas visuales, destiladas de landings de referencia (ecom-magic).
// `style` se inyecta en buildSectionInstruction para teñir TODAS las secciones con
// esa estética. `thumb` es un placeholder GENERADO por nosotros (genérico, sin marca
// ni producto de la referencia) → se muestra en la UI sin problema de copyright.

export interface LandingTemplate {
  id: string
  label: string
  style: string
  thumb: string
}

export const TEMPLATES: LandingTemplate[] = [
  {
    id: 'wellness-dark',
    label: 'Wellness oscuro',
    style: 'Dark near-black background, warm gold/amber single accent color, high contrast. Glossy product hero, thin line-art benefit icons, subtle natural/botanical motifs. Premium, calm, trustworthy.',
    thumb: '/templates/wellness-dark.jpg',
  },
  {
    id: 'sport-blue',
    label: 'Deportivo azul',
    style: 'Energetic athletic style, deep blue and white, gym/training background with athletes in motion. Bold uppercase headings, price packs with struck-through "antes" prices, round performance badges. High energy, masculine-neutral.',
    thumb: '/templates/sport-blue.jpg',
  },
  {
    id: 'industrial',
    label: 'Industrial',
    style: 'Rugged industrial style, matte black with safety-yellow single accent, workshop/construction setting. Heavy bold uppercase type, strong high-contrast lighting, tools and toolboxes. Tough, professional, masculine.',
    thumb: '/templates/industrial.jpg',
  },
  {
    id: 'feminine-pink',
    label: 'Femenino rosa',
    style: 'Soft feminine style, blush pink and magenta palette, floral accents and spa-like calm scenes. Clean rounded white cards, gentle elegant typography. Intimate, reassuring, premium-soft.',
    thumb: '/templates/feminine-pink.jpg',
  },
  {
    id: 'vital-green',
    label: 'Salud verde lima',
    style: 'Active-health style, lime-green and black with angular geometric shapes and energy/lightning motifs. Active healthy adults, dynamic diagonal layout. Vital, modern, energetic.',
    thumb: '/templates/vital-green.jpg',
  },
  {
    id: 'wellness-magenta',
    label: 'Bienestar claro',
    style: 'Bright clean style, white/light background with vivid magenta-fuchsia accent. Fitness lifestyle scenes, rounded price packs, trust/payment badges. Fresh, optimistic, approachable.',
    thumb: '/templates/wellness-magenta.jpg',
  },
  {
    id: 'kids-adventure',
    label: 'Aventura infantil',
    style: 'Playful kids style, jungle/adventure greens with vibrant pops of color, fun rounded chunky typography, a child enjoying the product. Cheerful, imaginative, family-friendly.',
    thumb: '/templates/kids-adventure.jpg',
  },
]

export const TEMPLATE_BY_ID: Record<string, LandingTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t])
)
