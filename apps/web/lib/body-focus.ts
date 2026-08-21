import { z } from 'zod'

// ─── Zona del cuerpo sobre la que actúa el producto ──────────────────────────
// Vocabulario COMPARTIDO entre landing (`lib/landing/types.ts`, donde nació el 2026-08-15 para
// encuadrar al avatar) y anuncios (`lib/types.ts`, donde decide a qué zona apuntan las flechas
// del anuncio replicado). Vive en un módulo hoja —solo zod— a propósito: `lib/landing/types.ts`
// arrastra `brand-system` → `lib/gemini`, que lee prompts del disco al importarse, y meter esa
// cadena dentro de `lib/types.ts` (que importa medio hub) es un ciclo esperando pasar.
//
// NO se deriva del nicho ni de la demografía: creatina para masa y creatina para glúteos son el
// MISMO nicho y la MISMA demografía, y distinta zona. Sale del producto + el ángulo.
export const BodyFocus = z.enum([
  'rostro',
  'cabello',
  'torso',
  'abdomen',
  'gluteos_piernas',
  'rodilla',
  'articulacion',
  'manos',
  'pies',
  'cuerpo_completo',
])
export type BodyFocus = z.infer<typeof BodyFocus>
