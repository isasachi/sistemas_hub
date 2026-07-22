import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callStructured, BRANDING_SYSTEM_PROMPT } from '@/lib/gemini'
import { getBrandingSession } from '@/lib/branding/db'
import { resolveEffectivePreset } from '@/lib/branding/effective-preset'
import { paletteToText } from '@/lib/branding/style-presets'
import { SelectedPaletteSchema, SelectedTypographySchema } from '@/lib/branding/types'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TemplatesSchema = z.object({
  templates: z.array(z.object({
    label: z.string(),                 // "Cálido tostado", "Alto contraste"
    palette: SelectedPaletteSchema,
    typography: SelectedTypographySchema,
  })).length(3),
})

// Paso 3: 3 variaciones de paleta+tipografía COHERENTES con el estilo elegido
// (el preset efectivo). Texto barato, no imagen. El default (preset) lo muestra la UI aparte.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { blocked } = await checkGenQuota(id, 'branding-templates')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getBrandingSession(id)
  if (!session || !session.style_id)
    return NextResponse.json({ error: 'Falta elegir un estilo' }, { status: 400 })

  const preset = resolveEffectivePreset(session)
  const parts: Part[] = [{
    text: [
      `Estilo base: ${preset.essence}. ${preset.styleBlock}`,
      `Paleta actual: ${paletteToText(preset.palette)}.`,
      `Tipografía actual: primaria ${preset.typography.primary}; secundaria ${preset.typography.secondary}; caja ${preset.typography.case}.`,
      ``,
      `Devuelve JSON { templates: [3] } con 3 variaciones ALTERNATIVAS de paleta+tipografía,`,
      `todas fieles al MISMO estilo (no lo cambies de familia), pero distinguibles entre sí`,
      `(ej: una más cálida, una de más contraste, una más sobria). Cada palette: 3-6 colores`,
      `con hex real, name en español y role (primary|secondary|accent|neutral|background).`,
      `typography: primary, secondary, case (uppercase|lowercase|title|mixed), detail. label: 2-3 palabras en español.`,
    ].join('\n'),
  }]

  let result
  try {
    result = await callStructured('branding_templates', TemplatesSchema, parts, 3, BRANDING_SYSTEM_PROMPT)
  } catch (err) {
    console.error('[branding-templates]', err)
    return NextResponse.json({ error: 'No se pudieron generar variaciones' }, { status: 500 })
  }
  await recordGenQuota(id, 'branding-templates', userId)
  return NextResponse.json(result)
}
