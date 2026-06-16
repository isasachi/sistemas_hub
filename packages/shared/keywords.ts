// Keywords seed por nicho (≥15 c/u, en las 4 direcciones del modelo original:
// síntomas · zonas · situaciones · soluciones). Para nichos NO listados aquí,
// scripts/scrape.ts genera la expansión con LLM (una vez, cacheada en
// ph_niches.keywords) — este mapa es solo el seed de los nichos fundadores.

export const NICHE_KEYWORDS: Record<string, string[]> = {
  espalda: [
    // síntomas
    'dolor espalda', 'lumbar', 'contractura', 'espalda tensa', 'postura', 'dolor cervical',
    // zonas
    'cervical', 'hombros', 'columna', 'cuello',
    // situaciones
    'trabajo oficina', 'sedentario', 'dormir mal', 'cargar peso',
    // soluciones
    'corrector postura', 'faja lumbar', 'masajeador espalda', 'parche calor', 'almohada cervical',
  ],
  acne: [
    // síntomas
    'acne', 'granitos cara', 'manchas acne', 'piel grasa', 'puntos negros', 'cicatrices acne',
    // zonas
    'poros abiertos', 'rostro manchas', 'espalda granos',
    // situaciones
    'acne adulto', 'acne hormonal', 'brote piel',
    // soluciones
    'crema acne', 'serum niacinamida', 'jabon acne', 'parche acne', 'limpiador facial', 'mascarilla acne', 'acido salicilico',
  ],
  rodilla: [
    // síntomas
    'dolor rodilla', 'rodilla inflamada', 'artrosis rodilla', 'dolor articulaciones', 'crujido rodilla',
    // zonas
    'menisco', 'dolor rotula', 'ligamentos rodilla',
    // situaciones
    'subir escaleras dolor', 'correr rodilla', 'adulto mayor articulaciones',
    // soluciones
    'rodillera', 'rodillera ortopedica', 'soporte rodilla', 'colageno articulaciones', 'crema articulaciones', 'masajeador rodilla', 'venda rodilla',
  ],
  pies: [
    // síntomas
    'dolor pies', 'fascitis plantar', 'dolor talon', 'juanetes', 'pie plano', 'callos pies',
    // zonas
    'planta pie', 'dolor tobillo', 'arco pie',
    // situaciones
    'estar de pie trabajo', 'zapatos incomodos',
    // soluciones
    'plantillas', 'plantillas ortopedicas', 'plantillas memory foam', 'separador dedos', 'calcetines compresion', 'masajeador pies', 'crema pies',
  ],
  peso: [
    // síntomas
    'bajar de peso', 'grasa abdominal', 'metabolismo lento', 'retencion liquidos', 'ansiedad comer',
    // zonas
    'abdomen plano', 'reducir cintura', 'vientre plano',
    // situaciones
    'post parto abdomen', 'sin tiempo ejercicio',
    // soluciones
    'quemador grasa', 'faja reductora', 'te detox', 'parche adelgazante', 'gel reductor', 'suplemento adelgazar', 'crema reductora',
  ],
}

// Países donde busca el scraper. PE incluido: los anunciantes peruanos SON la
// competencia local — no hace falta buscarlos aparte en tiempo real.
export const COUNTRIES = ['MX', 'CO', 'CL', 'AR', 'EC', 'PE'] as const

// Fallback del modelo original: si LATAM no da suficiente data, ampliar a US/ES.
export const FALLBACK_COUNTRIES = ['US', 'ES'] as const

// Mínimo de candidatos únicos tras la pasada LATAM para NO disparar el fallback.
export const MIN_CANDIDATES_BEFORE_FALLBACK = 30

// Seed estático del nicho, o null si no existe (→ expansión LLM en CI).
export function seedKeywords(niche: string): string[] | null {
  return NICHE_KEYWORDS[niche] ?? null
}

export const ALL_NICHES = Object.keys(NICHE_KEYWORDS)
