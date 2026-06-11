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

- **`lib/product-hunter/`** — `scraper.ts` (Playwright + métricas + pool concurrente), `anthropic.ts` (análisis), `analysis-runner.ts` (lógica compartida analyze/pipeline, solo CI), `keyword-expansion.ts` (expansión LLM de keywords), `prescore.ts` (índice P_w determinista para priorizar el batch), `quick-discard.ts` (Etapa 1: descarte rápido pre-enrich), `dom-fallback.ts` (fallback DOM cuando GraphQL da 0 nodos), `competitors.ts`, `github.ts` (dispatch on-demand), `db.ts` (Supabase), `types.ts`, `keywords.ts`, `session.ts`.
- **Schema:** `supabase/migrations/20260609_product_hunter.sql` + `20260611_niche_keywords.sql` + `20260611_ph_perf_indexes.sql` (tablas `ph_*` + RPCs + índices JSONB). Aplicar en Supabase antes de usar.
- **Workflow:** `.github/workflows/scrape-productos.yml`. Con `NICHE` (cold start): scrape → analyze del nicho. Sin `NICHE` (cron/siembra): `scripts/pipeline.ts --all` **entrelazado** — al terminar el scrape de cada nicho se envía su batch de análisis sin esperar y se cosecha entre nichos (primer nicho `ready` en ~20 min, no horas). Después: expand-uncovered → analyze → validate-pe. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. Env de Vercel para cold start on-demand: `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN`.
- **Priorización del análisis:** `getProductsToAnalyze` ordena los pendientes por `prescore.ts` (P_w = 0.6·longevidad + 0.4·volumen, caps 90 días/200 ads) — con más candidatos que `PH_ANALYZE_LIMIT`, los mejores entran primero al batch.

**Siembra masiva de nichos.** `scripts/seed-niches.ts` registra listas de nichos como `pending` en `ph_niches` (`--from <archivo>` 1/línea · `--niches "a,b,c"` · posicionales · `--dry-run`). No llama LLM ni scrapea — solo escribe filas pending; salta los nichos que ya existen (no los degrada). Luego `scripts/scrape.ts --all` (o el cron de 12h) drena la cola. El loop `--all` es resiliente: un nicho que falla loguea `✗` y no aborta los demás. Lo que no entre en el timeout de 10h queda `pending` y lo levanta el siguiente cron.

**Concurrencia del scraper.** `PH_CONCURRENCY` (default 3) controla cuántas pages navegan en paralelo dentro del mismo browser context (`launchScraperContext`). Cada navegación gasta ~12s esperando (no CPU), así que N pages dan ~N× throughput sin tocar los timings. ⚠️ La IP residencial es el recurso escaso: no subir de 3 sin evaluar (riesgo de que Meta sirva vacíos o bloquee la IP).

**Presupuesto de tiempo por nicho.** Las búsquedas traen cientos/miles de candidatos pero el análisis procesa `PH_ANALYZE_LIMIT` (50) por corrida — enriquecer la cola larga es trabajo perdido. Topes ($0, 0 = sin tope): `PH_SEARCH_CAP` (default 150) corta la Fase 1 discovery al juntar ese nº de candidatos únicos (PE siempre corre completo, es el pool de competidores); `PH_ENRICH_LIMIT` (default 80) enriquece solo el top-K discovery rankeado por señal de card (prescore P_w sobre collation/startDate). El pool PE se construye **directo desde la card** (`source: 'search-card'`, 0 navegaciones) — el matching usa nombre/creativos y `validate-pe` trae los counts en vivo para los ganadores.

**Garantía de output (regla del modelo original):** la tool debe devolver productos ganadores para TODO nicho consultado.

1. **Expansión de keywords (≥15, 4 direcciones: síntomas · zonas · situaciones · soluciones).** Un nicho nuevo nunca se busca con su keyword literal: `scripts/scrape.ts` resuelve keywords en orden cache DB (`ph_niches.keywords`) → seed estático (`keywords.ts`) → expansión LLM (Haiku, `lib/prompts/expansion-keywords.md`, una llamada por nicho, cacheada).
2. **Fallback de países.** Si la pasada LATAM junta <30 candidatos únicos, el scraper repite las keywords en US/ES (`FALLBACK_COUNTRIES`, como el agente original).
3. **Ampliación post-análisis.** `scripts/expand-uncovered.ts`: si un nicho analizado quedó sin ganadores (0 alta/media frescos), re-scrapea una vez en US/ES (`ph_niches.expanded` evita repetirlo) y el workflow re-analiza.
4. **Best-effort en el route.** `search` prioriza ganadores; si no hay, devuelve los mejores candidatos por score con `bestEffort: true` (la UI los etiqueta, y NO los marca como vistos — son relleno). Nunca respuesta vacía para un nicho ya scrapeado.
   - **Economía del visto (no exclusión dura).** `ph_unseen_products` rankea con penalización: lo visto-hace-poco se hunde y RE-APARECE tras 7 días (`markSeen` actualiza `seen_at` al re-ver). El pool nunca se vacía para un usuario — antes un solo usuario agotaba el nicho en 2 búsquedas. El "visto" es por-usuario (cookie `PH_USER_COOKIE`), no afecta a otros. `totalUnseen` cuenta ganadores frescos para el usuario (honesto); `allSeen` avisa cuando ya los vio todos y se le re-muestran. `pending` distingue `queued` (nicho nuevo encolado) de análisis-en-proceso (nicho existente sin productos aún).
5. **Cold start on-demand.** Un nicho nuevo dispara el workflow vía `repository_dispatch` (`lib/product-hunter/github.ts`); el cron de 12h sigue siendo el respaldo. Los scripts de CI iteran nichos desde el DB (`getActiveNiches`), no desde el mapa estático.
6. **Resolución de nicho antes del cold start.** `search` resuelve la consulta contra los nichos existentes (`lib/product-hunter/niche-match.ts`): match exacto del id, o la consulta contiene una keyword expandida / el id de un nicho. Tolerancia: plural (-s/-es), acentos y derivación por raíz vía prefijo común ≥4 chars que cubra casi toda la palabra corta ("rodillera" → `rodilla` incluso si el nicho está pending sin keywords). Prefijo y NO substring libre ("peso" ⊄ "espeso"). Precision-first: una consulta genuinamente nueva no matchea y sigue el cold start normal.

**⚠️ REGLAS DE ORO DE PRODUCTO — no romper (requisito explícito del usuario, 2026-06-11):**

`ph_products` SOLO contiene productos que cumplen las TRES reglas, SIEMPRE: **≥40 anuncios activos · ≥10 días corriendo · NO pautado en Perú**. Tres capas lo garantizan:

1. **Etapa 1 (card, `quickDiscard`):** conservadora — si falta el dato, pasa al enrich.
2. **Etapa 2 (post-enrich, `goldenDiscard`):** estricta — con los datos exactos, <40 ads, <10 días o antigüedad desconocida NO se guardan.
3. **Serving (`toCard`):** defensa en profundidad — filas legadas que violen las reglas tampoco se muestran.

Los anunciantes PE van a la tabla **`ph_pe_pool`** (migración `20260611_ph_pe_pool.sql`), nunca a `ph_products`: alimentan el matching de competencia (`getPeCompetitors`) pero no se analizan con LLM ni llegan a la UI.

**⚠️ REGLAS DE COSTO — no romper (esto fue requisito explícito del usuario):**

1. **Anthropic SOLO en GitHub Actions.** `lib/product-hunter/anthropic.ts` se importa únicamente desde `scripts/analyze.ts`, `scripts/pipeline.ts` y `lib/product-hunter/analysis-runner.ts` (módulo compartido que a su vez solo importan esos scripts). `lib/product-hunter/keyword-expansion.ts` se importa únicamente desde `scripts/resolve.ts` (usado por `scrape.ts`/`pipeline.ts`; una llamada Haiku por nicho nuevo, cacheada en DB). NINGUNA ruta de Vercel puede importar ninguno de estos módulos. Análisis en el path de request = costo x100.
2. **Vercel solo LEE de Supabase.** Las rutas `search`/`seen` no llaman LLM ni corren Playwright (respeta el timeout de 10s de Vercel Hobby).
3. **Cada producto se analiza una sola vez.** `getProductsToAnalyze` filtra `score IS NULL`; el re-scrape preserva `score`/`analysis` (Supabase upsert no toca columnas ausentes del payload).
4. **Cold start no scrapea inline.** Si el nicho no existe, `search` lo registra como `pending` y el cron lo levanta. Vercel no puede correr Playwright.

**⚠️ Scraper — bug crítico:** NO usar `playwright-stealth` ni equivalentes — rompen el JS de la SPA de Meta (0 respuestas GraphQL). Solo ocultar `navigator.webdriver` con un init script. El scraper intercepta respuestas GraphQL (no parsea el DOM, salvo el `~X results` para el ad_count).

**Arquitectura híbrida (implementada 2026-06-11):**
- **Etapa 1 pre-enrich:** `quick-discard.ts` filtra desde la card de búsqueda (volumen <40 ads, antigüedad <10 días, servicios). Los candidatos PE siempre pasan (son el pool de competidores). Reduce el enrich de cientos a decenas de navegaciones.
- **Fallback DOM:** `dom-fallback.ts` activa `querySelectorAll` sobre hrefs cuando GraphQL+inline dan 0 nodos (field `source: 'dom-fallback'` en `raw_data`). Los nodos son degradados (sin creatives) pero aseguran que la búsqueda no se pierda.
- **Observabilidad:** `scrapeNiche` loguea un resumen de métricas al final de cada corrida (búsquedas, 0-payloads, fallbacks DOM, descartados por motivo, enriquecidos). Detecta roturas de schema GraphQL desde el primer cron.
