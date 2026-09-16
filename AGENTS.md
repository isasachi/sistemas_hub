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
- **LLM:** OpenAI primario (gpt-4o-mini + gpt-image-2) con Gemini de fallback; el **texto/visión de Gemini sale por KIE** (`lib/kie-gemini.ts`) — ver "Motor de modelos". Anthropic (`@anthropic-ai/sdk`) solo para `buscador-productos` (en `apps/worker`).
- **UI:** tema oscuro sobre el granate de la marca. **El sistema de diseño está en `BRANDBOOK.md` (raíz) y se implementa en `apps/web/app/globals.css` — léelo antes de tocar color o tipografía.** En corto: granate `#1E0811` de lienzo, carmesí `#BD1347` de acción (solo relleno; para texto va `#E8467A`), crema `#F6F2EB` de tinta y prestigio; Poppins de titulares (h1–h6 y `.lp-serif`), Lato de cuerpo/UI/cifras y Bodoni Moda **solo** para el logotipo. Cada tool tiene su `accentColor`. Iconos de `lucide-react`. Strings de usuario en español.
  ⚠️ **Las fuentes se piden con `<link>` en `apps/web/app/layout.tsx`, NO con `@import` en `globals.css`:** Turbopack elimina los `@import url(...)` externos al compilar la hoja y el sitio se servía sin un solo `@font-face`, cayendo entero a la serif por defecto del navegador (medido: las familias del chrome daban exactamente el mismo ancho que `serif`). **Poppins y Lato van en el PRIMER `<link>`**, el del chrome: son las dos fuentes de render crítico. El segundo `<link>` es el catálogo tipográfico del contenido que se genera para el cliente (`lib/landing/niches.ts`); borrarlo rompe esas previews, pero ya no se lleva puesta la tipografía del sitio.
- **Tests:** Vitest por workspace (`npm test -w apps/web`, `npm test -w apps/worker`; `npm test` corre ambos).

## Motor de modelos — migración a KIE, recurso por recurso

⚠️ **La migración de TODO el hub a KIE de una vez se intentó y se revirtió (2026-08-25): produjo demasiados bugs encadenados.** Se rehace por partes, y cada parte se mide contra la API antes de cablearse. Lo que sigue es el estado real, no el plan.

| recurso | dónde vive hoy | estado |
|---|---|---|
| **Texto y visión de Gemini** (`gemini-2.5-flash`) | **KIE** — `lib/kie-gemini.ts` | ✅ migrado |
| **Imagen** (`gpt-image-2` + `nano-banana-2`) | **KIE** — `lib/kie-image.ts` | ✅ migrado |
| Texto y visión de OpenAI (`gpt-4o-mini`) | SDK de OpenAI | 🔒 **se queda ahí** — decisión del dueño del repo (2026-08-25) |
| Render de video (`grok-imagine`) | KIE, key del USUARIO | ya estaba |
| Worker (`claude-haiku-4-5`) | Anthropic directo | 🔒 **se queda ahí** — decisión del dueño del repo (2026-08-25) |
| Moderación (`omni-moderation-latest`) | OpenAI directo | 🔒 **se queda ahí** — decisión del dueño del repo (2026-08-25) |

🔒 **TRES RECURSOS NO SE MIGRAN, y es el estado final buscado — no un pendiente.** Con esto la migración queda CERRADA: no hay nada más en la lista.

1. **`gpt-4o-mini`** se queda en el SDK de OpenAI.
2. **La moderación (`omni-moderation-latest`)** se queda en OpenAI. Es gratis, fail-open y KIE no tiene equivalente; meterla en un modelo de chat sería pagar por algo que hoy no cuesta y perder el veredicto binario.
3. **El worker (`buscador-productos`, `claude-haiku-4-5`)** se queda en Anthropic directo. `anthropic.ts` corre **Batches (−50 %) + `cache_control` sobre un system prompt fijo grande (lecturas a 0,1×)** con mensajes de usuario chicos: es exactamente la forma donde perder el caché duele más, y KIE anuncia 30-50 % bajo lista **sin batching ni caché**. Con 66k filas pendientes en el barrido, moverlo sería plausiblemente un AUMENTO de costo. (Y su endpoint `/claude` devolvía 500 la última vez que se probó, pero ese no es el motivo: el motivo es el costo.)

⚠️ **Consecuencia práctica de la 1 y la 2:** `openai` sigue siendo dependencia de `apps/web` y `llm-openai.ts` es código VIVO, no legado. Lo que este documento midió sobre `gpt-5-6-luna` como reemplazo de gpt-4o-mini queda archivado: no se va a usar.

**Detalle de `gpt-4o-mini`:** El hub queda con dos proveedores de texto a propósito: OpenAI directo para su mitad y KIE para la de Gemini. `isPermanentOpenAiError` y el resto de `llm-openai.ts` siguen en uso; lo que ya NO se usa es `sizeFor`, que se jubiló con el ratio nativo de la imagen.

**Lo que NO cambió al migrar el recurso de Gemini:** el orden de proveedores. `callStructured`/`callReasoning` siguen siendo OpenAI-primario, con `preferGemini` invirtiéndolo en los sitios de siempre. Lo único que cambió es por dónde sale Gemini.

⚠️ **`GEMINI_VIA=direct` devuelve este recurso al SDK de Google sin desplegar nada.** Es lo que hace reversible un slice: si KIE se cae para este modelo, se cambia una variable. `LLM_PROVIDER=gemini` (Gemini-only) sigue existiendo y es ortogonal.

**Lo medido contra la API, que es lo que hay que respetar al cablear el resto:**

⚠️ **EL SCHEMA VA PLANO, SIN `toStrictSchema`.** Esa transformación —todo en `required` + los opcionales marcados nullable— es un requisito de los structured outputs de OpenAI, y el camino directo de Gemini NUNCA la usó: mandaba `z.toJSONSchema` tal cual. Aplicarla obliga al modelo a rellenar campos que el schema dice que puede omitir, y como la unión no se hace cumplir, inventa: medido, `bulletsAfter` —un array opcional que solo tiene sentido en la sección antes/después— volvió como el STRING *"Apto para todo tipo de pieles"* dentro de un hero. Verificado además que este endpoint acepta `strict: true` con un `required` incompleto, así que el truco de OpenAI no hace falta. El diseño de los schemas del repo ya cuenta con esto: lo que el modelo DEBE llenar se declara `.nullable()`, no `.nullish()`.

⚠️ **`type: ["string","null"]` NO se acepta** — `400 "The 'type' property must be a single string, not an array"`, con `strict` en true y en false. Lo produce el `.nullable()` de zod. `toSingleTypes` lo convierte en `anyOf`, y **los hermanos del `type` van DENTRO de la rama**: `{type:['array','null'], items:X}` tiene que quedar como `{anyOf:[{type:'array', items:X},{type:'null'}]}` — dejando `items` afuera, el modelo lee "un array de cualquier cosa".

⚠️ **UNA PROPIEDAD LLAMADA `type` ROMPE EL VALIDADOR.** Devuelve `422 …properties.type must be string or array`, confundiendo la clave con la palabra reservada. Por eso `SectionCopy.type` pasó a llamarse **`kind`** (y con él `OfferCopy`/`OfferGen`). Las sesiones guardadas traen `type`: se normalizan al LEER con `aKind`, en una sola puerta (`getLandingSession` y `resolveOffer`), así que **no hizo falta migrar el jsonb**. `LandingSection.type` NO se tocó: es almacenamiento nuestro y nunca viaja a un modelo. Hay un test que fija que ningún schema que va al modelo vuelva a tener esa propiedad.

⚠️ **`stream` e `include_thoughts` vienen en `true` por defecto** (lo dice la doc). Con el primero la respuesta llega como SSE y no como JSON; con el segundo el razonamiento viaja dentro del contenido y rompe el parse del structured output. Los dos se mandan en `false`.

⚠️ **Sin `max_tokens` explícito la salida larga vuelve truncada, y `finish_reason` no lo dice.** Medido: el reporte forense volvió cortado a mitad de string en tres intentos; con el tope puesto vuelve completo.

⚠️ **La base64 SÍ funciona, contra lo que dice la doc** ("solo URLs http"): verificado con imágenes y con video. Por eso el formato `Part[]` interno no cambió. ⚠️ **Pero un video grande MÁS un schema revienta:** medido sobre el mismo video de 13,6 MB, `schema + base64` falla a los ~69 s con un `400 "The server is currently being maintained"` que miente, y `schema + URL` responde. Por eso el análisis forense manda `fileData.fileUri` y KIE se baja el archivo; el allowlist de host y el tope de `MAX_VIDEO_MB` pasan a comprobarse con un **HEAD**.

⚠️ **KIE devuelve HTTP 200 con el error DENTRO del cuerpo** (`{code:400,…}`): mirar solo `res.ok` deja pasar el fallo como éxito. Y como en Node `fetch` no tiene timeout propio, toda petición lleva `AbortSignal.timeout`.

⚠️ **El JSON vuelve a veces envuelto en ```` ```json ```` aunque se haya pedido `response_format`** — sin quitar la cerca, `JSON.parse` tira y se queman los reintentos por una respuesta correcta (`parseJsonLoose`).

✅ **Verificado contra la API por el camino real:** visión con campo opcional y razonamiento (5 s), el copy de la landing —el schema que antes daba 422— (4 s), el análisis forense con el video real por URL (15 s, 5 cortes) y el análisis de referencia de anuncios, cuyo `bodyFocus` nullable vuelve como `null` en vez de faltar (6 s).


### La IMAGEN por KIE (`lib/kie-image.ts`)

`gpt-image-2` y `gemini-3.1-flash-image` —que en KIE se llama **`nano-banana-2`**— salen por el marketplace: `jobs/createTask` + polling de `recordInfo`. **El par no cambia**: gpt-image-2 primario, nano-banana-2 de respaldo, y `preferGemini` lo invierte. Quien orquesta el par sigue siendo `generateImage`; `kie-image.ts` es el transporte de UN modelo.

⚠️ **`IMAGE_VIA=direct` devuelve el recurso a los SDK sin desplegar**, y va aparte de `GEMINI_VIA`: son dos recursos, y se puede tener uno en KIE y el otro no — que es el punto de migrar de a uno.

⚠️ **EL AVATAR Y LAS ANCLAS DEL VIDEO SALEN POR GEMINI 3.1 FLASH IMAGE** (decisión del dueño del repo). Van con `preferGemini`, o sea nano-banana-2 de primario y gpt-image-2 de respaldo — y ese orden importa: está medido que **gpt-image-2 rechaza ~1 de cada 3 avatares por moderación** con la MISMA foto y el MISMO prompt, así que de primario sería un peaje sistemático y de respaldo es una segunda oportunidad. Lo sigue pagando el HUB; lo del usuario es el render del clip.

⚠️ **CADA MODELO NOMBRA DISTINTO EL CAMPO DE REFERENCIAS Y EQUIVOCARSE NO FALLA RUIDOSO.** `gpt-image-2-image-to-image` usa `input_urls` (máx 16) y `nano-banana-2` usa `image_input` (máx 14, 30 MB c/u). Mandando el equivocado, KIE crea la tarea, la termina con `state: success` y entrega una imagen generada **solo desde el prompt** — un text-to-image disfrazado de edición. Hay test que fija el body de cada modelo.

⚠️ **ACÁ LA BASE64 NO SIRVE, al revés que en el chat.** El campo pide *"File URL after upload, not file content"* y un data URI devuelve `500 File type not supported`. Las referencias inline se suben al bucket con el **hash del contenido** por nombre, así la misma foto en cinco pasos del wizard sube una vez. ⚠️ Una referencia que YA vive en un bucket público (`fileData.fileUri`) se pasa tal cual: el avatar y las anclas del video bajaban su propia imagen para volver a subirla. **El orden se conserva mezclando los dos tipos** — el prompt de las anclas cita `@image(n)`, así que reordenar le da a una toma la imagen de otra.

⚠️ **`output_format: 'png'` explícito.** El default de `nano-banana-2` es **jpg**, y los call sites suben lo que vuelve como `image/png`: sin esto se guardarían bytes jpg con nombre `.png`.

⚠️ **El ratio va NATIVO y por eso `sizeFor` se jubila.** Medido: pidiendo `9:16` devuelve **1152x2048 (0.563)** y pidiendo `4:5`, **1122x1402 (0.800)** — contra los tres buckets de múltiplos de 16 que aplastaban todo portrait. `auto` y los ratios 5:4/4:5 solo existen en 1K, y eso lo respeta `imageResolution`.

⚠️ **EL STREAM DE BRANDING NO ENTRA EN SECUENCIA CON LA IMAGEN ASÍNCRONA.** Cada pieza pasa a ser `createTask` + polling (~45-65 s medidos) y las 4 seguidas dan **5,8 minutos** contra el `maxDuration = 300` de esa ruta: la función muere antes de terminar y el usuario se queda con el kit a medias y la cuota de cada etapa ya cobrada. Las tres piezas que derivan de la identidad son independientes ENTRE SÍ, así que corren en `Promise.all` detrás de ella: **5,8 min → 2,9 min medidos**. `correrEtapa` atrapa sus propios errores, así que una pieza caída no tumba a las otras dos.

✅ **Verificado contra la API por el camino real (`scripts/probe-kie-image.ts`):** texto→imagen con gpt-image-2 (9:16 exacto, 53 s), referencia REMOTA con nano-banana-2 (46 s, sin volver a subir el archivo) y referencia INLINE con gpt-image-2 (4:5 exacto, 65 s incluyendo la subida). En el último se comprobó en píxeles que la referencia **se usó**: mismo frasco y misma etiqueta, con el texto traducido al español por la `SPANISH_RULE`.


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

⚠️ **`agents/video-ads.md` tiene 400 KB y su encabezado es un aviso de REINICIO** (commit
`a3a25d6`): la sección `## V2 — el movimiento pasa a ser un artefacto estructurado (motion.ts)`
describe módulos que **ya no existen en el árbol** (`motion.ts`, `MotionTimeline`, `anchors.ts`,
`tramo.ts`, `concat.ts` sí volvió). Lo MEDIDO sobre grok en esas páginas sigue valiendo; el
cableado que describen, no. Lee el titular en rojo del principio antes que nada.

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
- **KIE devuelve HTTP 200 con el error DENTRO del cuerpo.** Mirar `res.ok` deja pasar el fallo como éxito.
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
