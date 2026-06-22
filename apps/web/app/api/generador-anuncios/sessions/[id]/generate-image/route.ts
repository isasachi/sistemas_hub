import { NextRequest } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { editImage, callReasoning, STEP5_PROMPT } from '@/lib/gemini'
import { genQuotaResponse } from '@/lib/gen-quota'
import { ReferenceAnalysisSchema, ProductScanSchema, ConfirmedCopySchema } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const blocked = await genQuotaResponse('anuncios-image')
  if (blocked) return blocked

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)

      try {
        const session = await getSession(id)
        if (!session || !session.reference_url || !session.product_url || !session.confirmed_copy) {
          send({ status: 'error', message: 'Session incomplete' })
          return controller.close()
        }

        const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)
        const productScan = ProductScanSchema.parse(session.product_scan)
        const confirmedCopy = ConfirmedCopySchema.parse(session.confirmed_copy)
        const hasLogo = !!session.logo_url

        // Step 1: build prompt
        send({ status: 'building_prompt' })
        const contextForReasoning = [
          `=== REFERENCE ANALYSIS ===`,
          `Format: ${refAnalysis.format.ratio} — ${refAnalysis.format.platform}`,
          `Physical position: ${refAnalysis.physicalPosition}`,
          `Layout: ${refAnalysis.layoutDescription}`,
          `Composition: ${refAnalysis.composition.join(' | ')}`,
          `Style: ${refAnalysis.style}`,
          `Colorimetry: ${refAnalysis.colorimetry}`,
          `Typography: ${refAnalysis.typography}`,
          `Persuasive logic: ${refAnalysis.persuasiveLogic}`,
          `Scene elements:`,
          `  People: ${JSON.stringify(refAnalysis.sceneElements.people)}`,
          `  Props: ${JSON.stringify(refAnalysis.sceneElements.props)}`,
          `  Brand elements: ${JSON.stringify(refAnalysis.sceneElements.brandElements)}`,
          `  Setting: ${refAnalysis.sceneElements.setting}`,
          ``,
          `=== PRODUCT INFO ===`,
          `Product name: ${session.product_name}`,
          `What it does: ${session.what_it_does}`,
          `Target audience: ${session.target_audience}`,
          `Product description: ${productScan.productDescription}`,
          `Branding: ${productScan.brandingDescription ?? 'not provided'}`,
          `Logo provided: ${hasLogo ? 'YES — Image 3 is the brand logo' : 'NO'}`,
          ``,
          `=== APPROVED COPY ===`,
          `Version ${confirmedCopy.version}:`,
          ...confirmedCopy.breakdown.map((e) => `  ${e.element}: "${e.text}"`),
        ].join('\n')

        const editInstruction = await callReasoning(STEP5_PROMPT, contextForReasoning)

        // Step 2: load images
        send({ status: 'loading_images' })
        const [ref, product, logo] = await Promise.all([
          fetchAsBase64(session.reference_url),
          fetchAsBase64(session.product_url),
          session.logo_url ? fetchAsBase64(session.logo_url) : Promise.resolve(null),
        ])

        // Step 3: generate
        send({ status: 'generating' })
        const b64 = await editImage(
          ref.data, ref.mimeType,
          product.data, product.mimeType,
          logo?.data ?? null, logo?.mimeType ?? null,
          editInstruction
        )

        if (!b64) {
          send({ status: 'error', message: 'Image generation returned empty result' })
          return controller.close()
        }

        // Step 4: upload
        send({ status: 'uploading' })
        const imageBuffer = Buffer.from(b64, 'base64')
        const imageUrl = await uploadToStorage(id, imageBuffer, 'image/png', 'result')

        await updateSession(id, { step: 5, edit_instruction: editInstruction, image_url: imageUrl })

        send({ status: 'done', imageUrl })
      } catch (err) {
        send({ status: 'error', message: String(err), retryable: true })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
