import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { CopyVersionsSchema, ReferenceAnalysisSchema, ProductScanSchema } from '@/lib/types'
import type { Part } from '@google/genai'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.step < 2)
    return NextResponse.json({ error: 'Complete steps 1–2 first' }, { status: 409 })
  if (!session.product_name || !session.what_it_does || !session.target_audience)
    return NextResponse.json({ error: 'Missing product answers' }, { status: 409 })

  let body: { comments?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const comments = typeof body.comments === 'string' ? body.comments.trim() : ''
  if (!comments) return NextResponse.json({ error: 'Missing comments' }, { status: 400 })
  if (comments.length > 8000) return NextResponse.json({ error: 'Comments too long (max 8000 chars)' }, { status: 400 })

  const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)
  const productScan = ProductScanSchema.parse(session.product_scan)
  const { data: refB64, mimeType: refMime } = await fetchAsBase64(session.reference_url!)

  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refB64 } },
    {
      text: [
        `Reference ad copy structure: ${JSON.stringify(refAnalysis.composition)}`,
        `Persuasive logic: ${refAnalysis.persuasiveLogic}`,
        `Product: ${session.product_name} — ${session.what_it_does}`,
        `Target audience: ${session.target_audience}`,
        `Product description: ${productScan.productDescription}`,
        '',
        'TikTok audience comments (raw):',
        comments,
        '',
        'Generate two copy versions as structured element arrays.',
        '',
        'VERSION A — Narrative adaptation:',
        '  Mirror every structural slot from the reference ad composition exactly.',
        '  Adapt content to the product and audience. Keep the same narrative arc.',
        '  Never invent reviews, numbers, or guarantees.',
        '',
        'VERSION B — Fill-in-the-blank audience voice:',
        '  Version B is NOT a rewrite. It is Version A with surgical word-level substitutions.',
        '  Identify the 2–5 content words naming the specific pain or symptom.',
        '  Replace ONLY those words with a phrase from the TikTok comments.',
        '  Leave everything else — sentence structure, punctuation, count — identical to Version A.',
        '',
        'RULES:',
        '  - Version B must have the EXACT SAME number of elements in the EXACT SAME order as Version A.',
        '  - Only hook/pain elements may receive substitution. All others are copied verbatim from Version A.',
        '  - Use a continuous phrase from one comment, not a collage from multiple.',
        '  - If no comment maps cleanly to a slot, copy Version A text unchanged.',
        '  - Never invent reviews, numbers, or guarantees.',
      ].join('\n'),
    },
  ]

  const copyVersions = await callStructured('copy_versions', CopyVersionsSchema, parts)
  await updateSession(id, { step: 3, tiktok_comments: comments, copy_versions: copyVersions })
  return NextResponse.json({ copyVersions })
}
