import { NextRequest, NextResponse } from 'next/server'
import { refineAd } from '@/lib/anuncios/core'
import { errorResponse, load, notFound } from '../../../_lib'

// El modelo de imagen tarda (medido). Sin esto Vercel corta antes de que vuelva la imagen.
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()
  const body = (await req.json().catch(() => ({}))) as { feedback?: unknown }
  try {
    return NextResponse.json(await refineAd(row.session, typeof body.feedback === 'string' ? body.feedback : '', row.ctx))
  } catch (e) { return errorResponse(e) }
}
