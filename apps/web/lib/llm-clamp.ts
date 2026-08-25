import { z } from 'zod'

// Helpers puros de recorte, extraídos de `gemini.ts` al cablear el primer recurso a KIE
// (2026-08-25). Viven en un módulo HOJA (solo zod) porque los necesita `kie-gemini.ts`, y
// `gemini.ts` importa a ese: dejarlos allá era un ciclo. `gemini.ts` los re-exporta, así que sus
// importadores no cambiaron. Mismo criterio que `lib/body-focus.ts`.

/** Recorta a `max` en LÍMITE DE PALABRA — nunca a mitad, que dejaba basura visible ("Sient."). */
export function sliceToWord(s: string, max: number): string {
  if (s.length <= max) return s
  let cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > max * 0.5) cut = cut.slice(0, lastSpace)
  return cut.replace(/[\s,;:.–—-]+$/, '')
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
