/**
 * Genera los 12 thumbnails ORIGINALES del picker de `generador-branding` (uno
 * por STYLE_PRESET) con un mockup compuesto de una sola pasada (texto puro,
 * sin refs adjuntas — a diferencia del pipeline secuencial real
 * logo→etiqueta→mockup de `generation-prompts.ts`; aquí solo queremos UNA foto
 * representativa del estilo) y los sube a Storage en
 * `branding-refs/thumbnails/<styleId>.png` (bucket `ad-uploads`, upsert).
 *
 * Reemplaza el uso de `refUrls(id)[0]` (imagen scrapeada real) como thumbnail
 * visible del picker — ver `lib/branding/effective-preset.ts` (`thumbUrl`).
 * Las refs scrapeadas SIGUEN existiendo y se siguen adjuntando a Gemini
 * internamente durante la generación real (modo A); esto solo cambia qué se
 * muestra en la grilla de selección.
 *
 * Uso:  npx tsx scripts/gen-thumbnails.ts   (requiere GOOGLE_API_KEY,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en el entorno — ver .env.local)
 */
import { createClient } from "@supabase/supabase-js";
import { generateImage } from "../lib/gemini";
import { STYLE_LIST, paletteToText } from "../lib/branding/style-presets";
import type { BrandBrief } from "../lib/branding/generation-prompts";
import type { StylePreset } from "../lib/branding/style-presets";
import { getLayout, layoutToPrompt } from "../lib/branding/label-layouts";
import { contrastToPrompt } from "../lib/branding/contrast";
import { THUMBNAIL_BRIEFS } from "./thumbnail-briefs";

// Prompt de una sola pasada, autocontenido (sin "attached image" — este script
// no adjunta ninguna imagen a generateImage). No confundir con el pipeline
// secuencial real: es solo para la miniatura del picker.
function thumbnailPrompt(brief: BrandBrief, preset: StylePreset): string {
  const layout = getLayout(preset.id);
  const container = brief.containerType ?? "product packaging";
  return [
    `Create a photorealistic product mockup: a ${container} for "${brief.brandName}", a ${brief.productType}, with its COMPLETE packaging design fully applied — as one cohesive professional brand system.`,
    preset.styleBlock,
    `Color palette: ${paletteToText(preset.palette)}.`,
    contrastToPrompt(preset),
    `The packaging must show BOTH elements, integrated coherently as a single deliberate design: (1) a clear brand LOGO / wordmark for "${brief.brandName}" — prominent, legible and well-placed, NOT lost in the artwork and NOT clashing with the label; and (2) the full front label with${brief.descriptor ? ` the descriptor "${brief.descriptor}",` : ""}${brief.tagline ? ` the tagline "${brief.tagline}",` : ""} plus small realistic legal / net-weight / ingredient microtext.`,
    layoutToPrompt(layout),
    `Materials & finish: ${preset.materials.join(", ")}.`,
    `Studio product photography: ${preset.lighting}. Scene: ${preset.composition}. Mood: ${preset.mood.join(", ")}. Realistic reflections, soft contact shadow, believable depth of field.`,
    `Render the brand name on the packaging exactly as "${brief.brandName}", spelled correctly.`,
    `Avoid: ${[...preset.avoid, ...layout.avoidLayout].join(", ")}. High-resolution, professional commercial quality, sharp focus, no watermark, no stray or misspelled text.`,
  ].filter(Boolean).join(" ");
}

const BUCKET = "ad-uploads";
const PREFIX = "branding-refs/thumbnails";

async function main() {
  const storage = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ).storage.from(BUCKET);

  let ok = 0;
  let failed = 0;
  for (const preset of STYLE_LIST) {
    const brief = THUMBNAIL_BRIEFS[preset.id];
    if (!brief) { console.error(`✗ ${preset.id}: sin brief en THUMBNAIL_BRIEFS`); failed++; continue }
    process.stdout.write(`[${preset.index}/12] ${preset.id} (${brief.brandName})... `);
    try {
      const prompt = thumbnailPrompt(brief, preset);
      const b64 = await generateImage([{ text: prompt }], 3, { aspectRatio: "1:1" });
      if (!b64) throw new Error("generateImage devolvió vacío");
      const { error } = await storage.upload(`${PREFIX}/${preset.id}.png`, Buffer.from(b64, "base64"), {
        contentType: "image/png",
        upsert: true,
      });
      if (error) throw new Error(`upload: ${error.message}`);
      console.log("OK");
      ok++;
    } catch (e) {
      console.log(`FALLÓ — ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(`\n${ok}/12 thumbnails generados y subidos. ${failed} fallaron.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
