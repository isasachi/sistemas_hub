import { z } from 'zod'

// Helpers puros de recorte, extraídos de `gemini.ts` al cablear el primer recurso a KIE
// (2026-08-25). Viven en un módulo HOJA (solo zod) porque los necesita `kie-gemini.ts`, y
// `gemini.ts` importa a ese: dejarlos allá era un ciclo. `gemini.ts` los re-exporta, así que sus
// importadores no cambiaron. Mismo criterio que `lib/body-focus.ts`.

/**
 * Recorta a `max` sin dejar basura VISIBLE ni SEMÁNTICA.
 *
 * Empezó cortando a secas y dejaba palabras partidas ("Sient.", "absor…"), así que pasó a cortar
 * en límite de palabra. ⚠️ Pero eso no alcanza cuando el texto son VARIAS FRASES: medido en una
 * landing real, un titular de cierre de tres frases quedó en exactamente 90 caracteres —el tope
 * del schema— terminando en *"…Un placer saludable para su día a día. Hazlo 5"*. "Hazlo 5" es
 * un muñón: entero como palabra, sin sentido como frase, y se imprimió dentro de la imagen.
 *
 * Por eso el corte prefiere el LÍMITE DE FRASE: si al recortar queda un punto (o un ! / ?) pasada
 * la mitad del cupo, se corta ahí y la frase incompleta se cae entera. Solo si no hay ninguno se
 * cae al límite de palabra, que es el comportamiento anterior.
 */
export function sliceToWord(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)

  // Fin de frase = puntuación seguida de espacio/salto, o al final del recorte. ⚠️ Un SALTO DE
  // LÍNEA cuenta igual aunque no lleve puntuación: los titulares multilínea del ADN ("headline: 3
  // líneas") vienen como líneas sueltas sin punto, y medido dejaban el muñón *"¡No te quedes a"*.
  const finFrase = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '),
    cut.lastIndexOf('.\n'), cut.lastIndexOf('!\n'), cut.lastIndexOf('?\n'))
  const corte = Math.max(finFrase >= 0 ? finFrase + 1 : -1, cut.lastIndexOf('\n'))
  if (corte > max * 0.5) return cut.slice(0, corte).replace(/[\s\n]+$/, '')

  const lastSpace = cut.lastIndexOf(' ')
  const porPalabra = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut
  return porPalabra.replace(/[\s,;:.–—-]+$/, '')
}

function valueAtPath(obj: unknown, path: readonly (string | number | symbol)[]): unknown {
  return path.reduce<unknown>((o, k) => (o == null ? o : (o as Record<string | number, unknown>)[k as string | number]), obj)
}

/**
 * Gemini IGNORA los `maxLength` del schema y devuelve strings más largos que el `.max()` de zod.
 * Los `.max()` de copy son una defensa contra texto largo, no una validación dura: se recortan los
 * 'too_big' y se reintenta el PARSE (no la llamada). Solo toca strings.
 */
export function clampTooBigStrings(obj: unknown, error: z.ZodError): boolean {
  let changed = false
  for (const issue of error.issues) {
    if (issue.code !== 'too_big' || typeof issue.maximum !== 'number' || issue.path.length === 0) continue
    const parent = valueAtPath(obj, issue.path.slice(0, -1))
    const key = issue.path[issue.path.length - 1] as string | number
    const cur = parent == null ? undefined : (parent as Record<string | number, unknown>)[key]
    if (typeof cur !== 'string' || cur.length <= issue.maximum) continue
    ;(parent as Record<string | number, unknown>)[key] = sliceToWord(cur, issue.maximum)
    changed = true
  }
  return changed
}

/**
 * ⚠️ EL REINTENTO ERA CIEGO, Y POR ESO NO ARREGLABA NADA. Los tres intentos mandaban el MISMO
 * prompt: el modelo nunca se enteraba de que se había pasado, así que devolvía lo mismo y el
 * recorte del último intento seguía siendo el que decidía. Medido en la landing de snacks, ya con
 * el recorte movido al final: `cta-final.headline` y `testimonios.headline` volvieron los 3
 * intentos por encima del tope y salieron amputados igual.
 *
 * Devuelve la corrección que se le agrega al prompt del siguiente intento, o null si el fallo no
 * es de largo (ahí reintentar con la misma orden es lo correcto).
 */
export function correccionDeLargo(error: z.ZodError): string | null {
  const largos = error.issues.filter((i) => i.code === 'too_big' && typeof i.maximum === 'number' && i.path.length)
  if (!largos.length) return null
  const filas = largos.map((i) => `  - "${i.path.join('.')}": máximo ${(i as { maximum: number }).maximum} caracteres`)
  return [
    'CORRIGE EL LARGO (obligatorio) — tu respuesta anterior se pasó del tope en estos campos:',
    ...filas,
    'Reescríbelos MÁS CORTOS y con TODAS las frases completas. No los cortes a mitad de frase:',
    'quita una idea entera antes que dejar una frase por la mitad.',
  ].join('\n')
}

/**
 * ⚠️ EL FALLO DE PRODUCCIÓN NO ES EL DE GEMINI, Y EL CLAMP NO LO VE.
 *
 * Gemini IGNORA los `maxLength` y devuelve de más → zod tira `too_big` → hay algo que recortar o
 * reintentar. **OpenAI los aplica al DECODIFICAR**, así que no devuelve de más: devuelve el texto
 * ya CORTADO, exactamente en el tope. Y como `.max(90)` acepta 90, zod pasa, el clamp no corre, no
 * hay reintento, y el muñón se guarda y se imprime dentro de la imagen. Landing es OpenAI-primario,
 * o sea que ese es el camino real. Medido en la landing de snacks: `cta-final.headline` y
 * `testimonios.headline` volvieron los DOS en 90/90 caracteres, cortados a mitad de frase
 * (*"…¡No te quedes a"*), con el system prompt pidiéndole explícitamente no llegar al tope.
 *
 * Un string que aterriza EXACTO en su tope es la firma del decodificador, no una casualidad: por
 * eso alcanza con comparar longitudes. Devuelve la ruta de cada uno para pedir la corrección.
 */
export function stringsEnElTope(obj: unknown, jsonSchema: unknown, ruta: string[] = []): string[] {
  const esq = jsonSchema as Record<string, unknown> | null
  if (!esq || typeof esq !== 'object') return []
  if (typeof obj === 'string')
    return typeof esq.maxLength === 'number' && obj.length === esq.maxLength ? [ruta.join('.') || '(raíz)'] : []
  if (Array.isArray(obj))
    return obj.flatMap((v, i) => stringsEnElTope(v, esq.items, [...ruta, String(i)]))
  if (obj && typeof obj === 'object') {
    const props = esq.properties as Record<string, unknown> | undefined
    if (!props) return []
    return Object.entries(obj).flatMap(([k, v]) => (props[k] ? stringsEnElTope(v, props[k], [...ruta, k]) : []))
  }
  return []
}

/** La misma corrección que `correccionDeLargo`, para el corte que zod no ve (ver `stringsEnElTope`). */
export function correccionDeTope(rutas: string[]): string {
  return [
    'CORRIGE EL LARGO (obligatorio) — estos campos llegaron al tope de caracteres y salieron',
    'CORTADOS a mitad de frase:',
    ...rutas.map((r) => `  - "${r}"`),
    'Reescríbelos claramente MÁS CORTOS, con TODAS las frases completas. Quita una idea entera',
    'antes que dejar una frase por la mitad.',
  ].join('\n')
}
