import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { resolveEffectivePreset, sessionBrief, styleRefParts } from '@/lib/branding/effective-preset'
import { buildPromptFromPreset } from '@/lib/branding/generation-prompts'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let precision = ''
  try { const b = await req.json(); precision = (b?.prompt ?? '').trim() } catch { /* */ }

  const { blocked, regensLeft } = await checkGenQuota(id, 'branding-label')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getBrandingSession(id)
  if (!session || !session.style_id || !session.brand_name)
    return NextResponse.json({ error: 'Falta el estilo o el nombre de marca' }, { status: 400 })

  const preset = resolveEffectivePreset(session)
  const { prompt } = buildPromptFromPreset('label', preset, sessionBrief(session))
  const refParts = await styleRefParts(session)
  const logoPart: Part[] = session.logo_url
    ? await fetchAsBase64(session.logo_url).then(({ data, mimeType }) => [{ inlineData: { mimeType, data } }]).catch(() => [])
    : []

  const parts: Part[] = [...refParts, ...logoPart, { text: prompt }]
  if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })

  const b64 = await generateImage(parts)
  if (!b64) return NextResponse.json({ error: 'No se pudo generar la etiqueta', retryable: true }, { status: 502 })
  const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'label')
  await updateBrandingSession(id, { label_url: url })
  await recordGenQuota(id, 'branding-label', userId)
  return NextResponse.json({ url, regensLeft })
}
