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

  // Fin de frase = puntuación seguida de espacio/salto, o al final del recorte.
  const finFrase = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '),
    cut.lastIndexOf('.\n'), cut.lastIndexOf('!\n'), cut.lastIndexOf('?\n'))
  if (finFrase > max * 0.5) return cut.slice(0, finFrase + 1)

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
