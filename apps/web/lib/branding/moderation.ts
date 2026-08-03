import OpenAI from 'openai'

/**
 * Moderación del texto del usuario ANTES de la primera generación (spec 7.4).
 * El endpoint es gratis y evita pagar imágenes que el motor va a rechazar.
 *
 * ponytail: fail-open ante error de red o falta de key — igual que el resto del
 * hub. Un moderador caído no puede bloquear a un usuario legítimo; el motor
 * sigue teniendo su propio filtro.
 */
let _client: OpenAI | null = null
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

export async function isFlagged(text: string): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) return false
  try {
    const res = await client().moderations.create({ model: 'omni-moderation-latest', input: text })
    return res.results.some((r) => r.flagged)
  } catch (err) {
    console.warn('[moderation] falló, se deja pasar:', err)
    return false
  }
}
