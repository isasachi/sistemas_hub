import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { NicheClassification, type NicheId } from './types'
import { NICHE_DEFAULT_DEMOGRAPHIC } from './niches'
import type { LandingSessionResponse } from './types'
import type { Part } from '@google/genai'

// Paso 0.a del spec (2026-07-23): clasifica el producto en niche_id/demographic_id antes de
// derivar identidad visual. Entrada: 1ª foto (inlineData) + labels/beneficios/audiencia como texto.
const PROMPT = `Clasifica este producto en exactamente una de las categorías del esquema. Devuelve la clave literal, nunca una descripción. Si dudas entre dos, elige la que describa mejor a QUIÉN le vendes, no de qué está hecho el producto. Devuelve además la demografía del comprador y tu nivel de confianza entre 0 y 1.`

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
    return { niche_id: niche, demographic_id: NICHE_DEFAULT_DEMOGRAPHIC[niche], confidence: 0, reasoning: 'fallback' }
  }
}
