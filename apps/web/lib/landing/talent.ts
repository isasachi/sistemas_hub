import type { Part } from '@google/genai'
import { generateImage, geminiGenerateImage, NANO_BANANA_2, NANO_BANANA_PRO } from '@/lib/gemini'
import { BODY_FOCUS_FRAMING } from './demographics'
import type { BodyFocus, DemographicId, PaletteTokens } from './types'

// Fase 4 C4.1 → paso 0.b (spec 2026-07-23). Placa canónica del TALENTO: un retrato de
// referencia generado UNA vez por sesión desde el `model_persona` del ADN (texto ya resuelto
// por lookup/extracción, ver extract-dna.ts), sobre fondo neutro liso. Se pasa como referencia
// a todas las secciones para que la persona no cambie entre ellas (como el producto canónico en
// F2). Es una PLACA, no una escena: fondo neutro a propósito. $0-rule OK (Gemini, no Anthropic).

// Construye el prompt del retrato a partir de la persona-texto (ya trae edad/rasgos/wardrobe/
// expresión en una sola frase, ver DEMOGRAPHIC_PERSONA). Pide rasgos reales no idealizados — es
// lo que hace creíbles las referencias del ADN (una cara "de stock IA" delata el creativo).
function buildTalentPrompt(persona: string): string {
  return [
    `Generate a HALF-BODY PORTRAIT of ONE real Latin-American person to be used as the fixed talent reference for a Peruvian e-commerce campaign: ${persona}.`,
    `Plain, smooth, evenly-lit NEUTRAL background (soft light grey/beige, no scenery, no props, no furniture). Soft, directional studio lighting. The person faces the camera, looking into the lens, natural relaxed posture, head and torso in frame.`,
    // ⚠️ "believable body" se acotó a la piel/los rasgos y NO al físico (2026-08-21): la persona
    // ahora puede traer una complexión leída del producto ("atlética", "con musculatura
    // desarrollada"), y una regla que empuje el cuerpo hacia lo genérico contradice al texto que la
    // describe DENTRO DEL MISMO PROMPT — el modo de fallo que este repo ya registró tres veces
    // (`estable` contra el micro-temblor, "no reescribas" contra la sección que pide reescribir).
    // Lo que sigue prohibido es el RETOQUE, que es lo que la regla siempre quiso decir.
    `REAL, non-idealized features: visible skin texture, pores, freckles or fine lines as appropriate to the age, natural hair — NOT an airbrushed, glossy or "AI stock" look. A real Peruvian person you would meet, photographed well. Render the build EXACTLY as the description states, neither slimmer nor more muscular than described.`,
    `This is a REFERENCE PLATE, not an ad: render ZERO text, letters, numbers, logos, watermarks, captions or graphics anywhere in the image. No product, no packaging.`,
  ].join('\n')
}

// Genera la placa de talento (base64) o null si `persona` viene vacía (no_talent: el carril lo
// llena el sustituto por nicho, no un retrato — ver NO_TALENT_SUBSTITUTE/demographics.ts). El
// caller sube a Storage y persiste talent_canonical_url. 3:4 retrato (como pide la fase).
// `demographic`/`palette` quedan en la firma para futuros matices (tono de wardrobe por
// paleta) — hoy la persona-texto ya basta para el prompt.
export async function generateTalent(
  persona: string,
  _demographic: DemographicId,
  _palette: PaletteTokens,
): Promise<string | null> {
  if (!persona.trim()) return null
  // El retrato sale por el MISMO par que las secciones, y eso no es cosmético: es la cara que se
  // repite en las 8 secciones, así que si el respaldo entrara acá con otro modelo que en el resto
  // de la landing, la persona cambiaría de sección a sección — el bug que esta placa existe para
  // evitar. Respaldo `nano-banana-pro`: es una pieza de identidad, no una imagen de relleno.
  const b64 = await generateImage([{ text: buildTalentPrompt(persona) }], 3, { aspectRatio: '3:4', respaldo: NANO_BANANA_PRO })
  return b64 || null
}

// ─── Placa de ZONA (2026-08-15) ─────────────────────────────────────────────
// Segunda placa, encuadrada en la parte del cuerpo sobre la que actúa el producto y SIN rostro.
// La usan las secciones con protagonista menos el hero (ver `talent_zone_url` en types.ts).
//
// ⚠️ PARA QUÉ SIRVE REALMENTE — medido, y NO es lo que se predijo. La apuesta era que el encuadre
// es geometría y que solo otra IMAGEN podía ganarle a la plantilla, como pasó con la luz (donde el
// carve-out de texto no movió un píxel). Se probó sobre una sesión real de creatina con zona
// `gluteos_piernas`, comparando la placa de zona contra la canónica con la MISMA pose de zona:
//
//   - El ENCUADRE lo movió el TEXTO: el control, con el retrato adjunto, también salió de tren
//     inferior. La pose de zona bastó. (No es el caso de la luz: acá el texto sí gana.)
//   - Lo que la placa aporta es la IDENTIDAD. Sin ella el modelo improvisó otro cuerpo — una
//     modelo fitness en top deportivo dentro de un gimnasio — que contradice `model_persona`
//     ("mujer 30-45, blusa neutra sencilla") y no es la persona del hero. Con la placa, el cuerpo
//     y la ropa son los del retrato canónico.
//
// O sea: la placa existe por CONSISTENCIA entre secciones, no por encuadre. Sigue valiendo su
// generación —una landing donde el hero y los beneficios muestran dos mujeres distintas está rota—
// pero no la borres pensando que el texto de encuadre no alcanza, ni la cites como el mecanismo
// que produce el recorte.
function buildZonePrompt(persona: string, focus: BodyFocus): string {
  return [
    `Generate a REFERENCE PLATE of ONE real Latin-American person framed on ${BODY_FOCUS_FRAMING[focus]}. The person is: ${persona}.`,
    `The FIRST image attached is the same person's portrait: match her/his skin tone, body type, build and clothing EXACTLY. It is the SAME person — only the framing changes. Do NOT include the face in this plate even if the reference shows it.`,
    `Plain, smooth, evenly-lit NEUTRAL background (soft light grey/beige, no scenery, no props, no furniture). Soft, directional studio lighting.`,
    // Mismo acote que en la placa canónica: "NOT a fitness-model composite" negaba de plano el
    // físico que `model_persona` puede estar pidiendo. Si las placas de zona empiezan a volver
    // null, mirá acá primero: `generateZonePlate` ya va derecho a nano-banana-2 porque el modelo
    // de imagen de OpenAI modera los encuadres de cuerpo sin rostro, y la ruta de talento cae en
    // silencio al retrato canónico — o sea devuelve la cara, que es justo el bug que la placa
    // existe para evitar.
    `REAL, non-idealized body: visible skin texture and natural proportions appropriate to the age — NOT airbrushed, NOT an "AI stock" look. Render the build EXACTLY as the description states, neither slimmer nor more muscular than described.`,
    `This is a REFERENCE PLATE, not an ad: render ZERO text, letters, numbers, logos, watermarks, captions or graphics anywhere in the image. No product, no packaging.`,
  ].join('\n')
}

// Genera la placa de zona (base64) o null si no aplica. `portraitB64` es la placa canónica ya
// generada: viaja como imagen de referencia para conservar la identidad del cuerpo.
export async function generateZonePlate(
  persona: string,
  focus: BodyFocus,
  portrait: { data: string; mimeType: string },
): Promise<string | null> {
  if (!persona.trim()) return null
  const parts: Part[] = [
    { inlineData: { mimeType: portrait.mimeType, data: portrait.data } },
    { text: buildZonePrompt(persona, focus) },
  ]
  // 3:4 como la canónica: es una placa de referencia, no una sección — el 9:16 lo pone el render.
  //
  // ⚠️ ES LA ÚNICA PIEZA DEL HUB QUE NO PASA POR `generateImage`, y no es un olvido: va DERECHO a
  // nano-banana-2, sin el primario de OpenAI y sin respaldo (decisión del dueño del repo,
  // 2026-09-17). El modelo de imagen de OpenAI RECHAZA esta imagen — medido con el prompt y el
  // retrato reales de una sesión de producción, 4/4 corridas → 400 `moderation_blocked`,
  // `safety_violations=[sexual]`, `moderation_stage: output`. Un encuadre de cuerpo sin rostro cae
  // del lado prohibido de su filtro y no hay forma de pedirlo que no lo haga, así que ponerlo de
  // primario es peaje garantizado y ponerlo de respaldo es una segunda oportunidad que ya se sabe
  // que no existe.
  //
  // ⚠️ NO LE AGREGUES UN RESPALDO "por las dudas": el único candidato es justo el que rechaza.
  // La placa canónica (retrato, CON cara) no tiene este problema y sigue por el camino normal.
  const b64 = await geminiGenerateImage(NANO_BANANA_2, parts, 3, { aspectRatio: '3:4' })
  return b64 || null
}
