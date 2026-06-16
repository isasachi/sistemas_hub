import type { NicheRow } from '@ph/shared'

// Resuelve la consulta del usuario a un nicho EXISTENTE antes de registrar uno
// nuevo (route /search). Sin esto, "rodillera" o "dolor rodilla" crean nichos
// duplicados de "rodilla" y disparan scrapes redundantes — las keywords
// expandidas del nicho (ph_niches.keywords) ya contienen esas variaciones.
//
// Diseño precision-first: solo matchea cuando la consulta CONTIENE entera una
// keyword o el id de un nicho conocido (con tolerancia singular/plural). Una
// consulta genuinamente nueva ("crema facial") no matchea y sigue el cold start
// normal. $0 LLM, corre en Vercel (solo strings sobre ~decenas de nichos).

export type NicheForMatch = Pick<NicheRow, 'id' | 'keywords'>

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

// Igualdad de tokens con tolerancia de plural (es/-s) y de derivación por raíz:
// dos tokens matchean si comparten un prefijo que cubre casi toda la palabra
// corta ("rodilla" ≈ "rodillera", "acne" ≈ "acnegenico"). Prefijo y NO substring
// libre: "peso" ⊂ "espeso" o "pies" ⊂ "espies" serían falsos positivos por
// coincidencia interna. El umbral de 4 chars + cobertura shorter-1 mantiene
// fuera pares como pies/piel (raíz común 3) o cama/camiseta.
const MIN_STEM = 4

function tokenEq(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < MIN_STEM || b.length < MIN_STEM) return false // tokens cortos: solo igualdad exacta
  if (a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`) return true
  // Raíz por prefijo común
  let p = 0
  const max = Math.min(a.length, b.length)
  while (p < max && a[p] === b[p]) p++
  return p >= MIN_STEM && p >= max - 1
}

// ¿Todos los tokens de `phrase` aparecen entre los tokens de `query`?
function phraseInQuery(phraseTokens: string[], queryTokens: string[]): boolean {
  return phraseTokens.every((pt) => queryTokens.some((qt) => tokenEq(qt, pt)))
}

// Devuelve el id del nicho existente al que corresponde la consulta, o null
// (→ cold start normal). Prioridad: id exacto > keyword exacta > keyword/id
// contenidos en la consulta. Empates: el match más específico (keyword más larga).
export function matchNiche(query: string, niches: NicheForMatch[]): string | null {
  const q = normalize(query)
  if (!q) return null
  const qTokens = q.split(' ')

  let best: { id: string; score: number; specificity: number } | null = null
  const consider = (id: string, score: number, specificity: number) => {
    if (!best || score > best.score || (score === best.score && specificity > best.specificity)) {
      best = { id, score, specificity }
    }
  }

  for (const n of niches) {
    const id = normalize(n.id)
    if (id === q) return n.id // match exacto del id — no hay nada mejor

    for (const kwRaw of n.keywords ?? []) {
      const kw = normalize(kwRaw)
      if (!kw) continue
      if (kw === q) {
        consider(n.id, 3, kw.length) // la consulta ES una keyword del nicho
        continue
      }
      const kwTokens = kw.split(' ')
      if (phraseInQuery(kwTokens, qTokens)) {
        consider(n.id, 2, kw.length) // keyword contenida en la consulta
      }
    }

    // El id del nicho (o su plural) contenido en la consulta: "dolor de rodilla" → rodilla
    if (phraseInQuery(id.split(' '), qTokens)) {
      consider(n.id, 2, id.length)
    }
  }

  return best ? (best as { id: string }).id : null
}
