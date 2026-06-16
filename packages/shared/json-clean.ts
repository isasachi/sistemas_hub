// Sanitización de strings para columnas jsonb/text de Postgres.
//
// Los textos de anuncios de Meta vienen llenos de emojis (pares sustitutos
// UTF-16). Truncarlos (slice) puede partir un par y dejar un "lone surrogate":
// JSON.stringify lo serializa como \udXXX suelto y Postgres rechaza el insert
// con `invalid input syntax for type json`. Postgres tampoco acepta el escape
// \u0000 en jsonb/text. Esto se aplica a TODO lo que el scraper/validador
// escribe en jsonb (raw_data, analysis).

export function cleanJsonText(s: string): string {
  return s
    .replace(/\u0000/g, '')
    // high surrogate sin su low surrogate a continuación
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    // low surrogate sin un high surrogate antes
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

// Limpia recursivamente cualquier string dentro del valor (objetos, arrays).
export function sanitizeJsonDeep<T>(value: T): T {
  if (typeof value === 'string') return cleanJsonText(value) as T
  if (Array.isArray(value)) return value.map((v) => sanitizeJsonDeep(v)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [cleanJsonText(k), sanitizeJsonDeep(v)])
    ) as T
  }
  return value
}
