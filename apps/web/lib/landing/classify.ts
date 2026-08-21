import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { NicheClassification, type NicheId } from './types'
import { NICHE_DEFAULT_DEMOGRAPHIC } from './niches'
import type { LandingSessionResponse } from './types'
import type { Part } from '@google/genai'

// Paso 0.a del spec (2026-07-23): clasifica el producto en niche_id/demographic_id antes de
// derivar identidad visual. Entrada: 1ª foto (inlineData) + labels/beneficios/audiencia como texto.
const PROMPT = `Clasifica este producto en exactamente una de las categorías del esquema. Devuelve la clave literal, nunca una descripción. Si dudas entre dos, elige la que describa mejor a QUIÉN le vendes, no de qué está hecho el producto. Devuelve además la demografía del comprador y tu nivel de confianza entre 0 y 1.

body_focus: la PARTE DEL CUERPO sobre la que actúa el producto — la que habría que MOSTRAR en la pieza para que se entienda la promesa. Decidila por el BENEFICIO y el ÁNGULO, no por la categoría: dos productos de la misma categoría pueden tener zonas distintas (una creatina para masa muscular es \`cuerpo_completo\`; una creatina que promete glúteos es \`gluteos_piernas\`). Un sérum para el acné es \`rostro\`; una rodillera es \`rodilla\`; un colágeno para uñas es \`manos\`. Si el producto se toma para un bienestar general sin una zona visible, usá \`cuerpo_completo\` — es la AUSENCIA de zona (la pieza sale con el retrato de medio cuerpo), nunca un encuadre de cuerpo entero. Si de verdad la promesa se ve en la cara, usá \`rostro\` — es el valor correcto para media categoría de belleza, no un cajón de sastre.`

export async function classifyNiche(session: LandingSessionResponse): Promise<NicheClassification> {
  try {
    const parts: Part[] = []
    const photo = session.product_photo_urls?.[0]
    if (photo) {
      const { data, mimeType } = await fetchAsBase64(photo)
      parts.push({ inlineData: { mimeType, data } })
    }
    const ctx = [
      session.product_labels && `Etiquetas: ${session.product_labels}`,
      session.benefits && `Beneficios: ${session.benefits}`,
      session.audience && `Público: ${session.audience}`,
    ].filter(Boolean).join('\n')
    parts.push({ text: `${PROMPT}\n\n${ctx}` })
    return await callStructured('niche_classification', NicheClassification, parts)
  } catch {
    // callStructured ya reintentó internamente (maxRetries=3) — fallback duro tras agotarlos.
    // También captura fallos de fetchAsBase64 (foto eliminada, network error, etc).
    const niche: NicheId = 'generic'
    // `rostro` como fallback = el comportamiento histórico (todas las poses eran de rostro).
    return { niche_id: niche, demographic_id: NICHE_DEFAULT_DEMOGRAPHIC[niche], body_focus: 'rostro', confidence: 0, reasoning: 'fallback' }
  }
}
