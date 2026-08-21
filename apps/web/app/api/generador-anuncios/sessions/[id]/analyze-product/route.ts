import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { uploadToStorage } from '@/lib/storage'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ProductScanSchema, ReferenceAnalysisSchema } from '@/lib/types'
import type { Part } from '@google/genai'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'anuncios-product')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  if (!session.reference_analysis)
    return NextResponse.json({ error: 'Completa el paso anterior primero' }, { status: 409 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Los datos del formulario no son válidos' }, { status: 400 })
  }

  const productFile = formData.get('product') as File | null
  if (!productFile) return NextResponse.json({ error: 'Falta la foto del producto' }, { status: 400 })
  if (productFile.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'La foto del producto pesa más de 10 MB' }, { status: 400 })

  const logoFile = formData.get('logo') as File | null

  const precision = ((formData.get('prompt') as string | null) ?? '').trim()
  const productName = (formData.get('productName') as string | null)?.trim()
  const whatItDoes = (formData.get('whatItDoes') as string | null)?.trim()
  const targetAudience = (formData.get('targetAudience') as string | null)?.trim()

  if (!productName || !whatItDoes || !targetAudience)
    return NextResponse.json({ error: 'Faltan datos del producto' }, { status: 400 })

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
        // ⚠️ El logo entra como imagen 2 y el scan lo confundía con el producto: medido en la
        // sesión 4c8f6c8b, `brandingDescription` salió "LUMINA - ciencia que ilumina tu piel",
        // que es el lockup del LOGO, no la etiqueta del frasco. Ese string viaja a STEP5 como
        // `Branding:` y ahí se convierte en algo a renderizar → el logo entero flotando al medio.
        logoB64
          ? 'Image 1 is the PRODUCT. Image 2 is the brand LOGO — a separate asset, not part of the product. Describe ONLY image 1: never fold the logo lockup, its tagline or its layout into productDescription or brandingDescription.'
          : 'No logo provided.',
        'brandingDescription = only the text and graphics actually printed on the product in image 1 (label, packaging). If the product carries no readable text, return null.',
        // ÚNICA excepción a la regla de arriba: los COLORES sí se leen del logo. La regla existe
        // para que el lockup y su tagline no se conviertan en texto a renderizar; una paleta no
        // se renderiza como texto, y el logo es donde la marca elige sus colores.
        'brandColors = the brand palette, as hex codes ordered by prominence: the dominant colors'
          + (logoB64 ? ' of the packaging in image 1 AND of the logo in image 2' : ' of the packaging in image 1')
          + '. Read the colors off the artwork, never off the photo background, the surface it rests on or the lighting.'
          + ' Return at most 4. If the product has no deliberate palette (plain white, unbranded, unreadable), return null — do not invent one.',
        precision ? `Ajuste pedido: ${precision}` : '',
        'Analyze the product image. Return ProductScan JSON.',
      ].join('\n'),
    },
  ]

  const [productUrl, scan] = await Promise.all([
    uploadToStorage(id, productBytes, productMime, 'product'),
    callStructured('product_scan', ProductScanSchema, parts, 3, undefined, { preferGemini: true }),
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

  await recordGenQuota(id, 'anuncios-product', userId)
  return NextResponse.json({ scan, productUrl, logoUrl })
}
