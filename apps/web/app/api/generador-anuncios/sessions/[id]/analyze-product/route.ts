import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { uploadToStorage } from '@/lib/storage'
import { callStructured } from '@/lib/gemini'
import { genQuotaResponse } from '@/lib/gen-quota'
import { ProductScanSchema, ReferenceAnalysisSchema } from '@/lib/types'
import type { Part } from '@google/genai'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const blocked = await genQuotaResponse('anuncios-product')
  if (blocked) return blocked

  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.reference_analysis)
    return NextResponse.json({ error: 'Complete step 1 first' }, { status: 409 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const productFile = formData.get('product') as File | null
  if (!productFile) return NextResponse.json({ error: 'Missing product image' }, { status: 400 })
  if (productFile.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'Product image too large (max 10 MB)' }, { status: 400 })

  const logoFile = formData.get('logo') as File | null

  const productName = (formData.get('productName') as string | null)?.trim()
  const whatItDoes = (formData.get('whatItDoes') as string | null)?.trim()
  const targetAudience = (formData.get('targetAudience') as string | null)?.trim()

  if (!productName || !whatItDoes || !targetAudience)
    return NextResponse.json({ error: 'Missing product answers' }, { status: 400 })

  const productBytes = Buffer.from(await productFile.arrayBuffer())
  const productMime = productFile.type || 'image/jpeg'
  const productB64 = productBytes.toString('base64')

  let logoBytes: Buffer | null = null
  let logoMime: string | null = null
  let logoB64: string | null = null
  if (logoFile && logoFile.size > 0) {
    logoBytes = Buffer.from(await logoFile.arrayBuffer())
    logoMime = logoFile.type || 'image/png'
    logoB64 = logoBytes.toString('base64')
  }

  const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)

  const parts: Part[] = [
    { inlineData: { mimeType: productMime, data: productB64 } },
    ...(logoB64 && logoMime ? [{ inlineData: { mimeType: logoMime, data: logoB64 } } as Part] : []),
    {
      text: [
        `Reference ad style: ${refAnalysis.style}`,
        `Reference composition: ${refAnalysis.composition.join(', ')}`,
        `Product name: ${productName}`,
        `What it does: ${whatItDoes}`,
        `Target audience: ${targetAudience}`,
        logoB64 ? 'A brand logo is also provided.' : 'No logo provided.',
        'Analyze the product image. Return ProductScan JSON.',
      ].join('\n'),
    },
  ]

  const [productUrl, scan] = await Promise.all([
    uploadToStorage(id, productBytes, productMime, 'product'),
    callStructured('product_scan', ProductScanSchema, parts),
  ])

  const logoUrl = logoBytes && logoMime
    ? await uploadToStorage(id, logoBytes, logoMime, 'logo')
    : null

  await updateSession(id, {
    step: 2,
    product_url: productUrl,
    logo_url: logoUrl,
    product_scan: scan,
    product_name: productName,
    what_it_does: whatItDoes,
    target_audience: targetAudience,
  })

  return NextResponse.json({ scan, productUrl, logoUrl })
}
