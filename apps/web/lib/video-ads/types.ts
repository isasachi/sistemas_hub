import { z } from 'zod'
import { ProductScanSchema, type ProductScan } from '@/lib/types'
import type { ForensicReport } from './forensic'
import type { ScriptTemplate } from './template'
import type { ValidationMatrix } from './validation'
// Los tres tipos de abajo todavía no existen como módulos — los crean las Tasks 2-4
// del PLAN B (adapt.ts, character.ts, lotes.ts). `import type` se borra en runtime
// (esbuild/vitest no lo resuelve), así que la sesión de tests sigue verde hasta que
// esos archivos aparezcan; tsc SÍ marcará estos tres imports como error mientras tanto
// — es la rotura esperada de esta tarea, documentada en el reporte.
import type { AdaptedScript } from './adapt'
import type { VoiceProfile } from './character'
import type { Lote } from './lotes'

// ─── INPUTS DEL USUARIO (spec: "INPUTS DEL USUARIO") ─────────────────────────
//
// Son la fuente de verdad para producto, ángulo, público, problema y personaje.
// El VIDEO ORIGINAL es la fuente de verdad para estructura, ritmo y cámara.
//
// `characterEthnicity` y `accent` son los dos campos que el spec PROHÍBE inferir:
// "nunca infieras raza/etnia, origen cultural o acento únicamente a partir de la
// apariencia visual". Vacío = PENDIENTE, nunca "lo que se ve en el video".
export const UserInputsSchema = z.object({
  productName: z.string(),
  productDescription: z.string(),
  angle: z.string(),
  targetAudience: z.string(),
  problem: z.string(),
  characterDesc: z.string(),
  characterEthnicity: z.string(),
  accent: z.string(),
  voice: z.string(),
  constraints: z.string(),
  // Opcional: el personaje sube DIRECTO al bucket (uploadDirect), así que esta es
  // la única forma en que la URL llega a la ruta de `inputs` para persistirse en
  // la sesión. Sin esto `character_url` se quedaba en null para siempre y la
  // fila "Personaje" de la matriz nunca podía confirmarse por imagen.
  characterUrl: z.string().url().optional(),
})
export type UserInputs = z.infer<typeof UserInputsSchema>

// ─── Línea 1: análisis forense del video de referencia ───────────────────────

export {
  ForensicReportSchema, CorteSchema, TomaSchema,
  type ForensicReport, type Corte, type Toma,
} from './forensic'

// ─── Plantilla del guión (fill in the blank) ─────────────────────────────────

export {
  ScriptTemplateSchema, TomaTemplateSchema,
  type ScriptTemplate, type TomaTemplate,
} from './template'

// ─── Sesión (forma de la respuesta del API) ──────────────────────────────────

export interface VideoSessionResponse {
  id: string
  created_at: string
  step: number
  reference_video_url: string | null
  forensic_analysis: ForensicReport | null
  character_url: string | null
  product_url: string | null
  // Nicho del ad (migración 20260818000001_video_niche.sql). Decide si el producto es
  // un objeto que se sostiene o algo que el personaje LLEVA PUESTO — ver niches.ts.
  // Las filas anteriores a la migración traen el default 'suplementos'.
  niche: string
  product_scan: ProductScan | null
  product_name: string | null
  what_it_does: string | null
  target_audience: string | null
  angle: string | null
  problem: string | null
  character_desc: string | null
  character_ethnicity: string | null
  accent: string | null
  voice: string | null
  constraints: string | null
  validation: ValidationMatrix | null
  template: ScriptTemplate | null
  // FASE 3
  adapted: AdaptedScript | null
  // FASE 4 / 4.5
  character_prompt: string | null
  consistency_block: string | null
  voice_profile: VoiceProfile | null
  // FASE 5
  lotes: Lote[] | null
  video_url: string | null   // primer lote listo: sirve de miniatura en el dashboard
  duration: number | null
  // `renderDone(lotes)` cacheado (render-lotes.ts) — distinto de `!!video_url`, que se
  // estampa con el PRIMER lote listo, no cuando TODOS terminan. Ver la migración
  // 20260812000003_video_render_done.sql para el porqué de cachearlo en vez de leer
  // `lotes` (jsonb pesado) en cada listado del dashboard.
  render_done: boolean
}

export { ProductScanSchema }
export type { ProductScan }

export { ValidationMatrixSchema, type ValidationMatrix, type ValidationRow } from './validation'
