import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { sessionBrief } from '@/lib/branding/effective-preset'
import { labelFromMockupPrompt, logoFromMockupPrompt } from '@/lib/branding/generation-prompts'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Target = 'both' | 'logo' | 'label'

// Pipeline compose-first: deriva la ETIQUETA plana y/o el LOGO aislado a partir
// del mockup compuesto que el usuario eligió en /compose — así los tres
// artefactos quedan consistentes entre sí (mismo logo, misma etiqueta).
// NO usa editWithPrompt: su framing "cambio mínimo pixel-idéntico" pelea con
// una transformación real (mockup 3D → arte plano / logo aislado).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { mockupUrl?: string; target?: Target; prompt?: string }
  try { body = await req.json() } catch { body = {} }
  const target: Target = body.target ?? 'both'
  const precision = (body.prompt ?? '').trim()

  try {
    const session = await getBrandingSession(id)
    if (!session || !session.style_id || !session.brand_name)
      return NextResponse.json({ error: 'Falta el estilo o el nombre de marca' }, { status: 400 })

    const srcUrl = body.mockupUrl ?? session.mockup_url
    if (!srcUrl) return NextResponse.json({ error: 'Falta el mockup elegido' }, { status: 400 })

    const brief = sessionBrief(session)
    const userId = await readUserId()

    const deriveOne = async (kind: 'logo' | 'label'): Promise<{ url: string; regensLeft: number | null } | { error: Response }> => {
      const quotaKind = kind === 'logo' ? 'branding-logo' : 'branding-label'
      const { blocked, regensLeft } = await checkGenQuota(id, quotaKind)
      if (blocked) return { error: blocked }

      const { data, mimeType } = await fetchAsBase64(srcUrl)
      const prompt = kind === 'label' ? labelFromMockupPrompt(brief) : logoFromMockupPrompt(brief)
      const aspectRatio = kind === 'label' ? '4:5' : '1:1'

      const parts: Part[] = [{ inlineData: { mimeType, data } }, { text: prompt }]
      if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })

      const b64 = await generateImage(parts, 3, { aspectRatio })
      if (!b64) return { error: NextResponse.json({ error: `No se pudo derivar ${kind === 'logo' ? 'el logo' : 'la etiqueta'}`, retryable: true }, { status: 502 }) }

      const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `mockup-derived-${kind}`)
      await updateBrandingSession(id, kind === 'logo' ? { logo_url: url } : { label_url: url })
      await recordGenQuota(id, quotaKind, userId)
      return { url, regensLeft }
    }

    if (target === 'both') {
      await updateBrandingSession(id, { mockup_url: srcUrl, step: Math.max(session.step, 3) })

      const logoResult = await deriveOne('logo')
      if ('error' in logoResult) return logoResult.error
      const labelResult = await deriveOne('label')
      if ('error' in labelResult) return labelResult.error

      return NextResponse.json({ logoUrl: logoResult.url, labelUrl: labelResult.url, mockupUrl: srcUrl })
    }

    const result = await deriveOne(target)
    if ('error' in result) return result.error
    return NextResponse.json(target === 'logo' ? { logoUrl: result.url, regensLeft: result.regensLeft } : { labelUrl: result.url, regensLeft: result.regensLeft })
  } catch (err) {
    return NextResponse.json({ error: String(err), retryable: true }, { status: 500 })
  }
}
