import { z } from 'zod'
import { transcribeLaReferencia } from './anuncios/copy-check'
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
  /**
   * ⚠️ LA TRANSCRIPCIÓN LITERAL DE LA REFERENCIA (etapa 1 de la versión B), y existe por el mismo
   * motivo que `template`: exigirla obliga al modelo a HACER el paso en vez de afirmar que lo hizo,
   * y de paso le da al código con qué verificar. Sin ella nadie podía comprobar que los VALORES
   * cambiaran —`scaffoldFidelity` mide el andamiaje, no los datos— y B podía devolver el copy de la
   * referencia palabra por palabra, que es publicidad de la otra marca.
   *
   * `.nullable().catch(null)` por lo mismo que `template`: con `.nullish()` sale del `required` y
   * el modelo lo omite en silencio; con `.nullable()` a secas revienta el parse de toda sesión
   * guardada antes de este cambio.
   */
  source: z.string().nullable().catch(null),
})
export type CopyElement = z.infer<typeof CopyElementSchema>

export const CopyVersionsSchema = z.object({
  versionA: z.array(CopyElementSchema).min(1),
  versionB: z.array(CopyElementSchema).min(1),
// ⚠️ B NO PUEDE DEVOLVER EL COPY DE LA REFERENCIA TAL CUAL — es publicidad de la otra marca, y se
// imprime dentro del anuncio del usuario. Medido en una sesión real: referencia de peso y salud,
// producto de creatina para glúteos, y B devolvió "PANZA HINCHADA, INSOMNIO…" y "7 KILOS MENOS DE
// CORTISOL EN 30 DÍAS". `scaffoldFidelity` no lo veía porque mide el ANDAMIAJE y ese template era
// un slot entero entre corchetes, sin andamiaje que medir.
//
// Va como `.refine` y no como un log: `callStructured` lo valida post-hoc, así que se REINTENTA la
// generación en vez de ofrecerle al usuario una versión que anuncia a otra marca.
}).refine((d) => !d.versionB.some(transcribeLaReferencia), {
  message: 'la versión B transcribió el copy de la referencia en vez de rellenar sus huecos',
})
export type CopyVersions = z.infer<typeof CopyVersionsSchema>

// ─── Step 4: Confirmed copy ──────────────────────────────────────────────────

export const ConfirmedCopySchema = z.object({
  version: z.enum(['A', 'B']),
  breakdown: z.array(CopyElementSchema).min(1),
})
export type ConfirmedCopy = z.infer<typeof ConfirmedCopySchema>

// ─── Flujo de plantilla: el lote de variantes ────────────────────────────────

/**
 * UN anuncio del lote. La tríada del spec (§38) aterriza así: la PLANTILLA es
 * `sessions.template_id` (cómo se ve), el CONCEPT es `concepto` (qué comunica) y la VARIANT es
 * esta fila entera (cómo se implementa ese concepto en esa plantilla).
 *
 * ⚠️ EL ESTADO ES POR VARIANTE, y eso es lo que hace que el lote sea reanudable. `render-lote`
 * persiste cada variante EN CUANTO termina, no al final: si el stream muere a los 4 minutos —o
 * Vercel corta en `maxDuration`— lo que ya se pagó queda guardado y el reintento solo re-renderiza
 * las pendientes. Es la misma lección que `resumeSeed` en el render por lotes de video.
 */
export const AdVariantSchema = z.object({
  /** `v1`, `v2`… Es también el sufijo del kind de cuota (`anuncios-image:v1`). */
  id: z.string(),
  /** El mecanismo creativo que ESTA variante ejecuta ("errores", "mitos", "objeción"). */
  concepto: z.string(),
  /** Cómo entra: qué dolor, deseo u objeción ataca. Es lo que la distingue de sus hermanas. */
  angulo: z.string(),
  /**
   * El copy por slot de la plantilla. Array y no `z.record` a propósito: este mismo schema viaja
   * al modelo, y un objeto de claves dinámicas es justo donde los structured outputs se rompen.
   */
  slots: z.array(z.object({ slot: z.string(), texto: z.string() })),
  estado: z.enum(['planificada', 'generando', 'lista', 'fallida']),
  imageUrl: z.string().nullable().catch(null),
  /** El motivo del fallo, para que la tarjeta pueda decir por qué y ofrecer reintentar. */
  error: z.string().nullable().catch(null),
})
export type AdVariant = z.infer<typeof AdVariantSchema>

export const AdBatchSchema = z.array(AdVariantSchema)
export type AdBatch = z.infer<typeof AdBatchSchema>

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
  /**
   * La plantilla elegida, o `null` en el flujo clásico. ⚠️ ES EL DISCRIMINADOR DE LOS DOS
   * FLUJOS: no hay columna `flow` porque se deriva de acá, y una columna más sería una segunda
   * fuente de verdad que se puede desincronizar con ésta.
   */
  template_id: string | null
  variants: AdBatch | null
}
