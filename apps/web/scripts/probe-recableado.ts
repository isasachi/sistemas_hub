/**
 * Mide contra la API lo que el recableado asume, ANTES de cablearlo.
 *
 *   npx tsx scripts/probe-recableado.ts          # solo texto (gratis)
 *   npx tsx scripts/probe-recableado.ts --imagen # + 3 imágenes (CUESTA)
 *
 * Lo que se pone a prueba, y por qué cada uno puede romper el refactor:
 *
 *  1. `gpt-5.4-nano` es familia GPT-5 y pasa a ser el RESPALDO de todo el texto del hub. Si no
 *     acepta `chat.completions` + `response_format: json_schema strict`, o pide
 *     `max_completion_tokens` en vez de `max_tokens`, o rechaza `temperature`, entonces
 *     `openaiCallStructured` no es un swap de constante sino otra API.
 *  2. Y tiene que aceptar IMÁGENES: el respaldo de `analyze-reference` (anuncios) y del scan de
 *     producto es visión, no texto.
 *  3. `gpt-image-2.5-sunburst` hereda `sizeFor`, que está medido contra **gpt-image-2**: múltiplos
 *     de 16 y lado largo 1536. Si el modelo nuevo solo acepta los tres buckets del tipado, todo
 *     portrait se aplasta a 2:3 otra vez — el bug que `sizeFor` vino a arreglar.
 *  4. `images.edit` (multi-imagen) es el camino de anuncios y de las secciones con referencia.
 *  5. `gemini-3.6-flash` recibe el schema PLANO (`z.toJSONSchema` sin `toStrictSchema`): hay que
 *     ver que respete un opcional omitido y no lo invente.
 *  6. `gemini-3-pro-image` (Nano Banana Pro) tiene que respetar `imageConfig.aspectRatio`.
 */
import fs from 'fs'
import path from 'path'
import { z } from 'zod'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const CON_IMAGEN = process.argv.includes('--imagen')
const TEXTO = 'gpt-5.4-nano'
const IMAGEN = 'gpt-image-2.5-sunburst'
const GEMINI = 'gemini-3.6-flash'
const NANO_PRO = 'gemini-3-pro-image'

const ok = (n: string, d: string) => console.log(`  ✅ ${n} — ${d}`)
const ko = (n: string, e: unknown) => {
  const err = e as { status?: number; code?: string; message?: string }
  console.log(`  ❌ ${n} — ${err?.status ?? ''} ${err?.code ?? ''} ${err?.message ?? String(e)}`.trim())
}
const ms = (t: number) => `${((Date.now() - t) / 1000).toFixed(1)}s`

// Schema con un opcional: el caso donde un schema mal transformado hace inventar al modelo.
const Ficha = z.object({
  titulo: z.string().max(60),
  colores: z.array(z.string()).max(3),
  notaOpcional: z.string().optional(),
})

async function probarTexto() {
  const { default: OpenAI } = await import('openai')
  const { toStrictSchema, toChatContent } = await import('../lib/llm-openai')
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const schema = toStrictSchema(z.toJSONSchema(Ficha)) as Record<string, unknown>
  const response_format = {
    type: 'json_schema' as const,
    json_schema: { name: 'ficha', schema, strict: true },
  }

  console.log(`\n=== ${TEXTO} ===`)

  // 1. La forma EXACTA de `openaiCallStructured` hoy: sin max_tokens, sin temperature.
  let t = Date.now()
  try {
    const res = await client.chat.completions.create({
      model: TEXTO,
      messages: [
        { role: 'system', content: 'Devuelves JSON.' },
        { role: 'user', content: 'Un frasco de sérum de vitamina C sobre mármol. Describilo.' },
      ],
      response_format,
    })
    const c = res.choices[0]
    const parsed = Ficha.safeParse(JSON.parse(c?.message?.content ?? ''))
    ok('structured (forma actual)', `${ms(t)} · finish=${c?.finish_reason} · parse=${parsed.success} · ${JSON.stringify(parsed.success ? parsed.data : parsed.error.issues[0])}`)
  } catch (e) { ko('structured (forma actual)', e) }

  // 2. Visión: el respaldo de analyze-reference y del scan de producto.
  t = Date.now()
  try {
    const png = fs.readFileSync(path.join(process.cwd(), 'public/showcase/generador-anuncios.jpg')).toString('base64')
    const res = await client.chat.completions.create({
      model: TEXTO,
      messages: [
        { role: 'system', content: 'Devuelves JSON.' },
        { role: 'user', content: toChatContent([
          { inlineData: { mimeType: 'image/jpeg', data: png } },
          { text: 'Describe esta imagen.' },
        ]) },
      ],
      response_format,
    })
    const c = res.choices[0]
    ok('visión', `${ms(t)} · finish=${c?.finish_reason} · ${String(c?.message?.content).slice(0, 120)}`)
  } catch (e) { ko('visión', e) }

  // 3. Razonamiento libre (callReasoning): sin response_format.
  t = Date.now()
  try {
    const res = await client.chat.completions.create({
      model: TEXTO,
      messages: [
        { role: 'system', content: 'Respondes en español, en una línea.' },
        { role: 'user', content: '¿Qué hace un sérum de vitamina C?' },
      ],
    })
    ok('reasoning', `${ms(t)} · ${String(res.choices[0]?.message?.content).slice(0, 100)}`)
  } catch (e) { ko('reasoning', e) }

  // 4. ¿Acepta `temperature`? Los de razonamiento suelen rechazar todo valor != 1.
  t = Date.now()
  try {
    await client.chat.completions.create({
      model: TEXTO, temperature: 0,
      messages: [{ role: 'user', content: 'hola' }],
    })
    ok('temperature: 0', ms(t))
  } catch (e) { ko('temperature: 0', e) }

  // 5. `max_tokens` clásico vs `max_completion_tokens`.
  for (const campo of ['max_tokens', 'max_completion_tokens'] as const) {
    t = Date.now()
    try {
      await client.chat.completions.create({
        model: TEXTO, [campo]: 64,
        messages: [{ role: 'user', content: 'hola' }],
      } as never)
      ok(campo, ms(t))
    } catch (e) { ko(campo, e) }
  }
}

async function probarGemini() {
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  console.log(`\n=== ${GEMINI} (schema PLANO, sin toStrictSchema) ===`)
  const t = Date.now()
  try {
    const res = await ai.models.generateContent({
      model: GEMINI,
      contents: [{ role: 'user', parts: [{ text: 'Un frasco de sérum de vitamina C sobre mármol. Describilo. Omití notaOpcional.' }] }],
      config: {
        systemInstruction: 'Devuelves JSON.',
        responseMimeType: 'application/json',
        responseSchema: z.toJSONSchema(Ficha) as never,
      },
    })
    const obj = JSON.parse(res.text ?? '')
    const parsed = Ficha.safeParse(obj)
    ok('structured plano', `${ms(t)} · parse=${parsed.success} · notaOpcional=${JSON.stringify(obj.notaOpcional)} · ${JSON.stringify(obj).slice(0, 120)}`)
  } catch (e) { ko('structured plano', e) }
}

async function probarImagen() {
  const { default: OpenAI, toFile } = await import('openai')
  const { sizeFor } = await import('../lib/llm-openai')
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const size = sizeFor('9:16') // 864x1536 — múltiplo de 16, NO uno de los tres buckets del tipado
  const salida = path.join(process.cwd(), 'scripts/.probe-out')
  fs.mkdirSync(salida, { recursive: true })

  console.log(`\n=== ${IMAGEN} · size=${size} ===`)
  let refB64 = ''

  let t = Date.now()
  try {
    const res = await client.images.generate({
      model: IMAGEN,
      prompt: 'A clear glass serum bottle with a white label on a marble surface, soft studio light.',
      size: size as never,
    })
    refB64 = res.data?.[0]?.b64_json ?? ''
    if (!refB64) throw new Error('sin b64_json')
    const buf = Buffer.from(refB64, 'base64')
    fs.writeFileSync(path.join(salida, 'sunburst-t2i.png'), buf)
    const { default: sharp } = await import('sharp')
    const meta = await sharp(buf).metadata()
    ok('images.generate', `${ms(t)} · pedido ${size} · devuelto ${meta.width}x${meta.height} (${((meta.width ?? 0) / (meta.height ?? 1)).toFixed(3)})`)
  } catch (e) { ko('images.generate', e) }

  if (refB64) {
    t = Date.now()
    try {
      const file = await toFile(Buffer.from(refB64, 'base64'), 'ref-0.png', { type: 'image/png' })
      const res = await client.images.edit({
        model: IMAGEN, image: [file],
        prompt: 'Same bottle, now standing on a wooden table with a green leaf beside it.',
        size: size as never,
      })
      const b64 = res.data?.[0]?.b64_json ?? ''
      if (!b64) throw new Error('sin b64_json')
      fs.writeFileSync(path.join(salida, 'sunburst-edit.png'), Buffer.from(b64, 'base64'))
      ok('images.edit (multi-imagen)', ms(t))
    } catch (e) { ko('images.edit (multi-imagen)', e) }
  }

  console.log(`\n=== ${NANO_PRO} · aspectRatio 3:4 ===`)
  t = Date.now()
  try {
    const { GoogleGenAI, Modality } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
    const res = await ai.models.generateContent({
      model: NANO_PRO,
      contents: [{ role: 'user', parts: [{ text: 'A clear glass serum bottle on a marble surface, soft studio light. No text.' }] }],
      config: { responseModalities: [Modality.IMAGE], imageConfig: { aspectRatio: '3:4', imageSize: '2K' } },
    })
    const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data
    if (!data) throw new Error('sin inlineData')
    const buf = Buffer.from(data, 'base64')
    fs.writeFileSync(path.join(salida, 'nano-pro.png'), buf)
    const { default: sharp } = await import('sharp')
    const meta = await sharp(buf).metadata()
    ok('generateContent IMAGE', `${ms(t)} · pedido 3:4 (0.750) · devuelto ${meta.width}x${meta.height} (${((meta.width ?? 0) / (meta.height ?? 1)).toFixed(3)})`)
  } catch (e) { ko('generateContent IMAGE', e) }

  console.log(`\n  salida en scripts/.probe-out/`)
}

async function main() {
  await probarTexto()
  await probarGemini()
  if (CON_IMAGEN) await probarImagen()
  else console.log('\n(sin --imagen: no se probó ninguna generación de imagen)')
}

main()
