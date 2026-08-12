<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# jr-ai-hub — proyecto

Hub de herramientas de marketing con IA para el mercado peruano. Next.js 16 + React 19, Supabase (Postgres + Storage, service role), tema oscuro.

## Estructura — monorepo npm workspaces

El repo es un monorepo con tres workspaces (un solo git repo, lockfile en la raíz):

```
sistemas_hub/                (git root — package.json con "workspaces": ["apps/*","packages/*"])
  packages/shared/ (@ph/shared)  capa DB + tipos/utilidades PURAS — db.ts, types.ts,
                                 prescore.ts, json-clean.ts, keywords.ts. Sin Next/React/
                                 Playwright/Anthropic (prohibido). Se consume como `@ph/shared`.
  apps/web/        (Vercel)      Next.js: todo el hub (todas las tools), components/, store/,
                                 lib/ (Gemini, supabase, etc.) + lib/product-hunter/{session,
                                 quota,niche-match}.ts (web-only). Build: `next build`.
  apps/worker/     (VPS)         scraper+análisis de buscador-productos: scripts/*,
                                 lib/product-hunter/* (scraper, anthropic, pe-validation, …),
                                 lib/prompts/*, niches.txt, scripts/worker-loop.sh. Corre 24/7
                                 bajo systemd. NO se despliega a Vercel.
  supabase/migrations/           infra compartida (raíz). El worker las aplica; Vercel no.
```

- **`@ph/shared` se publica como `.ts` crudo** (sin build step). Next lo transpila vía `transpilePackages: ['@ph/shared']` en `apps/web/next.config.ts` (sino el build de Vercel falla).
- **El split blinda la regla de costo por construcción:** solo `apps/worker` importa `anthropic`/`scraper`/`playwright`; `apps/web` no los declara como dep y no puede importarlos.
- **Vercel:** Root Directory = `apps/web`, "Include files outside the root directory" ON (para el lockfile/symlinks del workspace), install en la raíz.
- **VPS:** `npm ci` en la raíz + `npx playwright install --with-deps chromium`; daemon vía systemd (ver `apps/worker/deploy/buscador-productos.service`).

## Convenciones

- **Tools:** una carpeta por herramienta en `apps/web/app/(app)/tools/<slug>/page.tsx`. Se registran en `apps/web/lib/tools.ts` (aparecen en el grid del home).
- **Rutas API:** `apps/web/app/api/<tool>/<accion>/route.ts`. Patrón: validar → operar → `NextResponse.json`.
- **Lógica:** en `apps/web/lib/` (web) o `apps/worker/lib/` (worker); la capa DB/tipos compartida en `packages/shared/` (`@ph/shared`).
- **Prompts:** archivos `.md` en `apps/web/lib/prompts/` (Gemini) o `apps/worker/lib/prompts/` (worker), leídos con `fs.readFileSync(path.join(process.cwd(), 'lib/prompts/...'))`.
- **DB:** Supabase con `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS). Cliente lazy singleton: `@ph/shared` (`db.ts`) para buscador-productos; `apps/web/lib/db.ts` para el resto del hub.
- **LLM:** Gemini (`@google/genai`) para las tools de imágenes/texto (en `apps/web`). Anthropic (`@anthropic-ai/sdk`) solo para `buscador-productos` (en `apps/worker`).
- **UI:** tema oscuro (`bg-[#080810]`, texto `#f1f5f9`, secundario `#94a3b8`, bordes `white/[0.08]`). Cada tool tiene su `accentColor`. Iconos de `lucide-react`. Strings de usuario en español.
- **Tests:** Vitest por workspace (`npm test -w apps/web`, `npm test -w apps/worker`; `npm test` corre ambos).

## Tool: Generador de Video Ads (`generador-video-ads`)

Genera un video ad UGC vertical (9:16) con **Grok Imagine 1.5 vía KIE AI** (`KIE_API_KEY`). Espeja el generador de anuncios (sesión en tabla propia + wizard de 5 pasos + `gen-quota`), con tres divergencias obligadas.

**Una sola línea de entrada.** El VIDEO ORIGINAL es obligatorio: es la fuente de verdad de estructura, orden, ritmo, cámara y número de tomas (`docs/superpowers/plans/2026-08-12-video-ugc-plan-a-analisis.md`). Los modos `character-ref`/`character-gen` se eliminaron con el recableado al PROMPT MAESTRO — sin referencia no hay ADN estructural que copiar, que es el valor de la tool.

**FASE 0 — gate de validación bloqueante.** `validation.ts` construye una matriz determinista (sin LLM: preguntar "¿el usuario entregó esto?" no necesita un modelo, y pedírselo abriría la puerta a que lo rellene). `canProceed` bloquea el wizard mientras una variable crítica siga pendiente. ⚠️ **Etnia y acento NUNCA se marcan confirmados desde la referencia**, ni habiendo foto de personaje: el spec lo prohíbe explícitamente y una foto no confirma origen cultural.

**FASE 1 — la unidad de análisis es el CORTE REAL, no la frase.** El pipeline viejo pedía un beat por cambio visual *o* por frase, lo que llegara primero; eso fabricaba cortes donde el original tenía una toma continua y destruía el ritmo al reconstruir. Ahora: "no dividas una toma continua solo porque cambia el diálogo". Los elementos gráficos (subtítulos, watermark) se capturan en su **propio campo** (`elementosGraficos`), nunca dentro de `accion` ni `camara` — así no viajan al render como algo a reproducir.

**Lo que NO se copia de anuncios (y por qué):**

1. **El video sube directo al bucket.** El body de una función serverless de Vercel está topado en 4.5 MB. `POST …/upload-url` firma la subida, el browser hace `PUT`, y a la ruta de análisis le llega solo la URL pública (`lib/video-ads/upload-client.ts`). Tope del video: **14 MB** — por encima, Gemini no lo acepta inline (base64 infla 4/3) y habría que ir a la Files API.
2. **El render no usa SSE.** KIE es asíncrono y tarda minutos: `generate-video` crea la tarea y guarda `kie_task_id`; el cliente hace polling contra `video-status`. **El taskId se lee SIEMPRE de la fila**, nunca del cliente — aceptarlo por query convertiría la ruta en un proxy abierto a la cuenta de KIE.
3. **El análisis forense no pasa por `callStructured`** (es OpenAI-primario y gpt-4o-mini no come video): usa `geminiCallStructured` directo. El personaje, en cambio, lo genera **`openaiGenerateImage` (gpt-image-2) sin fallback**, por decisión explícita del usuario; gpt-image-2 solo hace portrait 1024x1536 (2:3); el 9:16 exacto lo impone Grok al renderizar **porque el personaje nunca va solo** (siempre acompaña al producto, o sea modo multi-imagen, donde `aspect_ratio` sí manda).

**Contrato con KIE (`lib/video-ads/kie.ts`, verificado en `docs.kie.ai/market/grok-imagine/image-to-video`).** El modelo es **`grok-imagine/image-to-video`**. ⚠️ El marketplace tiene un segundo modelo, `grok-imagine-video-1-5-preview`, con **schema incompatible** (duración entera 1–15, `input` con `additionalProperties:false` → rechaza `mode`, prompt de 4096). Se probó y se descartó: **topa en 15s y la tool necesita 30**. Cambiar `MODEL` obliga a revisar el bloque entero de reglas, no solo el string. `POST /api/v1/jobs/createTask` → `taskId`; `GET /api/v1/jobs/recordInfo?taskId=` → `data.state` (`waiting|queuing|generating|success|fail`) y el video en `JSON.parse(data.resultJson).resultUrls[0]`. Reglas que rompen el render en silencio si se ignoran, todas blindadas y cubiertas por `kie.test.ts`: `duration` es **string** 6–30 (`clampDuration` devuelve número — la columna `duration` es int — y `buildTaskBody` lo convierte, un solo clamp para los dos consumidores); `aspect_ratio` default es 16:9 (hay que forzar 9:16) **pero solo aplica en modo multi-imagen**; **`1080p` solo admite UNA imagen** → el hub renderiza **720p fijo** en las tres líneas (1080p solo alcanzaría a `video-ref`, y encarecer el render más caro del hub por una calidad desigual que en feed vertical no se nota no paga); `prompt` topa en **5000** caracteres; las imágenes se referencian como `@image(n)` en el orden del array.

⚠️ **Con UNA imagen, el 9:16 del body es inerte.** Grok ignora `aspect_ratio` cuando el array trae una sola imagen y hereda el ratio del origen — o sea, la línea `video-ref` (solo producto) saldría horizontal si la foto lo es. Por eso `generate-video` enlienza esa imagen a 1080x1920 (`lib/video-ads/vertical.ts`) antes de crear la tarea. Es **padding, no recorte**: un `cover` le cortaría los bordes al producto y contradiría la regla que el propio prompt le impone a Grok ("visually identical"). La condición es `images.length === 1`, **no** `mode === 'video-ref'`: `mode` se puede cambiar por PATCH después de subir el producto.

⚠️ **El rango 6–30s es del render, no del guión.** `generate-script` clampa con el mismo `clampDuration` de `kie.ts`: si el límite viviera solo en el render, una duración fuera de rango produciría un guión válido que revienta minutos después, ya gastada la cuota. Un cambio de modelo mueve el rango en un solo lugar.

**Lo que NO se copia de la referencia (diagnóstico 2026-08-11).** Un render real replicó tres cosas que no son contenido: los **subtítulos quemados**, la **marca de agua de TikTok** y el **cierre de plataforma**; además cambió el casting (morena latina → rubia pecosa), perdió el encuadre y, al durar más que su copy, Grok **inventó frases** para rellenar. Cinco causas, todas en el mismo tramo:

1. *Captions.* El prompt forense pedía transcribir el on-screen text VERBATIM, y los subtítulos son on-screen text → viajaban a `onScreenText` → `buildVideoPrompt` los dictaba como gráfico. Ahora el análisis distingue **pista de subtítulos** (repite la voz → se descarta) de **gráfico real** (dice algo que la voz no dice), y `isCaptionEcho` los filtra al armar el prompt — eso limpia también las sesiones ya guardadas, sin migrar datos.
2. *Marca de agua.* El `visual` forense decía "The TikTok logo and '@handle' are visible in the top left" y se mandaba como *framing to reproduce*. `stripPlatformFurniture` borra esas frases; el análisis ya no las captura.
3. *Casting.* `forensic.subject` existía y **nunca llegaba al render** — en `video-ref` no hay imagen de personaje, así que Grok inventaba a la persona. Ahora va en un bloque CASTING explícito, y el forense pide rasgos (edad, tono de piel, color y peinado del cabello, ojos, complexión) en vez de solo vestuario.
4. *Estructura.* `beats[].camera` se analizaba y se tiraba. Ahora se anota por índice contra el guión (mismo número y orden por el esqueleto; se zipea hasta donde alcance y el resto va sin anotar).
5. *Duración.* Salía de la referencia — que incluye el cierre de plataforma y dura distinto que el copy rellenado. Ahora sale del guión: `scriptDuration` lee la marca de tiempo del último beat y suma `AIR_SEC`. `generate-video` la recalcula sobre el guión **confirmado** (que el usuario pudo editar); si las marcas no se leen, cae a la de la sesión.

⚠️ **El detalle forense no siempre cabe en 5000 chars** (con ~11 beats, el análisis completo llega a ~6300). `buildVideoPrompt` arma por niveles y manda el más detallado que entre: suelta primero `visual` (que se solapa con `action`) y `camera` al final, porque es corto y es lo que sostiene el encuadre. Sin esto el guard de `KIE_PROMPT_MAX` bloqueaba el render por completo.

**Copy editable antes del render (`Section4Video`).** Elegida la versión, la pantalla previa al render deja corregir cada línea (diálogo hablado y texto en pantalla). Se guarda **en cada blur** vía `confirm-script` con `beats` — no solo al darle a "Generar": con guardado-al-click, recargar o irse por el riel al paso 3 y volver perdía las ediciones en silencio, porque la sección rehidrata de la DB. Si el guardado falla, el render **no arranca** (renderizaría el guión viejo del servidor y el usuario pagaría por un video distinto al que ve). `confirm-script` con `beats` NO toca `script_versions`. Es edición de texto: **no se agregan ni borran beats**, porque en `video-ref` el número y el orden de los tramos son el esqueleto de la referencia. El tope de prompt de KIE (`KIE_PROMPT_MAX`, 5000) se verifica en `generate-video` antes de crear la tarea — pasarse costaría un 422 con la cuota ya consumida.

**Costo.** El render es la llamada más cara del hub por un orden de magnitud: kind `video-render` con tope propio **1 gen + 2 regens** (`GEN_VIDEO_LIMIT`), aparte del backstop diario global. El guión sigue sin tope per-step (es texto, y `isImageKind` no lo cubre): reescribirlo cuesta una fracción de un render.

**Gate de assets verticales (bloqueante, `upload-client.ts` + `Section1Source`).** El video de referencia y la foto de personaje se miden en el browser antes de subir y el wizard **no deja continuar** si son apaisados — el output es 9:16 y una fuente horizontal lo arruina río abajo. Dos decisiones que no hay que "apretar": (1) el criterio es `alto > ancho`, **no** 9:16 exacto, porque `character-gen` genera con gpt-image-2, que solo hace 1024x1536 (2:3) — un gate estricto rechazaría el propio output de la tool; (2) si la medición falla (HEIC, códec raro) **pasa igual** — dejar al usuario encerrado por un formato que el browser no decodifica es peor que un video horizontal. La foto de producto NO se valida: cuando va sola se enlienza server-side (ver arriba), y acompañada no manda el ratio.

**Descarga y miniatura.** El botón de descarga NO puede confiar en el atributo `download`: el mp4 vive en el bucket (cross-origin) y el browser lo ignora, así que abría el video en otra pestaña. Se le pide a Supabase `?download=<nombre>`, que responde `content-disposition: attachment` (verificado por `curl -I`). En el dashboard, la card de una sesión terminada usa el **mp4 como miniatura** y el browser pinta su primer frame (`#t=0.1`, porque muchos mp4 abren en negro) — no hay póster generado, no hay ffmpeg en `apps/web`. `ProjectHistory` distingue video de imagen por `.mp4` en la URL, y el route solo manda el `video_url` como thumb si es el mp4 **ya copiado al bucket**; si el mirror falló (URL de KIE) cae al still del personaje o del producto, que es también lo que se muestra a media sesión.

**Schema:** `supabase/migrations/20260810000001_video_sessions.sql`.

## Tool: Buscador de Productos (`buscador-productos`)

Encuentra productos ganadores validados en LATAM que aún no están saturados en Perú, usando Meta Ads Library. Migrado desde el proyecto Python standalone `~/chamba/product-hunter` (dejado como referencia).

**Arquitectura de tres capas — separación estricta para controlar costos:**

```
VPS daemon (systemd, 24/7)              Supabase                Vercel (Next.js)
  worker-loop.sh                                                 apps/web/app/api/
    → pipeline.ts --all  ──scrape──►   ph_products    ◄──lee──   buscador-productos/search
      (bloques de PH_NICHE_BATCH=15,   (score/analysis)          (solo lectura, ~200ms)
       proceso fresco por bloque)
```

- **`apps/worker/lib/product-hunter/`** — `scraper.ts` (Playwright + métricas + pool concurrente), `anthropic.ts` (análisis), `analysis-runner.ts` (lógica compartida analyze/pipeline), `pe-validation.ts` (validación PE en vivo, reusada por `pipeline.ts` y el CLI `validate-pe.ts`), `keyword-expansion.ts` (expansión LLM de keywords), `keyword-rotation.ts`, `quick-discard.ts` (Etapa 1: descarte rápido pre-enrich), `dom-fallback.ts` (fallback DOM cuando GraphQL da 0 nodos), `competitors.ts`, `offtopic.ts`.
- **`packages/shared/` (`@ph/shared`)** — `db.ts` (Supabase), `types.ts`, `prescore.ts` (índice P_w determinista), `json-clean.ts`, `keywords.ts`. Lo comparten web y worker.
- **`apps/web/lib/product-hunter/`** (web-only) — `session.ts`, `quota.ts`, `niche-match.ts`.
- **Schema:** `supabase/migrations/20260609_product_hunter.sql` + `20260611_niche_keywords.sql` + `20260611_ph_perf_indexes.sql` (tablas `ph_*` + RPCs + índices JSONB). Aplicar en Supabase antes de usar.
- **Daemon (reemplaza GitHub Actions):** `apps/worker/scripts/worker-loop.sh` bajo systemd. Cada ciclo: (1) siembra `niches.txt` (lista curada maestra) idempotente; (2) drena la cola en **bloques de `PH_NICHE_BATCH` (15)** llamando `pipeline.ts --all` con proceso fresco por bloque hasta el centinela `PH_QUEUE_EMPTY` — cada bloque scrapea+analiza **entrelazado** (primer nicho `ready` en ~20 min) y valida la **competencia PE de sus 15** con el browser caliente; (3) cola de refinamiento una vez por ciclo: `expand-uncovered → analyze → validate-pe → recheck-watchlist` (la validación PE principal corre por-bloque; esta `validate-pe` del tail es la red de seguridad $0 para los productos que `expand-uncovered` crea en nichos ya frescos, que no reentran a un bloque por ~7 días); (4) `sleep` y repite (con `PH_REFRESH_DAYS=7` los activos reentran semanalmente). Secrets en `apps/worker/.env.local`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. Unit template: `apps/worker/deploy/buscador-productos.service`.
- **Priorización del análisis:** `getProductsToAnalyze` ordena los pendientes por `prescore.ts` (P_w = 0.6·longevidad + 0.4·volumen, caps 90 días/200 ads) — con más candidatos que `PH_ANALYZE_LIMIT`, los mejores entran primero al batch.

**Siembra masiva de nichos.** `scripts/seed-niches.ts` registra listas de nichos como `pending` en `ph_niches` (`--from <archivo>` 1/línea · `--niches "a,b,c"` · posicionales · `--dry-run`). No llama LLM ni scrapea — solo escribe filas pending; salta los nichos que ya existen (no los degrada). El daemon la siembra al inicio de cada ciclo; la **fuente de nichos es la lista curada larga `niches.txt`** (no la cola `pending` ad-hoc, que solo tiene los cold-starts de usuarios — se mezclan en la misma cola). El loop `--all` es resiliente: un nicho que falla loguea `✗` y no aborta los demás.

**Concurrencia del scraper.** `PH_CONCURRENCY` controla cuántas pages navegan en paralelo dentro del mismo browser context (`launchScraperContext`). Cada navegación gasta ~12s esperando (no CPU), así que N pages dan ~N× throughput sin tocar los timings — son las ~45 búsquedas keyword×país de UN nicho en paralelo (1 keyword≈1 page), NO N nichos. ⚠️ **Subir por rampa, no en frío.** El scraper live probó 20 pages en perfil **bursty** (ráfagas de ~70s) sobre el VPS; el daemon es **sostenido 24/7**, que es lo que Meta bloquea (volumen de requests por IP en el tiempo). El viejo "no subir de 3" era del runner residencial sostenido. El daemon arranca en ~15 y sube hacia el objetivo **30** solo mientras los GraphQL-vacíos (que `scrapeNiche` loguea por corrida) sigan ~0 sobre horas y la RAM aguante (`free -m`); si trepan o hay OOM, bajar un escalón. Ajuste sin redeploy: `export PH_CONCURRENCY` en `worker-loop.sh`.

**Rate-control anti-bloqueo (P1, en `navigateAndCapture` — choke point de TODA navegación, discovery Y validación PE).** Defensa de dos capas contra el soft-block de Meta por IP, ambas configurables ($0): (1) **jitter** `PH_JITTER_MS` (default 500, 0=off) — delay aleatorio antes de cada navegación, desincroniza la ráfaga inicial de las N pages; (2) **cool-down** — una navegación que vuelve SIN nodos (tras agotar GraphQL+DOM) es la señal del throttle; tras `PH_ZERO_STREAK` (default 8) navegaciones-sin-nodos consecutivas, un controlador singleton de módulo (compartido entre discovery y PE, misma IP) pausa TODAS las pages `PH_COOLDOWN_MS` (default 90s) y re-escala si sigue vacío. La señal la alimentan los callers vía `noteNavResult` (nodos post-fallback), no `navigateAndCapture` (un block puede devolver payload no-vacío-sin-nodos que el conteo crudo no detecta). Un payload no-vacío resetea la racha. **Dos guards complementarios protegen la regla de oro** (un probe bloqueado no debe fabricar escenario A "sin competencia en PE"): (P0, per-probe) `pe-validation.ts` lee el marcador `~results` — sin marcador + 0 nodos = bloqueo → inconcluso, no clasifica A (depende del marker); (P2, run-level) `scrapeNiche` reporta `blocked` cuando ≥`PH_BLOCK_RATIO` (0.6) de sus búsquedas quedó vacía-tras-DOM (`searchZeros/searches`, marker-INDEPENDENTE) → `pipeline.ts` saltea la validación PE de ese nicho y lo re-encola a `pending`. ⚠️ Origen: un smoke test a 6 países × conc 12 tripeó un block (247/268 0-payloads) que fabricó 7 ganadores falsos — de ahí las tres defensas (jitter, cool-down, guards P0+P2).

**Hard-abort (P3, en el mismo controlador singleton).** El cool-down de 90s NO des-bloquea un block persistente: re-sondear cada 90s mantiene la IP caliente y escala soft→hard (lección 2026-06-18: el daemon sondeó una IP-proxy muerta 70+ min hasta hard-bloquearla). Tras `PH_MAX_COOLDOWNS` (default 3) cool-downs SEGUIDOS sin que ninguna nav recuperara nodos, el controlador se declara `persistentlyBlocked` (latch, `isPersistentlyBlocked()`): `navigateAndCapture` lanza `PersistentBlockError` al instante (fast-fail, deja de tocar la IP), `scrapeNiche` devuelve `persistentBlock:true`, `pipeline.ts` **corta el bloque** (break), re-encola el nicho, saltea la validación PE y emite el centinela `PH_PERSISTENT_BLOCK`; `worker-loop.sh` lo detecta, salta el refinamiento del ciclo y duerme `PH_BLOCK_COOLDOWN` (default 3600s) para que la IP respire. Una recuperación (payload con nodos) resetea el contador → no se declara block por throttles transitorios. `PH_MAX_COOLDOWNS=0` lo desactiva.

**Presupuesto de tiempo por nicho.** Las búsquedas traen cientos/miles de candidatos pero el análisis procesa `PH_ANALYZE_LIMIT` (50) por corrida — enriquecer la cola larga es trabajo perdido. Topes ($0, 0 = sin tope): `PH_SEARCH_CAP` (default 300) corta la Fase 1 discovery al juntar ese nº de candidatos únicos (PE siempre corre completo, es el pool de competidores); `PH_ENRICH_LIMIT` (default 150) enriquece solo el top-K discovery rankeado por señal de card (prescore P_w sobre collation/startDate). Las tareas de búsqueda van intercaladas keyword×país (el cap corta keywords tardías, no países enteros). El pool PE se construye **directo desde la card** (`source: 'search-card'`, 0 navegaciones) — el matching usa nombre/creativos y `validate-pe` trae los counts en vivo para los ganadores.

**Inventario sostenido (plan 13, implementado 2026-06-12; migrado a daemon 2026-06-16).**
- **Rotación de keywords (C):** `PH_KEYWORD_ROTATION=1` (siempre-on en el daemon) hace que cada corrida use una ventana rotativa del pool (`PH_KEYWORD_WINDOW`, default 15; cursor en `ph_niches.keyword_cursor`) → descubre anunciantes nuevos sin re-buscar lo mismo. **Clamp adaptativo:** la ventana efectiva es `min(PH_KEYWORD_WINDOW, floor(pool/2))` — la no-solape entre corridas exige N≥2·ventana, así que en pools chicos la ventana se topa a la mitad (pool 18→9, 24→12; window 15 solo pleno con pools ≥30). El seed/re-scrape manual (ROTATE off) usa TODAS las keywords.
- **Refresh configurable:** `PH_REFRESH_DAYS` (default 30; el daemon usa **7**) controla cada cuánto un nicho `active` vence y reentra a `getNichesToRefresh()`.
- **Bloque del daemon:** `PH_NICHE_BATCH` (default 15) = nichos por invocación de `pipeline.ts` (proceso fresco). `PH_NO_PE=1` salta la validación PE del bloque (debug).
- **Profundidad de scroll (D):** `PH_SCROLL_PASSES` (default 3) configurable para experimentar nodos/búsqueda.
- **Watchlist (E):** los descartados por reglas de oro pero con tracción (`isNearWinner`: ≥20 ads y ≥5 días) van a `ph_watchlist` (migración `20260612_watchlist.sql`); `scripts/recheck-watchlist.ts` (cola de refinamiento del daemon) los re-visita y promueve a `ph_products` cuando maduran (≥40 ads · ≥10 días). $0 LLM.

**Garantía de output (regla del modelo original):** la tool debe devolver productos ganadores para TODO nicho consultado.

1. **Expansión de keywords (≥15, 4 direcciones: síntomas · zonas · situaciones · soluciones).** Un nicho nuevo nunca se busca con su keyword literal: `resolve.ts` (usado por `pipeline.ts`/`scrape.ts`) resuelve keywords en orden cache DB (`ph_niches.keywords`) → seed estático (`@ph/shared` `keywords.ts`) → expansión LLM (Haiku, `apps/worker/lib/prompts/expansion-keywords.md`, una llamada por nicho, cacheada).
2. **Fallback de países.** Si la pasada LATAM junta <30 candidatos únicos, el scraper repite las keywords en US/ES (`FALLBACK_COUNTRIES`, como el agente original).
3. **Ampliación post-análisis.** `scripts/expand-uncovered.ts`: si un nicho analizado quedó sin ganadores (0 alta/media frescos), re-scrapea una vez en US/ES (`ph_niches.expanded` evita repetirlo) y el daemon re-analiza (`analyze.ts` en la cola de refinamiento).
4. **Best-effort en el route.** `search` prioriza ganadores; si no hay, devuelve los mejores candidatos por score con `bestEffort: true` (la UI los etiqueta, y NO los marca como vistos — son relleno). Nunca respuesta vacía para un nicho ya scrapeado.
   - **Economía del visto (no exclusión dura).** `ph_unseen_products` rankea con penalización: lo visto-hace-poco se hunde y RE-APARECE tras 7 días (`markSeen` actualiza `seen_at` al re-ver). El pool nunca se vacía para un usuario — antes un solo usuario agotaba el nicho en 2 búsquedas. El "visto" es por-usuario (cookie `PH_USER_COOKIE`), no afecta a otros. `totalUnseen` cuenta ganadores frescos para el usuario (honesto); `allSeen` avisa cuando ya los vio todos y se le re-muestran. `pending` distingue `queued` (nicho nuevo encolado) de análisis-en-proceso (nicho existente sin productos aún).
5. **Cold start on-demand.** Un nicho nuevo se registra como `pending` (`search` hace `upsertNiche`, NO scrapea — Vercel no corre Playwright). El daemon siempre-on lo levanta en una vuelta del loop (minutos): `getNichesToRefresh()` devuelve los `pending`. Sin dispatch externo. Los scripts iteran nichos desde el DB (`getActiveNiches`/`getNichesToRefresh`), no desde el mapa estático.
6. **Resolución de nicho antes del cold start.** `search` resuelve la consulta contra los nichos existentes (`apps/web/lib/product-hunter/niche-match.ts`): match exacto del id, o la consulta contiene una keyword expandida / el id de un nicho. Tolerancia: plural (-s/-es), acentos y derivación por raíz vía prefijo común ≥4 chars que cubra casi toda la palabra corta ("rodillera" → `rodilla` incluso si el nicho está pending sin keywords). Prefijo y NO substring libre ("peso" ⊄ "espeso"). Precision-first: una consulta genuinamente nueva no matchea y sigue el cold start normal.

**⚠️ REGLAS DE ORO DE PRODUCTO — no romper (requisito explícito del usuario, 2026-06-11):**

`ph_products` SOLO contiene productos que cumplen las TRES reglas, SIEMPRE: **≥40 anuncios activos · ≥10 días corriendo · NO pautado en Perú**. Tres capas lo garantizan:

1. **Etapa 1 (card, `quickDiscard`):** conservadora — si falta el dato, pasa al enrich.
2. **Etapa 2 (post-enrich, `goldenDiscard`):** estricta — con los datos exactos, <40 ads, <10 días o antigüedad desconocida NO se guardan.
3. **Serving (`toCard`):** defensa en profundidad — filas legadas que violen las reglas tampoco se muestran.

Los anunciantes PE van a la tabla **`ph_pe_pool`** (migración `20260611_ph_pe_pool.sql`), nunca a `ph_products`: alimentan el matching de competencia (`getPeCompetitors`) pero no se analizan con LLM ni llegan a la UI.

**⚠️ REGLAS DE COSTO — no romper (esto fue requisito explícito del usuario):**

1. **Anthropic SOLO en los workers del VPS, NUNCA en Vercel.** `anthropic.ts`/`analysis-runner.ts`/`keyword-expansion.ts` viven en `apps/worker` y solo los importan sus scripts (`pipeline.ts`/`analyze.ts`/`resolve.ts`). El split del monorepo lo blinda por construcción: `apps/web` no declara `@anthropic-ai/sdk` ni `playwright` como dep y físicamente no puede importarlos. Análisis en el path de request = costo x100.
2. **Vercel solo LEE de Supabase.** Las rutas `search`/`seen`/`today` no llaman LLM ni corren Playwright (respeta el timeout de 10s de Vercel Hobby).
3. **Cada producto se analiza una sola vez.** `getProductsToAnalyze` filtra `score IS NULL`; el re-scrape preserva `score`/`analysis` (Supabase upsert no toca columnas ausentes del payload).
4. **Cold start no scrapea inline.** Si el nicho no existe, `search` lo registra como `pending` y el daemon lo levanta. Vercel no puede correr Playwright.
5. **Crecer el batch NO ahorra.** El descuento de la Batches API es plano (50%, sin tiers): el costo es `tokens×productos`, igual agrupes 15 nichos en 1 batch o en 15. Los únicos levers de costo son el gate `score IS NULL` (#3) y el **prompt caching** del system prompt (`cache_control: { type: 'ephemeral' }` en el bloque `system` de `anthropic.ts`), que amortiza el prefijo fijo (system + tool schema, idéntico en todo análisis) a 0.1x de lectura entre los análisis del daemon 24/7. El user message (per-producto) queda fuera del cache.

**⚠️ Scraper — bug crítico:** NO usar `playwright-stealth` ni equivalentes — rompen el JS de la SPA de Meta (0 respuestas GraphQL). Solo ocultar `navigator.webdriver` con un init script. El scraper intercepta respuestas GraphQL (no parsea el DOM, salvo el `~X results` para el ad_count).

**Arquitectura híbrida (implementada 2026-06-11):**
- **Etapa 1 pre-enrich:** `quick-discard.ts` filtra desde la card de búsqueda (volumen <40 ads, antigüedad <10 días, servicios). Los candidatos PE siempre pasan (son el pool de competidores). Reduce el enrich de cientos a decenas de navegaciones.
- **Fallback DOM:** `dom-fallback.ts` activa `querySelectorAll` sobre hrefs cuando GraphQL+inline dan 0 nodos (field `source: 'dom-fallback'` en `raw_data`). Los nodos son degradados (sin creatives) pero aseguran que la búsqueda no se pierda.
- **Observabilidad:** `scrapeNiche` loguea un resumen de métricas al final de cada corrida (búsquedas, 0-payloads, fallbacks DOM, descartados por motivo, enriquecidos). Detecta roturas de schema GraphQL desde el primer cron.
