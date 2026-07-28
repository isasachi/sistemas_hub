/**
 * dna-source.ts
 * ---------------------------------------------------------------------------
 * De dónde sale el ADN que alimenta a `generation-prompts.ts`. Dos fuentes,
 * una sola forma (`BrandDna`):
 *
 *   modo 'template' → TEMPLATE_DNA[template_id] (extraído offline, commiteado)
 *   modo 'upload'   → session.image_analysis     (extraído en vivo por `analyze`)
 *
 * En ambos casos la paleta efectiva es la VARIANTE que el usuario eligió, no
 * necesariamente la de la imagen original.
 *
 * Reemplaza a `effective-preset.ts`, que resolvía entre los 7 presets fijos y
 * la imagen subida. Ya no hay presets: las dos fuentes son ExtractedStyle.
 * ---------------------------------------------------------------------------
 */
import { getTemplate, templateImageUrl, templateWireframeUrl, isSameProduct } from './templates'
import { TEMPLATE_DNA } from './template-dna'
import type { BrandDna, ExtractedLayout, PaletteColor, BrandingSessionResponse } from './types'
import type { BrandBrief } from './generation-prompts'
import { fetchAsBase64 } from '@/lib/storage'
import type { Part } from '@google/genai'

/** El ADN de la plantilla de la sesión. Lanza si el id no está en el catálogo. */
function templateDnaOf(session: BrandingSessionResponse) {
  const id = session.template_id ?? ''
  const t = TEMPLATE_DNA[id]
  if (!t) throw new Error(`Plantilla desconocida: "${id}" (¿falta correr el seed?)`)
  return t
}

/** Índice de paleta válido dentro de `total`; cualquier cosa rara cae a 0. */
function variantIndex(v: number | null, total: number): number {
  return Number.isInteger(v) && v! >= 0 && v! < total ? v! : 0
}

function withPalette(dna: BrandDna, palette: PaletteColor[]): BrandDna {
  return { ...dna, palette }
}

/** El ADN efectivo de la sesión, con la variante de paleta ya aplicada. */
export function resolveBrandDna(session: BrandingSessionResponse): BrandDna {
  if (session.source_mode === 'upload') {
    const a = session.image_analysis
    if (!a?.palette?.length || !a?.typography) {
      throw new Error('Falta el análisis de la imagen subida (o está incompleto)')
    }
    const options = session.palette_options?.length ? session.palette_options : [a.palette]
    return withPalette(a, options[variantIndex(session.palette_variant, options.length)])
  }
  const t = templateDnaOf(session)
  return withPalette(t.dna, t.palettes[variantIndex(session.palette_variant, t.palettes.length)])
}

/** El layout del panel frontal: el de la plantilla, o el extraído de la imagen. */
export function resolveLayout(session: BrandingSessionResponse): ExtractedLayout {
  if (session.source_mode === 'upload') {
    const l = session.image_analysis?.layout
    if (!l) throw new Error('Falta el layout en el análisis de la imagen subida')
    return l
  }
  return templateDnaOf(session).dna.layout
}

/**
 * BrandBrief (input de generation-prompts) desde la sesión.
 *
 * `sameProduct` decide entre clonar la plantilla y traspasarle el ADN a otro
 * producto. En modo upload es SIEMPRE true: la referencia que subió el usuario
 * es su producto, por definición.
 */
export function sessionBrief(session: BrandingSessionResponse): BrandBrief {
  const productType = session.product_type ?? session.product_name ?? 'producto'
  const isUpload = session.source_mode === 'upload'
  const meta = isUpload ? null : getTemplate(session.template_id ?? '')
  const sameProduct = isUpload ? true : isSameProduct(meta!, productType)

  // El containerType de la plantilla SÓLO se hereda cuando el producto es el
  // mismo. Heredarlo en la rama de traspaso sería contradecirse a sí mismo: el
  // prompt pediría "una rodillera EN un frasco de vidrio con gotero" mientras
  // la frase siguiente prohíbe copiar el envase de la referencia. Si el usuario
  // no dijo qué envase quiere y el producto es otro, mejor no decir nada y
  // dejar que el modelo deduzca el envase del producto.
  const containerType =
    session.container_type
    ?? session.container_desc
    ?? (!isUpload && sameProduct ? templateDnaOf(session).containerType : undefined)

  return {
    brandName: session.brand_name ?? 'Marca',
    productName: session.product_name ?? undefined,
    productType,
    descriptor: session.descriptor ?? undefined,
    tagline: session.tagline ?? undefined,
    containerType,
    sameProduct,
    referenceProductType: meta?.productType,
  }
}

/**
 * Refs de identidad: la foto de la plantilla, o la imagen que subió el usuario.
 * Es el contexto visual de estilo en los tres pasos del pipeline.
 */
export async function identityRefParts(session: BrandingSessionResponse): Promise<Part[]> {
  const url = session.source_mode === 'upload'
    ? session.uploaded_image_url
    : templateImageUrl(session.template_id ?? '')
  return url ? fetchParts([url]) : []
}

/** El wireframe (esqueleto de layout): el de la plantilla, o el del upload. */
export async function wireframeRefParts(session: BrandingSessionResponse): Promise<Part[]> {
  const url = session.source_mode === 'upload'
    ? session.uploaded_wireframe_url
    : templateWireframeUrl(session.template_id ?? '')
  return url ? fetchParts([url]) : []
}

/** Una imagen ya generada (label_url del paso anterior) como Part. */
export async function imageRefParts(url: string | null): Promise<Part[]> {
  return url ? fetchParts([url]) : []
}

/** FAIL-LOUD: un fetch fallido debe abortar la generación, no seguir a medias. */
async function fetchParts(urls: string[]): Promise<Part[]> {
  const parts: Part[] = []
  for (const url of urls) {
    try {
      const { data, mimeType } = await fetchAsBase64(url)
      parts.push({ inlineData: { mimeType, data } })
    } catch (e) {
      console.error('[fetchParts]', url, e)
      throw new Error(`No se pudo cargar la referencia: ${url}`)
    }
  }
  return parts
}
