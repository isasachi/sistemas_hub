import { z } from 'zod'

// ─── Step 1: Reference ────────────────────────────────────────────────────────

export const SceneElementsSchema = z.object({
  people: z.array(z.string()),
  props: z.array(z.string()),
  brandElements: z.array(z.string()),
  setting: z.string(),
})

export const ReferenceAnalysisSchema = z.object({
  format: z.object({ ratio: z.string(), platform: z.string() }),
  style: z.string(),
  composition: z.array(z.string()),
  replacements: z.array(z.string()),
  physicalPosition: z.string(),
  colorimetry: z.string(),
  typography: z.string(),
  persuasiveLogic: z.string(),
  layoutDescription: z.string(),
  sceneElements: SceneElementsSchema,
  summaryForUser: z.string(),
})
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>

// ─── Step 2: Product ─────────────────────────────────────────────────────────

export const ProductScanSchema = z.object({
  productDescription: z.string(),
  brandingDescription: z.string().nullish(),
  styleCompatibilityNote: z.string().nullish(),
  summaryForUser: z.string(),
})
export type ProductScan = z.infer<typeof ProductScanSchema>

// ─── Step 3: Copy ────────────────────────────────────────────────────────────

export const CopyElementSchema = z.object({
  element: z.string(),
  text: z.string(),
})
export type CopyElement = z.infer<typeof CopyElementSchema>

export const CopyVersionsSchema = z.object({
  versionA: z.array(CopyElementSchema).min(1),
  versionB: z.array(CopyElementSchema).min(1),
})
export type CopyVersions = z.infer<typeof CopyVersionsSchema>

// ─── Step 4: Confirmed copy ──────────────────────────────────────────────────

export const ConfirmedCopySchema = z.object({
  version: z.enum(['A', 'B']),
  breakdown: z.array(CopyElementSchema).min(1),
})
export type ConfirmedCopy = z.infer<typeof ConfirmedCopySchema>

// ─── Session (API response shape) ────────────────────────────────────────────

export interface SessionResponse {
  id: string
  created_at: string
  step: number
  reference_url: string | null
  reference_analysis: ReferenceAnalysis | null
  product_url: string | null
  logo_url: string | null
  product_scan: ProductScan | null
  product_name: string | null
  what_it_does: string | null
  target_audience: string | null
  tiktok_comments: string | null
  copy_versions: CopyVersions | null
  confirmed_copy: ConfirmedCopy | null
  edit_instruction: string | null
  image_url: string | null
}
