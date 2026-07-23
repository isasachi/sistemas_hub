import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { resolveEffectivePreset, sessionBrief, identityRefParts, imageRefParts } from '@/lib/branding/effective-preset'
import { buildMockupPrompt } from '@/lib/branding/generation-prompts'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Paso 3 (último) del pipeline SECUENCIAL: mockup fotorrealista que aplica la
// etiqueta generada en el paso 2 sobre el envase. Etiqueta PRIMERO en los adjuntos.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let precision = ''
  try { const b = await req.json(); precision = (b?.prompt ?? '').trim() } catch { /* sin body */ }

  const { blocked, regensLeft } = await checkGenQuota(id, 'branding-mockup')
  if (blocked) return blocked
  const userId = await readUserId()

  try {
    const session = await getBrandingSession(id)
    if (!session || !session.style_id || !session.brand_name)
      return NextResponse.json({ error: 'Falta el estilo o el nombre de marca' }, { status: 400 })
    if (!session.label_url)
      return NextResponse.json({ error: 'Falta generar la etiqueta primero' }, { status: 400 })

    const preset = resolveEffectivePreset(session)
    const brief = sessionBrief(session)
    const prompt = buildMockupPrompt(brief, preset)

    const parts: Part[] = [
      ...(await imageRefParts(session.label_url)),
      ...(await identityRefParts(session)),
      { text: prompt },
    ]
    if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })

    const b64 = await generateImage(parts)
    if (!b64) throw new Error('No se pudo generar el mockup')

    const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'mockup')
    await updateBrandingSession(id, { mockup_url: url, generation_status: 'done', generation_error: null })
    await recordGenQuota(id, 'branding-mockup', userId)
    return NextResponse.json({ mockupUrl: url, regensLeft })
  } catch (err) {
    await updateBrandingSession(id, { generation_status: 'failed', generation_error: String(err) }).catch(() => {})
    return NextResponse.json({ error: String(err), retryable: true }, { status: 500 })
  }
}
