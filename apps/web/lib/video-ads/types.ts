import { z } from 'zod'
import { ProductScanSchema, type ProductScan } from '@/lib/types'

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
})
export type UserInputs = z.infer<typeof UserInputsSchema>

// ─── Línea 1: análisis forense del video de referencia ───────────────────────

// Un beat = un tramo del video. El análisis es segundo a segundo: el modelo debe
// emitir un beat por cada cambio visual o de discurso, con su marca de tiempo.
export const ForensicBeatSchema = z.object({
  t: z.string(),            // "0:00–0:03"
  visual: z.string(),       // qué se ve
  dialogue: z.string(),     // lo que se dice (vacío si no hay)
  onScreenText: z.string(), // texto sobreimpreso (vacío si no hay)
  camera: z.string(),       // encuadre + movimiento
  emotion: z.string(),      // tono/energía del talento
})
export type ForensicBeat = z.infer<typeof ForensicBeatSchema>

export const ForensicAnalysisSchema = z.object({
  durationSec: z.number(),
  aspectRatio: z.string(),
  subject: z.string(),         // quién aparece y cómo va vestido
  setting: z.string(),         // dónde
  productHandling: z.string(), // cómo se muestra/manipula el producto
  audio: z.string(),           // voz, música, ambiente
  hookType: z.string(),        // qué tipo de gancho usa los primeros segundos
  persuasiveLogic: z.string(), // por qué convence, en una frase
  beats: z.array(ForensicBeatSchema).min(1),
  summaryForUser: z.string(),  // resumen en español para mostrar en el wizard
})
export type ForensicAnalysis = z.infer<typeof ForensicAnalysisSchema>

// ─── Plantilla del guión (fill in the blank) ─────────────────────────────────

// El esqueleto conserva la estructura literal de la referencia y marca con
// [corchetes] SOLO las palabras de contenido intercambiables:
//   "5 razones por las cuales los [producto común] generan [padecimiento] y no lo sabías"
export const ScriptSlotSchema = z.object({
  t: z.string(),
  pattern: z.string(),
  blanks: z.array(z.string()), // los nombres de los blancos que aparecen en pattern
})
export type ScriptSlot = z.infer<typeof ScriptSlotSchema>

export const ScriptTemplateSchema = z.object({
  slots: z.array(ScriptSlotSchema).min(1),
  summaryForUser: z.string(),
})
export type ScriptTemplate = z.infer<typeof ScriptTemplateSchema>

// ─── Guión final ─────────────────────────────────────────────────────────────

export const ScriptBeatSchema = z.object({
  t: z.string(),
  dialogue: z.string(),
  action: z.string(),
  onScreenText: z.string(),
})
export type ScriptBeat = z.infer<typeof ScriptBeatSchema>

export const ScriptVersionsSchema = z.object({
  versionA: z.array(ScriptBeatSchema).min(1),
  versionB: z.array(ScriptBeatSchema).min(1),
})
export type ScriptVersions = z.infer<typeof ScriptVersionsSchema>

export const ConfirmedScriptSchema = z.object({
  version: z.enum(['A', 'B']),
  beats: z.array(ScriptBeatSchema).min(1),
})
export type ConfirmedScript = z.infer<typeof ConfirmedScriptSchema>

// Dirección del video (acento, vibe, cámara). En la línea 1 la deduce el análisis
// forense; en las líneas 2 y 3 la propone el modelo junto con el guión.
export const VideoDirectionSchema = z.object({
  accent: z.string(),
  vibe: z.string(),
  cameraMotion: z.string(),
  eyeDirection: z.string(),
})
export type VideoDirection = z.infer<typeof VideoDirectionSchema>

// El paso de guión devuelve dirección + dos versiones en una sola llamada.
export const ScriptResultSchema = z.object({
  direction: VideoDirectionSchema,
  versions: ScriptVersionsSchema,
})
export type ScriptResult = z.infer<typeof ScriptResultSchema>

// ─── Sesión (forma de la respuesta del API) ──────────────────────────────────

export interface VideoSessionResponse {
  id: string
  created_at: string
  step: number
  reference_video_url: string | null
  forensic_analysis: ForensicAnalysis | null
  character_url: string | null
  product_url: string | null
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
  script_template: ScriptTemplate | null
  script_versions: ScriptVersions | null
  direction: VideoDirection | null
  confirmed_script: ConfirmedScript | null
  video_prompt: string | null
  duration: number | null
  kie_task_id: string | null
  video_status: string | null
  video_url: string | null
}

export { ProductScanSchema }
export type { ProductScan }

export { ValidationMatrixSchema, type ValidationMatrix, type ValidationRow } from './validation'
