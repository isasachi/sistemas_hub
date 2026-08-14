import type { z } from 'zod'
import type { Part } from '@google/genai'
import { callStructured } from '@/lib/gemini'

/**
 * Toda llamada de texto/visión del generador de video ads va a GEMINI.
 * ---------------------------------------------------------------------------
 * `callStructured` es OpenAI-primario (gpt-4o-mini) para el resto del hub, y para esta
 * tool eso era el techo real de calidad, no un detalle de configuración. Medido sobre la
 * sesión `6a1e6157`, con el guión original ya delante del modelo y el prompt corregido:
 *
 *   gpt-4o-mini  →  "Tres razones para tomar gomitas de melatonina para adultos y
 *                    jóvenes desde los 12 años"   (3/3 corridas)
 *   gemini-2.5   →  "Tres razones para tomar Kukamonga para adultos y jóvenes"
 *                                                 (3/3 corridas)
 *
 * El original decía "Tres razones para tomar Gomi Energy para Ella". El hueco lo bautizó
 * la FASE 2 como `[tipo de producto]`, así que "gomitas de melatonina" ES la respuesta
 * correcta a la etiqueta — y equivocada al anuncio. Distinguir las dos cosas con el
 * original delante es exactamente el "contextual awareness" que el PROMPT MAESTRO tiene
 * por venir de una sola pasada en un modelo grande; no se puede comprar con más reglas
 * de prompt sobre un modelo chico. Lo mismo con las notas del formulario pegadas crudas.
 *
 * NO cubre dos cosas, por decisión explícita del dueño del repo:
 *  - el RENDER (KIE / grok-imagine), que no es un LLM de texto;
 *  - la GENERACIÓN DEL AVATAR (`openaiGenerateImage`, gpt-image-2, sin fallback) en
 *    `character/route.ts`. El ANÁLISIS de identidad de esa misma ruta sí va por acá.
 *
 * El análisis forense (`analyze-reference`) ya llamaba a Gemini directo por otra razón
 * —gpt-4o-mini no acepta partes de video— y sigue igual.
 */
export function callVideoAds<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
): Promise<T> {
  return callStructured(schemaName, schema, parts, 3, undefined, { preferGemini: true })
}
