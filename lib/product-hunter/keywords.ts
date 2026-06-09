// Keywords por nicho que el scraper usa para buscar en Meta Ads Library.
// Para agregar un nicho nuevo: añadir su entrada aquí y correr el scraper una vez.

export const NICHE_KEYWORDS: Record<string, string[]> = {
  espalda: ['dolor espalda', 'lumbar', 'faja lumbar', 'masajeador espalda', 'corrector postura', 'dolor cervical'],
  acne: ['acne', 'granitos cara', 'manchas acne', 'crema acne', 'rutina acne'],
  rodilla: ['dolor rodilla', 'rodillera', 'rodilla articulacion', 'dolor articulaciones'],
  pies: ['dolor pies', 'plantillas', 'fascitis plantar', 'plantillas ortopedicas'],
  peso: ['bajar de peso', 'perder peso', 'quemador grasa', 'suplemento adelgazar'],
}

// Países donde busca el scraper. PE incluido: los anunciantes peruanos SON la
// competencia local — no hace falta buscarlos aparte en tiempo real.
export const COUNTRIES = ['MX', 'CO', 'CL', 'AR', 'EC', 'PE'] as const

export function loadKeywords(niche: string): string[] {
  return NICHE_KEYWORDS[niche] ?? [niche]
}

export const ALL_NICHES = Object.keys(NICHE_KEYWORDS)
