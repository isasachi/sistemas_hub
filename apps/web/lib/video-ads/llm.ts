import type { Part } from '@google/genai'
import type { z } from 'zod'
import { callStructured } from '@/lib/gemini'

/**
 * TODA llamada de texto/visión del generador de video sale por GEMINI.
 *
 * El resto del hub es OpenAI-primario (gpt-4o-mini) y para ESTA tool ese modelo es el
 * techo real de calidad, no un detalle de configuración. Medido sobre una sesión real,
 * con el guion original delante y el prompt ya corregido: gpt-4o-mini responde la
 * ETIQUETA del hueco en vez del anuncio —"para tomar gomitas de melatonina" donde el
 * original decía el nombre comercial, 3 de 3— y gemini-2.5-flash responde el anuncio,
 * también 3 de 3. Distinguir esas dos cosas con el original al lado es exactamente la
 * conciencia de contexto que este pipeline necesita, y NO se compra con más reglas de
 * prompt sobre un modelo chico: se intentaron tres rondas antes de mirar qué modelo era.
 *
 * Existe como envoltorio y no como un `{ preferGemini: true }` suelto en cada ruta
 * porque la regla es de la TOOL entera: un call site nuevo que se olvide del flag vuelve
 * a gpt-4o-mini en silencio, y el síntoma —valores que contestan la etiqueta— se lee
 * como un problema de prompt. Ya pasó.
 *
 * Excepciones deliberadas, las dos fuera de esta función: el análisis forense
 * (`analyze-reference`, que llama a Gemini directo porque gpt-4o-mini no acepta partes
 * de video) y el render (KIE, que no es un LLM de texto).
 */
export function callVideoAds<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3,
): Promise<T> {
  // El system prompt queda en el default de `callStructured`: ningún call site de esta
  // tool usa uno propio, y nombrarlo acá obligaría a todo test que mockea `@/lib/gemini`
  // a exportarlo también.
  return callStructured(schemaName, schema, parts, maxRetries, undefined as unknown as string, { preferGemini: true })
}
