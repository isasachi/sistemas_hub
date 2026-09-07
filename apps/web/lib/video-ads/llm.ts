import fs from 'fs'
import path from 'path'
import type { Part } from '@google/genai'
import type { z } from 'zod'
import { callStructured } from '@/lib/gemini'

/**
 * EL SYSTEM PROMPT DE ESTA TOOL ES PROPIO, y hasta ahora no lo era.
 *
 * `callStructured` tiene por defecto `gemini-system.md`, que abre diciendo *"You are a
 * static ad replication engine"* y ordena, entre sus reglas de oro, que TODA salida
 * declare la posición física del producto *"ending with the negative: No está
 * flotando."*. Esa orden es correcta para un anuncio estático —donde el producto es una
 * foto de catálogo— y venenosa para un video, donde el producto está en la mano de
 * alguien: medido sobre una sesión real, las SEIS `accionVisual` del guion adaptado
 * terminaban con **"El producto no está flotando."**, o sea escenografía de foto dentro
 * del único campo que le dice al render qué hace el cuerpo, emitida seis veces en los
 * prompts de render. La frase no está en ningún insumo de la sesión: la puso el system
 * prompt. Branding y landing ya tenían el suyo; el video se quedó con el de anuncios.
 */
export const VIDEO_SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/video-system.md'),
  'utf-8',
)

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
  return callStructured(schemaName, schema, parts, maxRetries, VIDEO_SYSTEM_PROMPT, { preferGemini: true })
}
