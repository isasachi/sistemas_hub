import { NextRequest, NextResponse } from 'next/server'
import { uploadToStorage } from '@/lib/storage'
import { MAX_DOC_BYTES, docKind } from '@/lib/landing-v2/document'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_IMG = 4 * 1024 * 1024 // tope del body de Vercel (4,5 MB); el cliente reduce la foto antes
const MAX_IMPORT = 10 * 1024 * 1024

/** Bloquea URLs a la red interna: solo https a un nombre de host público. */
function safeExternal(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return null
    const h = u.hostname
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':')) return null
    return u
  } catch { return null }
}

// Sube un adjunto a Storage y devuelve su URL del bucket propio (lo único que el núcleo acepta).
//  - multipart: `file` + `kind` ('image' | 'document').
//  - JSON `{ url }`: importa una imagen por URL (el uploader del wizard acepta "archivo o URL").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()
  try {
    const stamp = Date.now()
    if (req.headers.get('content-type')?.includes('application/json')) {
      const { url } = (await req.json().catch(() => ({}))) as { url?: string }
      const u = url ? safeExternal(url) : null
      if (!u) return NextResponse.json({ error: 'La URL no es válida (tiene que empezar con https://).' }, { status: 400 })
      const res = await fetch(u, { signal: AbortSignal.timeout(15_000), redirect: 'error' }).catch(() => null)
      const mime = res?.headers.get('content-type')?.split(';')[0] ?? ''
      if (!res?.ok || !mime.startsWith('image/')) return NextResponse.json({ error: 'No se pudo descargar una imagen desde esa URL.' }, { status: 400 })
      if (Number(res.headers.get('content-length')) > MAX_IMPORT) return NextResponse.json({ error: 'La imagen pesa más de 10 MB.' }, { status: 400 })
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_IMPORT) return NextResponse.json({ error: 'La imagen pesa más de 10 MB.' }, { status: 400 })
      const stored = await uploadToStorage(id, buf, mime, `v2-up-${stamp}`)
      return NextResponse.json({ url: stored, kind: 'image', name: u.pathname.split('/').pop() || 'imagen' })
    }

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const kind = form?.get('kind')
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'No llegó ningún archivo.' }, { status: 400 })
    const buf = Buffer.from(await file.arrayBuffer())
    if (kind === 'document') {
      if (buf.length > MAX_DOC_BYTES) return NextResponse.json({ error: 'El archivo pesa más de 4 MB.' }, { status: 400 })
      const k = docKind(buf, file.name) // rechaza .doc y formatos raros antes de guardar
      const mime = k === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      const stored = await uploadToStorage(id, buf, mime, `v2-doc-${stamp}`)
      return NextResponse.json({ url: stored, kind: 'document', name: file.name })
    }
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Sube una imagen (JPG, PNG o WebP).' }, { status: 400 })
    if (buf.length > MAX_IMG) return NextResponse.json({ error: 'La imagen pesa más de 4 MB.' }, { status: 400 })
    const stored = await uploadToStorage(id, buf, file.type, `v2-up-${stamp}`)
    return NextResponse.json({ url: stored, kind: 'image', name: file.name })
  } catch (e) { return errorResponse(e) }
}
