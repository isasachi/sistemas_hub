// Normalizador de consulta (spec §6). Acentos fuera, minúsculas, sin
// puntuación, espacios colapsados: "DOLOR DE MUÉLA" → "dolor de muela".
//
// Es la MISMA forma que usa `productKey.normalize` del motor viejo, repetida
// acá a propósito: aquella vive en lib/ y sirve a otro pipeline, y acoplarlos
// haría que tocar una clave de producto cambie en silencio qué se le pide a
// Meta.
export function normalizeQuery(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clave de archivo del diccionario: "dolor de muela" → "dolor_de_muela". */
export function dictionaryKey(seed: string): string {
  return normalizeQuery(seed).replace(/\s+/g, '_')
}
