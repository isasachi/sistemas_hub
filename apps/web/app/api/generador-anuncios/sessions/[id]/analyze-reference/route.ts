import { NextRequest, NextResponse } from 'next/server'
import { analyzeReference } from '@/lib/anuncios/core'
import { errorResponse, load, notFound, toImg } from '../../../_lib'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Los datos del formulario no son válidos' }, { status: 400 })
  const file = formData.get('reference') as File | null
  if (!file) return NextResponse.json({ error: 'Falta la imagen de referencia' }, { status: 400 })
  const precision = ((formData.get('prompt') as string | null) ?? '').trim()

  try {
    return NextResponse.json(await analyzeReference(row.session, await toImg(file, 'image/jpeg'), precision, row.ctx))
  } catch (e) { return errorResponse(e) }
}
