import { z } from 'zod'
import type { Part } from '@google/genai'
import { toChatContent } from './llm-openai'
import { clampTooBigStrings } from './llm-clamp'

/**
 * PRIMER RECURSO MIGRADO A KIE: el modelo de TEXTO Y VISIÓN de Gemini (2026-08-25).
 * ---------------------------------------------------------------------------
 * `gemini-2.5-flash` deja de llamarse por `@google/genai` y pasa por
 * `api.kie.ai/gemini-2.5-flash/v1/chat/completions`, que habla el dialecto de OpenAI.
 *
 * Es UN recurso, no el motor entero: gpt-4o-mini sigue siendo primario donde lo era, la imagen de
 * Gemini (`gemini-3.1-flash-image`), el render de video y el worker no se tocan. La migración de
 * golpe se intentó una vez y se revirtió por acumulación de bugs; esto la rehace por partes.
 *
 * ⚠️ `GEMINI_VIA=direct` devuelve este recurso al SDK de Google sin revertir código — es lo que
 * hace reversible el slice (ver `viaDirecta` en gemini.ts).
 */

const BASE = process.env.KIE_API_BASE ?? 'https://api.kie.ai'
export const KIE_GEMINI_MODEL = 'gemini-2.5-flash'
const URL_CHAT = `${BASE}/${KIE_GEMINI_MODEL}/v1/chat/completions`

// ⚠️ SIN TOPE EXPLÍCITO LA SALIDA LARGA VUELVE TRUNCADA, y `finish_reason` NO lo dice. Medido: el
// reporte forense volvió cortado a mitad de string (`Unterminated string at position 3353`) en
// tres intentos seguidos; con el tope puesto vuelve completo (5341 caracteres, `finish: stop`).
const MAX_TOKENS = 16_384
const TIMEOUT_MS = 120_000

function apiKey(): string {
  const k = process.env.KIE_API_KEY
  if (!k) throw new Error('KIE_API_KEY no configurada: no se puede llamar a Gemini por KIE')
  return k
}

/**
 * ⚠️ DOS TRAMPAS DEL TRANSPORTE, las dos medidas:
 *
 * 1. KIE devuelve **HTTP 200 con el error DENTRO del cuerpo** (`{code:400,…}` o `{error:{…}}`).
 *    Mirar solo `res.ok` deja pasar el fallo como éxito.
 * 2. En Node `fetch` NO tiene timeout propio — una conexión que KIE deja abierta cuelga el await
 *    para siempre (colgó el dev server una vez). Toda petición lleva `AbortSignal.timeout`.
 */
async function kieChat(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(URL_CHAT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const code = typeof json?.code === 'number' ? json.code : null
  const err = json?.error as { message?: string } | undefined
  if (!res.ok || (code !== null && code !== 200) || err) {
    throw new Error(`KIE gemini → ${res.status} ${code ?? ''} ${String(json?.msg ?? err?.message ?? '')}`.trim())
  }
  const choice = (json?.choices as { message?: { content?: string }; finish_reason?: string }[] | undefined)?.[0]
  if (choice?.finish_reason === 'length') throw new Error('KIE gemini: respuesta truncada (length)')
  return choice?.message?.content ?? ''
}

/**
 * Part[] → content del chat. Reusa `toChatContent` (texto + inlineData como data URI) y agrega
 * los archivos REMOTOS.
 *
 * ⚠️ LA DOC DICE "SOLO URLs http" Y ES FALSO PARA ESTE ENDPOINT: verificado en vivo, `image_url`
 * acepta data URIs en base64, y también un VIDEO de 18 MB de body. Gracias a eso el formato
 * `Part[]` interno del hub no cambió.
 *
 * ⚠️ PERO UN VIDEO GRANDE *MÁS* UN SCHEMA SÍ REVIENTA: medido sobre el mismo video de 13,6 MB,
 * `schema + base64` falla a los ~69 s con un `400 "The server is currently being maintained"` que
 * miente, y `schema + URL` responde. Por eso el análisis forense manda `fileData.fileUri` y KIE se
 * baja el archivo él.
 */
function contenido(parts: Part[]) {
  const remotos = parts
    .filter((p) => p.fileData?.fileUri)
    .map((p) => ({ type: 'image_url' as const, image_url: { url: p.fileData!.fileUri! } }))
  return [...toChatContent(parts), ...remotos]
}

/**
 * ⚠️ LOS OPCIONALES NO PUEDEN VIAJAR COMO `type: ["string","null"]` — este endpoint responde
 * `400 "The 'type' property must be a single string, not an array"`, con `strict` en true Y en
 * false. El array lo produce el `.nullable()` de zod (`bodyFocus` de anuncios, por ejemplo).
 * `anyOf` sí lo acepta, y el campo conserva su lugar en `required`.
 *
 * ⚠️ Y LOS HERMANOS DEL `type` VAN DENTRO DE LA RAMA. `{type:['array','null'], items:X}` tiene que
 * quedar como `{anyOf:[{type:'array', items:X},{type:'null'}]}`: dejando `items` al lado del
 * `anyOf`, el modelo lee "un array de cualquier cosa" y devuelve otra — medido, los arrays
 * opcionales del reporte forense volvieron como `{}`. `description`/`title` sí se quedan arriba:
 * son anotaciones, no restricciones.
 */
export function toSingleTypes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toSingleTypes)
  if (!node || typeof node !== 'object') return node
  const s: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) s[k] = toSingleTypes(v)
  if (!Array.isArray(s.type)) return s

  const { type, description, title, anyOf: previo, ...resto } = s
  const [primero, ...otros] = type as string[]
  return {
    ...(description !== undefined ? { description } : {}),
    ...(title !== undefined ? { title } : {}),
    anyOf: [
      ...(Array.isArray(previo) ? (previo as unknown[]) : []),
      { type: primero, ...resto },
      ...otros.map((t) => ({ type: t })),
    ],
  }
}

/**
 * ⚠️ Con `response_format` pedido, el modelo IGUAL devuelve a veces el JSON envuelto en ```json —
 * medido sobre la misma llamada que otras veces vuelve limpia. Sin quitar la cerca, `JSON.parse`
 * tira y se queman los reintentos por una respuesta que era correcta.
 */
export function parseJsonLoose(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  return JSON.parse(s)
}

/**
 * ⚠️ EL VALIDADOR DE CHAT NO ACEPTA UNA PROPIEDAD LLAMADA `type`: devuelve
 * `422 …properties.type must be string or array`, confundiendo la clave con la palabra reservada.
 * Se comprueba antes de gastar la llamada; el caller decide qué hacer (hoy: caer a Gemini directo).
 */
export function schemaAceptado(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(schemaAceptado)
  if (!node || typeof node !== 'object') return true
  const s = node as Record<string, unknown>
  const props = s.properties as Record<string, unknown> | undefined
  if (props && typeof props === 'object' && Object.prototype.hasOwnProperty.call(props, 'type')) return false
  return Object.values(s).every(schemaAceptado)
}

export class SchemaNoSoportado extends Error {}

export async function kieGeminiStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries: number,
  systemInstruction: string,
): Promise<T> {
  // ⚠️ EL SCHEMA VA PLANO, COMO SIEMPRE FUE POR EL SDK — sin `toStrictSchema`. Esa transformación
  // (todo en `required` + los opcionales marcados nullable) es un requisito de los structured
  // outputs de OPENAI, y el camino directo de Gemini nunca la usó: mandaba `z.toJSONSchema` tal
  // cual. Aplicarla acá obliga al modelo a rellenar campos que el schema dice que puede omitir, y
  // como la unión no se hace cumplir, inventa: medido, `bulletsAfter` —un array opcional que solo
  // tiene sentido en la sección antes/después— volvió como el STRING "Apto para todo tipo de
  // pieles" dentro de un hero, y el parse lo rechazó.
  //
  // Verificado además contra la API: este endpoint acepta `strict: true` con un `required` que NO
  // lista todas las propiedades, así que no hace falta el truco de OpenAI.
  const jsonSchema = toSingleTypes(z.toJSONSchema(schema)) as Record<string, unknown>
  if (!schemaAceptado(jsonSchema)) {
    throw new SchemaNoSoportado(`${schemaName}: el chat de KIE rechaza los schemas con una propiedad llamada "type"`)
  }

  let lastError: unknown = new Error(`kieGeminiStructured(${schemaName}): sin intentos`)
  for (let i = 0; i < maxRetries; i++) {
    try {
      const raw = await kieChat({
        model: KIE_GEMINI_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: contenido(parts) },
        ],
        // ⚠️ Los dos vienen en TRUE por defecto en este endpoint (lo dice la doc). Con `stream` la
        // respuesta llega como SSE y no como JSON; con `include_thoughts` el razonamiento viaja
        // dentro del contenido y rompe el parse del structured output.
        stream: false,
        include_thoughts: false,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_schema', json_schema: { name: schemaName.slice(0, 64), strict: true, schema: jsonSchema } },
      })
      const obj = parseJsonLoose(raw)
      let parsed = schema.safeParse(obj)
      // Recupera el caso común: strings sobre el `.max()` de zod → recorta y reintenta el PARSE.
      // ⚠️ EL RECORTE ES EL ÚLTIMO RECURSO, NO EL PRIMERO. Recortar en el primer intento REPARA en
      // silencio lo que el modelo escribió de más, y así nunca se le vuelve a pedir: el copy sale
      // amputado aunque un segundo intento lo habría escrito completo. Medido en una landing real
      // —"…con ingredientes de alta " y un titular cortado en "¡Espera a ver"— con el system
      // prompt diciéndole explícitamente que no llegue al tope.
      //
      // Ahora un `too_big` deja fallar el parse y se reintenta; solo en el ÚLTIMO intento se
      // recorta, para devolver algo en vez de tirar (que es el 500 tras tres intentos que este
      // recorte vino a evitar en su día).
      const ultimo = i === maxRetries - 1
      if (!parsed.success && ultimo && clampTooBigStrings(obj, parsed.error)) parsed = schema.safeParse(obj)
      if (parsed.success) return parsed.data
      lastError = parsed.error
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

export async function kieGeminiReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  return kieChat({
    model: KIE_GEMINI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: false,
    include_thoughts: false,
    max_tokens: MAX_TOKENS,
  })
}
