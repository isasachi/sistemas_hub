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
const TIENE_HUECO = () => /\[[^\]]*\]/

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

/**
 * ¿La versión B TRANSCRIBIÓ la referencia en vez de rellenarla?
 *
 * ⚠️ EL FALLO QUE ESTO CAZA, medido en una sesión real: la referencia era un antes/después de peso
 * y salud, el producto del usuario unas gomitas de creatina para glúteos, y B devolvió
 * *"PANZA HINCHADA, INSOMNIO, CANSANCIO, ANTOJOS"* y *"7 KILOS MENOS DE CORTISOL EN 30 DÍAS"* —
 * el copy de la otra marca, palabra por palabra, listo para imprimirse en el anuncio del usuario.
 *
 * ⚠️ `scaffoldFidelity` NO puede verlo, y no por un descuido: mide qué fracción del ANDAMIAJE
 * sobrevive, y en esa sesión el template era `"[PROBLEMAS DE FORMA FÍSICA]"` — el slot entero
 * entre corchetes, sin andamiaje. Devuelve `null` ("no medible") justo en el caso donde el modelo
 * falla, porque un slot que es 100 % dato no tiene nada que preservar. Las dos mitades hacen falta:
 * aquella vigila que la estructura NO cambie, ésta que los datos SÍ.
 *
 * ⚠️ LA EXCEPCIÓN SE DEFINE POR EL TEMPLATE, NO POR LOS CORCHETES. Un slot sin dato del producto
 * —un CTA pelado como "COMPRAR AHORA"— *es* su propio template y copiarlo igual es lo CORRECTO;
 * ahí `text === source` no es un fallo. La primera versión de esto preguntaba "¿el template tiene
 * corchetes?", y eso deja un hueco: medido, el modelo a veces devuelve como template una
 * DESCRIPCIÓN ("Listado de síntomas negativos contra beneficios positivos") en vez de una
 * plantilla — sin corchetes, así que el guard se callaba aunque el texto fuera el de la otra marca.
 * La pregunta correcta es si el modelo declaró que ese slot se copia tal cual.
 */
export function transcribeLaReferencia(el: { text: string; template?: string | null; source?: string | null }): boolean {
  const { text, template, source } = el
  if (!source) return false // sin la transcripción no hay con qué comparar; no se juzga
  const igual = (a: string, b: string) => palabras(a).join(' ') === palabras(b).join(' ')
  if (template && igual(template, source)) return false // "se copia unchanged", declarado
  return igual(text, source)
}
