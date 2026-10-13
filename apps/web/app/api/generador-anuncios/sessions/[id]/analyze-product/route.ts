import { NextRequest, NextResponse } from 'next/server'
import { analyzeProduct } from '@/lib/anuncios/core'
import { errorResponse, load, notFound, toImg } from '../../../_lib'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Los datos del formulario no son válidos' }, { status: 400 })
  const productFile = formData.get('product') as File | null
  if (!productFile) return NextResponse.json({ error: 'Falta la foto del producto' }, { status: 400 })
  const logoFile = formData.get('logo') as File | null
  const str = (k: string) => ((formData.get(k) as string | null) ?? '').trim()

  try {
    return NextResponse.json(await analyzeProduct(row.session, {
      product: await toImg(productFile, 'image/jpeg'),
      logo: logoFile && logoFile.size > 0 ? await toImg(logoFile, 'image/png') : null,
      productName: str('productName'),
      whatItIs: str('whatItIs') || null,
      whatItDoes: str('whatItDoes'),
      targetAudience: str('targetAudience'),
      precision: str('prompt'),
    }, row.ctx))
  } catch (e) { return errorResponse(e) }
}
