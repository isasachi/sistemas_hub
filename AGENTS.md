<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# jr-ai-hub — proyecto

Hub de herramientas de marketing con IA para el mercado peruano. Next.js 16 + React 19, Supabase (Postgres + Storage, service role), tema oscuro.

## Convenciones

- **Tools:** una carpeta por herramienta en `app/tools/<slug>/page.tsx`. Se registran en `lib/tools.ts` (aparecen en el grid del home).
- **Rutas API:** `app/api/<tool>/<accion>/route.ts`. Patrón: validar → operar → `NextResponse.json`.
- **Lógica:** en `lib/` (o `lib/<tool>/` si la herramienta tiene varios módulos).
- **Prompts:** archivos `.md` en `lib/prompts/`, leídos con `fs.readFileSync(path.join(process.cwd(), 'lib/prompts/...'))`.
- **DB:** Supabase con `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS). Cliente lazy singleton, ver `lib/db.ts`.
- **LLM:** Gemini (`@google/genai`) para las tools de imágenes/texto. Anthropic (`@anthropic-ai/sdk`) solo para `buscador-productos`.
- **UI:** tema oscuro (`bg-[#080810]`, texto `#f1f5f9`, secundario `#94a3b8`, bordes `white/[0.08]`). Cada tool tiene su `accentColor`. Iconos de `lucide-react`. Strings de usuario en español.
- **Tests:** Vitest (`npm test`).

## Tool: Buscador de Productos (`buscador-productos`)

Encuentra productos ganadores validados en LATAM que aún no están saturados en Perú, usando Meta Ads Library. Migrado desde el proyecto Python standalone `~/chamba/product-hunter` (dejado como referencia).

**Arquitectura de tres capas — separación estricta para controlar costos:**

```
GitHub Actions (cron 48h)          Supabase                Vercel (Next.js)
  scripts/scrape.ts   ──scrape──►  ph_products    ◄──lee── app/api/buscador-productos/search
  scripts/analyze.ts  ──score───►  (score/analysis)         (solo lectura, ~200ms)
```

- **`lib/product-hunter/`** — `scraper.ts` (Playwright), `anthropic.ts` (análisis), `db.ts` (Supabase), `types.ts`, `keywords.ts`, `session.ts`.
- **Schema:** `supabase/migrations/20260609_product_hunter.sql` (tablas `ph_*` + RPCs). Aplicar en Supabase antes de usar.
- **Workflow:** `.github/workflows/scrape-productos.yml` (scrape → analyze). Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.

**⚠️ REGLAS DE COSTO — no romper (esto fue requisito explícito del usuario):**

1. **Anthropic SOLO en batch en GitHub Actions.** `lib/product-hunter/anthropic.ts` se importa únicamente desde `scripts/analyze.ts`. NINGUNA ruta de Vercel puede importarlo. Análisis en el path de request = costo x100.
2. **Vercel solo LEE de Supabase.** Las rutas `search`/`seen` no llaman LLM ni corren Playwright (respeta el timeout de 10s de Vercel Hobby).
3. **Cada producto se analiza una sola vez.** `getProductsToAnalyze` filtra `score IS NULL`; el re-scrape preserva `score`/`analysis` (Supabase upsert no toca columnas ausentes del payload).
4. **Cold start no scrapea inline.** Si el nicho no existe, `search` lo registra como `pending` y el cron lo levanta. Vercel no puede correr Playwright.

**⚠️ Scraper — bug crítico:** NO usar `playwright-stealth` ni equivalentes — rompen el JS de la SPA de Meta (0 respuestas GraphQL). Solo ocultar `navigator.webdriver` con un init script. El scraper intercepta respuestas GraphQL (no parsea el DOM, salvo el `~X results` para el ad_count).
