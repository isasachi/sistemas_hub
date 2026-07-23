/**
 * gen-mockups-openai.ts
 * ---------------------------------------------------------------------------
 * Genera un MOCKUP COMPUESTO por cada uno de los 7 estilos, usando la MISMA
 * arquitectura del pipeline del generador (prompt + refs de estilo + wireframe),
 * pero con la API de imágenes de OpenAI (gpt-image-2) en vez de Gemini.
 *
 * "Mismo approach que con Gemini": se pasa el PROMPT (construido desde el preset
 * + layout + contraste, igual que buildComposedMockupPrompt) y las REFS como
 * imágenes adjuntas — las 5 refs de estilo del folder + el wireframe del layout
 * ÚLTIMO (el prompt lo referencia como "the final attached image is a skeleton").
 * En OpenAI eso se hace con el endpoint de EDIT (multi-imagen): `image[]` =
 * refs, `prompt` = el brief de diseño.
 *
 * Guarda los PNG en `apps/web/generated-mockups/<styleId>.png` (a la altura de
 * la raíz de apps/web).
 *
 * NO se ejecuta solo. Correr manualmente con el env cargado (necesita
 * OPENAI_API_KEY y SUPABASE_URL — las refs salen de Storage):
 *
 *   cd apps/web && set -a && source .env.local && set +a \
 *     && npx tsx scripts/gen-mockups-openai.ts            # los 7 estilos
 *     && npx tsx scripts/gen-mockups-openai.ts editorial  # solo uno (test barato)
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs'
import path from 'node:path'
import { STYLE_PRESETS, getPreset, paletteToText, type StylePreset } from '../lib/branding/style-presets'
import { getLayout, layoutToPrompt, type LabelLayout } from '../lib/branding/label-layouts'
import { contrastToPrompt } from '../lib/branding/contrast'
import { refUrls, wireframeUrl } from '../lib/branding/effective-preset'
import { THUMBNAIL_BRIEFS } from './thumbnail-briefs'
import type { BrandBrief } from '../lib/branding/generation-prompts'

const OUT_DIR = path.join(__dirname, '..', 'generated-mockups')
const MODEL = 'gpt-image-2'
const SIZE = '1024x1536' // retrato ~2:3 para el mockup de producto
const EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edit'

/**
 * Prompt del mockup compuesto — misma receta que buildComposedMockupPrompt del
 * pipeline (styleBlock + paleta + contraste + layout + instrucción de wireframe
 * + materiales/escena/mood + avoid). Self-contained para no depender de helpers
 * privados del módulo de la app.
 */
function buildComposedMockupPrompt(brief: BrandBrief, preset: StylePreset, layout: LabelLayout): string {
  const container = brief.containerType ?? 'product packaging'
  return [
    `Create a photorealistic product mockup: a ${container} for "${brief.brandName}", a ${brief.productType}, with its COMPLETE packaging design fully applied — as one cohesive professional brand system.`,
    preset.styleBlock,
    `Color palette: ${paletteToText(preset.palette)}.`,
    contrastToPrompt(preset),
    `The packaging must show BOTH elements, integrated coherently as a single deliberate design: (1) a clear brand LOGO / wordmark for "${brief.brandName}" — prominent, legible and well-placed, NOT lost in the artwork and NOT clashing with the label; and (2) the full front label with${brief.descriptor ? ` the descriptor "${brief.descriptor}",` : ''}${brief.tagline ? ` the tagline "${brief.tagline}",` : ''} plus small realistic legal / net-weight / ingredient microtext.`,
    layoutToPrompt(layout),
    `The final attached image is a LAYOUT SKELETON, not a style reference. Follow its spatial arrangement of elements exactly; ignore its colors and treat it as structure only.`,
    `Materials & finish: ${preset.materials.join(', ')}.`,
    `Studio product photography: ${preset.lighting}. Scene: ${preset.composition}. Mood: ${preset.mood.join(', ')}. Realistic reflections, soft contact shadow, believable depth of field.`,
    `Render the brand name exactly as "${brief.brandName}", spelled correctly.`,
    `Avoid: ${[...preset.avoid, ...layout.avoidLayout].join(', ')}. High-resolution, professional commercial quality, sharp focus, no watermark, no stray or misspelled text.`,
  ].filter(Boolean).join(' ')
}

/** Baja una ref de Storage y la envuelve como Blob para el multipart (mismo rol que un inlineData Part en Gemini). */
async function fetchRefBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ref ${res.status}: ${url}`)
  const type = res.headers.get('content-type') ?? 'image/png'
  return new Blob([await res.arrayBuffer()], { type })
}

async function genOne(styleId: string): Promise<void> {
  const preset = getPreset(styleId)
  const layout = getLayout(styleId)
  const brief = THUMBNAIL_BRIEFS[styleId]
  if (!brief) throw new Error(`sin brief para ${styleId} en THUMBNAIL_BRIEFS`)

  const prompt = buildComposedMockupPrompt(brief, preset, layout)
  // Refs = 5 imágenes de estilo del folder + el wireframe ÚLTIMO (igual que styleRefParts).
  const urls = [...refUrls(styleId), wireframeUrl(styleId)]
  const blobs = await Promise.all(urls.map(fetchRefBlob))

  const form = new FormData()
  form.append('model', MODEL)
  form.append('prompt', prompt)
  form.append('size', SIZE)
  blobs.forEach((blob, i) => {
    const ext = blob.type.includes('png') ? 'png' : 'jpg'
    form.append('image[]', blob, `ref-${i}.${ext}`)
  })

  const res = await fetch(EDIT_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { data?: { b64_json?: string }[] }
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error(`respuesta sin b64_json: ${JSON.stringify(json).slice(0, 300)}`)

  const outPath = path.join(OUT_DIR, `${styleId}.png`)
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'))
  console.log(`  OK ${styleId} → ${outPath} (${blobs.length} refs)`)
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY en el env (source apps/web/.env.local)')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const only = process.argv[2]
  const ids = only ? [only] : Object.keys(STYLE_PRESETS)
  if (only && !STYLE_PRESETS[only as keyof typeof STYLE_PRESETS]) {
    throw new Error(`estilo desconocido "${only}". Válidos: ${Object.keys(STYLE_PRESETS).join(', ')}`)
  }

  console.log(`== Mockups OpenAI (${MODEL}) — ${ids.length} estilo(s) → ${OUT_DIR} ==`)
  for (const id of ids) {
    try {
      await genOne(id)
    } catch (e) {
      console.error(`  ✗ ${id}:`, e instanceof Error ? e.message : e)
    }
  }
  console.log('listo.')
}

main().catch((e) => { console.error(e); process.exit(1) })
