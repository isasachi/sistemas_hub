import { NextRequest, NextResponse } from 'next/server'
import { fetchAsBase64 } from '@/lib/storage'
import { extractResearchDocument, MAX_DOC_BYTES } from '@/lib/landing-v2/document'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Extrae el texto de un PDF/Word ya subido. Devuelve el texto para el preview editable del wizard;
// no lo guarda (lo guarda el PATCH cuando el usuario continúa).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const row = await load((await params).id)
  if (!row) return notFound()
  const { url } = (await req.json().catch(() => ({}))) as { url?: string }
  if (!url) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })
  try {
    const { data } = await fetchAsBase64(url, MAX_DOC_BYTES)
    return NextResponse.json({ text: await extractResearchDocument(Buffer.from(data, 'base64'), url.split('?')[0]) })
  } catch (e) { return errorResponse(e) }
}
