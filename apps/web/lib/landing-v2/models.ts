// Modelos de TEXTO de landing v2 por el AI SDK (decisión del dueño del repo, 2026-10-05: v2 prueba
// este camino). El par es el MISMO del hub —`gemini-3.6-flash` primario, `gpt-5.4-nano` respaldo—,
// con las MISMAS keys y sin Gateway, y vive en `lib/ai-sdk.ts`, compartido con anuncios. La IMAGEN no
// pasa por acá: sigue en `generateImage` (respaldo por pieza).
// Lo ÚNICO propio de landing es el director de arte de cada sección: `DIRECTOR` (gpt-5.5 → gemini).
import { createOpenAI } from '@ai-sdk/openai'
import { primario, type Par } from '@/lib/ai-sdk'

export { chatModel, conRespaldo, primario, respaldo, structured } from '@/lib/ai-sdk'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * El DIRECTOR DE ARTE de cada sección: `gpt-5.5` primario, `gemini-3.6-flash` respaldo. Es la única
 * excepción al par de texto del hub, y es decisión del dueño (2026-10-13). Medido el 2026-10-09 con el
 * mismo pedido (prompt literal del GPT, checklist, PDF de wireframes completo y producto): Gemini
 * flash, pro y 3.1-pro describían un layout (fondo, titular, frasco, bullets) en 0 de 8 draws;
 * `gpt-5.5` propuso un concepto visual que cuenta el ángulo en todos los draws, en 4 productos y 3 nichos.
 * Va por `.chat()`, sin temperatura ni opciones de proveedor: es exactamente lo que se midió.
 */
export const DIRECTOR: Par = [openai.chat('gpt-5.5'), primario]
// Medido con el PDF de 25 MB: gpt-5.5 tarda 36 s y Gemini 53 s. Con 90 s por intento, el peor caso
// (gpt-5.5 agota el tiempo y responde el respaldo) son 180 s, y el render de imagen cabe dentro de
// los 300 s de la ruta.
export const DIRECTOR_TIMEOUT_MS = 90_000
