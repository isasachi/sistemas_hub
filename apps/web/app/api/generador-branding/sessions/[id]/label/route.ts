import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import {
  resolveEffectivePreset,
  resolveEffectiveLayout,
  sessionBrief,
  identityRefParts,
  wireframeRefParts,
} from '@/lib/branding/effective-preset'
import { buildLabelPrompt } from '@/lib/branding/generation-prompts'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Genera 1 imagen (gpt-image-2 ~60-90s con OpenAI primario). Fluid Compute (vercel.json) da 300s.
export const maxDuration = 300

// Paso 2 del pipeline SECUENCIAL: etiqueta plana que construye su PROPIO wordmark
// tipográfico con el NOMBRE DE PRODUCTO (el logo de marca es un asset aparte y NO
// se inserta acá), siguiendo el wireframe de layout y los pares de contraste del
// estilo. Adjunta refs de identidad + el wireframe ÚLTIMO. No depende del logo.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let precision = ''
  try { const b = await req.json(); precision = (b?.prompt ?? '').trim() } catch { /* sin body */ }

  const { blocked, regensLeft } = await checkGenQuota(id, 'branding-label')
  if (blocked) return blocked
  const userId = await readUserId()

  try {
    const session = await getBrandingSession(id)
    if (!session || !session.style_id || !session.brand_name)
      return NextResponse.json({ error: 'Falta el estilo o el nombre de marca' }, { status: 400 })

    const preset = resolveEffectivePreset(session)
    const layout = resolveEffectiveLayout(session)
    const brief = sessionBrief(session)
    const prompt = buildLabelPrompt(brief, preset, layout)

    const parts: Part[] = [
      ...(await identityRefParts(session)),
      ...(await wireframeRefParts(session)),
      { text: prompt },
    ]
    if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })

    const b64 = await generateImage(parts, 3, { aspectRatio: '4:5' })
    if (!b64) throw new Error('No se pudo generar la etiqueta')

    const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'label')
    await updateBrandingSession(id, { label_url: url, generation_status: 'label', generation_error: null })
    await recordGenQuota(id, 'branding-label', userId)
    return NextResponse.json({ labelUrl: url, regensLeft })
  } catch (err) {
    await updateBrandingSession(id, { generation_status: 'failed', generation_error: String(err) }).catch(() => {})
    return NextResponse.json({ error: String(err), retryable: true }, { status: 500 })
  }
}
