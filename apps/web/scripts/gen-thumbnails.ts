/**
 * Genera los 12 thumbnails ORIGINALES del picker de `generador-branding` (uno
 * por STYLE_PRESET) con el pipeline compose-first ya existente
 * (`buildComposedMockupPrompt` + Gemini) y los sube a Storage en
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
import { STYLE_LIST } from "../lib/branding/style-presets";
import { buildComposedMockupPrompt } from "../lib/branding/generation-prompts";
import { THUMBNAIL_BRIEFS } from "./thumbnail-briefs";

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
      const prompt = buildComposedMockupPrompt(brief, preset);
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
