import type { Part } from '@google/genai'
import { generateImage } from '@/lib/gemini'
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
    `REAL, non-idealized features: visible skin texture, pores, freckles or fine lines as appropriate to the age, natural hair, believable body — NOT an airbrushed, glossy or "AI stock" look. A real Peruvian person you would meet, photographed well.`,
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
  const b64 = await generateImage([{ text: buildTalentPrompt(persona) }], 3, { aspectRatio: '3:4' })
  return b64 || null
}

// ─── Placa de ZONA (2026-08-15) ─────────────────────────────────────────────
// Segunda placa, encuadrada en la parte del cuerpo sobre la que actúa el producto y SIN rostro.
// La usan las secciones con protagonista menos el hero (ver `talent_zone_url` en types.ts).
//
// POR QUÉ UNA SEGUNDA IMAGEN Y NO UNA INSTRUCCIÓN DE RECORTE: el encuadre es GEOMETRÍA, y contra
// la plantilla curada —una imagen ráster que muestra un retrato— el texto pierde. Ya se midió con
// la luz: el carve-out estaba escrito y no movió un píxel. Lo que sí gana es otra IMAGEN: la placa
// adjunta es lo que la difusión copia, igual que hoy copia el envase canónico y la cara del talento.
//
// La placa canónica se adjunta como referencia para que sea la MISMA persona (tono de piel,
// complexión, ropa), aunque la cara no salga en cuadro: sin eso el tren inferior podría ser de otro
// cuerpo que el rostro del hero, y la landing dejaría de leerse como una sola persona.
function buildZonePrompt(persona: string, focus: BodyFocus): string {
  return [
    `Generate a REFERENCE PLATE of ONE real Latin-American person framed on ${BODY_FOCUS_FRAMING[focus]}. The person is: ${persona}.`,
    `The FIRST image attached is the same person's portrait: match her/his skin tone, body type, build and clothing EXACTLY. It is the SAME person — only the framing changes. Do NOT include the face in this plate even if the reference shows it.`,
    `Plain, smooth, evenly-lit NEUTRAL background (soft light grey/beige, no scenery, no props, no furniture). Soft, directional studio lighting.`,
    `REAL, non-idealized body: visible skin texture and natural proportions appropriate to the age — NOT airbrushed, NOT a fitness-model composite, NOT an "AI stock" look.`,
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
  const b64 = await generateImage(parts, 3, { aspectRatio: '3:4' })
  return b64 || null
}
