import { z } from 'zod'
import { BodyFocus } from '@/lib/body-focus'

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
  // ⚠️ ZONA DEL CUERPO A LA QUE APUNTA EL ANUNCIO. Un anuncio de "baja la panza" con flechas al
  // abdomen replicado para unas gomitas de glúteos tiene que apuntar a los GLÚTEOS: la estructura
  // (flechas, antes/después, círculos) se conserva, la zona cambia. Es dato VISUAL, así que no se
  // puede inferir en STEP5 —que es texto puro— y por eso se extrae acá. `null` = el anuncio no
  // señala ninguna zona (packshot, flat-lay): ahí no hay nada que re-apuntar.
  // EL CONCEPTO CREATIVO: qué mecanismo persuasivo ES el anuncio y cómo está construido
  // ("antes/después: dos siluetas de la misma persona, la izquierda rotulada ANTES con el problema,
  // la derecha AHORA con el resultado"). `persuasiveLogic` dice POR QUÉ convence; esto dice QUÉ es.
  // Lo necesitan `generate-copy` (en un antes/después los slots NO son intercambiables: uno es
  // dolor y el otro resultado) y STEP5, que es texto puro y no ve la imagen.
  creativeConcept: z.string().nullable().catch(null),
  bodyFocus: BodyFocus.nullable().catch(null),
  // Los dispositivos que dirigen la mirada a esa zona, uno por elemento, con dónde está cada uno:
  // flechas, círculos, líneas de callout, mitades de antes/después, zoom, resaltados.
  attentionMarkers: z.array(z.string()).nullable().catch(null),
  summaryForUser: z.string(),
})
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>

// ─── Step 2: Product ─────────────────────────────────────────────────────────

export const ProductScanSchema = z.object({
  productDescription: z.string(),
  brandingDescription: z.string().nullish(),
  // Paleta de la MARCA del usuario, en hex y ordenada por prominencia. El anuncio final adopta
  // estos colores: el reparto de roles de la referencia (qué es fondo, qué es acento, qué es CTA)
  // se conserva, los tonos se sustituyen. `null` = no hay paleta legible → se deja la de la
  // referencia intacta. Es el ÚNICO campo del scan que puede mirar el logo (imagen 2).
  brandColors: z.array(z.string()).nullable().catch(null),
  styleCompatibilityNote: z.string().nullish(),
  summaryForUser: z.string(),
})
export type ProductScan = z.infer<typeof ProductScanSchema>

// ─── Step 3: Copy ────────────────────────────────────────────────────────────

export const CopyElementSchema = z.object({
  element: z.string(),
  text: z.string(),
  // La plantilla fill-in-the-blank del slot, con el dato específico entre corchetes
  // ("[problema común] que no se va"). SOLO la llena la versión B: exigirla es lo que fuerza el
  // paso de templating — sin ella B se vuelve otra reescritura libre y las dos versiones colapsan
  // en la misma. Se guarda y no se muestra; `scaffoldFidelity` la mide contra el texto final.
  template: z.string().nullable().catch(null),
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
  what_it_is: string | null
  what_it_does: string | null
  target_audience: string | null
  tiktok_comments: string | null
  copy_versions: CopyVersions | null
  confirmed_copy: ConfirmedCopy | null
  edit_instruction: string | null
  image_url: string | null
}
