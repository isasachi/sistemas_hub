// One-off: genera el placeholder de cada plantilla (genérico, SIN marca/producto de
// la referencia → sin copyright) y lo guarda en public/templates/<id>.jpg.
// Re-correr solo si cambian los estilos. Run: cd apps/web && node scripts/gen-template-thumbs.mjs
import { GoogleGenAI, Modality } from '@google/genai'
import fs from 'fs'
import path from 'path'

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8')
const key = env.match(/^GOOGLE_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '')
if (!key) throw new Error('no GOOGLE_API_KEY en .env.local')
const ai = new GoogleGenAI({ apiKey: key })
const OUT = path.join(process.cwd(), 'public', 'templates')
fs.mkdirSync(OUT, { recursive: true })

// duplicado liviano del catálogo (el .ts no se puede importar desde node sin build)
const TEMPLATES = [
  { id: 'wellness-dark', style: 'Dark near-black background, warm gold/amber single accent, high contrast, glossy product hero, thin line-art icons, subtle botanical motifs. Premium, calm.' },
  { id: 'sport-blue', style: 'Energetic athletic, deep blue and white, gym background with an athlete in motion, bold uppercase headings, round performance badges. High energy.' },
  { id: 'industrial', style: 'Rugged industrial, matte black with safety-yellow accent, workshop setting, heavy bold uppercase type, strong contrast lighting. Tough, professional.' },
  { id: 'feminine-pink', style: 'Soft feminine, blush pink and magenta, floral accents, spa-like calm, clean rounded white cards, gentle elegant type. Intimate, premium-soft.' },
  { id: 'vital-green', style: 'Active-health, lime-green and black, angular geometric shapes and energy motifs, an active adult, dynamic diagonal layout. Vital, modern.' },
  { id: 'wellness-magenta', style: 'Bright clean, white background with vivid magenta-fuchsia accent, fitness lifestyle, rounded packs, trust badges. Fresh, optimistic.' },
  { id: 'kids-adventure', style: 'Playful kids, jungle adventure greens with vibrant color pops, fun rounded chunky type, a happy child. Cheerful, imaginative.' },
]

async function gen(style) {
  const text =
    `Design a vertical landing-page HERO section as one high-resolution image, 9:16 portrait, premium e-commerce.\n` +
    `STYLE: ${style}\n` +
    `Use a GENERIC, unbranded product (a plain bottle or box) — do NOT depict any real brand, logo or trademark.\n` +
    `Render a short placeholder heading "TU PRODUCTO AQUÍ", a one-line subheading, and a CTA button "Comprar".\n` +
    `Legible Spanish. Do NOT print field names, hex codes, font names or lorem ipsum.`
  const res = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: { responseModalities: [Modality.IMAGE], imageConfig: { aspectRatio: '9:16', imageSize: '1K' } },
  })
  return res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data ?? ''
}

for (const t of TEMPLATES) {
  try {
    const b64 = await gen(t.style)
    if (!b64) { console.log(`✗ ${t.id}: vacío`); continue }
    const f = path.join(OUT, `${t.id}.jpg`)
    fs.writeFileSync(f, Buffer.from(b64, 'base64'))
    console.log(`✓ ${t.id}: ${(Buffer.byteLength(b64, 'base64') / 1024).toFixed(0)} KB`)
  } catch (e) {
    console.log(`✗ ${t.id}: ${e.message ?? e}`)
  }
}
