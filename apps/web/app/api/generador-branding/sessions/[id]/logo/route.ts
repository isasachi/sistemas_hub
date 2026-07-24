import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { resolveEffectivePreset, sessionBrief, identityRefParts } from '@/lib/branding/effective-preset'
import { buildLogoPrompt } from '@/lib/branding/generation-prompts'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Genera 1 imagen (gpt-image-2 ~60-90s con OpenAI primario). Fluid Compute (vercel.json) da 300s.
export const maxDuration = 300

// Paso 1 del pipeline SECUENCIAL: logo aislado, en la identidad del estilo
// (refs de identidad, SIN wireframe). El logo generado acá es el que la
// etiqueta (paso 2) inserta literalmente — no se re-deriva de nada.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let precision = ''
  try { const b = await req.json(); precision = (b?.prompt ?? '').trim() } catch { /* sin body */ }

  const { blocked, regensLeft } = await checkGenQuota(id, 'branding-logo')
  if (blocked) return blocked
  const userId = await readUserId()

  try {
    const session = await getBrandingSession(id)
    if (!session || !session.style_id || !session.brand_name)
      return NextResponse.json({ error: 'Falta el estilo o el nombre de marca' }, { status: 400 })

    const preset = resolveEffectivePreset(session)
    const brief = sessionBrief(session)
    const prompt = buildLogoPrompt(brief, preset)

    const parts: Part[] = [...(await identityRefParts(session)), { text: prompt }]
    if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })

    const b64 = await generateImage(parts, 3, { aspectRatio: '1:1' })
    if (!b64) throw new Error('No se pudo generar el logo')

    const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'logo')
    await updateBrandingSession(id, { logo_url: url, generation_status: 'logo', generation_error: null })
    await recordGenQuota(id, 'branding-logo', userId)
    return NextResponse.json({ logoUrl: url, regensLeft })
  } catch (err) {
    await updateBrandingSession(id, { generation_status: 'failed', generation_error: String(err) }).catch(() => {})
    return NextResponse.json({ error: String(err), retryable: true }, { status: 500 })
  }
}
