import type { NicheId, DemographicId } from './types'

// ─── Anexo A — Tipografía por niche_id ───────────────────────────────────────
// `font_accent` solo se usa en el titular de hero_problem y offer, nunca en cuerpo/cards.
export const NICHE_TYPOGRAPHY: Record<NicheId, { font_family: string; font_accent: string | null }> = {
  supplement_skin_female: { font_family: 'Poppins', font_accent: null },
  skincare_topical: { font_family: 'Inter', font_accent: 'Playfair Display' },
  haircare: { font_family: 'Gilroy', font_accent: null },
  fitness_weightloss: { font_family: 'Montserrat', font_accent: 'Anton' },
  supplement_male_performance: { font_family: 'Oswald', font_accent: 'Archivo Black' },
  joint_mobility: { font_family: 'Source Sans 3', font_accent: null },
  intimate_wellness: { font_family: 'Recoleta', font_accent: null },
  herbal_natural: { font_family: 'Nunito Sans', font_accent: 'Lora' },
  baby_maternity: { font_family: 'Quicksand', font_accent: 'Baloo' },
  pets: { font_family: 'Nunito', font_accent: 'Fredoka' },
  home_cleaning: { font_family: 'Work Sans', font_accent: null },
  tech_gadgets: { font_family: 'Space Grotesk', font_accent: 'Chakra Petch' },
  kitchen_tools: { font_family: 'Poppins', font_accent: 'Lora' },
  jewelry_fashion: { font_family: 'Futura', font_accent: 'Cormorant Garamond' },
  automotive: { font_family: 'Rajdhani', font_accent: 'Titillium' },
  generic: { font_family: 'Poppins', font_accent: null },
}

// Anexo A, columna "Nombre legible (UI)".
export const NICHE_LABELS: Record<NicheId, string> = {
  supplement_skin_female: 'Suplemento belleza / piel',
  skincare_topical: 'Skincare / cosmética',
  haircare: 'Cuidado capilar',
  fitness_weightloss: 'Fitness / pérdida de peso',
  supplement_male_performance: 'Suplemento masculino',
  joint_mobility: 'Articulaciones / movilidad',
  intimate_wellness: 'Bienestar íntimo',
  herbal_natural: 'Herbal / natural',
  baby_maternity: 'Bebé / maternidad',
  pets: 'Mascotas',
  home_cleaning: 'Hogar / limpieza',
  tech_gadgets: 'Tecnología / gadgets',
  kitchen_tools: 'Cocina / utensilios',
  jewelry_fashion: 'Joyería / moda',
  automotive: 'Automotriz',
  generic: 'Otro',
}

// ─── Anexo C — Partículas, props y hue por niche_id ─────────────────────────
// `halo` y `particle_density` NO están tabulados en el spec (Anexo C solo da hue/partículas/
// props): son elección de diseño de esta implementación, no transcripción literal.
//   halo: radial_soft = belleza/salud/bebé/íntimo/herbal · backlight = fitness/masculino ·
//         rim = tech/automotriz/joyería · none = hogar/mascotas/cocina/genérico.
//   particle_density: low = técnicos/masculinos · high = belleza/limpieza/bebé · medium = resto
//   (spec 0.b C).
export const NICHE_FALLBACK: Record<
  NicheId,
  {
    hue: number
    particles: string
    particle_density: 'low' | 'medium' | 'high'
    propsFamily: string
    halo: 'radial_soft' | 'rays' | 'backlight' | 'rim' | 'none'
  }
> = {
  supplement_skin_female: {
    hue: 210,
    particles: 'Burbujas translúcidas y destellos sobre agua',
    particle_density: 'high',
    propsFamily: 'Raíz o flor del ingrediente, hojas, cápsulas sueltas, molécula 3D',
    halo: 'radial_soft',
  },
  skincare_topical: {
    hue: 340,
    particles: 'Gotas de agua, vapor suave, pétalos flotando',
    particle_density: 'high',
    propsFamily: 'Gotas de sérum, pétalos, cristales, textura de crema',
    halo: 'radial_soft',
  },
  haircare: {
    hue: 35,
    particles: 'Motas doradas, brillos capilares',
    particle_density: 'high',
    propsFamily: 'Gotero con aceite, semillas, hojas',
    halo: 'radial_soft',
  },
  fitness_weightloss: {
    hue: 20,
    particles: 'Chispas de energía, polvo en suspensión, trazos de movimiento',
    particle_density: 'low',
    propsFamily: 'Scoop de polvo, cítricos, cinta métrica, cápsulas',
    halo: 'backlight',
  },
  supplement_male_performance: {
    hue: 355,
    particles: 'Partículas tipo brasa, humo tenue, esquirlas',
    particle_density: 'low',
    propsFamily: 'Raíz de maca, cápsulas oscuras, textura de piedra',
    halo: 'backlight',
  },
  joint_mobility: {
    hue: 175,
    particles: 'Destellos suaves, partículas cálidas',
    particle_density: 'medium',
    propsFamily: 'Cápsulas, raíz de cúrcuma, estructura ósea 3D',
    halo: 'radial_soft',
  },
  intimate_wellness: {
    hue: 340,
    particles: 'Pétalos, bruma suave, destellos tenues',
    particle_density: 'medium',
    propsFamily: 'Pétalos, tejido de seda, cápsulas',
    halo: 'radial_soft',
  },
  herbal_natural: {
    hue: 120,
    particles: 'Esporas, polvo de luz, hojas cayendo',
    particle_density: 'medium',
    propsFamily: 'Planta fresca, mortero, semillas, miel',
    halo: 'radial_soft',
  },
  baby_maternity: {
    hue: 195,
    particles: 'Motas suaves, plumas, pompas de jabón',
    particle_density: 'high',
    propsFamily: 'Textil de algodón, sonajero, flor blanca',
    halo: 'radial_soft',
  },
  pets: {
    hue: 140,
    particles: 'Pelusas, motas de luz, hojas',
    particle_density: 'medium',
    propsFamily: 'Croquetas, juguete, huella en relieve, hojas',
    halo: 'none',
  },
  home_cleaning: {
    hue: 185,
    particles: 'Burbujas de espuma, gotas, brillos de superficie',
    particle_density: 'high',
    propsFamily: 'Espuma, paño, superficie reflectante, gotas',
    halo: 'none',
  },
  tech_gadgets: {
    hue: 225,
    particles: 'Partículas geométricas, líneas de circuito, bokeh frío',
    particle_density: 'low',
    propsFamily: 'Cable, superficie mate, punto de luz LED',
    halo: 'rim',
  },
  kitchen_tools: {
    hue: 15,
    particles: 'Vapor, motas de harina, chispas de aceite',
    particle_density: 'medium',
    propsFamily: 'Ingredientes crudos, tabla de madera, hierbas',
    halo: 'none',
  },
  jewelry_fashion: {
    hue: 45,
    particles: 'Destellos, bokeh cálido',
    particle_density: 'medium',
    propsFamily: 'Terciopelo, espejo, estuche',
    halo: 'rim',
  },
  automotive: {
    hue: 215,
    particles: 'Partículas metálicas, polvo, gotas',
    particle_density: 'low',
    propsFamily: 'Herramienta, superficie metálica, gota de aceite',
    halo: 'rim',
  },
  generic: {
    hue: 210,
    particles: 'Motas de luz suaves, bokeh neutro',
    particle_density: 'medium',
    propsFamily: 'Formato de consumo del producto + 2 ingredientes literales',
    halo: 'none',
  },
}

// ─── Anexo B.0 — Demografía por defecto según niche_id ──────────────────────
export const NICHE_DEFAULT_DEMOGRAPHIC: Record<NicheId, DemographicId> = {
  supplement_skin_female: 'female_18_30',
  skincare_topical: 'female_18_30',
  haircare: 'female_18_30',
  intimate_wellness: 'female_30_45',
  herbal_natural: 'female_30_45',
  baby_maternity: 'female_30_45',
  joint_mobility: 'senior_55_plus',
  fitness_weightloss: 'male_20_35',
  supplement_male_performance: 'male_35_55',
  pets: 'no_talent',
  home_cleaning: 'no_talent',
  tech_gadgets: 'no_talent',
  kitchen_tools: 'no_talent',
  automotive: 'no_talent',
  jewelry_fashion: 'female_18_30',
  generic: 'female_30_45',
}
