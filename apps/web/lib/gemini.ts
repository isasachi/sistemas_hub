import { GoogleGenAI, Modality, type Part, type Schema } from '@google/genai'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { openaiCallStructured, openaiCallReasoning, openaiGenerateImage } from './llm-openai'
import { kieGeminiStructured, kieGeminiReasoning } from './kie-gemini'
import { kieGenerateImage, type ModeloImagen } from './kie-image'
import { clampTooBigStrings, sliceToWord } from './llm-clamp'

// Re-exportados desde el módulo hoja `llm-clamp.ts`: los necesita también `kie-gemini.ts`, y este
// archivo lo importa a él — dejarlos acá era un ciclo. Los importadores no cambiaron.
export { clampTooBigStrings, sliceToWord }

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! })
}

// ─── Motor de IA: OpenAI PRIMARIO, Gemini FALLBACK (2026-07-23) ──────────────
// Antes Gemini era el motor y OpenAI un cableado alternativo tras un flag. Ahora se invierte: el
// motor principal (texto, visión, imagen) es el SDK de OpenAI (gpt-4o-mini + gpt-image-2); si una
// llamada de OpenAI falla (error, vacío o timeout), se cae a Gemini. Escape hatch: `LLM_PROVIDER=
// gemini` fuerza Gemini-only (sin tocar OpenAI) — útil para costo o si OpenAI está caído.
function geminiForced(): boolean {
  return process.env.LLM_PROVIDER === 'gemini'
}

// ─── Recurso migrado a KIE: el texto/visión de Gemini (2026-08-25) ───────────
// `gemini-2.5-flash` sale por `api.kie.ai` en vez del SDK de Google. Es UN recurso: gpt-4o-mini
// sigue primario donde lo era, la IMAGEN de Gemini (`gemini-3.1-flash-image`) sigue en el SDK, y
// el render de video y el worker no se tocan.
//
// ⚠️ `GEMINI_VIA=direct` lo devuelve al SDK sin revertir código. Es lo que hace reversible el
// slice: si KIE se cae PARA ESTE RECURSO, se cambia una variable y no hay que desplegar nada.
export function geminiEsDirecto(): boolean {
  return process.env.GEMINI_VIA === 'direct'
}
function viaDirecta(): boolean {
  return geminiEsDirecto()
}

// ─── Recurso migrado a KIE: la IMAGEN (2026-08-25) ──────────────────────────
// `gpt-image-2` y `gemini-3.1-flash-image` (en KIE, `nano-banana-2`) salen por el marketplace.
// El par no cambia: gpt-image-2 primario, nano-banana-2 de respaldo, y `preferGemini` lo invierte.
//
// ⚠️ `IMAGE_VIA=direct` devuelve el recurso a los SDK sin desplegar. Va aparte de `GEMINI_VIA`
// porque son dos recursos distintos: se puede tener el texto en KIE y la imagen en los SDK, o al
// revés, que es justo el punto de migrar de a uno.
function imagenDirecta(): boolean {
  return process.env.IMAGE_VIA === 'direct'
}

// ⚠️ Latencia de imagen (constraint de despliegue, NO se resuelve solo con este cableado):
// gpt-image-2 tarda ~60-90s por imagen (medido). Las rutas de imagen en Vercel Hobby tienen
// maxDuration 60s → OpenAI como primario de imagen las 504-earía en PROD antes de poder caer a
// Gemini (el timeout de Vercel mata el request). Default aquí = SIN timeout (0): en local/testing
// OpenAI corre completo (honra "OpenAI primario de imagen"). Para PROD, setear `LLM_IMAGE_TIMEOUT_MS`
// (p.ej. 45000) hace que un OpenAI lento se abandone y caiga a Gemini (~15s) dentro del presupuesto
// — a costa de que la imagen la termine haciendo Gemini. Alternativa: `LLM_PROVIDER=gemini` (imagen
// Gemini-primaria en prod) o subir maxDuration en un plan Vercel pago. Texto/visión (gpt-4o-mini)
// responden en segundos y no tienen este problema.
function imageTimeoutMs(): number {
  const n = Number(process.env.LLM_IMAGE_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 0
}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return p
  let t: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => { t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms) })
  return Promise.race([p.finally(() => clearTimeout(t)), timeout])
}

export const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/gemini-system.md'),
  'utf-8'
)

export const STEP5_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/step5.md'),
  'utf-8'
)

export const BRANDING_SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/branding-system.md'),
  'utf-8'
)

// Gemini structured (fallback). Contiene la lógica de recuperación de strings 'too_big'.
// Exportada también como entrada directa para el análisis forense de video:
// `callStructured` es OpenAI-primario y gpt-4o-mini no acepta partes de video, así que
// ahí no sirven ni el fallback ni `preferGemini`.
export async function geminiCallStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3,
  systemInstruction: string = SYSTEM_PROMPT,
): Promise<T> {
  return viaDirecta()
    ? geminiDirectoStructured(schemaName, schema, parts, maxRetries, systemInstruction)
    : kieGeminiStructured(schemaName, schema, parts, maxRetries, systemInstruction)
}

/** El camino de siempre por `@google/genai`. Solo se usa con `GEMINI_VIA=direct`. */
async function geminiDirectoStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries: number,
  systemInstruction: string,
): Promise<T> {
  let lastError: unknown = new Error(`geminiCallStructured(${schemaName}): no attempts`)
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: z.toJSONSchema(schema) as Schema,
        },
      })
      const obj = JSON.parse(res.text ?? '')
      let parsed = schema.safeParse(obj)
      // Recupera el caso común: strings sobre el límite → recorta y reintenta el parse (no la API).
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

// Texto+visión estructurado: OpenAI (gpt-4o-mini) primario, Gemini fallback en fallo.
// `preferGemini`: invierte el orden para tareas donde Gemini es netamente mejor — la detección de
// bounding box (`extractProductBox`) usa el formato box_2d [0-1000] en el que Gemini está entrenado;
// gpt-4o-mini devuelve cajas imprecisas (recortes cortados). Gemini primario + OpenAI fallback ahí.
export async function callStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3,
  systemInstruction: string = SYSTEM_PROMPT,
  opts?: { preferGemini?: boolean }
): Promise<T> {
  if (geminiForced()) return geminiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
  if (opts?.preferGemini) {
    try {
      return await geminiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
    } catch (e) {
      console.warn(`[llm] Gemini structured (${schemaName}, preferGemini) falló → fallback a OpenAI`, e)
      return openaiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
    }
  }
  try {
    return await openaiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
  } catch (e) {
    console.warn(`[llm] OpenAI structured (${schemaName}) falló → fallback a Gemini`, e)
    return geminiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
  }
}

// Texto libre (razonamiento): OpenAI primario, Gemini fallback.
async function geminiCallReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  return viaDirecta() ? geminiDirectoReasoning(systemPrompt, userMessage) : kieGeminiReasoning(systemPrompt, userMessage)
}

/** El camino de siempre por `@google/genai`. Solo se usa con `GEMINI_VIA=direct`. */
async function geminiDirectoReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: { systemInstruction: systemPrompt },
  })
  return res.text ?? ''
}

// `preferGemini`: mismo escape hatch que `callStructured`. Lo usa el generador de anuncios
// (STEP5): armar el instructivo de imagen es una cadena de razonamiento contextual (§10:
// identificar → evaluar contra el público → decidir) y gpt-4o-mini es el techo de calidad ahí,
// igual que lo medido para video-ads (ver AGENTS.md). No se invierte globalmente: branding y
// landing siguen con OpenAI primario.
export async function callReasoning(
  systemPrompt: string,
  userMessage: string,
  opts?: { preferGemini?: boolean }
): Promise<string> {
  if (geminiForced()) return geminiCallReasoning(systemPrompt, userMessage)
  if (opts?.preferGemini) {
    try {
      const out = await geminiCallReasoning(systemPrompt, userMessage)
      if (out.trim()) return out // vacío no tira: cae a OpenAI igual que un error
    } catch (e) {
      console.warn('[llm] Gemini reasoning (preferGemini) falló → fallback a OpenAI', e)
    }
    return openaiCallReasoning(systemPrompt, userMessage)
  }
  try {
    return await openaiCallReasoning(systemPrompt, userMessage)
  } catch (e) {
    console.warn('[llm] OpenAI reasoning falló → fallback a Gemini', e)
    return geminiCallReasoning(systemPrompt, userMessage)
  }
}

// Generación de imagen genérica (texto→imagen o imágenes+texto). La usa el
// generador de branding: logo (solo texto), etiqueta (logo + texto), mockup
// (etiqueta + envase + texto). Reintenta ante fallos transitorios de red/empty
// (igual que callStructured) — las llamadas de imagen no son idempotentes pero
// solo reintentamos cuando NO hubo resultado. Devuelve '' si nunca produjo imagen.
// `opts.aspectRatio` (ej '9:16') controla el formato — lo usa el generador de landing
// para secciones portrait; omitido = formato libre del modelo (branding).
// Regla de idioma compartida por TODA generación de imagen (branding, landing,
// anuncios). El texto visible del resultado siempre va en español neutro, traduciendo
// cualquier texto en otro idioma que venga en refs/plantillas. Se inyecta en el choke
// point (las 3 funciones de imagen) para no repetirla en cada builder de prompt.
const SPANISH_RULE =
  'MANDATORY LANGUAGE RULE: every visible word rendered in the output image MUST be in neutral Latin-American Spanish (español neutro). If any reference image, template or input contains text in English or another language, TRANSLATE it into neutral Spanish — never copy, keep or render foreign-language words. This overrides any text seen in the inputs.'

// Generación de imagen con Gemini (fallback). `allParts` ya trae la SPANISH_RULE.
async function geminiGenerateImage(
  allParts: Part[],
  maxRetries: number,
  opts?: { aspectRatio?: string; imageSize?: string }
): Promise<string> {
  let lastError: unknown = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: [{ role: 'user', parts: allParts }],
        config: {
          responseModalities: [Modality.IMAGE],
          ...(opts?.aspectRatio
            ? { imageConfig: { aspectRatio: opts.aspectRatio, imageSize: opts.imageSize ?? '2K' } }
            : {}),
        },
      })
      const imagePart = res.candidates?.[0]?.content?.parts?.find((p: Part) => p.inlineData)
      const data = imagePart?.inlineData?.data
      if (data) return data
    } catch (e) {
      lastError = e
    }
  }
  if (lastError) throw lastError
  return ''
}

export async function generateImage(
  parts: Part[],
  maxRetries = 3,
  opts?: { aspectRatio?: string; imageSize?: string; preferGemini?: boolean }
): Promise<string> {
  const allParts: Part[] = [...parts, { text: SPANISH_RULE }]

  // Por KIE los dos modelos hablan el mismo protocolo, así que el par se arma acá y el orden es el
  // de siempre: `preferGemini` pone a nano-banana-2 (gemini-3.1-flash-image) de primario. Lo usan
  // la placa de zona de landing —donde gpt-image-2 modera el encuadre de cuerpo sin rostro en 4 de
  // 4 corridas— y el avatar y las anclas del video.
  if (!imagenDirecta() && !geminiForced()) {
    const [primero, segundo]: ModeloImagen[] = opts?.preferGemini
      ? ['nano-banana-2', 'gpt-image-2']
      : ['gpt-image-2', 'nano-banana-2']
    try {
      const out = await kieGenerateImage(primero, allParts, maxRetries, opts)
      if (out) return out
      console.warn(`[llm] imagen ${primero} vacía → respaldo ${segundo}`)
    } catch (e) {
      // Una imagen rechazada por MODERACIÓN cae acá igual que un fallo de red, y el respaldo es la
      // respuesta correcta: está medido que gpt-image-2 rechaza ~1 de cada 3 sobre una foto de
      // persona, con la misma foto y el mismo prompt. Reintentar con el que ya dijo que no es
      // repetirle la pregunta.
      console.warn(`[llm] imagen ${primero} falló → respaldo ${segundo}`, e)
    }
    return kieGenerateImage(segundo, allParts, maxRetries, opts)
  }

  if (geminiForced()) return geminiGenerateImage(allParts, maxRetries, opts)
  // `preferGemini` invierte el orden de proveedores para UNA llamada, igual que en callStructured.
  // Existe porque hay imágenes que gpt-image-2 rechaza SIEMPRE por política de contenido — la placa
  // de talento encuadrada en el tren inferior es el caso medido (`moderation_blocked`,
  // `safety_violations=[sexual]`, 4/4 corridas). Para esas, OpenAI de primario es 19s de peaje
  // garantizado antes de un fallback que igual iba a ocurrir.
  //
  // El fallback a OpenAI se conserva (misma forma que callStructured) y NO es contradictorio: cubre
  // que Gemini caiga por algo transitorio —un 500, un pico de cuota— donde OpenAI sí respondería.
  // Solo en la doble falla se pagan esos 19s, y ahí es preferible el último intento a devolver ''.
  if (opts?.preferGemini) {
    try {
      const out = await geminiGenerateImage(allParts, maxRetries, opts)
      if (out) return out
      console.warn('[llm] Gemini image vacía (preferGemini) → fallback a OpenAI')
    } catch (e) {
      console.warn('[llm] Gemini image falló (preferGemini) → fallback a OpenAI', e)
    }
    return withTimeout(openaiGenerateImage(allParts, maxRetries, opts), imageTimeoutMs())
  }
  // OpenAI primario (gpt-image-2, edit multi-imagen si hay refs), acotado por timeout para caber en
  // el presupuesto de Vercel; vacío/timeout/error → Gemini. gpt-image-2 no acepta aspectRatio libre,
  // solo tamaños fijos (ver openaiGenerateImage/sizeFor); Gemini sí respeta opts.aspectRatio.
  try {
    const out = await withTimeout(openaiGenerateImage(allParts, maxRetries, opts), imageTimeoutMs())
    if (out) return out
    console.warn('[llm] OpenAI image vacía → fallback a Gemini')
  } catch (e) {
    console.warn('[llm] OpenAI image falló/timeout → fallback a Gemini', e)
  }
  return geminiGenerateImage(allParts, maxRetries, opts)
}

// Edición exclusiva sobre una imagen ya generada (regen con prompt en landing/branding):
// aplica SOLO el cambio pedido y deja el resto pixel-idéntico, igual que el refine de
// anuncios. Reusa generateImage → hereda retry, aspectRatio y la SPANISH_RULE.
export async function editWithPrompt(
  base64: string,
  mime: string,
  prompt: string,
  opts?: { aspectRatio?: string; imageSize?: string }
): Promise<string> {
  const parts: Part[] = [
    { inlineData: { mimeType: mime, data: base64 } },
    {
      text: [
        `Image 1 is the current design. Apply ONLY the change requested below and treat it as`,
        `exclusive: modify exactly what is asked and keep EVERYTHING else — product, logo, text,`,
        `copy, layout, colors, background and composition — pixel-identical to image 1. Do NOT`,
        `redesign, re-render or "improve" anything not asked. Change request: ${prompt}`,
      ].join(' '),
    },
  ]
  return generateImage(parts, 3, opts)
}

// Fidelidad de producto en el ad final (anuncios): el producto real (Image 2) pasa tal
// cual al ad, reemplazando al producto que tuviera la referencia (Image 1); si la
// referencia no muestra producto físico, se inserta de forma natural. Anclado en el
// choke point para garantizarlo aunque el instructivo de razonamiento sea débil.
const PRODUCT_RULE =
  'PRODUCT FIDELITY (mandatory): Image 2 is the REAL product. Render it in the final ad EXACTLY as it appears in Image 2 — identical shape, proportions, colors, finish and label (every text and graphic printed on the label reproduced faithfully; do not simplify, alter or omit any detail). This product MUST REPLACE whatever product appears in Image 1 (the reference ad), taking over its physical position and integration. If Image 1 shows no physical product, insert the product from Image 2 into the scene naturally and believably. Never invent, redraw, restyle or substitute the product.'

// ⚠️ `aspectRatio` NO es opcional de verdad: sin `imageConfig` el modelo elige el formato y
// una referencia 9:16 salía como ad 16:9 (sesión 4c8f6c8b, verificado: ref 335x597 → out
// 1376x768). El ratio se mide del archivo de referencia (`aspectRatioOf`), no del texto que
// devuelve el análisis — ese decía "16:9" sobre una imagen vertical. Se deja `| undefined`
// solo para el caso en que sharp no pueda leer el archivo.
export async function editImage(
  refBase64: string, refMime: string,
  productBase64: string, productMime: string,
  logoBase64: string | null, logoMime: string | null,
  instruction: string,
  aspectRatio?: string
): Promise<string> {
  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refBase64 } },
    { inlineData: { mimeType: productMime, data: productBase64 } },
    ...(logoBase64 && logoMime ? [{ inlineData: { mimeType: logoMime, data: logoBase64 } } as Part] : []),
    { text: instruction },
    { text: PRODUCT_RULE },
  ]
  // Pasa por `generateImage` (gpt-image-2 primario, Gemini fallback) en vez de llamar a Gemini
  // directo: comparados sobre el mismo anuncio y el mismo instructivo, gpt-image-2 rinde
  // mejor en el detalle de la etiqueta y en el rostro. Hereda la SPANISH_RULE y el retry.
  return generateImage(parts, 3, aspectRatio ? { aspectRatio } : undefined)
}

// ⚠️ La gente sale de la imagen ACTUAL, nunca de la referencia. `generate-image` adapta el
// sujeto al targetAudience (§10 de STEP5); refine no ve ese instructivo, y sin nombrar a las
// personas en la lista de "conservar" el modelo volvía al hombre de la referencia — medido 2/2
// con targetAudience "Mujeres de 20-40". La rama sin feedback es la peor porque ancla al layout
// de la imagen 1: el ancla es el LAYOUT, no quién aparece.
export function refinePrompt(resultImageNumber: number, feedback: string): string {
  const identityLock =
    `The people in image ${resultImageNumber} were already adapted to this ad's target audience: ` +
    `keep their gender, age, skin tone, hair and appearance exactly as they are in image ` +
    `${resultImageNumber}. NEVER revert them to the person shown in image 1.`
  // ⚠️ Mismo hueco que el identityLock, y por el mismo camino. STEP5 re-apunta los marcadores de
  // atención a la zona del producto y recolorea la paleta con la marca del usuario; refine no ve
  // ese instructivo, así que sin nombrar las dos cosas en la lista de "conservar" la imagen 1 las
  // tira de vuelta: las flechas vuelven al abdomen de la referencia y el CTA a su color viejo.
  const adaptationLock =
    `The attention markers in image ${resultImageNumber} — arrows, callouts, circles, highlights, ` +
    `before/after halves — already point at the body zone this product acts on, and its color ` +
    `palette is already this brand's. Keep both exactly as they are in image ${resultImageNumber}. ` +
    `NEVER re-aim them at the zone shown in image 1, and never restore image 1's colors.`
  // ⚠️ TERCER CANDADO, MISMO HUECO. STEP5 congela el tratamiento tipográfico de la referencia y
  // deja que solo cambie el COLOR del texto; refine no lee ese instructivo, así que sin nombrarlo
  // acá la regeneración re-tipografía el anuncio — cambia la familia, el peso o la caja "para que
  // combine con la marca" y el anuncio deja de espejar a la referencia, que es lo único que esta
  // tool promete replicar.
  //
  // ⚠️ Ojo con la rama SIN feedback: ahí se pide una variación de tratamiento visual, y sin este
  // candado la tipografía es justo lo primero que un modelo entiende por "otra versión".
  const typographyLock =
    `The typographic treatment in image ${resultImageNumber} — typeface, weight, case, ` +
    `letter-spacing, alignment, the size hierarchy between blocks, and any effect on the letters ` +
    `(outline, shadow, highlight box, angled baseline) — was copied from the reference on purpose. ` +
    `Reproduce it exactly. Only the text COLOR may differ, and it already does. Never restyle, ` +
    `re-set or "modernize" the type, and never resize one text block relative to another.`
  // Con feedback el cambio es SAGRADO y EXCLUSIVO: solo eso, el resto pixel-idéntico
  // (no redibujar ni "mejorar" lo no pedido). Sin feedback, una variación fresca
  // (el botón "Regenerar" sin texto debe dar algo distinto, no un eco de la misma).
  return feedback.trim()
    ? [
        `Image ${resultImageNumber} above is the current ad. Apply ONLY the change requested below`,
        `and treat it as exclusive: modify exactly what is asked and keep EVERYTHING else —`,
        `product, logo, copy, text, layout, colors, background, composition and the people —`,
        `pixel-identical to image ${resultImageNumber}. Do NOT redesign, re-render or "improve"`,
        `anything not asked.`,
        identityLock,
        adaptationLock,
        typographyLock,
        `Change request: ${feedback.trim()}`,
      ].join(' ')
    : [
        // ⚠️ "variar la composición" era licencia para abandonar la plantilla, que es lo
        // único que esta tool promete replicar. La variación se acota a tratamiento visual:
        // el layout de la referencia (Image 1) sigue siendo la ley.
        `Image ${resultImageNumber} above is the current ad. Produce a fresh alternative version:`,
        `keep the same product, logo, copy and people, AND the layout, composition and format of`,
        `image 1 (the reference ad) — from image 1 copy ONLY the layout, never who appears in it.`,
        identityLock,
        adaptationLock,
        typographyLock,
        `Vary only the visual treatment — lighting, framing detail, background texture, and how`,
        `strongly the accents read WITHIN that same palette — so it reads as a different take of`,
        `the same ad, never a redesign.`,
      ].join(' ')
}

export async function refineImage(
  refBase64: string, refMime: string,
  productBase64: string, productMime: string,
  logoBase64: string | null, logoMime: string | null,
  resultBase64: string, resultMime: string,
  feedback: string,
  aspectRatio?: string
): Promise<string> {
  const logoCount = logoBase64 ? 1 : 0
  const resultImageNumber = 3 + logoCount
  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refBase64 } },
    { inlineData: { mimeType: productMime, data: productBase64 } },
    ...(logoBase64 && logoMime ? [{ inlineData: { mimeType: logoMime, data: logoBase64 } } as Part] : []),
    { inlineData: { mimeType: resultMime, data: resultBase64 } },
    { text: refinePrompt(resultImageNumber, feedback) },
  ]
  return generateImage(parts, 3, aspectRatio ? { aspectRatio } : undefined)
}
