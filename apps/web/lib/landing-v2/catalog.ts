// Catálogo de las 14 secciones de landing v2, en el orden FIJO del esqueleto CRO compartido
// (`knowledge/landing/cro-checklist.pdf`, última página). Módulo hoja y sin `fs`: lo importa también
// la UI (`'use client'`) para listar las secciones.
//
// `wf` es la página del PDF de wireframes (verificado abriendo el PDF: el mapeo es 1:1 con el orden).
// `checklist` nombra los bloques del checklist que evalúan la sección. El checklist NO es 1:1 con el
// esqueleto: las dos de beneficios comparten el #5, segmentación/ingredientes/cómo usarlo no tienen
// bloque propio (manda la regla del wireframe), y #3 urgencia, #10 garantía, #11 objeciones y #13
// confianza transversal se reparten donde lo dice el system prompt (`rules.skeleton`).

export const SECTION_IDS = [
  'hero', 'immediate_benefits', 'offer_pricing', 'friction_reduction', 'expanded_benefits',
  'mechanism', 'segmentation', 'ingredients', 'how_to_use', 'comparison', 'before_after',
  'testimonials', 'authority', 'final_reoffer',
] as const
export type SectionId = (typeof SECTION_IDS)[number]

/** Qué dato real exige la sección para no inventar contenido. */
export type SectionRequirement = 'testimonials' | 'proof_images'

export interface SectionSpec {
  id: SectionId
  es: string
  en: string
  wf: number
  checklist: string
  requires: SectionRequirement | null
  /** La sección compatible más cercana cuando falta el dato que exige. */
  fallback: SectionId | null
}

export const SECTIONS: readonly SectionSpec[] = [
  { id: 'hero', es: 'Hero', en: 'Hero', wf: 1, checklist: '#1 Hero / Gancho; micro-confianza (#13) si hay datos', requires: null, fallback: null },
  { id: 'immediate_benefits', es: 'Beneficios inmediatos', en: 'Immediate benefits', wf: 2, checklist: '#5 Beneficios (los más inmediatos)', requires: null, fallback: null },
  { id: 'offer_pricing', es: 'Oferta y precios', en: 'Offer & pricing', wf: 3, checklist: '#2 Oferta irresistible; #3 Urgencia + escasez solo si el usuario la dio', requires: null, fallback: null },
  { id: 'friction_reduction', es: 'Compra sin riesgo', en: 'Friction reduction', wf: 4, checklist: '#10 Garantía / riesgo cero; #11 Objeciones / FAQ; #13 Elementos de confianza (envío, pago, contra entrega) — solo con datos', requires: null, fallback: null },
  { id: 'expanded_benefits', es: 'Beneficios ampliados', en: 'Expanded benefits', wf: 5, checklist: '#5 Beneficios (razones de uso diario)', requires: null, fallback: null },
  { id: 'mechanism', es: 'Cómo funciona', en: 'Mechanism', wf: 6, checklist: '#6 Cómo funciona', requires: null, fallback: null },
  { id: 'segmentation', es: '¿Es para ti?', en: 'Segmentation', wf: 7, checklist: 'Sin bloque propio: regla del wireframe; #11 Objeciones ("¿para quién NO es?")', requires: null, fallback: null },
  { id: 'ingredients', es: 'Ingredientes / materiales', en: 'Ingredients', wf: 8, checklist: 'Sin bloque propio: regla del wireframe (generar confianza sin prometer milagros)', requires: null, fallback: null },
  { id: 'how_to_use', es: 'Cómo usarlo', en: 'How to use', wf: 9, checklist: 'Sin bloque propio: regla del wireframe; #6 (qué hacer, cuándo y cómo)', requires: null, fallback: null },
  { id: 'comparison', es: 'Comparativa', en: 'Comparison', wf: 10, checklist: '#7 Tabla comparativa', requires: null, fallback: null },
  { id: 'before_after', es: 'Antes y después', en: 'Before/After', wf: 11, checklist: '#4 Antes y después', requires: 'proof_images', fallback: 'comparison' },
  { id: 'testimonials', es: 'Testimonios', en: 'Testimonials', wf: 12, checklist: '#9 Testimonios', requires: 'testimonials', fallback: 'authority' },
  { id: 'authority', es: 'Autoridad', en: 'Authority', wf: 13, checklist: '#8 Prueba de autoridad', requires: null, fallback: null },
  { id: 'final_reoffer', es: 'Re-oferta final', en: 'Final re-offer', wf: 14, checklist: '#12 Cierre (sin botón: los renders no llevan botones); #3 Urgencia final solo si el usuario la dio; #10 y #13 seguridad — solo con datos', requires: null, fallback: null },
]

export const SECTION_BY_ID: Record<SectionId, SectionSpec> =
  Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<SectionId, SectionSpec>

/** Ordena según el esqueleto (la generación SIEMPRE lo respeta, aunque la selección venga desordenada). */
export function inSkeletonOrder(ids: readonly SectionId[]): SectionId[] {
  return SECTION_IDS.filter((id) => ids.includes(id))
}
