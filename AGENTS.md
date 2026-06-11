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

- **`lib/product-hunter/`** — `scraper.ts` (Playwright), `anthropic.ts` (análisis), `keyword-expansion.ts` (expansión LLM de keywords), `competitors.ts`, `github.ts` (dispatch on-demand), `db.ts` (Supabase), `types.ts`, `keywords.ts`, `session.ts`.
- **Schema:** `supabase/migrations/20260609_product_hunter.sql` + `20260611_niche_keywords.sql` (tablas `ph_*` + RPCs). Aplicar en Supabase antes de usar.
- **Workflow:** `.github/workflows/scrape-productos.yml` (scrape → analyze → expand-uncovered → analyze → validate-pe). Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. Env de Vercel para cold start on-demand: `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN`.

**Garantía de output (regla del modelo original):** la tool debe devolver productos ganadores para TODO nicho consultado.

1. **Expansión de keywords (≥15, 4 direcciones: síntomas · zonas · situaciones · soluciones).** Un nicho nuevo nunca se busca con su keyword literal: `scripts/scrape.ts` resuelve keywords en orden cache DB (`ph_niches.keywords`) → seed estático (`keywords.ts`) → expansión LLM (Haiku, `lib/prompts/expansion-keywords.md`, una llamada por nicho, cacheada).
2. **Fallback de países.** Si la pasada LATAM junta <30 candidatos únicos, el scraper repite las keywords en US/ES (`FALLBACK_COUNTRIES`, como el agente original).
3. **Ampliación post-análisis.** `scripts/expand-uncovered.ts`: si un nicho analizado quedó sin ganadores (0 alta/media frescos), re-scrapea una vez en US/ES (`ph_niches.expanded` evita repetirlo) y el workflow re-analiza.
4. **Best-effort en el route.** `search` prioriza ganadores; si no hay, devuelve los mejores candidatos por score con `bestEffort: true` (la UI los etiqueta). Nunca respuesta vacía para un nicho ya scrapeado.
5. **Cold start on-demand.** Un nicho nuevo dispara el workflow vía `repository_dispatch` (`lib/product-hunter/github.ts`); el cron de 12h sigue siendo el respaldo. Los scripts de CI iteran nichos desde el DB (`getActiveNiches`), no desde el mapa estático.

**⚠️ REGLAS DE COSTO — no romper (esto fue requisito explícito del usuario):**

1. **Anthropic SOLO en GitHub Actions.** `lib/product-hunter/anthropic.ts` se importa únicamente desde `scripts/analyze.ts` (análisis en batch) y `lib/product-hunter/keyword-expansion.ts` únicamente desde `scripts/scrape.ts` (una llamada Haiku por nicho nuevo, cacheada en DB). NINGUNA ruta de Vercel puede importar ninguno de los dos. Análisis en el path de request = costo x100.
2. **Vercel solo LEE de Supabase.** Las rutas `search`/`seen` no llaman LLM ni corren Playwright (respeta el timeout de 10s de Vercel Hobby).
3. **Cada producto se analiza una sola vez.** `getProductsToAnalyze` filtra `score IS NULL`; el re-scrape preserva `score`/`analysis` (Supabase upsert no toca columnas ausentes del payload).
4. **Cold start no scrapea inline.** Si el nicho no existe, `search` lo registra como `pending` y el cron lo levanta. Vercel no puede correr Playwright.

**⚠️ Scraper — bug crítico:** NO usar `playwright-stealth` ni equivalentes — rompen el JS de la SPA de Meta (0 respuestas GraphQL). Solo ocultar `navigator.webdriver` con un init script. El scraper intercepta respuestas GraphQL (no parsea el DOM, salvo el `~X results` para el ad_count).
