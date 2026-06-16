/**
 * Guard off-topic determinista — backstop léxico contra productos fuera de categoría.
 *
 * Complementa el descarte LLM (Paso 1 del prompt). Solo rechaza cuando
 * hay CERO solapamiento léxico/semántico entre el producto y la categoría buscada.
 * Es conservador a propósito: si falta información → deja pasar (el LLM ya filtró).
 *
 * Módulo puro (sin I/O) — fácil de testear.
 */

// ─── Stopwords (español + inglés básico) ─────────────────────────────────────

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'del', 'un', 'una', 'unos', 'unas',
  'para', 'con', 'por', 'sin', 'en', 'al', 'que', 'y', 'o', 'a', 'e',
  'su', 'sus', 'mi', 'tu', 'se', 'es', 'son', 'fue', 'ser', 'the', 'for',
  'and', 'with', 'to', 'of', 'in', 'on', 'at', 'by',
])

// ─── Sinónimos curados (categoría → términos relacionados) ───────────────────

const SYNONYMS: Record<string, string[]> = {
  rodilla:   ['rodillera', 'knee', 'articulacion', 'articulaciones', 'menisco', 'ligamento'],
  rodillera: ['rodilla', 'knee', 'articulacion'],
  espalda:   ['lumbar', 'columna', 'corse', 'faja', 'back'],
  mascota:   ['mascotas', 'perro', 'gato', 'can', 'felino', 'pet', 'canino'],
  mascotas:  ['mascota', 'perro', 'gato', 'can', 'felino', 'pet', 'canino'],
  cocina:    ['kitchen', 'utensilio', 'utensilios', 'cocinar', 'culinario'],
  piel:      ['dermis', 'cutis', 'facial', 'skin', 'acne', 'antienvejecimiento'],
  fitness:   ['gym', 'gimnasio', 'ejercicio', 'musculo', 'deporte', 'entreno'],
  bebe:      ['bebe', 'infante', 'lactante', 'neonato', 'infantil', 'baby'],
  pelo:      ['cabello', 'capilar', 'hair', 'cabellos'],
  cabello:   ['pelo', 'capilar', 'hair'],
  pie:       ['pies', 'plantar', 'podal', 'foot', 'feet', 'talon', 'talones'],
  pies:      ['pie', 'plantar', 'podal', 'foot', 'feet', 'talon', 'talones'],
}

// ─── Tokenizador ──────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  const tokens = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  return new Set(tokens)
}

function expandWithSynonyms(tokens: Set<string>): Set<string> {
  const expanded = new Set(tokens)
  for (const t of tokens) {
    const syns = SYNONYMS[t]
    if (syns) syns.forEach((s) => expanded.add(s))
  }
  return expanded
}

function hasPrefixMatch(needles: Set<string>, haystack: Set<string>): boolean {
  for (const n of needles) {
    if (n.length < 4) continue
    for (const h of haystack) {
      if (h.startsWith(n) || n.startsWith(h)) return true
    }
  }
  return false
}

// ─── API pública ──────────────────────────────────────────────────────────────

type Creative = { body: string | null; title: string | null; cta: string | null; link: string | null }

/**
 * Devuelve `true` si el producto parece estar fuera de la categoría buscada.
 * Conservador: solo rechaza cuando hay CERO solapamiento léxico/semántico.
 * Si los tokens de la categoría/keyword están vacíos → devuelve false (no se puede juzgar).
 */
export function isOffTopic(
  productName: string,
  creatives:   Creative[],
  category:    string,
  keyword:     string,
): boolean {
  const creativeText = creatives
    .flatMap((c) => [c.title, c.body, c.cta].filter(Boolean))
    .join(' ')
  const haystackRaw = tokenize(`${productName} ${creativeText}`)

  const needlesRaw = tokenize(`${category} ${keyword}`)
  if (needlesRaw.size === 0) return false

  const needles  = expandWithSynonyms(needlesRaw)
  const haystack = haystackRaw

  for (const n of needles) {
    if (haystack.has(n)) return false
  }

  if (hasPrefixMatch(needles, haystack)) return false

  return true
}
