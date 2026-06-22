import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callStructured, BRANDING_SYSTEM_PROMPT } from '@/lib/gemini'
import { genQuotaResponse } from '@/lib/gen-quota'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NamesSchema = z.object({ names: z.array(z.string()).min(4).max(6) })

// Sugiere nombres de MARCA o de PRODUCTO. Llamada estructurada con Gemini (rápida,
// sin imágenes) — efímera, no persiste: el usuario elige uno y recién ahí se guarda.
export async function POST(req: NextRequest) {
  const blocked = await genQuotaResponse('branding-names')
  if (blocked) return blocked

  let body: {
    kind?: 'brand' | 'product'
    category?: string
    audience?: string
    personality?: string[]
    idea?: string
    brandName?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const kind = body.kind === 'product' ? 'product' : 'brand'
  const category = body.category?.trim()
  if (!category)
    return NextResponse.json({ error: 'Falta el producto/categoría' }, { status: 400 })

  const personality = (body.personality ?? []).map((p) => p.trim()).filter(Boolean)
  const what =
    kind === 'brand'
      ? `Propón nombres de MARCA (el nombre del negocio/sello).`
      : `Propón nombres de PRODUCTO${body.brandName?.trim() ? ` para la marca "${body.brandName.trim()}"` : ''} (el nombre comercial de este producto puntual, distinto del de la marca).`

  const parts: Part[] = [
    {
      text: [
        what,
        `Devuelve JSON { names: string[] } con 4-6 opciones.`,
        ``,
        `Producto / categoría: ${category}`,
        `Público objetivo: ${body.audience?.trim() || 'no especificado'}`,
        `Personalidad deseada: ${personality.length ? personality.join(', ') : 'no especificada'}`,
        body.idea?.trim() ? `Idea/estilo de nombre que tiene en mente: ${body.idea.trim()}` : '',
        ``,
        `Reglas: nombres cortos, memorables, pronunciables en español (mercado peruano/LATAM),`,
        `sin marcas registradas obvias. Solo el nombre, sin descripción.`,
      ].join('\n'),
    },
  ]

  try {
    const { names } = await callStructured('name_suggestions', NamesSchema, parts, 3, BRANDING_SYSTEM_PROMPT)
    return NextResponse.json({ names })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
