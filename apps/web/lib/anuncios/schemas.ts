// Schemas "DE SALIDA" de anuncios: lo que se le pide al MODELO por el AI SDK.
//
// ⚠️ NO son los de `lib/types.ts`, y no se pueden unificar. Aquéllos re-parsean el jsonb guardado
// y por eso llevan `.catch(null)`/`.nullish()` (una sesión vieja no puede reventar el parse). El
// AI SDK convierte zod con `io: 'input'`: cualquier `.catch`/`.nullish()`/`.optional()` SACA el
// campo del `required` y el modelo lo omite en silencio (ley del repo, pagada 4 veces). Acá todo
// va en `required` y lo opcional es `.nullable()`: el MISMO schema va plano a Gemini y strict a
// OpenAI. `schemas.test.ts` lo fija.
//
// El orden de los campos es el de `lib/types.ts`: el modelo los llena en ese orden.
import { z } from 'zod'
import { BodyFocus } from '@/lib/body-focus'
import { ReferenceAnalysisSchema } from '@/lib/types'

export const ReferenceAnalysisOut = ReferenceAnalysisSchema.extend({
  creativeConcept: z.string().nullable(),
  bodyFocus: BodyFocus.nullable(),
  attentionMarkers: z.array(z.string()).nullable(),
})

export const ProductScanOut = z.object({
  productDescription: z.string(),
  brandingDescription: z.string().nullable(),
  brandColors: z.array(z.string()).nullable(),
  styleCompatibilityNote: z.string().nullable(),
  summaryForUser: z.string(),
})

const CopyElementOut = z.object({
  element: z.string(),
  text: z.string(),
  template: z.string().nullable(),
  source: z.string().nullable(),
})

// Sin `.min(1)` ni `.refine`: lo que antes validaba el schema lo verifica `validate` en el núcleo,
// que además le devuelve al modelo la corrección (un `.refine` que falla dentro de `Output.object`
// es un error, no un reintento).
export const CopyVersionsOut = z.object({
  versionA: z.array(CopyElementOut),
  versionB: z.array(CopyElementOut),
})

/**
 * La investigación de mercado que reemplaza a los comentarios de TikTok: cómo habla y qué busca
 * el nicho del producto. La escribe el modelo de texto desde lo que sabe (sin búsqueda web: tiene
 * que ser rápida) y su ÚNICO consumidor es el prompt de copy.
 */
export const MarketResearchSchema = z.object({
  niche: z.string(),
  keywords: z.array(z.string()),
  pains: z.array(z.string()),
  desires: z.array(z.string()),
})
export type MarketResearch = z.infer<typeof MarketResearchSchema>
