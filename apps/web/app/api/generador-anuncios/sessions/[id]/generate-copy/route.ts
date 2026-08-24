import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { fetchAsBase64 } from '@/lib/storage'
import { CopyVersionsSchema, ReferenceAnalysisSchema, ProductScanSchema } from '@/lib/types'
import { scaffoldFidelity, FIDELIDAD_MIN } from '@/lib/anuncios/copy-check'
import type { Part } from '@google/genai'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'anuncios-copy')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  if (session.step < 2)
    return NextResponse.json({ error: 'Completa los pasos anteriores primero' }, { status: 409 })
  if (!session.product_name || !session.what_it_does || !session.target_audience)
    return NextResponse.json({ error: 'Faltan datos del producto' }, { status: 409 })

  let body: { comments?: unknown; prompt?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const comments = typeof body.comments === 'string' ? body.comments.trim() : ''
  const precision = (body.prompt ?? '').trim()
  if (!comments) return NextResponse.json({ error: 'Faltan los comentarios' }, { status: 400 })
  if (comments.length > 8000) return NextResponse.json({ error: 'Los comentarios pasan de 8000 caracteres' }, { status: 400 })

  try {
  const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)
  const productScan = ProductScanSchema.parse(session.product_scan)
  const { data: refB64, mimeType: refMime } = await fetchAsBase64(session.reference_url!)

  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refB64 } },
    {
      text: [
        `Reference ad visual layout (NOT copy slots): ${JSON.stringify(refAnalysis.composition)}`,
        `Creative concept: ${refAnalysis.creativeConcept ?? 'not identified'}`,
        `Persuasive logic: ${refAnalysis.persuasiveLogic}`,
        `Product: ${session.product_name} — ${session.what_it_does}`,
        `What the product is: ${session.what_it_is ?? 'not provided'}`,
        `Target audience: ${session.target_audience}`,
        `Product description: ${productScan.productDescription}`,
        `Product label text: ${productScan.brandingDescription ?? 'not provided'}`,
        '',
        'TikTok audience comments (raw):',
        comments,
        '',
        'The first image is the reference ad. Read the words actually rendered on it — headline,',
        'subhead, badge, CTA, any burned-in text. Those visible text blocks, in reading order, are',
        'the copy slots. One element per text block, and NOTHING else: never emit an element for a',
        'person, a product shot, a prop or any other visual — those are not copy. If the reference',
        'has a single text block, return a single element.',
        'A text block is one continuous phrase: line breaks INSIDE a phrase do not split it into',
        'separate blocks. Name each element by its persuasive role (headline, subhead, badge, CTA…),',
        'never by position.',
        '',
        'The creative concept above is the mechanism the ad IS, and both versions keep it. If it is',
        'a before/after, the slots are NOT interchangeable: the slot on the "before" side states the',
        'problem and the one on the "after" side states the result. Never swap them and never let',
        'both sides say the same thing.',
        '',
        'AUDIENCE VOICE — applies to BOTH versions:',
        '  The comments are how these buyers name their problem, in their own words. Use that',
        '  vocabulary; never paste a comment as a quote, never collage several, never drop in text',
        '  that does not agree grammatically with the sentence around it. A comment that maps to no',
        '  slot is simply not used.',
        '  Never invent reviews, numbers, ratings, guarantees or claims — not even from a comment.',
        '',
        'Generate two copy versions as structured element arrays.',
        '',
        'VERSION A — new copy, inspired by the reference:',
        '  Keep the creative concept, the number of slots, their order, and each slot\'s persuasive',
        '  role and length register. Everything else is yours: write NEW copy for this product and',
        '  this audience, and the sentence structure may change. This is NOT a template — do not',
        '  reuse the reference wording, which would advertise the other brand.',
        '  The comments feed the writing as raw material: what hurts, how they name it, what they want.',
        '  `template` is null for every element of version A.',
        '',
        'VERSION B — fill in the blank, built from the reference copy:',
        '  Three explicit stages per slot, in this order:',
        '    1. Transcribe the slot\'s literal text as rendered in the reference image.',
        '    2. Turn it into a template: bracket ONLY the words carrying data specific to the other',
        '       product, brand, promise or problem. Everything else is scaffolding and stays put.',
        '       "Grasa rebelde que no se va" becomes "[problema común] que no se va".',
        '       Bracket the WHOLE piece of data, never half of it, and never swallow the scaffolding',
        '       around it. Return this string in the element\'s `template` field.',
        '    3. Fill each bracket with THIS product\'s data, written in the audience\'s vocabulary and',
        '       agreeing grammatically with the sentence around it: "Flacidez que no se va".',
        '  The scaffolding is copied LITERALLY into the final text. ONE exception: if it carries voseo',
        '  or expressions that are not Peruvian Spanish (sos, vos, tenés, querés, che, güey, parcero,',
        '  chévere, vosotros…), rewrite those words into neutral Peruvian Spanish — and nothing else.',
        '  Scaffolding that is already neutral does not change at all.',
        '  A slot with no product-specific data (a bare CTA like "COMPRAR AHORA") has itself as its',
        '  template and is copied unchanged.',
        '',
        'RULES:',
        '  - Both versions have the SAME number of elements, in the SAME order, with the SAME names.',
        '  - One element per text block of the reference. Never an element for a visual.',
        '  - Version A never reuses the reference wording; version B never abandons its scaffolding.',
        precision ? `\nAjuste pedido: ${precision}` : '',
      ].join('\n'),
    },
  ]

  const copyVersions = await callStructured('copy_versions', CopyVersionsSchema, parts, 3, undefined, { preferGemini: true })

  // El modelo redacta, el código verifica. Si el andamiaje de la plantilla no sobrevive en el texto
  // final, B no templó: redactó — y entonces las dos versiones son lo mismo con otro nombre.
  // ponytail: solo se loguea. Acá no hay piso determinista al que caer (a diferencia de video-ads,
  // no tenemos el valor del hueco por separado) y el fallo es visible en pantalla, no un cobro
  // perdido; si se mide que pasa seguido, el upgrade es reintentar la llamada.
  for (const el of copyVersions.versionB) {
    if (!el.template) {
      console.warn(`[generate-copy] ${id}: "${el.element}" volvió sin plantilla`)
      continue
    }
    const fidelidad = scaffoldFidelity(el.template, el.text)
    if (fidelidad !== null && fidelidad < FIDELIDAD_MIN)
      console.warn(
        `[generate-copy] ${id}: "${el.element}" perdió el andamiaje (${Math.round(fidelidad * 100)}%) — ` +
        `"${el.template}" → "${el.text}"`
      )
  }
  await updateSession(id, { step: 3, tiktok_comments: comments, copy_versions: copyVersions })
  await recordGenQuota(id, 'anuncios-copy', userId)
  return NextResponse.json({ copyVersions })
  } catch (err) {
    console.error('[generate-copy]', err)
    return NextResponse.json({ error: 'No se pudo generar el copy. Inténtalo de nuevo.' }, { status: 500 })
  }
}
