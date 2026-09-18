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
- **LLM:** los DOS SDK directos — **texto/visión: Gemini primario con OpenAI de respaldo; imagen: OpenAI primario con un respaldo de Google por pieza** — ver "Motor de modelos". KIE quedó SOLO para el render de video con Grok. Anthropic (`@anthropic-ai/sdk`) solo para `buscador-productos` (en `apps/worker`).
- **UI:** tema oscuro sobre el granate de la marca. **El sistema de diseño está en `BRANDBOOK.md` (raíz) y se implementa en `apps/web/app/globals.css` — léelo antes de tocar color o tipografía.** En corto: granate `#1E0811` de lienzo, carmesí `#BD1347` de acción (solo relleno; para texto va `#E8467A`), crema `#F6F2EB` de tinta y prestigio; Poppins de titulares (h1–h6 y `.lp-serif`), Lato de cuerpo/UI/cifras y Bodoni Moda **solo** para el logotipo. Cada tool tiene su `accentColor`. Iconos de `lucide-react`. Strings de usuario en español.
  ⚠️ **Las fuentes se piden con `<link>` en `apps/web/app/layout.tsx`, NO con `@import` en `globals.css`:** Turbopack elimina los `@import url(...)` externos al compilar la hoja y el sitio se servía sin un solo `@font-face`, cayendo entero a la serif por defecto del navegador (medido: las familias del chrome daban exactamente el mismo ancho que `serif`). **Poppins y Lato van en el PRIMER `<link>`**, el del chrome: son las dos fuentes de render crítico. El segundo `<link>` es el catálogo tipográfico del contenido que se genera para el cliente (`lib/landing/niches.ts`); borrarlo rompe esas previews, pero ya no se lleva puesta la tipografía del sitio.
- **Tests:** Vitest por workspace (`npm test -w apps/web`, `npm test -w apps/worker`; `npm test` corre ambos).

## Motor de modelos — los DOS SDK directos (2026-09-17)

⚠️ **KIE quedó reducido a UN recurso: el render de video con Grok.** Todo lo demás —texto, visión
e imagen— sale por el SDK de Google o el de OpenAI. El intento anterior (migrar el hub entero A
KIE) se revirtió el 2026-08-25 por bugs encadenados, y la migración parcial que quedó se deshizo
acá: era un intermediario más para mantener, con su propio dialecto y sus propios modos de fallo
(ver "lo que costó KIE" al final de esta sección).

**El par de TEXTO es uno solo para todo el hub: `gemini-3.6-flash` primario, `gpt-5.4-nano` de
respaldo.** Por eso `callStructured`/`callReasoning` **no toman opciones**: el viejo `preferGemini`
ya no puede significar nada distinto del default. Los dos sitios que NO quieren respaldo llaman a
`geminiCallStructured`, que es otra función y se lee como lo que es.

**En IMAGEN el primario también es uno solo —`gpt-image-2.5-sunburst`— y lo que cambia por pieza
es el RESPALDO**, que se declara en el call site (`generateImage(parts, n, { respaldo })`). No hay
default: cuál corresponde es una decisión medida por pieza, y un default la escondería.

| recurso | modelo | dónde |
|---|---|---|
| **Texto y visión, primario** | `gemini-3.6-flash` | SDK de Google (`@google/genai`) |
| **Texto y visión, respaldo** | `gpt-5.4-nano` | SDK de OpenAI |
| **Imagen, primario** | `gpt-image-2.5-sunburst` | SDK de OpenAI |
| **Imagen, respaldo barato** | `gemini-3.1-flash-image` (*nano-banana-2*) | SDK de Google |
| **Imagen, respaldo premium** | `gemini-3-pro-image` (*nano-banana-pro*) | SDK de Google |
| Render de video | `grok-imagine-video-1-5-preview` | **KIE, key del USUARIO** |
| Moderación | `omni-moderation-latest` | OpenAI directo 🔒 |
| Worker (`buscador-productos`) | `claude-haiku-4-5` | Anthropic directo 🔒 |

🔒 **Moderación y worker no se tocan, y es el estado final buscado.** La moderación es gratis,
fail-open y devuelve un veredicto binario que un modelo de chat no da. El worker corre **Batches
(−50 %) + `cache_control` sobre un system prompt fijo grande**: es exactamente la forma donde
perder el caché duele más. (El `gpt-5.6-luna` que vive en `nicho-verdict.ts` **no** es un respaldo
sino un motor alternativo que se pide con `PH_NICHO_MOTOR=openai`, y no se autodetecta a propósito:
un fallback silencioso entre motores es lo que hace que "cambió el resultado" no se pueda atribuir
a nada.)

### El respaldo por pieza — qué modelo y por qué

| pieza | primario | respaldo | por qué ESE respaldo |
|---|---|---|---|
| anuncios: ad y su refine | sunburst | nano-banana-2 | replica el LAYOUT de una referencia que ya existe, no es identidad de marca |
| branding: logo, etiqueta 360 | sunburst | nano-banana-2 | insumos que después se rehacen y se editan |
| branding: identidad, mockup | sunburst | **nano-banana-pro** | son el "así se ve mi marca" que el cliente mira |
| landing: secciones y su regen | sunburst | **nano-banana-pro** | las ve el comprador final, y las 8 tienen que leerse como una sola pieza |
| landing: placa canónica de talento | sunburst | **nano-banana-pro** | es la cara que se repite en las 8 secciones |
| **landing: placa de ZONA** | **nano-banana-2** | **ninguno** | ver abajo |
| video: avatar | sunburst | **nano-banana-pro** | es el ancla de identidad en cada lote |

⚠️ **La placa de zona es la ÚNICA pieza que no pasa por `generateImage`** — va derecho a
`geminiGenerateImage(NANO_BANANA_2, …)`, sin primario de OpenAI y sin respaldo. Está medido que
el modelo de imagen de OpenAI la rechaza **4 de 4** (`moderation_blocked`,
`safety_violations=[sexual]`, `moderation_stage: output`): un encuadre de cuerpo sin rostro cae del
lado prohibido de su filtro y no hay forma de pedirlo que no lo haga. **No le agregues un respaldo
"por las dudas": el único candidato es justo el que rechaza.** La placa canónica (retrato, CON
cara) no tiene ese problema y va por el camino normal.

⚠️ **El avatar del video SÍ tiene respaldo, y su ausencia fue un bug real.** Está medido que el
modelo de imagen de OpenAI rechaza por moderación **~1 de cada 3 avatares** con la misma foto y el
mismo prompt; hasta el 2026-09-17 ese tercio se le devolvía al usuario como "no se pudo construir
el personaje", con la cuota ya cobrada. No pasa por `generateImage` a propósito: ese choke point
agrega la regla de idioma de textos visibles y el avatar no lleva una sola letra.

### Los dos sitios de texto SIN respaldo

- **El forense del video** (`analyze-reference`): el modelo de respaldo no procesa video, así que
  no hay a qué caer. ⚠️ **Y el video va INLINE, en base64**: el SDK de Google solo acepta un
  `fileUri` de su propia Files API, no una URL de Supabase. Por eso `MAX_VIDEO_MB` no es un
  capricho —el request se come el archivo en memoria y el base64 lo infla ~33 %— y se comprueba
  con un **HEAD** antes de bajarlo.
- **La caja del producto de landing** (`extractProductBox`): `box_2d [0-1000]` es el formato en el
  que Gemini está entrenado y el respaldo devuelve cajas cortadas. Un recorte mal hecho es PEOR
  que no recortar, y el caller ya sabe caerse al render completo cuando esto devuelve `null`.

### ⚠️ NO HAY ESCAPES GLOBALES

`LLM_PROVIDER`, `GEMINI_VIA`, `IMAGE_VIA` y `LLM_IMAGE_TIMEOUT_MS` **se borraron** (decisión del
dueño del repo, 2026-09-17). Cada call site declara su par, que es lo que se puede leer sin correr
el programa. Si un modelo se cae, se cambia la constante en `lib/gemini.ts` y se despliega. No
reintroduzcas un flag de entorno para "poder revertir rápido": lo que producía era que el mismo
código se comportara distinto en dos entornos y que un respaldo entrara en silencio.

`LLM_IMAGE_TIMEOUT_MS` en particular existía porque el modelo de imagen viejo tardaba 40-90 s
contra un cap de 60 s. Sunburst tarda **13-15 s medidos**, así que ya no tiene a quién proteger.

### Lo medido contra la API, que es lo que hay que respetar al tocar esto

✅ **Verificado el 2026-09-17** (`scripts/probe-models-list.ts` y `scripts/probe-recableado.ts`):

- `gpt-5.4-nano` responde por `chat.completions` con `response_format: json_schema strict` (2-3 s),
  **acepta imágenes** por `toChatContent` (1,6-4,5 s) y acepta `temperature: 0`.
- `gemini-3.6-flash` con el **schema PLANO** devuelve un opcional omitido como ausente.
- `gpt-image-2.5-sunburst` devuelve **`864x1536` exacto** cuando se le pide (`images.generate` 13 s
  y `images.edit` 15 s), así que `sizeFor` transfiere del modelo viejo.
- `gemini-3-pro-image` respeta `imageConfig.aspectRatio` (pedido 3:4 → 1792x2400, 0.747; 22 s).
- `gemini-3-pro-image` y `nano-banana-pro-preview` son el mismo modelo (mismos límites); se usa el
  id sin `-preview`.

⚠️ **EL SCHEMA DE GEMINI VA PLANO, SIN `toStrictSchema`.** Esa transformación —todo en `required` +
los opcionales marcados nullable— es un requisito de los structured outputs de **OpenAI** y vive en
`llm-openai.ts`. Aplicarla al camino de Gemini obliga al modelo a rellenar campos que el schema
dice que puede omitir, y entonces los inventa: medido, `bulletsAfter` —un array opcional que solo
tiene sentido en la sección antes/después— volvió como el STRING *"Apto para todo tipo de pieles"*
dentro de un hero. **El reordenamiento del par NO movió esa transformación de lado.**

⚠️ **`gpt-5.4-nano` NO acepta `max_tokens`** (`400 unsupported_parameter`); el campo se llama
`max_completion_tokens`. Hoy no se manda ninguno de los dos.

⚠️ **NO REINTRODUZCAS EL CLAMP `imageResolution`.** Vivía en `kie-image.ts` y bajaba a `1K` los
ratios `4:5`/`5:4`/`auto` porque *el marketplace de KIE* solo los ofrecía ahí. **Es una restricción
de KIE, no de la API de Google**: medido el 2026-09-17 por el SDK nativo, `4:5` + `2K` responde en
los DOS modelos (1856x2304, ratio 0.806). Importa porque `aspectFor('mockup')` devuelve `4:5` en
todos los kits de branding: un clamp de más ahí sería inventar un límite que no existe.

⚠️ **La clave de Google SÍ factura imagen.** El `429 prepayment credits are depleted` que este doc
citaba (medido 2026-08-27) está muerto desde la recarga: verificado generando con
`gemini-3.1-flash-image` (14 s) y con `gemini-3-pro-image` (22 s). Era el argumento por el que el
respaldo de landing "no podía ser el SDK de Google" — ya no aplica, y la placa de zona depende de
que siga así.

✅ **El schema PLANO no le come casillas al copy de landing.** Es la duda razonable al invertir el
par: `toStrictSchema` metía los 15 campos de `SectionCopy` en `required` y el plano exige 2. Medido
con 6 draws reales (3 secciones × 2, `scripts/probe-copy-casillas.ts`): cada sección llena
exactamente las casillas de SU plantilla y repite el mismo conjunto en los dos draws —`cta-final`
→ subheadline/ctaHeadline/ctaSub/cta/accentWord, `beneficios` → subheadline/kicker/closingBold/
closingSub/accentWord, `testimonios` → kicker/socialProof/accentWord— y los arrays vuelven con el
conteo exacto (4, 5 y 3). Las casillas "ausentes" son las que esa sección no dibuja. **Los arrays
siguen forzados por `sectionCopySchema`, y eso es lo que hay que cuidar**: son lo que sostiene la
plantilla.

⚠️ **Toda llamada a OpenAI lleva timeout explícito** (`TIMEOUT_TEXTO_MS` 30 s, `TIMEOUT_IMAGEN_MS`
90 s). El SDK no es `fetch` pelado pero su default son **10 minutos**, más que el `maxDuration = 300`
de las rutas de imagen: una llamada colgada se comía el presupuesto entero y el request moría en 504
**sin llegar nunca al respaldo**.

⚠️ **El diseño de los schemas cuenta con esto:** lo que el modelo DEBE llenar se declara
`.nullable()`, no `.nullish()` (ver las leyes de más abajo).

### Lo que costó KIE, para que no se reintente sin leerlo

Se deja escrito porque el síntoma vuelve si alguien mete otro intermediario:

- **Rechazaba los prompts de landing 3 de 3** con "The current content could not be processed", y
  `generateImage` caía al respaldo **en silencio**: el respaldo dibujaba la barra y las cards
  distinto en cada sección, y eso se reportó como "nada es estándar" y se persiguió tres rondas
  como problema de prompt. El mismo prompt por el SDK directo se aceptaba.
- **Devolvía HTTP 200 con el error DENTRO del cuerpo** (`{code:400,…}`): mirar `res.ok` dejaba
  pasar el fallo como éxito.
- **Una propiedad llamada `type` rompía su validador** (`422 …properties.type must be string or
  array`). Por eso `SectionCopy.type` se llama **`kind`**; el rename NO se revierte —las sesiones
  guardadas traen `type` y `aKind` las normaliza al leer— pero el guard que lo fijaba se borró con
  su motivo.
- **Cada modelo de imagen nombraba distinto el campo de referencias** y equivocarse no fallaba
  ruidoso: creaba la tarea, la terminaba con `state: success` y devolvía un text-to-image
  disfrazado de edición.

**La huella para saber QUÉ modelo respondió sigue siendo el tamaño:** `864x1536` = el de OpenAI,
`1152x2048` o más = uno de Google.

## Doctrina por tool — LEE EL ARCHIVO ANTES DE TOCAR EL CÓDIGO

Cada tool tiene su doc con lo medido: qué se probó, qué falló y por qué está como está.
**No son opcionales** — casi todo lo que parece un descuido ahí está documentado como una
decisión con su medición detrás. Y **no se cargan solas**: hay que leerlas.

| antes de tocar… | lee |
|---|---|
| `apps/web/lib/video-ads/**`, `app/api/generador-video-ads/**`, `tools/generador-video-ads/**` | `agents/video-ads.md` |
| `app/api/generador-anuncios/**`, `tools/generador-anuncios/**`, `lib/prompts/step5.md`, `lib/anuncios/**` | `agents/anuncios.md` |
| `lib/landing/**`, `app/api/generador-landing/**`, `tools/generador-landing/**` | `agents/landing.md` |
| `apps/worker/**`, `packages/shared/{db,prescore,keywords}.ts`, `app/api/buscador-productos/**` | `agents/buscador-productos.md` |
| `lib/whop.ts`, `packages/shared/plans.ts`, `lib/credits.ts`, `lib/gen-quota.ts`, `app/cuenta/**`, `app/admin/**`, `app/suscripcion/**` | `agents/suscripcion-whop.md` |
| `lib/calculadora-costos/**`, `tools/calculadora-costos/**` | `agents/calculadora-costos.md` |

⚠️ **`agents/video-ads.md` tiene 356 KB y su encabezado es un aviso de REINICIO** (commit
`a3a25d6`): el motor de este árbol es `grok-imagine-video-1-5-preview` y varias secciones describen
cableado de otras ramas. Lee el titular en rojo del principio antes que nada — dice qué módulos
**no existen acá**.

⚠️ **Lo revertido vive en `agents/archivo/video-motores-revertidos.md`** (Veo 3.1, el experimento de
4 motores, `wan/3-0-video`, el `MotionTimeline`/candado de movimiento y las anclas de pose).
Verificado ausente del árbol. **Lo MEDIDO ahí sigue valiendo** —son ~20 renders pagados— y está
resumido en la cabecera del archivo; el cableado que describe, no. No implementes contra él.

⚠️ **Los headings de `video-ads.md` NO acotan su contenido**: es un diario cronológico y debajo de
`## V2 — motion.ts` o de `### EL CANDADO DE MOVIMIENTO` cuelga doctrina VIVA. Partir por H2/H3
archiva código que sigue corriendo — verificá contra el filesystem antes de mover nada.

## Leyes que valen en TODO el repo

Salieron de fallos medidos en tools distintas y se repitieron hasta volverse ley. La medición
que respalda cada una está en el doc que se nombra.

**Del contrato con los modelos**

- **Un campo `.nullish()` sale del `required` del JSON Schema y el modelo lo omite en silencio** — el eje queda en no-op con el síntoma idéntico al bug que venía a arreglar. Se usa `.nullable().catch(null)` para exigirlo sin romper el jsonb guardado. Pagado 4 veces (`body_focus`, `style`, `template`, `micro`).
- **`.nullable().catch(null)` en una CASILLA le ofrece al modelo una salida legal** (`"default": null`) y la toma. Las casillas van `.catch('')`: en el `required`, infalibles y sin `null` donde escaparse.
- **Un `.catch` sobre el OBJETO con casillas obligatorias destruye dato bueno**: una casilla omitida tira las seis. El `.catch` va por casilla.
- **Un campo nuevo que solapa con otro que el modelo ya contestó vuelve VACÍO.** El arreglo es **borrar el duplicado, no insistir en el schema**. Pagado 5 veces (`izquierda`/`derecha`, `Micro.posicion`, `objetoEnMano`, `productInteraction`, las cuatro casillas de `MotionBeat`). → `video-ads.md`
- **Una regla lejos de su campo es una sugerencia.** Va donde se DECLARA el campo, no en el encabezado del bloque. Registrado 4 veces. → `video-ads.md`
- **Entre quince bullets, una orden es una sugerencia.** Lo que tiene que cumplirse va de TITULAR, antes de la lista. Medido. → `video-ads.md`
- **Un anti-ejemplo con forma de valor es una plantilla que rellenar.** Un prompt que muestra `"S/ 199"`, `"3x2"`, `"corte directo"` o una frase ya rellenada como ejemplo, recibe eso de vuelta como respuesta. Pagado 6 veces. → `landing.md`, `video-ads.md`
- **Dos instrucciones opuestas en el mismo prompt: gana la primera, o gana el sorteo.** Al borrar un bloque hay que cazar las referencias que le apuntaban (`"exactly as above"`, `"la adaptación demográfica"`). Registrado 6+ veces. → `anuncios.md`, `video-ads.md`
- **El modelo REDACTA, el código VERIFICA.** Todo veredicto que se pueda calcular se calcula (polaridad, ratio, rango, share, fidelidad); lo que el modelo devuelve se comprueba post-hoc y se reintenta, no se confía.

**De la operación**

- **Al cambiar el FORMATO que produce un paso, mirá quién lo parsea aguas abajo.** Guards deterministas que fallan ABIERTO son el modo de fallo caro. → `video-ads.md`
- **Un respaldo silencioso convierte un problema de infraestructura en una cacería de prompts.** Si el resultado de imagen "cambia de estética" sin que nadie toque código: mirá el saldo y **qué modelo produjo la imagen** (el tamaño del lienzo lo delata) antes de mirar el prompt. → `landing.md`
- **Un oráculo al que se le muestra la respuesta esperada no mide, confirma.** Antes de creerle a un juez de visión, preguntate qué diría con un clip vacío. Cuando la métrica automática es frágil, lo que vale es IMPRIMIR. → `video-ads.md`
- **`n = 1` no es una medición.** Este repo tiene tres rondas perdidas por leer un draw como efecto. Un A/B contra un modelo estocástico necesita ≥2 draws por brazo y un brazo de control.
- **Un probe que arma el prompt a mano tiene que copiar también las OPCIONES del modelo**, no solo el texto. → `video-ads.md`
- **Un probe se INVIERTE al adoptar su resultado** (el brazo de control reconstruye lo viejo), si no deja de ser re-corrible.
- **`fetch` en Node no tiene timeout.** Toda petición lleva `AbortSignal.timeout`, y un bucle de polling comprueba su presupuesto ANTES del await.
- **KIE devuelve HTTP 200 con el error DENTRO del cuerpo.** Mirar `res.ok` deja pasar el fallo como éxito. (Hoy solo lo toca el render de video, pero la ley vale para cualquier intermediario.)
- **Antes de bumpear una huella (`scriptFingerprint`), contá a cuántas sesiones PAGADAS invalida.** Si el cambio ya entra por un insumo hasheado, el bump es over-invalidación gratuita.

**Prohibiciones explícitas — están en el doc porque ya se intentaron y fallaron**

- **No tomes `node_modules/openai/.../images.d.ts` como fuente de verdad de tamaños** — está desactualizado, la API acepta mucho más. → `anuncios.md`
- **No partas `adapted.tomas`** para acortar un textarea: tres degradaciones silenciosas en caminos que manejan dinero. → `video-ads.md`
- **No aflojes `alignSlots`** para tolerar paráfrasis: así empieza a atribuir mal los tramos. → `video-ads.md`
- **No aflojes `esEstadoDeManos`**: lo leen el reparto, el andamiaje de frontera y los dos guards del forense. Se amplía agregando palabras, no aflojando patrones. Mismo criterio para `VERBOS_ACCION`, `VERBOS_TRAMO` y `PIEZAS`. → `video-ads.md`
- **La puesta en cuadro: no lo intentes una cuarta vez sin cambiar de modelo o de paso.** 0/4, 0/5, 0/6 y 0/6 en tres formas distintas. → `video-ads.md`
- **Las anclas de pose: no lo intentes otra vez por el lado del texto.** Construido, medido y revertido; es el techo del modo de referencia. → `video-ads.md`
- **No partas los lotes por número de beats** (`n=3`: ganó 1 vez, perdió 2, incluida la prueba diseñada a su favor) ni **subas `LOTE_MAX_SEC` sin medirlo**. → `video-ads.md`
- **`vertical.ts` no es dead code**: es el salvavidas documentado para el caso de una sola imagen. Mismo criterio con `trust-bar.ts` en landing. → `video-ads.md`, `landing.md`
- **En `normalizeSlots` no reintroduzcas** el desmarcado de huecos numéricos ni la fusión de enumeraciones: las dos van contra la plantilla de referencia. → `video-ads.md`
- **No reintroduzcas los datos de facturación** sin que exista antes quien emita el comprobante. → `suscripcion-whop.md`
- **La plantilla de landing NO manda el color ni el material** (solo el esqueleto); se intentó al revés y se revirtió. → `landing.md`
- **No uses `playwright-stealth` ni equivalentes** en el scraper: rompen el JS de la SPA de Meta (0 respuestas GraphQL). → `buscador-productos.md`

**Reglas de costo y de producto que no se negocian** (detalle en `buscador-productos.md`)

- **Anthropic/Playwright SOLO en `apps/worker`, NUNCA en Vercel.** El split del monorepo lo blinda: `apps/web` no declara esas deps.
- **Vercel solo LEE de Supabase** en el path de request. Nada de LLM ni de browser ahí.
- **Cada producto se analiza una sola vez** (`score IS NULL` es el gate).
- **Reglas de oro de `ph_products`: ≥40 anuncios activos · ≥10 días corriendo · NO pautado en Perú.** Tres capas lo garantizan y ninguna se puede saltar.
