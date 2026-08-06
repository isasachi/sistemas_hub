import { NextResponse } from 'next/server'
import { z } from 'zod'
import { callStructured, BRANDING_SYSTEM_PROMPT } from '@/lib/gemini'
import { DEFAULT_STYLE, DISPLAY_FONTS, BODY_FONTS, feelWords } from '@/lib/branding/brief'

/**
 * Paleta y tipografías propuestas PARA ESTA MARCA (paso 5).
 * ---------------------------------------------------------------------------
 * Es la pieza que reemplaza a los 7 pares paleta/tipografía fijos: en vez de
 * elegir uno de siete, cada marca arranca de una propuesta hecha con su producto,
 * su público y su actitud. El usuario la edita después en el editor.
 *
 * Texto, no imagen: gpt-4o-mini con ~200 tokens de prompt. Barata y rápida.
 *
 * ponytail: sin quota. `checkGenQuota` retorna temprano cuando no hay sessionId, y
 * en el paso 5 la sesión todavía no existe en DB; el freno real es el caché por
 * actitud del cliente (`suggestedFor`). Si aparece abuso: crear la sesión antes del
 * paso 5 y pasar su id a checkGenQuota.
 */

const HEX = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

/** El enum es la única defensa contra una familia inventada: no hay forma de cargar
 *  en runtime una fuente que no esté en el catálogo. */
const SuggestedStyle = z.object({
  palette: z.object({ primary: HEX, secondary: HEX, accent: HEX, dark: HEX, light: HEX }),
  typography: z.object({
    display: z.enum(DISPLAY_FONTS as [string, ...string[]]),
    body: z.enum(BODY_FONTS as [string, ...string[]]),
  }),
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
      `Design a distinctive brand style for one specific product.`,
      ``,
      `Product: ${b.productDescription}`,
      `Category: ${b.category}`,
      `Brand name: ${b.brandName}`,
      `Buyer: ${b.audience.join(', ')}`,
      `Attitude the brand must convey: ${feelWords(b.feel)}`,
      ``,
      `Return a 5-colour palette and a type pairing that belong to THIS brand.`,
      `Rules:`,
      `- Do NOT reach for the generic palette of the category. Two brands in the same`,
      `  category must not end up with the same colours — the attitude is what drives`,
      `  the palette, and it is the strongest signal you have.`,
      `- "dark" and "light" are the text/background pair: they must be legible against`,
      `  each other (contrast ratio of at least 4.5:1).`,
      `- "accent" is the single colour used sparingly for emphasis; it has to stand out`,
      `  against "primary", not blend into it.`,
      `- Choose the typefaces only from the lists allowed by the schema.`,
    ].join('\n')

    const style = await callStructured('branding_style', SuggestedStyle, [{ text: prompt }], 2, BRANDING_SYSTEM_PROMPT)
    return NextResponse.json({ style })
  } catch (err) {
    // Nunca 500: sin sugerencia el editor arranca del default y el usuario edita.
    console.error('[estilo-sugerido]', err)
    return NextResponse.json({ style: DEFAULT_STYLE, fallback: true })
  }
}
