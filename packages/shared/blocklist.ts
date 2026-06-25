// Términos que NO son nichos de producto válidos: typos / genéricos demasiado
// amplios, y anatomía sexual/explícita (contenido sensible para ads). Fuente
// ÚNICA compartida web+worker (pura, sin deps — vive en @ph/shared como
// keywords.ts / prescore.ts). La consumen:
//   · apps/worker/scripts/clean-niches.ts → marca status='blocked' cada 12h
//   · apps/web .../search → rechaza el término en el cold-start (no lo crea)
// Editar acá: el cambio aplica al barrido y al guard a la vez.

// Genéricos/typos: SOLO match EXACTO del id. "agua" se bloquea, pero
// "agua micelar" / "filtro de agua" (nichos reales) NO — por eso exacto, no token.
const EXACT = new Set([
  'oidp', 'agua', 'peso', 'grasa', 'hogar', 'limpieza', 'bebidas', 'sangre',
  'conductos deferentes',
])

// Anatomía sexual/explícita: match por palabra (\b) sobre el id normalizado.
// Stems inequívocos — ningún nicho legítimo los contiene como palabra, así que
// cubre variaciones ("dolor de pene", "vagina seca") sin falsos positivos:
// \bano\b NO matchea "mano" / "verano" / "pie plano" (no hay borde de palabra).
const SEXUAL =
  /\b(vulva|vagina|pene|prepucio|glande|escroto|testiculos?|epididimo|clitoris|semen|esperma|ano|coito|masturba|porno)\b/

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function isBlocked(niche: string): boolean {
  const n = normalize(niche)
  return EXACT.has(n) || SEXUAL.test(n)
}
