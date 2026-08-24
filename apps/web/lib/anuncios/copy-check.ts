// Verifica que la VERSIÓN B siga siendo una plantilla rellenada y no otra reescritura libre.
//
// B se construye en tres etapas: transcribir el texto literal de la referencia, convertirlo en
// plantilla marcando SOLO el dato específico (`[problema común] que no se va`) y rellenar el hueco.
// El andamiaje —lo que queda fuera de los corchetes— se copia literal, así que si desaparece del
// texto final el modelo no templó: redactó, y entonces B es A con otro nombre.
//
// La única excepción legítima al copiado literal es la neutralización de expresiones no peruanas
// ("si sos… para vos" → "si eres… para ti"), que cambia una o dos palabras del andamiaje. Por eso
// esto NO es contención literal sino fidelidad por palabra, con el mismo criterio que
// `acceptRewrite` de video-ads: una reescritura que pasa el filtro no es de las que derivan.

const HUECO = /\[[^\]]*\]/g

function palabras(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Palabras del andamiaje del template (todo lo que NO está entre corchetes). */
function andamiaje(template: string): string[] {
  return palabras(template.replace(HUECO, ' '))
}

/**
 * Fracción del andamiaje del template que sobrevive en el texto final.
 * `null` = no medible: un template sin andamiaje (`[titular]` a secas) o con menos de 3 palabras
 * fuera de los corchetes, donde neutralizar un regionalismo puede tumbar la medida entera.
 */
export function scaffoldFidelity(template: string, text: string): number | null {
  const scaffold = andamiaje(template)
  // ponytail: piso de 3 palabras; si aparecen falsos positivos, medir contra el original del slot.
  if (scaffold.length < 3) return null
  const enTexto = new Set(palabras(text))
  const vivas = scaffold.filter((w) => enTexto.has(w)).length
  return vivas / scaffold.length
}

/** Por debajo de esto, B dejó de ser una plantilla rellenada. */
export const FIDELIDAD_MIN = 0.7
