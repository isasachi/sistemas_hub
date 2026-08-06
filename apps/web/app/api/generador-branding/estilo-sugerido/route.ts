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

/**
 * ⚠️ Los valores tienen que salir CORTOS. El prompt maestro rinde con inputs
 * breves ("bold orange, soft yellow, pure white, electric lime"; "Editorial
 * product photography"); textos largos densifican el board. Los `.max()` no son
 * decoración: son el freno.
 */
const SuggestedStyle = z.object({
  /** Nombres, nunca hex: el modelo de imagen elige mejores valores que los impuestos. */
  palette: z.array(z.string().min(3).max(28)).min(PALETTE_MIN).max(PALETTE_MAX),
  inspiration: z.string().min(5).max(80),
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
      'Pick the two creative-direction fields for the brand below.',
      '',
      `Product: ${b.productDescription}`,
      `Brand name: ${b.brandName}`,
      `Buyer: ${b.audience.join(', ')}`,
      `Brand feel: ${feelWords(b.feel)}`,
      '',
      'Rules — keep both SHORT, they go into an image prompt where long values ruin the layout:',
      `- palette: ${PALETTE_MIN}-${PALETTE_MAX} colour NAMES in Spanish, two or three words each`,
      '  ("naranja intenso", "amarillo suave", "blanco puro", "lima eléctrico"). NEVER hex codes —',
      '  the image model picks better values than any it is handed. Do not reach for the generic',
      '  palette of the category: two brands with different attitudes must not share colours.',
      '- inspiration: one short phrase IN SPANISH naming where the visual world comes from.',
      '  A photographic style, a design movement, an era or a material ("fotografía editorial de',
      '  producto", "botica de los años 50", "cerámica esmaltada japonesa"). Under ten words.',
      '  In Spanish because the user reads and edits it; the image model understands it fine —',
      '  the rest of the brief already reaches it in Spanish.',
    ].join('\n')

    const style = await callStructured('branding_style', SuggestedStyle, [{ text: prompt }], 2, BRANDING_SYSTEM_PROMPT)
    return NextResponse.json({ style })
  } catch (err) {
    // Nunca 500: sin sugerencia el editor arranca del default y el usuario escribe.
    console.error('[estilo-sugerido]', err)
    return NextResponse.json({ style: DEFAULT_STYLE, fallback: true })
  }
}
