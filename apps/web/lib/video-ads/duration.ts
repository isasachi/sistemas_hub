/**
 * Duración del render derivada del COPY, no de la referencia.
 * ---------------------------------------------------------------------------
 * Antes el render duraba lo que duraba el video de referencia. Dos cosas lo hacían
 * mal: (1) la referencia trae el cierre de plataforma (la placa de TikTok) que no se
 * replica, y (2) el guión rellenado casi nunca dura lo mismo que el original. El
 * resultado era un video más largo que su guión, y Grok llenaba el vacío inventando
 * frases sin sentido. La duración tiene que salir de lo que el personaje dice.
 *
 * `t` lo escribe un LLM en formato libre ("0:00–0:03"), así que el parser es tolerante
 * y devuelve null cuando no entiende — el caller cae a la duración de la referencia en
 * vez de inventar un número.
 */

/** Aire al final: que el último beat no quede cortado en seco. */
export const AIR_SEC = 2

const SEPARATORS = /[–—\-~]|\bto\b/i

/** "1:04" → 64 · "12" → 12 · "3s" → 3 · basura → null */
function toSeconds(raw: string): number | null {
  const s = raw.trim().replace(/[s"']+$/i, '').trim()
  if (!s) return null
  const parts = s.split(':')
  if (parts.length > 3) return null
  let total = 0
  for (const p of parts) {
    const n = Number(p.trim())
    if (!Number.isFinite(n) || n < 0) return null
    total = total * 60 + n
  }
  return total
}

/**
 * Segundo en que TERMINA un beat. De un rango toma el extremo derecho; de un valor
 * suelto, el valor (un beat marcado "0:03" se lee como "termina a los 3s").
 */
export function beatEndSeconds(t: string): number | null {
  if (!t) return null
  // Sin filtrar los vacíos a propósito: en "0:00–" el extremo derecho falta, y eso es
  // ilegible (null), no "termina en 0:00".
  const parts = t.split(SEPARATORS)
  return toSeconds(parts[parts.length - 1])
}

/**
 * Duración del video para un guión: fin del último beat + aire. null si ningún beat
 * tiene una marca legible (el caller decide el fallback).
 */
export function scriptDuration(beats: { t: string }[]): number | null {
  let end = 0
  let anyParsed = false
  for (const b of beats) {
    const e = beatEndSeconds(b.t)
    if (e === null) continue
    anyParsed = true
    if (e > end) end = e
  }
  if (!anyParsed || end <= 0) return null
  return Math.round(end + AIR_SEC)
}
