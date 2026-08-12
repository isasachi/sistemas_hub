import { z } from 'zod'
import { ProductScanSchema, type ProductScan } from '@/lib/types'

// Las tres líneas de entrada del wizard. `character-gen` es `character-ref` con un
// paso previo que fabrica el personaje — no es una rama aparte del pipeline.
export const VIDEO_MODES = ['video-ref', 'character-ref', 'character-gen'] as const
export const VideoModeSchema = z.enum(VIDEO_MODES)
export type VideoMode = z.infer<typeof VideoModeSchema>

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

// ─── Personaje (líneas 2 y 3) ────────────────────────────────────────────────

// Espeja el formato de brief que usa el equipo para pedir un UGC influencer.
// El builder (kie.ts) lo aplana al prompt de imagen; el wizard lo pinta como chips.
export const CharacterBriefSchema = z.object({
  gender: z.string(),
  age: z.string(),
  ethnicity: z.string(),
  background: z.string(),
  style: z.string(),
  cameraPlacement: z.string(),
  coverage: z.string(),
  additionalDetails: z.string(),
})
export type CharacterBrief = z.infer<typeof CharacterBriefSchema>

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
  mode: VideoMode | null
  reference_video_url: string | null
  forensic_analysis: ForensicAnalysis | null
  character_brief: CharacterBrief | null
  character_url: string | null
  product_url: string | null
  product_scan: ProductScan | null
  product_name: string | null
  what_it_does: string | null
  target_audience: string | null
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
