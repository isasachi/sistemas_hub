import { GoogleGenAI, Modality, type Part, type Schema } from '@google/genai'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { openaiCallStructured, openaiCallReasoning, openaiGenerateImage } from './llm-openai'
import { clampTooBigStrings, correccionDeLargo, sliceToWord } from './llm-clamp'
import { GEMINI_TEXTO, NANO_BANANA_2, NANO_BANANA_PRO, type RespaldoImagen } from './modelos'

// Re-exportados desde el módulo hoja `llm-clamp.ts`: los usan también los call sites, y este
// archivo lo importa a él — dejarlos acá era un ciclo. Los importadores no cambiaron.
export { clampTooBigStrings, sliceToWord }

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! })
}

// ─── Motor de IA: los DOS SDK directos, sin KIE (2026-09-17) ─────────────────
// KIE queda reducido a UN recurso en todo el hub: el render de video con Grok
// (`lib/video-ads/kie.ts`, y con la key del USUARIO). Todo lo demás —texto, visión e imagen—
// sale por el SDK de Google o el de OpenAI.
//
// El par de TEXTO es uno solo y vale para todo el hub: **Gemini primario, OpenAI de respaldo**.
// Por eso `callStructured`/`callReasoning` ya no toman opciones: antes el orden se elegía por
// call site con `preferGemini`, y con Gemini de primario en todos lados ese flag solo podía
// significar "el orden de siempre". Los dos únicos sitios que NO quieren respaldo
// —el forense de video y la caja del producto de landing— llaman a `geminiCallStructured`
// directo, que es una función distinta y se lee como lo que es.
//
// ⚠️ NO HAY ESCAPES GLOBALES, y es a propósito (decisión del dueño del repo, 2026-09-17).
// `LLM_PROVIDER`, `GEMINI_VIA`, `IMAGE_VIA` y `LLM_IMAGE_TIMEOUT_MS` se borraron: cada call site
// declara su par, que es lo que se puede leer sin correr el programa. Si un modelo se cae, se
// cambia la constante de acá y se despliega.
// Los IDs viven en `lib/modelos.ts`, un módulo hoja: este archivo lee prompts del disco al
// importarse, así que un `'use client'` que necesite un id no puede pasar por acá. Se re-exportan
// para que un call site de servidor los pida donde le quede cómodo.
export { GEMINI_TEXTO, NANO_BANANA_2, NANO_BANANA_PRO, type RespaldoImagen }

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

/**
 * Gemini structured, SIN respaldo. Es el primario de `callStructured` y, además, la entrada que
 * usan los dos sitios que no quieren caer a OpenAI:
 *
 *  - el análisis forense del video (`analyze-reference`): el modelo de respaldo no procesa video,
 *    así que no hay a qué caer.
 *  - la caja del producto de landing (`extractProductBox`): el formato `box_2d [0-1000]` es en el
 *    que Gemini está entrenado y el respaldo devuelve cajas cortadas — un recorte mal hecho es
 *    peor que no tener recorte (decisión del dueño del repo, 2026-09-17).
 *
 * ⚠️ EL SCHEMA VA PLANO (`z.toJSONSchema` tal cual), NUNCA por `toStrictSchema`. Esa
 * transformación —todo en `required` + los opcionales nullable— es un requisito de los structured
 * outputs de OpenAI y vive en `llm-openai.ts`. Aplicarla acá obliga al modelo a rellenar campos
 * que el schema dice que puede omitir, y entonces los inventa: medido con `bulletsAfter`, un
 * array opcional que volvió como un STRING dentro de un hero. Verificado el 2026-09-17 contra
 * `gemini-3.6-flash`: con el schema plano, un opcional omitido vuelve ausente.
 */
export async function geminiCallStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3,
  systemInstruction: string = SYSTEM_PROMPT,
): Promise<T> {
  let lastError: unknown = new Error(`geminiCallStructured(${schemaName}): no attempts`)
  // El reintento NO puede mandar el mismo prompt: ver `correccionDeLargo`.
  let correccion: string | null = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: GEMINI_TEXTO,
        contents: [{ role: 'user', parts: correccion ? [...parts, { text: correccion }] : parts }],
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
      correccion = correccionDeLargo(parsed.error)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/**
 * Texto+visión estructurado: **Gemini primario, OpenAI de respaldo**. Es el par de TODO el hub
 * —anuncios, video, branding y landing— y por eso no toma opciones.
 *
 * El respaldo es visión también: verificado el 2026-09-17 que `gpt-5.4-nano` acepta una imagen
 * por `toChatContent` y responde con `response_format: json_schema strict`. Sin eso, el respaldo
 * de `analyze-reference` y del scan de producto sería letra muerta.
 */
export async function callStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3,
  systemInstruction: string = SYSTEM_PROMPT,
): Promise<T> {
  try {
    return await geminiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
  } catch (e) {
    console.warn(`[llm] Gemini structured (${schemaName}) falló → respaldo OpenAI`, e)
    return openaiCallStructured(schemaName, schema, parts, maxRetries, systemInstruction)
  }
}

/** Texto libre por Gemini, sin respaldo. El primario de `callReasoning`. */
async function geminiCallReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await getAI().models.generateContent({
    model: GEMINI_TEXTO,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: { systemInstruction: systemPrompt },
  })
  return res.text ?? ''
}

/** Texto libre (razonamiento): mismo par que `callStructured` — Gemini primario, OpenAI respaldo. */
export async function callReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const out = await geminiCallReasoning(systemPrompt, userMessage)
    if (out.trim()) return out // vacío no tira: cae al respaldo igual que un error
  } catch (e) {
    console.warn('[llm] Gemini reasoning falló → respaldo OpenAI', e)
  }
  return openaiCallReasoning(systemPrompt, userMessage)
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

/**
 * Generación de imagen por el SDK de Google, con el modelo EXPLÍCITO.
 *
 * Es el respaldo de `generateImage` y, además, el camino único de la placa de zona de landing
 * (ver `generateZonePlate`). Por eso es pública y pide el modelo: los dos de Google no son
 * intercambiables — `nano-banana-2` es el barato y `nano-banana-pro` el que se paga donde la
 * pieza es la cara de la marca.
 *
 * ⚠️ Agrega la SPANISH_RULE, igual que `generateImage`: quien llame acá directo no tiene que
 * acordarse de ponerla.
 */
export async function geminiGenerateImage(
  modelo: typeof NANO_BANANA_2 | typeof NANO_BANANA_PRO,
  parts: Part[],
  maxRetries: number,
  opts?: { aspectRatio?: string; imageSize?: string }
): Promise<string> {
  const allParts: Part[] = [...parts, { text: SPANISH_RULE }]
  let lastError: unknown = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: modelo,
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

/**
 * Generación de imagen del hub: **gpt-image-2.5-sunburst primario, `respaldo` de segunda**.
 *
 * El primario es el mismo en todas las piezas (decisión del dueño del repo, 2026-09-17); lo que
 * cambia por pieza es el respaldo, y por eso `respaldo` es OBLIGATORIO y `opts` también: un call
 * site nuevo que se lo olvide NO COMPILA. Un default acá sería un respaldo silencioso, que es
 * justo el modo de fallo caro de este repo — "el diseño cambió" sin que nadie tocara el diseño.
 *
 * ⚠️ QUE EL RESPALDO EXISTA NO ES DECORACIÓN. Una imagen rechazada por MODERACIÓN cae por el
 * mismo `catch` que un fallo de red, y ahí el respaldo es la respuesta correcta: está medido que
 * el modelo de OpenAI rechaza ~1 de cada 3 imágenes sobre una foto de persona con el MISMO
 * prompt y la MISMA foto. Reintentar con el que ya dijo que no es repetirle la pregunta —
 * `isPermanentOpenAiError` trata `moderation_blocked` como permanente justo para no quemar los
 * reintentos antes de llegar acá.
 *
 * ⚠️ La única pieza que NO pasa por acá es la placa de zona de landing: va derecho a
 * `geminiGenerateImage(NANO_BANANA_2, …)` porque el primario la rechaza 4 de 4 (ver
 * `generateZonePlate`).
 */
export async function generateImage(
  parts: Part[],
  maxRetries: number,
  opts: { aspectRatio?: string; imageSize?: string; respaldo: RespaldoImagen }
): Promise<string> {
  const { respaldo } = opts
  const allParts: Part[] = [...parts, { text: SPANISH_RULE }]
  try {
    const out = await openaiGenerateImage(allParts, maxRetries, opts)
    if (out) return out
    console.warn(`[llm] gpt-image-2.5-sunburst vacía → respaldo ${respaldo}`)
  } catch (e) {
    console.warn(`[llm] gpt-image-2.5-sunburst falló → respaldo ${respaldo}`, e)
  }
  // `parts` sin la SPANISH_RULE: `geminiGenerateImage` la pone por su cuenta.
  return geminiGenerateImage(respaldo, parts, maxRetries, opts)
}

// Edición exclusiva sobre una imagen ya generada (regen con prompt en landing/branding):
// aplica SOLO el cambio pedido y deja el resto pixel-idéntico, igual que el refine de
// anuncios. Reusa generateImage → hereda retry, aspectRatio y la SPANISH_RULE.
export async function editWithPrompt(
  base64: string,
  mime: string,
  prompt: string,
  opts: { aspectRatio?: string; imageSize?: string; respaldo: RespaldoImagen }
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
  // Pasa por `generateImage` en vez de llamar a Gemini directo: comparados sobre el mismo anuncio
  // y el mismo instructivo, el modelo de imagen de OpenAI rinde mejor en el detalle de la etiqueta
  // y en el rostro. Hereda la SPANISH_RULE y el retry.
  //
  // Respaldo `nano-banana-2` y no el pro: acá lo que se replica es el LAYOUT de una referencia que
  // ya existe, no una pieza de identidad de marca (decisión del dueño del repo, 2026-09-17).
  return generateImage(parts, 3, { ...(aspectRatio ? { aspectRatio } : {}), respaldo: NANO_BANANA_2 })
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
  // El MISMO par que `editImage`: un refine que cayera a otro respaldo cambiaría de estética a
  // mitad de sesión sin que nadie tocara el prompt.
  return generateImage(parts, 3, { ...(aspectRatio ? { aspectRatio } : {}), respaldo: NANO_BANANA_2 })
}
