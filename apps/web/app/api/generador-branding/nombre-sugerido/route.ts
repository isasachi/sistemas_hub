import { NextResponse } from 'next/server'
import { z } from 'zod'
import { callStructured, BRANDING_SYSTEM_PROMPT } from '@/lib/gemini'
import { BRAND_NAME_MAX, cleanNameSuggestions, feelWords } from '@/lib/branding/brief'

/**
 * Nombres de marca propuestos por el LLM (paso 2 del brief).
 * ---------------------------------------------------------------------------
 * Texto, no imagen: la misma llamada barata que `estilo-sugerido`.
 *
 * En el paso 2 lo único que existe del brief es la categoría y el producto —
 * público y actitud se preguntan DESPUÉS. Por eso las líneas del prompt son
 * condicionales: mandar "Buyer:" vacío empeora la propuesta en el camino normal.
 *
 * ponytail: sin quota, igual que estilo-sugerido — todavía no hay sesión en DB a
 * la cual cobrarle. El freno es que se dispara solo con clic del usuario.
 */

// max generoso a propósito: el recorte duro (BRAND_NAME_MAX) lo hace
// `cleanNameSuggestions`, que descarta en vez de truncar un nombre mutilado.
// Un `.max()` ajustado acá haría fallar el parse entero por un nombre largo.
const SuggestedNames = z.object({
  names: z.array(z.string().min(2).max(40)).min(1).max(10),
})

const Body = z.object({
  category: z.string().default(''),
  productDescription: z.string().default(''),
  audience: z.array(z.string()).default([]),
  feel: z.array(z.string()).default([]),
})

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json())

    const prompt = [
      'Propose 6 brand names for the product below.',
      '',
      `Product: ${b.productDescription}`,
      b.category ? `Category: ${b.category}` : '',
      b.audience.length ? `Buyer: ${b.audience.join(', ')}` : '',
      b.feel.length ? `Brand feel: ${feelWords(b.feel)}` : '',
      '',
      'Rules:',
      '- Names a Latin-American buyer can read, say and remember. Spanish, or an invented',
      '  word that sounds natural in Spanish. No English marketing words.',
      `- One or two words, never over ${BRAND_NAME_MAX} characters, no punctuation, no slogans,`,
      '  no legal suffixes (SAC, SRL) and no descriptive labels ("Magnesio Premium").',
      '- Vary the register: some evocative, some invented, some plain. Six near-identical',
      '  names are worth one name.',
    ].filter(Boolean).join('\n')

    const { names } = await callStructured('branding_names', SuggestedNames, [{ text: prompt }], 2, BRANDING_SYSTEM_PROMPT)
    return NextResponse.json({ names: cleanNameSuggestions(names) })
  } catch (err) {
    // Nunca 500: sin propuestas el usuario escribe el nombre, que es el camino principal.
    console.error('[nombre-sugerido]', err)
    return NextResponse.json({ names: [], fallback: true })
  }
}
