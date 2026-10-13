/**
 * Anuncios por el AI SDK: lo que los tests no pueden ver.
 *
 *   npx tsx scripts/probe-anuncios-ai-sdk.ts            # los tres brazos
 *   npx tsx scripts/probe-anuncios-ai-sdk.ts research   # solo uno: research | respaldo | copy | scan (este último solo a pedido)
 *
 * Solo TEXTO y visión: cero imágenes generadas, cero cuota, no toca la base.
 *
 * 1. `research` — ¿CUÁNTO TARDA la investigación de mercado? Es el requisito del paso: corre en
 *    paralelo con el scan del producto y no puede ser lo más lento de los dos. 3 draws × 2 productos,
 *    imprime los ms y lo que devolvió.
 * 2. `respaldo` — ¿los schemas de salida pasan por OpenAI STRICT? Con el AI SDK el mismo schema va a
 *    los dos modelos, y un campo mal declarado solo se nota el día que Gemini se cae. Fuerza el par
 *    al revés (`[respaldo, primario]`) sobre los cuatro schemas con las imágenes reales.
 * 3. `copy` — el copy CON investigación contra el brazo de control SIN ella (que es lo que escribe
 *    una sesión donde la investigación falló), 2 draws por brazo. IMPRIME, no puntúa.
 *
 * Usa los assets de la sesión `e50be4f7` (la misma de `probe-anuncio-e2e.ts`).
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const BASE = 'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/e50be4f7-ff38-4f02-a101-cb6d0c825638'

const PRODUCTOS = [
  { productName: 'Pure Niacinamide 10 Serum', whatItIs: 'sérum facial', whatItDoes: 'atenúa las manchas y marcas de acné', targetAudience: 'mujeres de 20 a 40 con piel con marcas' },
  { productName: 'Gluteboost', whatItIs: 'gomitas de creatina', whatItDoes: 'ayuda a ganar volumen en glúteos al entrenar', targetAudience: 'mujeres de 18 a 35 que entrenan' },
]

async function bajar(nombre: string) {
  const res = await fetch(`${BASE}/${nombre}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`${nombre}: ${res.status}`)
  return { type: 'file' as const, data: Buffer.from(await res.arrayBuffer()), mediaType: nombre.endsWith('.png') ? 'image/png' : 'image/jpeg' }
}

async function main() {
  const solo = process.argv[2]
  const { structured, primario, respaldo } = await import('../lib/ai-sdk')
  const { researchMarket, researchPrompt } = await import('../lib/anuncios/research')
  const { ReferenceAnalysisOut, ProductScanOut, CopyVersionsOut, MarketResearchSchema } = await import('../lib/anuncios/schemas')
  const { copyPrompt, copyCorrection } = await import('../lib/anuncios/core')
  const { SYSTEM_PROMPT } = await import('../lib/gemini')
  const { ReferenceAnalysisSchema, ProductScanSchema } = await import('../lib/types')

  if (!solo || solo === 'research') {
    console.log('\n━━ 1. INVESTIGACIÓN DE MERCADO: velocidad ━━')
    const ms: number[] = []
    for (const p of PRODUCTOS) for (let i = 0; i < 3; i++) {
      const t0 = Date.now()
      const r = await researchMarket(p)
      ms.push(Date.now() - t0)
      console.log(`\n[${p.productName} #${i + 1}] ${ms.at(-1)} ms`)
      console.log(r ? `  nicho: ${r.niche}\n  keywords: ${r.keywords.join(' | ')}\n  dolores: ${r.pains.join(' | ')}\n  deseos: ${r.desires.join(' | ')}` : '  → null (falló)')
    }
    ms.sort((a, b) => a - b)
    console.log(`\nms: min ${ms[0]} · mediana ${ms[Math.floor(ms.length / 2)]} · max ${ms.at(-1)}`)
  }

  // 4. `scan` — ¿el scan del producto CAMBIÓ al pasar `brandingDescription` y `styleCompatibilityNote`
  //    de opcionales a obligatorios-con-null? Es el patrón que AGENTS.md documenta como causa de que
  //    el modelo invente (`bulletsAfter`). Control = el camino viejo tal cual: `callStructured` con
  //    `ProductScanSchema` plano y el prompt SIN la línea nueva de `styleCompatibilityNote`.
  if (solo === 'scan') {
    const { callStructured } = await import('../lib/gemini')
    const { productScanPrompt } = await import('../lib/anuncios/core')
    const product = await bajar('product.jpg')
    const ref = await bajar('reference.jpg')
    const analisis = ReferenceAnalysisSchema.parse((await structured({ name: 'reference_analysis', schema: ReferenceAnalysisOut, system: SYSTEM_PROMPT, content: [ref, { type: 'text', text: 'Analyze this reference ad. Return the complete structured analysis including all sceneElements.' }] })).output)
    const nuevo = productScanPrompt(analisis, { ...PRODUCTOS[0], logo: null })
    const viejo = nuevo.split('\n').filter((l) => !l.startsWith('styleCompatibilityNote =')).join('\n')
    console.log('\n━━ 4. SCAN DEL PRODUCTO: AI SDK (required+null) vs. control (callStructured, schema plano) ━━')
    const ver = (o: { brandingDescription?: string | null; styleCompatibilityNote?: string | null; brandColors?: string[] | null }) =>
      `\n    branding: ${JSON.stringify(o.brandingDescription)}\n    nota: ${JSON.stringify(o.styleCompatibilityNote)}\n    colores: ${JSON.stringify(o.brandColors)}`
    for (let i = 0; i < 3; i++) {
      const c = await callStructured('product_scan', ProductScanSchema, [{ inlineData: { mimeType: product.mediaType, data: product.data.toString('base64') } }, { text: viejo }], 3)
      console.log(`[control #${i + 1}]${ver(c)}`)
      const { output, model } = await structured({ name: 'product_scan', schema: ProductScanOut, system: SYSTEM_PROMPT, content: [product, { type: 'text', text: nuevo }] })
      console.log(`[ai-sdk  #${i + 1}] (${model})${ver(output)}`)
    }
    return
  }

  if (!solo || solo === 'respaldo' || solo === 'copy') {
    const [ref, product] = await Promise.all([bajar('reference.jpg'), bajar('product.jpg')])

    // El análisis y el scan por el PRIMARIO: son el insumo del brazo de copy.
    const analisis = ReferenceAnalysisSchema.parse((await structured({ name: 'reference_analysis', schema: ReferenceAnalysisOut, system: SYSTEM_PROMPT, content: [ref, { type: 'text', text: 'Analyze this reference ad. Return the complete structured analysis including all sceneElements.' }] })).output)
    const tScan = Date.now()
    const scan = ProductScanSchema.parse((await structured({ name: 'product_scan', schema: ProductScanOut, system: SYSTEM_PROMPT, content: [product, { type: 'text', text: 'No logo provided.\nAnalyze the product image. Return ProductScan JSON.' }] })).output)
    // El paso del producto dura lo que dure el MÁS LENTO de los dos: la investigación tiene que quedar por debajo.
    console.log(`\nscan del producto (primario, con imagen): ${Date.now() - tScan} ms`)
    const s = { product_name: PRODUCTOS[0].productName, what_it_is: PRODUCTOS[0].whatItIs, what_it_does: PRODUCTOS[0].whatItDoes, target_audience: PRODUCTOS[0].targetAudience } as Parameters<typeof copyPrompt>[0]
    const research = await researchMarket(PRODUCTOS[0])

    if (!solo || solo === 'respaldo') {
      console.log('\n━━ 2. RESPALDO FORZADO: los cuatro schemas por OpenAI strict ━━')
      const alReves = [respaldo, primario] as const
      const casos = [
        { name: 'reference_analysis', schema: ReferenceAnalysisOut, content: [ref, { type: 'text' as const, text: 'Analyze this reference ad. Return the complete structured analysis including all sceneElements.' }] },
        { name: 'product_scan', schema: ProductScanOut, content: [product, { type: 'text' as const, text: 'No logo provided.\nAnalyze the product image. Return ProductScan JSON.' }] },
        { name: 'copy_versions', schema: CopyVersionsOut, content: [ref, { type: 'text' as const, text: copyPrompt(s, analisis, scan, research, '') }] },
        { name: 'market_research', schema: MarketResearchSchema, content: [{ type: 'text' as const, text: researchPrompt(PRODUCTOS[0]) }] },
      ]
      for (const c of casos) {
        const t0 = Date.now()
        try {
          const { output, model } = await structured({ name: c.name, schema: c.schema as never, system: SYSTEM_PROMPT, content: c.content, models: alReves, intentos: 1 })
          const ok = model === respaldo.modelId
          console.log(`${ok ? '✅' : '❌ respondió el OTRO'} ${c.name}: ${model}, ${Date.now() - t0} ms — ${JSON.stringify(output).slice(0, 140)}…`)
        } catch (e) { console.log(`❌ ${c.name}: ${(e as Error).message.slice(0, 300)}`) }
      }
    }

    if (!solo || solo === 'copy') {
      console.log('\n━━ 3. COPY: con investigación vs. control sin ella ━━')
      console.log('investigación:', JSON.stringify(research))
      for (const [brazo, r] of [['CON', research], ['SIN (control)', null]] as const) for (let i = 0; i < 2; i++) {
        const t0 = Date.now()
        const { output, model } = await structured({ name: 'copy_versions', schema: CopyVersionsOut, system: SYSTEM_PROMPT, content: [ref, { type: 'text', text: copyPrompt(s, analisis, scan, r, '') }], validate: copyCorrection, intentos: 3 })
        console.log(`\n[${brazo} #${i + 1}] ${model}, ${Date.now() - t0} ms, corrección pendiente: ${copyCorrection(output) ?? 'ninguna'}`)
        for (const v of ['versionA', 'versionB'] as const) for (const e of output[v]) console.log(`  ${v.slice(-1)} ${e.element}: "${e.text}"${e.template ? `  ← ${e.template}` : ''}`)
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
