import { z } from 'zod'
import { callStructured } from '@/lib/gemini'
import type { Part } from '@google/genai'

// Analiza una imagen de referencia (logo o etiqueta) UNA vez al subirla y extrae
// SOLO estructura de diseño transferible — nunca el contenido literal. El texto
// resultante se guarda en la sesión y alimenta la generación; la imagen cruda NO
// se vuelve a pasar al modelo de imagen (si se pasa, copia el producto/sabor/color
// de la referencia — el bug del "ref de chocolate → producto de chocolate").

const AnalysisSchema = z.object({
  composition: z.string(), // grilla, distribución y proporción de los elementos
  hierarchy: z.string(),   // jerarquía visual / tipográfica, tamaños relativos
  spacing: z.string(),     // ritmo de espaciado, densidad, márgenes
  finish: z.string(),      // acabado, tratamiento, estilo y mood (en abstracto)
})

const SYSTEM = [
  'You are a design analyst. You will be shown ONE reference image.',
  'Extract ONLY the abstract, transferable DESIGN STRUCTURE — the patterns a designer would learn from, not the content.',
  'STRICTLY FORBIDDEN to describe or even mention: the product type or subject, brand or product name, any text content, flavor, ingredients, materials, or specific colors.',
  'Describe shape language, layout grid, element placement and proportion, visual/typographic hierarchy, spacing rhythm and density, and overall finish/treatment/mood — all in the abstract.',
  'Never name what the product is. If the reference is a chocolate package, you describe its layout and finish, never "chocolate".',
].join(' ')

const FOCUS = {
  logo: 'This reference is a LOGO. Focus on mark construction, balance, and typographic treatment in the abstract.',
  label: 'This reference is a PRODUCT LABEL. Focus on information layout, shelf-appeal structure and density in the abstract.',
}

export async function analyzeReference(
  base64: string,
  mimeType: string,
  kind: 'logo' | 'label'
): Promise<string> {
  const parts: Part[] = [
    { inlineData: { mimeType, data: base64 } },
    { text: FOCUS[kind] },
  ]
  const a = await callStructured('reference_analysis', AnalysisSchema, parts, 3, SYSTEM)
  return [
    `Composition & layout: ${a.composition}`,
    `Visual hierarchy: ${a.hierarchy}`,
    `Spacing & density: ${a.spacing}`,
    `Finish & treatment: ${a.finish}`,
  ].join('\n')
}
