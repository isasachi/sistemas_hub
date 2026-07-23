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

    type DeriveOk = { ok: true; url: string; regensLeft: number | null }
    type DeriveErr = { ok: false; message: string; status: number; blocked?: Response }
    const deriveOne = async (kind: 'logo' | 'label'): Promise<DeriveOk | DeriveErr> => {
      const quotaKind = kind === 'logo' ? 'branding-logo' : 'branding-label'
      const { blocked, regensLeft } = await checkGenQuota(id, quotaKind)
      if (blocked) return { ok: false, message: 'quota', status: 429, blocked }

      const { data, mimeType } = await fetchAsBase64(srcUrl)
      const prompt = kind === 'label' ? labelFromMockupPrompt(brief) : logoFromMockupPrompt(brief)
      const aspectRatio = kind === 'label' ? '4:5' : '1:1'

      const parts: Part[] = [{ inlineData: { mimeType, data } }, { text: prompt }]
      if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })

      const b64 = await generateImage(parts, 3, { aspectRatio })
      if (!b64) return { ok: false, message: `No se pudo derivar ${kind === 'logo' ? 'el logo' : 'la etiqueta'}`, status: 502 }

      const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `mockup-derived-${kind}`)
      await updateBrandingSession(id, kind === 'logo' ? { logo_url: url } : { label_url: url })
      await recordGenQuota(id, quotaKind, userId)
      return { ok: true, url, regensLeft }
    }

    if (target === 'both') {
      // Fija el mockup elegido (la llamada cara) + avanza; luego deriva en PARALELO.
      await updateBrandingSession(id, { mockup_url: srcUrl, generation_status: 'deriving', generation_error: null, step: Math.max(session.step, 2) })

      // Promise.all: label y logo son independientes → paralelo (~40% menos tiempo).
      const [logoR, labelR] = await Promise.all([deriveOne('logo'), deriveOne('label')])

      // Fallo parcial (8.3): NUNCA se tira el mockup. Se presenta lo que salió y se
      // ofrece reintento por artefacto. 'done' solo si ambos derivados existen.
      const bothOk = logoR.ok && labelR.ok
      const status: 'done' | 'deriving' | 'failed' = bothOk ? 'done' : (!logoR.ok && !labelR.ok ? 'failed' : 'deriving')
      await updateBrandingSession(id, {
        generation_status: status,
        generation_error: bothOk ? null : [!logoR.ok ? 'logo' : '', !labelR.ok ? 'etiqueta' : ''].filter(Boolean).join(' + ') + ' falló',
      })
      return NextResponse.json({
        mockupUrl: srcUrl,
        logoUrl: logoR.ok ? logoR.url : null,
        labelUrl: labelR.ok ? labelR.url : null,
        errors: { logo: logoR.ok ? null : logoR.message, label: labelR.ok ? null : labelR.message },
      })
    }

    const result = await deriveOne(target)
    if (!result.ok) return result.blocked ?? NextResponse.json({ error: result.message, retryable: true }, { status: result.status })
    // regen individual: si ya existen ambos derivados, el estado sigue 'done'
    return NextResponse.json(target === 'logo' ? { logoUrl: result.url, regensLeft: result.regensLeft } : { labelUrl: result.url, regensLeft: result.regensLeft })
  } catch (err) {
    return NextResponse.json({ error: String(err), retryable: true }, { status: 500 })
  }
}
