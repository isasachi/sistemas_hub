/**
 * Los IDs de los modelos, en un módulo HOJA: sin imports, sin efectos al cargarse.
 * ---------------------------------------------------------------------------
 * ⚠️ VIVEN ACÁ Y NO EN `lib/gemini.ts` POR UNA RAZÓN DE BUNDLE, no de orden. `lib/gemini.ts` hace
 * tres `fs.readFileSync` al importarse (los system prompts), así que cualquier módulo que lo
 * importe queda contaminado: si algún día lo toca un `'use client'`, el bundle del navegador se
 * lleva `fs` y el build se cae.
 *
 * Y eso NO es hipotético: `lib/branding/generation.ts` necesita estos IDs para `RESPALDO_POR_ETAPA`,
 * y dos páginas `'use client'` importan de él un VALOR (`STAGE_LABELS`, no solo `type Stage`, que
 * se borraría al compilar). Con las constantes dentro de `lib/gemini.ts`, ese import encadenaba
 * los prompts del disco hasta el navegador.
 *
 * Mismo criterio que `lib/body-focus.ts`, y la misma trampa que AGENTS.md ya tenía anotada para
 * `lib/landing/types.ts` → `brand-system` → `lib/gemini`.
 *
 * `lib/gemini.ts` los RE-EXPORTA, así que un call site puede seguir pidiéndolos ahí.
 */

/** Texto y visión, el primario de todo el hub. */
export const GEMINI_TEXTO = 'gemini-3.6-flash'

// Los dos modelos de imagen de Google. `nano-banana-2` y `nano-banana-pro` son sus nombres de
// marketing (y los que usaba KIE); acá van por su id de la API, que es lo que el SDK acepta.
// Verificado el 2026-09-17 contra `models.list`: `gemini-3-pro-image` y `nano-banana-pro-preview`
// son el mismo modelo (mismos límites), y se usa el id sin `-preview`.
export const NANO_BANANA_2 = 'gemini-3.1-flash-image'
export const NANO_BANANA_PRO = 'gemini-3-pro-image'

/**
 * El respaldo de imagen, explícito y OBLIGATORIO en cada call site (ver `generateImage`). No hay
 * default a propósito: cuál de los dos corresponde es una decisión por pieza —medida, no
 * estética— y un default la escondería detrás de un respaldo silencioso.
 */
export type RespaldoImagen = typeof NANO_BANANA_2 | typeof NANO_BANANA_PRO
