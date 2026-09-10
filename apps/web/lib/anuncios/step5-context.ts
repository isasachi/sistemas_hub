import type { ReferenceAnalysis, ProductScan } from '@/lib/types'

/**
 * El contexto que se le pasa a STEP5 (`callReasoning`) para que arme el instructivo de imagen.
 *
 * ⚠️ VIVE ACÁ PORQUE LO USAN LOS DOS FLUJOS: `generate-image` (clásico, un anuncio) y
 * `render-lote` (plantilla, N anuncios). Con una copia en cada ruta, un arreglo al contexto
 * llegaría a un flujo y no al otro en silencio — el modo de fallo que este repo ya registró al
 * cambiar el formato del forense sin mirar quién lo parsea aguas abajo.
 *
 * Es construcción de string pura: sin llamadas, sin IO, testeable.
 */
export interface ContextoStep5 {
  /**
   * El ratio MEDIDO de los bytes de la referencia, no el que declaró el análisis.
   * `undefined` cuando no se pudo medir (`aspectRatioOf` devuelve el enum de Gemini o nada):
   * ahí se cae al que trae el análisis.
   */
  aspectRatio: string | null | undefined
  ref: ReferenceAnalysis
  scan: ProductScan
  productName: string | null
  whatItIs: string | null
  whatItDoes: string | null
  targetAudience: string | null
  hasLogo: boolean
  /** "A", "B" en el flujo clásico; el id de la variante en el lote. */
  version: string
  copy: { element: string; text: string }[]
}

export function contextoStep5(c: ContextoStep5): string {
  const { ref, scan } = c
  return [
    `=== REFERENCE ANALYSIS ===`,
    `Format: ${c.aspectRatio ?? ref.format.ratio} — ${ref.format.platform}`,
    `Physical position: ${ref.physicalPosition}`,
    `Layout: ${ref.layoutDescription}`,
    `Composition: ${ref.composition.join(' | ')}`,
    `Style: ${ref.style}`,
    `Colorimetry: ${ref.colorimetry}`,
    `Typography: ${ref.typography}`,
    `Creative concept: ${ref.creativeConcept ?? 'not identified'}`,
    `Persuasive logic: ${ref.persuasiveLogic}`,
    `Scene elements:`,
    `  People: ${JSON.stringify(ref.sceneElements.people)}`,
    `  Props: ${JSON.stringify(ref.sceneElements.props)}`,
    `  Brand elements: ${JSON.stringify(ref.sceneElements.brandElements)}`,
    `  Setting: ${ref.sceneElements.setting}`,
    `Body zone the reference points at: ${ref.bodyFocus ?? 'none — the ad points at no body zone'}`,
    `Attention markers: ${ref.attentionMarkers?.length ? ref.attentionMarkers.join(' | ') : 'none'}`,
    ``,
    `=== PRODUCT INFO ===`,
    `Product name: ${c.productName}`,
    `What it is: ${c.whatItIs ?? 'not provided'}`,
    `What it does: ${c.whatItDoes}`,
    `Target audience: ${c.targetAudience}`,
    `Product description: ${scan.productDescription}`,
    `Branding: ${scan.brandingDescription ?? 'not provided'}`,
    `Brand colors: ${scan.brandColors?.length ? scan.brandColors.join(', ') : 'not detected — keep the reference palette'}`,
    `Logo provided: ${c.hasLogo ? 'YES — Image 3 is the brand logo' : 'NO'}`,
    ``,
    `=== APPROVED COPY ===`,
    `Version ${c.version}:`,
    ...c.copy.map((e) => `  ${e.element}: "${e.text}"`),
  ].join('\n')
}
