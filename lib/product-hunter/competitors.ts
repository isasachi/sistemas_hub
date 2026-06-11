import type { ProductRow, PeCompetitor } from './types'

// Matching determinista de competencia PE por producto (Fase 2).
//
// Antes: el análisis recibía TODOS los anunciantes PE del nicho (clínicas y
// fisios incluidos) → cualquier candidato parecía "escenario D saturado".
// Ahora: se excluyen servicios y solo se listan competidores cuyo producto
// coincide con el del candidato (tokens de nombre/keyword/creativos).
// Corre en el batch de Actions, $0 LLM.

// ─── SERVICIOS vs PRODUCTO FÍSICO ────────────────────────────────────────────

// Categorías de página de Meta que son inequívocamente servicios. OJO: las
// genéricas tipo "Health & wellness website" NO van aquí — las usan también
// tiendas de producto.
const SERVICE_CATEGORY_RX =
  /medical service|physical therapist|servicio de salud|doctor|m[eé]dico|hospital|clinic|cl[ií]nica|medical center|centro m[eé]dico|chiropractor|quiropr[aá]ctico|dentist|odont[oó]log|physiotherap|fisioterap|massage service|terapeuta|spa\b|gym|gimnasio/i

// Nombre del anunciante con pinta de servicio (fallback cuando no hay categorías)
const SERVICE_NAME_RX =
  /\b(dr|dra)\.?\s|\bdoctor(a)?\b|cl[ií]nica|fisio(terap)?|traumat[oó]log|quiropr[aá]ct|alphabiot|rehabilitaci[oó]n|consultorio|terapia|terapeuta|pod[oó]log|ortopedista|odont[oó]log|nutricionista|kinesi[oó]log|hospital|sanatorio|centro\s+(de\s+)?(salud|rehabilitaci[oó]n|diagn[oó]stico|regeneraci[oó]n)|sobador|huesero|masajista|wellness center|ozonoterapia/i

export function isLikelyService(name: string | null | undefined, categories: string[] = []): boolean {
  if (categories.some((c) => SERVICE_CATEGORY_RX.test(c))) return true
  if (name && SERVICE_NAME_RX.test(name)) return true
  return false
}

// ─── TOKENIZACIÓN ────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'para', 'con', 'las', 'los', 'del', 'que', 'por', 'una', 'uno', 'unos', 'unas',
  'mas', 'más', 'sin', 'sobre', 'este', 'esta', 'estos', 'estas', 'desde', 'hasta',
  'the', 'and', 'for', 'with', 'your', 'shop', 'store', 'tienda', 'oficial',
  'original', 'envio', 'envío', 'gratis', 'peru', 'perú', 'dolor', 'alivio',
])

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Filas que el matching necesita: nombre + raw_data. Lo cumplen tanto
// ProductRow (candidatos) como PePoolRow (pool de competidores PE).
export type PeSource = Pick<ProductRow, 'name' | 'raw_data'>

// Tokens "de producto" de una fila: nombre + títulos/bodies de creativos.
// La found_keyword NO entra: es del nicho, no del producto — un vendedor de
// colágeno y uno de rodilleras comparten "dolor rodilla" sin competir entre sí.
export function productTokens(row: PeSource): Set<string> {
  const raw = row.raw_data
  const parts: string[] = [row.name ?? '']
  for (const c of raw.creatives ?? []) {
    if (c.title) parts.push(c.title)
    if (c.body) parts.push(c.body.slice(0, 150))
  }
  const tokens = new Set<string>()
  for (const part of parts) {
    for (const t of normalize(part).split(/[^a-z0-9ñ]+/)) {
      if (t.length >= 4 && !STOPWORDS.has(t)) tokens.add(t)
    }
  }
  return tokens
}

// ─── MATCHING ────────────────────────────────────────────────────────────────

export interface PeMatchResult {
  competitors: PeCompetitor[]
  poolSize: number          // anunciantes PE del nicho en total
  servicesExcluded: number  // cuántos se excluyeron por ser servicios
}

const MAX_COMPETITORS = 10

// Filtra el pool PE a competidores del MISMO producto que el candidato.
export function matchPeCompetitors(candidate: ProductRow, pePool: PeSource[]): PeMatchResult {
  const sellers = pePool.filter(
    (p) => !isLikelyService(p.name ?? p.raw_data.advertiser_name, p.raw_data.page_categories ?? [])
  )
  const servicesExcluded = pePool.length - sellers.length

  const candTokens = productTokens(candidate)
  const candKeyword = normalize(candidate.raw_data.found_keyword ?? '')

  const matched = sellers.filter((p) => {
    // Señal fuerte: comparten tokens de producto (nombre/título de creativo)
    const theirTokens = productTokens(p)
    for (const t of theirTokens) {
      if (candTokens.has(t)) return true
    }
    // Fallback (filas viejas sin creativos): encontrados por la misma keyword
    const noCreatives = !(candidate.raw_data.creatives?.length) || !(p.raw_data.creatives?.length)
    if (noCreatives && candKeyword && normalize(p.raw_data.found_keyword ?? '') === candKeyword) return true
    return false
  })

  const competitors = matched
    .map((p) => ({
      name: p.name ?? p.raw_data.advertiser_name,
      adCount: p.raw_data.ad_count ?? 0,
    }))
    .sort((a, b) => b.adCount - a.adCount)
    .slice(0, MAX_COMPETITORS)

  return { competitors, poolSize: pePool.length, servicesExcluded }
}
