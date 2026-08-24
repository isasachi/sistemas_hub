// Normalizador de consulta (spec §6). Acentos fuera, minúsculas, sin
// puntuación, espacios colapsados: "DOLOR DE MUÉLA" → "dolor de muela".
//
// Es la MISMA forma que usa `productKey.normalize` del motor viejo, repetida
// acá a propósito: aquella vive en lib/ y sirve a otro pipeline, y acoplarlos
// haría que tocar una clave de producto cambie en silencio qué se le pide a
// Meta.
export function normalizeQuery(input: string): string {
  return input
    // ⚠️ NFKD, NO NFD — y la diferencia la puso el copy de los anuncios. Meta
    // está lleno de falsa negrita hecha con el bloque Unicode matemático
    // (`Piel Impecable`, `Tienda Oficial` escritos con esos code points), que
    // `NFD` deja intacto porque no son letras acentuadas sino caracteres
    // distintos. Así entraron 8 términos al vocabulario que buscaban
    // literalmente esos caracteres y nunca podían coincidir con copy normal.
    // `NFKD` los pliega a ASCII y de paso normaliza ligaduras y anchos
    // completos.
    //
    // ⚠️ NO toca la clave de dedupe: esa usa `normalizeText`
    // (normalization/text.ts), otro módulo, y cambiarla reescribiría claves ya
    // guardadas. Tampoco renombra diccionarios: `dictionaryKey` cuelga de acá,
    // pero los 164 archivos en disco son ASCII y para ASCII NFKD ≡ NFD
    // (verificado antes de cambiarlo).
    .normalize('NFKD')
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
