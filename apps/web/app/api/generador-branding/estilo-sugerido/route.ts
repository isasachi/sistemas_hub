import { NextResponse } from 'next/server'
import { z } from 'zod'
import { callStructured, BRANDING_SYSTEM_PROMPT } from '@/lib/gemini'
import { DEFAULT_STYLE, PALETTE_MIN, PALETTE_MAX, feelWords } from '@/lib/branding/brief'

/**
 * Las 4 casillas del prompt maestro que el usuario no responde: colores,
 * inspiración visual, estilo gráfico y piezas del board.
 * ---------------------------------------------------------------------------
 * Es la pieza que automatiza el llenado del prompt. "Inspired from" y "Graphic
 * style" son justo las que un dueño de negocio no sabe escribir y las que más
 * definen el resultado, así que las propone el modelo y el usuario las corrige.
 *
 * Texto, no imagen: gpt-4o-mini con ~250 tokens de prompt.
 *
 * ponytail: sin quota. `checkGenQuota` retorna temprano cuando no hay sessionId, y
 * en el paso 5 la sesión todavía no existe en DB; el freno real es el caché por
 * actitud del cliente (`suggestedFor`). Si aparece abuso: crear la sesión antes del
 * paso 5 y pasar su id a checkGenQuota.
 */

const SuggestedStyle = z.object({
  palette: z.array(z.object({
    /** En español: se rotula así en el board. */
    name: z.string().min(2).max(24),
    hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  })).min(PALETTE_MIN).max(PALETTE_MAX),
  inspiration: z.string().min(10).max(220),
  graphicStyle: z.string().min(10).max(220),
  products: z.string().min(5).max(220),
})

const Body = z.object({
  category: z.string().default(''),
  productDescription: z.string().default(''),
  brandName: z.string().default(''),
  audience: z.array(z.string()).default([]),
  feel: z.array(z.string()).default([]),
})

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json())

    const prompt = [
      'A brand identity board is going to be generated for the product below. Fill in the four',
      'creative-direction fields that the client did not answer.',
      '',
      `Product: ${b.productDescription}`,
      `Category: ${b.category}`,
      `Brand name: ${b.brandName}`,
      `Buyer: ${b.audience.join(', ')}`,
      `Attitude the brand must convey: ${feelWords(b.feel)}`,
      '',
      'Rules:',
      `- palette: ${PALETTE_MIN}-${PALETTE_MAX} colours that belong to THIS brand. Do not reach for the`,
      '  generic palette of the category — two brands in the same category must not end up with the same',
      '  colours, and the attitude is the strongest signal you have. Name each colour in Spanish, the way',
      '  it will be printed on the board (e.g. "Naranja intenso", "Lima eléctrico"). Include one very light',
      '  and one very dark colour so text stays legible on the packaging.',
      '- inspiration: where the visual world comes from. Name concrete references — a design movement, an',
      '  era, a material, a place, a discipline. Not adjectives.',
      '- graphicStyle: how it is drawn — layout, shapes, iconography, use of the grid. This is different',
      '  from the attitude: the attitude is how the brand FEELS, this is how it LOOKS.',
      '- products: which pieces should appear in the board — the packaging that fits this product plus one',
      '  or two branded extras that make sense for it.',
      'Write inspiration, graphicStyle and products in English; they go straight into an image prompt.',
    ].join('\n')

    const style = await callStructured('branding_style', SuggestedStyle, [{ text: prompt }], 2, BRANDING_SYSTEM_PROMPT)
    return NextResponse.json({ style })
  } catch (err) {
    // Nunca 500: sin sugerencia el editor arranca del default y el usuario escribe.
    console.error('[estilo-sugerido]', err)
    return NextResponse.json({ style: DEFAULT_STYLE, fallback: true })
  }
}
