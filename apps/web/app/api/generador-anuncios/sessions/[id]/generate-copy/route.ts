import { NextRequest, NextResponse } from 'next/server'
import { generateCopy } from '@/lib/anuncios/core'
import { errorResponse, load, notFound } from '../../../_lib'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()
  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown }
  const precision = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  try {
    return NextResponse.json(await generateCopy(row.session, precision, row.ctx))
  } catch (e) { return errorResponse(e, 'No se pudo generar el copy. Inténtalo de nuevo.') }
}
