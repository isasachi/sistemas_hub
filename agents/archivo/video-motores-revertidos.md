# ARCHIVO — motores y candado de movimiento revertidos

🔴 **NADA DE ESTE ARCHIVO DESCRIBE CÓDIGO QUE EXISTA EN ESTE ÁRBOL.** Verificado contra el
filesystem: `apps/web/lib/video-ads/kie.ts` tiene `MODEL = 'grok-imagine-video-1-5-preview'`, y
`motion.ts`, `anchors.ts`, `tramo.ts` **no existen**. Lo revirtió el commit `a3a25d6` (2026-09-04,
*"el generador vuelve a su primera versión funcional"*), por COSTO: Wan a 720P cobra
`precio × (entrada + salida)`, ~$7,20 por anuncio de 45 s, contra ~$1 de grok.

**Se conserva porque lo MEDIDO sigue valiendo**, y vale caro: son ~20 renders pagados y cuatro
motores comparados. Lo que NO vale es el cableado — no implementes contra estas páginas.

**Lo que hay que saber sin leerlo entero:**

- **Solo un motor que recibe el VIDEO fuente copia la coreografía.** Kling, xAI Edit y Seedance la copian; grok no lo logró en ~15 renders. La representación del movimiento en TEXTO es el techo, no la falta de detalle.
- **Y la primitive de MOVIMIENTO no puede ser también la de VOZ:** Kling y xAI Edit arrastran la pista de audio del original, o sea la voz y el guion de la otra marca. Descalificados por eso, no por calidad.
- **El candado de movimiento (`MotionTimeline`, estados + ventanas de tiempo) NO tuvo efecto medible** en 12 renders contra prosa (A 2/6, B 1/6). El techo del forense es **semántico**: 2-3 beats por corte pase lo que pase, y ni más llamadas ni beats más baratos lo mueven.
- **Las anclas de pose se construyeron, se midieron y se revirtieron.** La imagen salía correcta y el clip igual no arrancaba ahí: es el techo del modo de referencia. **No lo intentes otra vez por el lado del texto.**
- **El cobro de KIE con video de referencia es `precio × (entrada + salida)`** — un anuncio se factura como el DOBLE de su duración. Ese es el número para presupuestar.
- **El canario gratis es POR MODELO, no de KIE.** Con grok un campo inválido no despacha; con kling y seedance sí — ahí el canario es `creditsConsumed: 0.0`.

Si algún día se vuelve a mirar un motor con señal de video, empezá por acá y no por cero.

---

### 🔴 EL EXPERIMENTO DE MOTORES — la primitive de movimiento NO es grok (2026-09-04)

**Hipótesis del dueño del repo:** *"el problema no es que falten detalles en el prompt. El pipeline convierte el movimiento original en TEXTO y grok nunca recibe el video fuente como señal física de movimiento."* Cuatro brazos sobre **el mismo tramo de 6 s** del anuncio de sérum (16–22 s: la gota en la mejilla y el extendido con las yemas), con `scripts/probe-video-motores.ts`.

| | movimiento | voz | identidad | producto | limpio |
|---|---|---|---|---|---|
| **A · grok** (el pipeline de hoy) | ❌ sostiene el frasco y habla | ✅ nueva | ✅ avatar | ✅ | ✅ |
| **B · Kling 3.0 Motion Control** | ✅ copia la coreografía | ❌ **la del original** | ✅ avatar | ❌ manos vacías | ✅ |
| **C · xAI Video Edit** | ✅ (es el original editado) | ❌ **la del original** | ❌ **la creadora** | ~ repintado | ❌ **watermark** |
| **D · ByteDance Seedance 2.5** | ✅ | ✅ **98 %** | ✅ avatar | ✅ etiqueta legible | ✅ |

✅ **LA HIPÓTESIS SE CONFIRMA: la señal FÍSICA de movimiento es la palanca.** B, C y D copian la coreografía; A no la logró en ~15 renders de esta rama. La representación en texto era el techo, no la falta de detalle.

⚠️ **Y EL EXPERIMENTO AGREGA LO QUE LA HIPÓTESIS NO PREVEÍA: la primitive de MOVIMIENTO no puede ser también la de VOZ.** Kling y xAI Edit **arrastran la pista del video fuente** — la transcripción de sus salidas es palabra por palabra la de la creadora original, con el guion de la OTRA marca. Kling no tiene ningún campo de audio; xAI Edit tampoco sustituyó la identidad y conservó el logo de TikTok, el arroba y los subtítulos quemados. **Los dos quedan descalificados**: por buena que sea la coreografía, un clip con la voz y la cara de otra persona no se publica.

✅ **SEEDANCE 2.5 ES EL ÚNICO QUE TOMA LAS CUATRO SEÑALES EN UNA LLAMADA** — `reference_video_urls` (movimiento), `reference_image_urls` (avatar + producto), el prompt (la locución) y `generate_audio`. Y acepta **30.000 caracteres de prompt** contra los 4.096 de grok: toda la escalera de degradación que este documento describe existe por un presupuesto que con este motor no aplica.

⚠️ **DOS ARREGLOS QUE LO LLEVARON DE "PROMETEDOR" A "CERRADO", los dos medidos con su propio observable:**

1. **EL AUDIO DE LA REFERENCIA CONTAMINA LA LOCUCIÓN — se manda el clip MUDO.** Primera corrida: se pidió *"y nos ayuda a **atenuar**"* y dijo *"**lo que** nos ayuda a **hidratar**"*, que es la construcción literal de la creadora en ese mismo tramo; y *"suero"* le salió *"serum"*, la palabra del original. Con `-an` sobre el clip de referencia: **86 % → 98 % de cobertura**, *"suero"* correcto, *"atenuar"* correcto, y el ingrediente pasa de *"ferul sopinil"* a *"p-resorcinol"*. Se mide TRANSCRIBIENDO, así que no se confunde con el otro arreglo.
2. **EL ORDEN LO PONE EL FORENSE, NO EL VIDEO.** El prompt decía *"same action order"* **sin decir nunca cuál es ese orden** — una exigencia de fidelidad, no una descripción — y el clip copiaba la acción pero abría por el final. `accionesDelTramo` recorta las oraciones de `MotionBeat.action` al tramo (ventana del corte + `startSec`/`endSec`) y las emite numeradas con `IN THIS EXACT ORDER`. Post-fix los fotogramas van gota → extendido, como la fuente. Se mide MIRANDO LA SECUENCIA.

**Y eso deja el reparto que el dueño del repo anticipó: el video es la señal física, el forense es el PLANNER.** No un sustituto de la señal de movimiento — el plan que le fija el orden. La plantilla de la oración de acción (arriba) es justamente lo que hace que ese plan sea emitible.

✅ **LA PRIMITIVE ES `bytedance/seedance-2` A 480p (decisión del dueño del repo, 2026-09-04).** Cuatro configuraciones medidas sobre el MISMO tramo de 6 s, todas con referencia muda y las acciones del forense numeradas:

| | voz | orden | producto | tiempo | costo del clip | anuncio 46,5 s |
|---|---|---|---|---|---|---|
| `seedance-2-5` @720p, ref 720p | **98 %** | ✅ | ✅ | ~4 min | — | $17,67 |
| **`seedance-2` @480p, ref 720p** | **94 %** | ✅ | ✅ | 254 s | **$0,690** | **~$5,35** |
| `seedance-2-fast` @480p, ref 480p | 92 % | ✅ | ✅ | 165 s | $0,408 | ~$3,16 |
| `seedance-2-fast` @480p, ref **720p** | — | — | — | 1840 s | $0 | ❌ falló |

Los tres que salieron ejecutan las dos acciones EN ORDEN, con el frasco del usuario, la identidad del avatar y sin marca de agua. **La diferencia entre 92 y 98 es UNA palabra** —el ingrediente, que sale destrozado en los tres y bien en ninguno (*"ferrespitona"*, *"feresutinol"*, *"feresopinil"*)—, así que la elección se hizo por precio y por cómo se ve, no por cobertura.

⚠️ **EL COBRO ES `precio × (input + output)` CUANDO HAY VIDEO DE REFERENCIA, y está verificado empíricamente**: `fast` a 480p devolvió 81,6 créditos por un clip de 6 s con referencia de 6 s = 12 s × $0,034, exacto. O sea **el anuncio se factura como el doble de su duración**, y ése es el número que hay que usar al presupuestar, no la duración del video.

⚠️ **LA REFERENCIA SE MANDA EN 480x854, y el motivo es un fallo medido.** Seedance exige que el video de referencia esté entre **409.600 y 927.408 píxeles**: 720x1280 = 921.600 entra por 5.808 px y 480x854 = 410.112 por 512. La única corrida que falló fue `fast` con la referencia de 720p — 30 minutos para devolver *"The upstream API service timed out"*, con créditos 0. ⚠️ **No está probado que la causa sea el tamaño**: `seedance-2` corrió con referencia de 720p sin problema, así que puede haber sido un pico del proveedor. Pero re-encodar a 480p no cuesta nada y esquiva el único caso que se cayó.

⚠️ **LA REFERENCIA LE PASA APARIENCIA AL AVATAR, no solo movimiento — y esto es nuevo.** Las uñas salieron **celestes en los dos modelos y con las dos resoluciones de referencia**: es el esmalte de la creadora del video original. No es varianza. Es la misma clase que la voz y la cara —contaminación de identidad desde la referencia— solo que mucho más chica, y hay que tenerla presente antes de dar por cerrada la sustitución de identidad.

⚠️ **EL INGREDIENTE SE ROMPE EN LOS TRES MODELOS, y no es el mismo fallo que el del guion.** Aquél era el LLM completando de memoria y se arregló con la transcripción de la etiqueta; éste es la síntesis de voz tropezando con un nombre químico raro. El arreglo barato sería escribirlo fonéticamente SOLO en la locución que viaja al render (`fe-re-sorcinol`), sin tocar el guion que el usuario lee — el repo ya separa esos dos artefactos. **Sin implementar.**

⚠️ **EL CANARIO GRATIS ES POR MODELO, NO DE KIE — y esto costó una lectura equivocada.** Con grok, una `duration` fuera de rango vuelve sin `taskId`. Con **kling y seedance un campo válido DESPACHA**: lo único que no despacha es un **modelo inexistente**; un **asset inalcanzable** sí despacha pero vuelve con `creditsConsumed: 0.0`, así que ése es el canario de estos dos. De paso: la doc de KIE dice que el `mode` de kling es `std`/`pro` y **es falsa** — medido, `std` devuelve *"mode is not within the range of allowed options"* y `720p` se acepta.

⚠️ **LO QUE NO SE MIDIÓ:** un solo tramo de 6 s, una sesión, un draw por brazo. El precio por clip de seedance tampoco está medido, y el pipeline de producción **no se tocó** — esto determina la primitive, no la cablea.

### 🔴 EL MOTOR PASA A `wan/3-0-video` — cableado y verificado con un render (2026-09-04)

**Decisión del dueño del repo, con su precio explícito:** *"Vamos a ir con 720p como default, por
calidad aunque el precio crezca un poco"*. Cierra lo que el experimento de motores dejó abierto:
la primitive de movimiento tenía que ser un motor que reciba el VIDEO fuente, y Wan es el que
además toma las cuatro señales en una sola llamada (movimiento, imágenes, locución y audio).

**Pricing del proveedor:** 480P 8 cr/s ($0,04/s) · **720P 16 cr/s ($0,08/s)** · 1080P 32 cr/s
($0,16/s). Grok medía ~4,3 cr/s, o sea **720P Wan cuesta ~3,7× por segundo de clip**.

⚠️ **Y EL COBRO ES `precio × (entrada + salida)`, VERIFICADO CON EL RENDER:** 10 s de salida +
10 s de referencia costaron **320 créditos exactos** (20 × 16), no 160. Es el mismo modelo que ya
se había medido para Seedance. **Un anuncio se factura como el DOBLE de su duración**: los 45 s
de `520c9169` son ~1.440 créditos ≈ **$7,20**, y ése es el número con el que hay que
presupuestar, no la duración del video.

⚠️ **Y HAY UN DELTA QUE NO CUADRA CON ESA REGLA, así que la regla es n=1.** El render que el
dueño del repo hizo desde el wizard movió el saldo **1.709,41 → 704,65 = 1.004,76 créditos**, y
eso no es ni solo-salida (20 × 16 = 320) ni entrada+salida (29,8 × 16 = 477) a 720P. A 1080P
entrada+salida daría ~954, que se le acerca pero tampoco encaja. No se dedujo qué pasó ahí —
puede haber sido otra resolución, otro reintento o un cobro que agrupa varias cosas. La regla
`entrada + salida` está verificada en el render controlado; **el delta del wizard sigue sin
explicación y conviene mirarlo antes de dar el presupuesto por cerrado.**

✅ **PASO 0 — ¿Wan honra la emisión REAL de `buildLotePrompt`?** Era la pregunta que decidía el
tamaño del trabajo, y no se podía deducir leyendo: el render que abrió esta puerta se hizo desde
el wizard con un prompt escrito A MANO en bloques `【0.0–4.0 s】`, y el pipeline emite otra forma
(`Shot N — X seconds` + lista numerada). **Sí la honra**, así que el cableado es de TRANSPORTE y
la plantilla no se toca.

El bed fue un duelo directo, no un lote cualquiera: el **lote 1 de `520c9169`**, que tiene el plan
CORRECTO (*"She releases one drop of serum onto her left cheek with the dropper"*) y del que ya
estaba verificado que **grok lo falló** — su clip pagado muestra a la mujer sosteniendo el frasco y
hablando, sin sacar el gotero.

| | grok (verificado antes) | **Wan, mismo prompt** |
|---|---|---|
| saca el gotero | ❌ | ✅ ~1,5 s |
| lleva el gotero a la mejilla | ❌ | ✅ el gotero llega a la cara y vuelve al frasco |
| locución | — | ✅ **99 % cobertura / 99 % precisión** (`probe-audio-espanol.ts`) |
| resolución | 720x1280 | 720x1280 |
| identidad · suéter · habitación · frasco | ✅ | ✅ |

❌ **Y EL "FRAGMENTO MUDO DE DOS SEGUNDOS" NO SE REPRODUCE — era el prompt, no el motor.** El
render del wizard abría con 3,5 s de silencio (medido con `silencedetect`), y la causa era que
ESE prompt ponía *"She looks at the camera and speaks"* al FINAL del bloque `0.0–4.0 s`. Con la
emisión del pipeline —que pone `Spoken line:` debajo de cada toma— `silencedetect` no encuentra
**ni un silencio** en todo el clip. **El arreglo que el plan tenía previsto para esto es un
no-op**: no hay que distribuir la locución en bloques con marca de tiempo. De paso confirma por el
otro lado que Wan honra el orden en el que se le escriben las cosas.

⚠️ **EL NOMBRE DEL CAMPO DE IMÁGENES NO SE VALIDA Y NINGÚN CANARIO PUEDE CAZARLO.** Medido con
`scripts/canary-wan.ts`: `reference_image_urls`, `image_urls` y hasta un campo inventado devuelven
todos la MISMA queja (la del campo inválido que se mandó a propósito), o sea KIE ignora en
silencio lo que no conoce. Con el nombre equivocado la tarea se crea, termina en `success` y
devuelve un video hecho solo desde el prompt. Es la misma trampa que `kie-image.ts` ya documenta
para gpt-image-2 vs nano-banana-2, y lo único que la fija es el **test del cuerpo de cada motor**.

✅ **Lo que el canario SÍ midió gratis** (Wan también valida antes de despachar, así que el truco
del campo inválido sirve igual): `prompt` **20.000** exactos · `resolution` **sensible a la caja**
(`720P` pasa, `720p` devuelve *"resolution is not within the range of allowed options"*) ·
`aspect_ratio: 9:16` válido · `duration` entera fuera de rango con 999. ⚠️ El orden de validación
es `resolution → prompt → duration`, así que **no hay escudo después de `duration`** y su piso no
se puede aislar gratis: 2–30 sale de la doc y falla ruidoso si está mal.

**`MOTOR` (kie.ts) es una constante y volver a grok es UNA LÍNEA.** Los dos motores viven en el
mismo endpoint del marketplace con el mismo polling y el mismo parser; lo único que cambia es el
cuerpo del POST. Por eso `grok` se conserva ENTERO, con su cuerpo fijado por test, y no comentado.

⚠️ **`KIE_PROMPT_MAX` pasa de 4.096 a 20.000, así que LA ESCALERA DE DEGRADACIÓN QUEDA INERTE** —
ningún lote real se acerca. **No se borra**: es lo que sostiene a grok. Pero sus tests dejaban de
medirla y pasaban en vacío (verdes sin ejercitar nada), así que `buildLotePrompt` acepta
`promptMax` y esos tests le pasan el tope viejo. Mismo criterio que invertir un probe al adoptar
su resultado.

⚠️ **`MAX_IMAGES` SE QUEDA EN 7 aunque Wan acepte 10.** Ese número es el presupuesto de ANCLAS
(`anchors.ts` topa en `MAX_IMAGES - 2`) y cada ancla es una imagen **pagada por el hub**. Subirlo
es una decisión de costo, no de transporte. Igual `MIN_DURATION` sube de 1 a 2 (piso de Wan) y
`MAX_DURATION` se queda en 15: es `LOTE_MAX_SEC`, y con referencia rige `entrada + salida ≤ 30`,
así que 15 + 15 es el reparto que deja el tramo más largo posible.

#### El tramo de referencia (`lib/video-ads/tramo.ts`)

Cada lote recibe **su** tramo del original, mudo. Mandarle el video entero a cada lote sería
pedirle 45 s de coreografía dentro de un clip de 10 — la coreografía duplicada de `repartirAccion`
otra vez, en otra modalidad.

🔴 **LA TRAMPA ES LA TOMA PARTIDA, Y ESTÁ EN LOS DATOS REALES.** `splitLongToma` corre ANTES de
`groupIntoLotes` y los fragmentos **comparten `tiempoOriginal`**: en `520c9169` los lotes 3 y 4
apuntan los DOS a la ventana `16-35s`. Derivando el tramo de esa marca a secas los dos reciben el
MISMO clip de 19 s — el lote 4 pide movimiento que ya ocurrió y el 3 pide el que todavía no. Por
eso el reparto es **proporcional y se calcula sobre TODOS los lotes a la vez**: desde un lote
suelto es imposible saber cuánto de su ventana ya se llevó un hermano de otro lote. Y esa misma
ventana de 19 s viola los dos topes de Wan al mismo tiempo (15 s por clip, `entrada + salida ≤ 30`).
Con test sobre esos números reales, y **verificado revirtiendo**: con la derivación ingenua
(sin acumular lo ya consumido) falla ESE test y pasan los otros seis, que es lo que lo hace
un test y no una decoración.

⚠️ **`-an` OBLIGATORIO.** Medido en el experimento de motores: con la pista del original puesta la
locución copia las palabras de la creadora (86 % → 98 % al mutear). Es la misma contaminación que
descalificó a Kling y a xAI Edit.

⚠️ **Se RE-ENCODA, no `-c copy`**, al revés que `concat.ts`: un corte por copia empieza en el
keyframe anterior y el clip arrancaría antes del gesto que se quiere copiar. Acá el fotograma
exacto es el punto.

⚠️ **Falla CERRADO (502, cero cobrado) y antes de crear la primera tarea.** Dejarlo pasar sin
referencia sería cobrarle al usuario 3,7× por segundo un clip con exactamente la calidad de
movimiento que veníamos a arreglar. Una ventana ilegible o más corta que el piso de 1 s sí devuelve
`null` para ESE lote: ahí el degradado es a un render solo-texto, que es el comportamiento de grok.

⚠️ **`next.config.ts` necesitó la SEGUNDA línea de `outputFileTracingIncludes`**, para
`generate-lotes`. El binario de ffmpeg es un archivo de datos que ningún `require` menciona, así
que sin eso el trazador lo deja fuera de ESA función y el síntoma es un `spawn
/ROOT/…/ffmpeg ENOENT` **solo en producción** — que este repo ya pagó una vez con `concat`.

⚠️ **`scriptFingerprint` v17 → v18, y ahora el MOTOR entra en la huella.** El bump manual cubre
este cambio; hashear `MOTOR` cubre el siguiente, porque volver a grok es una línea y un ida y
vuelta entre motores no se vería de otra forma.

⚠️ **LO QUE NO ESTÁ MEDIDO, y no hay que leerlo como medido:** un lote, un seed, una sesión.
**Ninguna sesión completa corrió por el wizard con Wan** — quedó bloqueada por saldo (704 → 384
créditos ≈ $1,92 tras el paso 0, y una sesión de 45 s cuesta ~$7,20). Tampoco está medido si Wan
aguanta clips más largos que los 15 s de `LOTE_MAX_SEC` —ese cap se bajó por la deriva de
consistencia de GROK, no de Wan— ni si las imágenes ancla siguen aportando algo cuando el
movimiento ya viaja como video.

### EL CANDADO DE MOVIMIENTO (V2) — cableado, verificado y **sin efecto medible todavía** (2026-09-03)

La coreografía deja de viajar como prosa y viaja como una **máquina de estados**: `MotionTimeline` (`lib/video-ads/motion.ts`) con `startState` / `beats` / `endState`, y el prompt del lote emite

```
START STATE: …                                   ← solo si la toma NO se partió
TIMED MOTION — perform these in order, each inside its own window:
[0.0–3.5s] sway; left hand: holds bottle; right hand: rubs product into skin
[6.2–8.5s] upright; left hand: holding bottle; right hand: touches chin
END STATE: …
```
más las tres prohibiciones (`Do not compress…`, `Do not start the next beat early.`, `Do not invent additional hand gestures between beats.`), **una vez por prompt y no por toma** — son globales, y repetirlas son ~150 caracteres × (N−1) de duplicación pura dentro del presupuesto que el candado existe para proteger.

⚠️ **REEMPLAZA A LA PROSA, no se suma.** `accionVisual` se COMPILA desde estos mismos beats (`compileAccion`), así que emitir las dos es decir lo mismo dos veces. Sin timeline —toda sesión guardada— el candado vuelve vacío y manda la prosa, como siempre.

⚠️ **LA PRIMERA CORRIDA DE 4 RENDERS MIDIÓ UN BED DONDE EL CANDADO ES UN NO-OP POR CONSTRUCCIÓN, y hay que leerla así.** El lote elegido eran DOS shots con **un beat cada uno**: ahí las tres prohibiciones no tienen referente —no hay nada que comprimir, nada que adelantar, ningún orden que imponer— y los estados tampoco se emiten (un fragmento no los trae). El brazo B se reducía a formato. Resultado, como corresponde: **2 de 4 beats ejecutados en cada brazo** (A1 1/2, A2 1/2, B1 0/2, B2 2/2), con el peor y el mejor clip los dos del brazo con candado. **No dice nada sobre el candado**, y el guard que lo habría frenado (el shot medido tiene que llevar ≥2 tramos) es ahora el cuarto del probe.

❌ **CON EL BED CORREGIDO —UN SOLO SHOT DE 10,4 s CON TRES TRAMOS SECUENCIALES Y LOS DOS ESTADOS EMITIDOS— EL CANDADO SIGUE SIN MOVER LA AGUJA.** Cuatro renders más, dos draws por brazo, mismo lote y mismo contenido; el brazo A es el control científico (los MISMOS beats proyectados a prosa con `compileAccion`), no literalmente lo que producción emitía.

| | tramos ejecutados |
|---|---|
| A1 (prosa) | **0 de 3**, 1 parcial — *"0.0-8.0s postura estable hablando a cámara sin realizar las acciones solicitadas"* |
| A2 (prosa) | **2 de 3** |
| B1 (candado) | **1 de 3**, 1 parcial |
| B2 (candado) | **0 de 3**, 1 parcial — *"0.0-9.5s sosteniendo el frasco frente a la cámara durante todo el clip"* |

**A 2 de 6, B 1 de 6.** La varianza del seed vuelve a dominar —cada brazo tiene un clip que ejecuta y uno que se queda quieto los diez segundos— y en los dos brazos el clip promedio ejecuta **un tercio** de lo que se le pidió. Con n=2 por brazo no hay efecto que reportar, y la dirección del ruido tampoco favorece al candado. Clips y prompts en `~/Downloads/probe-motion-lock/`.

⚠️ **Y EL DUEÑO DEL REPO MIRÓ LOS CUATRO CLIPS Y ELIGIÓ B1 — que es al que el juez le dio 1 de 3.** No es un detalle: el juez automático cuenta **cuántos tramos de la lista se ejecutan**, y una persona juzga si el clip se ve bien. Son dos preguntas distintas y acá se separaron. Lo que la discrepancia dice es que **la métrica de ejecución no es un proxy de la calidad percibida**, así que un veredicto sobre el candado basado solo en ella queda incompleto; lo que NO dice es que el candado gane, porque es un juicio sobre un clip. Si esto se vuelve a medir, hace falta el ojo humano sobre los cuatro clips a ciegas, no solo el conteo.

⚠️ **LO QUE SÍ ESTÁ SOSTENIDO POR LA MEDICIÓN, y es el hallazgo:** el refinamiento devuelve **2 o 3 beats por corte sin importar cuánto dure el corte** — medido sobre el pase fresco de **tres sesiones** (`2849e595`, `7e4ccbcf`, `1f231b1d`): un corte de 20 s vuelve con 3, uno de 3,4 s también con 3. Es exactamente el mismo techo que este documento ya midió para la prosa (*"los cortes LARGOS se quedan en ~4 frases pase lo que pase"*), y el pase dedicado NO lo rompió: **el techo es semántico, no de presupuesto ni de formato**. Y se ve en el render: los dos clips quietos lo están justo donde el timeline no pide nada.

**Entonces la palanca siguiente no es el prompt del lote: es la DENSIDAD del timeline.** Ninguna forma de emitir 3 tramos hace que grok ejecute diez movimientos.

✅ **Y LA DENSIDAD SE ROMPIÓ, con la MISMA táctica que ya había funcionado para la prosa: darle una ESTRUCTURA donde colgar las respuestas en vez de pedirle "más" (`scripts/probe-densidad.ts`, 2026-09-03).** El refinamiento recibe ahora cada corte **pre-partido en ventanas de 1,5 s** (`VENTANA_BEAT_SEG`) y se le pide **al menos un beat por ventana**. Dos draws por brazo sobre los mismos 4 cortes:

| | beats por corte | total | beats/s | palabras por casilla |
|---|---|---|---|---|
| A1 (prompt actual) | 2, 2, 2, 2 | 8 | 0,18 | 3 |
| A2 (prompt actual) | 3, 2, 3, 2 | 10 | 0,22 | 3 |
| **B1 (ventanas 1,5 s)** | **7, 4, 13, 6** | **30** | **0,66** | 3 |
| **B2 (ventanas 1,5 s)** | **7, 4, 13, 6** | **30** | **0,66** | 2 |

**3× la densidad, y los dos draws devolvieron EXACTAMENTE el mismo reparto** — o sea la estructura manda sobre el sorteo, que es justo lo que un techo estocástico no hace. El corte de 19,3 s pasa de 2-3 beats a 13, y esos 13 son una progresión real: *aplica → mezcla → cambia de dirección → mandíbula → mentón → cuello*.

⚠️ **NO ES LA CUOTA QUE EL SPEC PROHÍBE, y la distinción es la que hace legítimo el cambio.** Aquélla es una cuota de MOVIMIENTO —inventar gestos que el original no tiene, que el render después ejecuta—; ésta es de **OBSERVACIONES**: una ventana quieta se responde con un beat que dice que está quieta, que este documento ya registra como dato válido. Y el prompt lo dice explícito: *"never invent a gesture… declared stillness is data; an unexamined second is not"*.

⚠️ **EL RIESGO ANOTADO ANTES DE INTENTARLO —cambiar detalle por estructura— NO SE MATERIALIZÓ, pero se midió:** la mediana de palabras por casilla se mantiene en 3 (B2 baja a 2). Por eso el probe imprime las dos cosas: nueve beats de dos palabras habrían sido una regresión disfrazada de mejora.

⚠️ **LAS VENTANAS TRAEN SU PROPIO DEFECTO, y se arregla en CÓDIGO: un tramo quieto vuelve repetido ventana por ventana.** Medido: un corte de 9,8 s devolvió **cinco beats idénticos seguidos** (*Still · left: lowered · right: holding bottle*), con el prompt pidiendo ya fusionarlos. `colapsarQuietud` (dentro de `normalizeMotionTimeline`) une los beats consecutivos que dicen literalmente lo mismo en las cuatro casillas de contenido y en el estado del producto; el resultante abarca la unión de las ventanas y se queda con la importancia más alta. Efecto medido sobre la misma sesión: el corte quieto **7 → 3 beats** y el de aplicación **13 → 12** (solo se fusionan dos *"Massaging skin"* idénticos). O sea recorta la redundancia y no la coreografía.

La comparación es **igualdad exacta normalizada**, no el subconjunto de `mismoEstado`: acá el modo de fallo de pasarse es borrar un cambio real, así que se une solo lo que es literalmente lo mismo. Con test en las dos direcciones.

⚠️ **El presupuesto aguanta:** el prompt del lote con el timeline denso sale en **4.860 caracteres sin truncar**, y el test del piso ya cubre el caso extremo (con la prosa fuera, la búsqueda binaria encoge las líneas del candado y con cap 0 deja la ventana de tiempo sola).

⚠️ **Solo alcanza a análisis NUEVOS** — es un cambio en el paso caro. Y **el veredicto del candado queda ABIERTO otra vez**: se midió con 2-3 tramos por clip, que era todo lo que el forense daba; ahora da 12. Ese A/B hay que rehacerlo sobre el bed denso.

🔴 **CON EL TIMELINE YA DENSO Y EL FRAGMENTO ORIGINAL AL LADO: NINGUNO DE LOS CUATRO CLIPS REPRODUCE LA COREOGRAFÍA, Y EL DEFECTO ESTÁ EN EL RENDER, NO EN EL PROMPT (2026-09-03).** Tercera corrida de 4 renders, ahora sobre el bed bueno —el corte de 19,3 s con 12 beats, partido, midiendo el fragmento de 11,1 s con **6 tramos de aplicación real**— y con el tramo equivalente del video original recortado con ffmpeg (`16.0s → 27.1s`) para comparar.

**Veredicto del dueño del repo mirando los cinco:** *"ninguno se parece, todos se quedan casi quietos todo el tiempo, lo máximo que hacen es tocarse la mejilla o acercar el frasco a la cámara"*. Verificado además fotograma a fotograma: en el original la mano **trabaja sobre la cara** —dedos abiertos masajeando mejilla y pómulo en cuatro de los cinco fotogramas—; en el clip generado la persona sostiene el frasco a la altura del pecho, señala con un dedo y habla. Nunca se aplica nada.

**Entonces la representación de la coreografía es una palanca MUERTA para grok.** Prosa y candado dan lo mismo porque el modelo no ejecuta seis tramos en once segundos, le llegue como le llegue. Es la confirmación de la hipótesis que este documento ya tenía escrita sin cerrar (*"el límite no es cuánto le podemos contar a grok, es cuánta coreografía ejecuta por clip"*), y ahora con el original al lado en vez de contra una lista.

⚠️ **EL TRABAJO DEL TIMELINE NO SE TIRA, pero hay que saber qué compró y qué no.** La densidad (0,22 → 0,66 beats/s) y el encadenado de estados son insumos correctos y son lo que habilita las anclas de pose; lo que NO compran por sí solos es un render distinto. Las dos palancas que quedan son de otra clase: **(a) anclas de pose DENTRO del clip** —el timeline ya trae `referenceFrameMs` en el 100 % de los beats, y este repo tiene medido cinco veces que **la imagen le gana al texto**, así que es la única que cambia de modalidad; sin medir que grok interpole hacia referencias intermedias— y **(b) cambiar el modelo de render**, que es decisión del dueño del repo.

🔴 **Y EL JUEZ AUTOMÁTICO DEL PROBE ERA FALSO — se retiró.** Le daba al clip la lista de tramos que se le habían pedido al render y preguntaba cuáles se ejecutaban: sobre ESE clip —el de la cabeza parlante— devolvió **6 de 6**. Con la lista delante, *"mano cerca de la cara"* se convierte en *"aplica producto en la mejilla"*: el oráculo confirmaba su propio enunciado. Ya había dado dos señales antes (el ojo humano eligió dos veces el clip peor puntuado) y se leyeron como discrepancia de criterio en vez de como lo que eran.

Ahora el probe **describe A CIEGAS** —el modelo no sabe qué se pidió— y además escribe una **tira de cinco fotogramas por clip** con ffmpeg, que es determinista y gratis. La comparación la hace quien lee. Mismo criterio que el probe del español y el de tipografía: **cuando la métrica automática es frágil, lo que vale es imprimir.**

⚠️ **LA LECCIÓN GENERAL, y es la más cara de esta ronda: un oráculo al que se le muestra la respuesta esperada no mide, confirma.** Antes de creerle a un juez de visión, hay que preguntarse qué vería si le mostráramos un clip vacío.

⚠️ **Lo que NO se midió, y no hay que leerlo como medido:** que el candado no sirva NUNCA. Se midió que no cambia nada **con 2-3 tramos por clip**, que es todo lo que el forense da hoy. Si algún día la densidad sube, esto se vuelve a medir — el probe está escrito y sus cuatro guards también.

✅ **Lo que la corrida SÍ dejó, y no es poco: cinco defectos que solo aparecen armando el prompt de verdad.** Los cinco están arreglados y con test.
1. **Los beats se DUPLICABAN al partir la toma.** `splitLongToma` copia la toma entera, así que los dos fragmentos recibían el timeline completo — el bug de la coreografía duplicada en su forma más literal, ahora con línea de tiempo. `repartirBeats` los reparte por punto medio y rebasa los tiempos.
2. **Y un beat desbordaba la ventana de su fragmento.** Cae en el fragmento que contiene su PUNTO MEDIO, así que puede empezar antes o terminar después de sus bordes: un beat `[6.5–13.2]` se emitía dentro de un clip de 11,6 s. Se clampea.
3. **Las ventanas eran relativas a la TOMA y el clip es UNO.** La segunda toma de un lote volvía a empezar en `[0.0s]`: dos relojes en el mismo prompt. Ahora llevan el corrimiento acumulado del lote.
4. **`repartirBeats` dejaba fragmentos sin un solo beat** (con duraciones 9:1, el caso que `repartirAccion` ya tenía medido), y ahí el fragmento cae a la prosa — que se compila de TODOS los beats de la toma, o sea repite lo que el candado del hermano ya pidió. Piso de un beat por fragmento.
5. **Los estados salían del primer y del último beat cuando el timeline no los traía**, y eso es duplicación pura: en un fragmento de dos beats el prompt decía lo mismo tres veces. Ahora **los estados salen del timeline o no salen**; un fragmento arranca de su imagen ancla, que ya dice cómo se ve.

⚠️ **Y el presupuesto: con la prosa fuera, lo único que la búsqueda binaria del piso puede encoger son las líneas del candado.** Con cap 0 el tramo deja **la ventana de tiempo sola** —lo único que aporta sobre la prosa— y los estados desaparecen enteros. Sin eso, un lote con el timeline cargado hacía lanzar a `buildLotePrompt` con la cuota ya gastada (medido: 8.394 caracteres en el piso). Con test.

⚠️ **`scriptFingerprint` HASHEA LOS BEATS, y no alcanzaba con `accionVisual`.** `compileAccion` descarta los `micro` y —lo que importa— **los TIEMPOS**: dos timelines que difieren solo en la ventana de cada tramo compilan a la misma prosa. Misma huella, prompts distintos, `isPaidResume` jurando que es el mismo contenido — y la ventana de tiempo es justamente lo único que el candado agrega. **Huella v11 → v12** por el cambio de plantilla.

⚠️ **EL PROBE SE ESCRIBIÓ CON GUARDS ANTES DE GASTAR UN RENDER, y todos se dispararon.** (a) *el brazo B no lleva candado* — el primer emparejamiento ataba los cortes frescos a `adapted.tomas[].tiempoOriginal`, y el forense fresco corta el video DISTINTO (5 cortes donde el guardado tenía 4): la toma de 14,3 s recibía por cercanía el timeline de un corte de 3,4 s. Se habrían gastado cuatro renders midiendo eso. Ahora el lote se construye desde el forense fresco y el timeline manda. (b) *el brazo B sale truncado* — en una sesión el prompt pasaba de 5.000 y se habría medido presupuesto y no representación. (c) *un beat termina después de que el clip se acabó* — el defecto 2 de arriba. (d) *ningún shot del lote lleva 2 o más tramos* — el guard que faltaba, y el que habría frenado la primera corrida. **Un probe de render tiene que negarse a rendir.**

⚠️ **LA COREOGRAFÍA SE DUPLICABA EN CADA FRAGMENTO, Y ÉSA ERA LA CAUSA DE "FALTAN MOVIMIENTOS".** `splitLongToma` partía `locucion` por frases y copiaba `accionVisual` **tal cual** a cada fragmento. Una toma fusionada de 17,4 s partida en dos le pedía al modelo la coreografía COMPLETA de los 17 s en 3 s, y otra vez en 8,7 s — una instrucción imposible, de la que el modelo ejecuta una fracción arbitraria. Reportado por el dueño del repo como *"no se ve como el video original, faltan movimientos y gestos"*.

⚠️ **Y EL CONTEO POR LOTE LO SUBESTIMA 3×.** Contando duplicados dentro de un mismo lote da **5 de 85**; contando fragmentos por sesión da **21 de 119 tomas**. La diferencia es que `splitLongToma` corre ANTES de `groupIntoLotes`, así que los fragmentos de una misma toma caen en lotes distintos y ahí el conteo por lote no los ve. Con el cap en 15 s este es el camino normal, no la cola.

`repartirAccion` reparte los tramos en orden y proporcionalmente a la duración de cada fragmento (por resto mayor, con **al menos un tramo por fragmento cuando alcanza** — un reparto puramente posicional dejaba fragmentos vacíos teniendo material: medido con duraciones 9:1, los tres tramos caían en el primero). El separador ` Luego, ` no es una heurística sobre prosa: **lo escribe `mergeMicroCortes` al fusionar**, así que cada tramo es exactamente un corte del original. Sin separador, la acción entera va al PRIMER fragmento y los demás quedan sin línea — vacío es recuperable, duplicado no.

⚠️ **Y `mergeMicroCortes` NO PUEDE FABRICAR UNA TOMA QUE EL REPARTO TENGA QUE VOLVER A PARTIR.** `MIN_TOMA_SEG = 4` se calibró contra el cap de 30 s; con 15, fusionar tres cortes en 17,4 s es pura pérdida — `splitLongToma` la vuelve a cortar enseguida y en el camino ya se descartó el encuadre de los cortes absorbidos. Ahora acepta un `maxSeg` (`Infinity` por defecto, para no tocar a ningún caller existente) y `extract-template` le pasa `LOTE_MAX_SEC`.

⚠️ **EL INTERVALO DE LOS TRAMOS PONÍA EL TECHO DE LA DENSIDAD, Y SE CONTRADECÍA CON LA CUENTA (2026-09-02).** Reportado como *"los movimientos se sienten estirados en una línea de tiempo más extensa, da impresión de lentitud"*.

El prompt de FASE 1 pedía **un movimiento cada 2 segundos** (0,50 mov/s) y, tres párrafos más abajo, **un tramo cada 4 o 5 segundos**. Se contradicen, y **gana la estructura**, porque es la que da la forma de la respuesta. Medido en la sesión `7e4ccbcf`: un corte de 18,7 s volvió con **4 tramos y 7 movimientos = 0,37 mov/s**, exactamente el techo que el intervalo permitía. Con el intervalo alineado a la cuenta, las dos piden lo mismo. Es la sexta vez que este documento registra dos instrucciones opuestas dentro del mismo prompt.

⚠️ **QUÉ MIRAR EN LA PRÓXIMA CORRIDA, porque el techo puede reaparecer por el otro lado:** la estructura existe porque el modelo se topa en ~4-5 cláusulas por respuesta. Un corte de ~19 s tiene que volver con **~9 tramos y ~14 movimientos**; si vuelve con 9 tramos de dos palabras, se cambió detalle por estructura y hay que revertir. Se lee en la línea de `coreografiaEscasa` del log, no hace falta un probe. **Solo alcanza a análisis NUEVOS.**

❌ **LO QUE NO ERA: el desajuste entre la duración del clip y la de sus tramos.** Se propuso alinear las dos y se descartó al medirlo: en la sesión reportada el estiramiento máximo es **1,10×** y dos de cuatro fragmentos están COMPRIMIDOS, no estirados. El desajuste grande (1,45× y 0,44×) es de otra sesión que nadie objetó. No vale 40 líneas de algoritmo para el 10 % mientras la brecha real es 0,27 contra 0,50 mov/s.

⚠️ **CADA LOTE ABRE CON SU PROPIA ANCLA, SALVO EL PRIMERO — y esto es lo que ancla el FONDO entre clips (2026-09-02, decisión del dueño del repo).** Las anclas solo se generaban para un cambio de escena DENTRO de un lote, así que con `maxPlanos = 1` casi nunca se generaba ninguna: medido, **0 anclas en las dos sesiones nuevas**, y los N clips arrancaban del avatar solo por texto. En `7e4ccbcf` la persona, el suéter y el producto se sostienen en los 5 clips, pero **el fondo deriva**: marco de puerta, dos cuadros, una puerta blanca, una planta.

⚠️ **QUITAR `SETTING AND LIGHTING` NO CAUSÓ ESTO, y la distinción importa.** Aquel cambio eliminó la clase CONTRADICCIÓN —habitaciones ajenas, tipo pasillo o cocina— y está medido. Lo que queda es DERIVA dentro de la misma habitación, que es otro modo de fallo. El A/B de 2 draws nunca lo habría visto: era el **mismo lote con el prompt byte-idéntico**, y acá son N lotes con prompts distintos (cada uno con su línea de cámara y su coreografía).

✅ **LA PREMISA SE MIDIÓ ANTES DE CABLEARLO (`scripts/probe-anclas.ts`, 2 imágenes):** dos anclas generadas desde el MISMO avatar conservan su habitación — mismo marco de puerta, misma pared, misma luz, mismo encuadre. O sea **el modelo de imagen conserva el escenario al editar; grok lo re-inventa al generar video**, y esa diferencia es la que hace que el eje funcione.

⚠️ **Y NO SE PODÍA HEREDAR LA MEDICIÓN VIEJA: la de AGENTS.md era de Nano Banana Pro.** Peor: **la primera corrida del probe midió el modelo equivocado** — omitió `preferGemini` y usó gpt-image-2, cuando `generate-lotes` genera las anclas con nano-banana-2 de primario. Se repitió con el par real y ahí sí quedó verificado (el tamaño lo delata: 1536×2752 es el ratio nativo de nano-banana-2, no los 864×1536 de gpt-image-2). **Un probe que arma el prompt a mano tiene que copiar también las OPCIONES del modelo, no solo el prompt.**

⚠️ **El PRIMER lote no lleva ancla a propósito:** arranca del avatar, que ya ES una imagen válida de esa escena. Generarle una sería pagar por una copia.

❌ **ANCLAS DE POSE: CONSTRUIDAS, MEDIDAS Y REVERTIDAS (2026-09-04, decisión del dueño del repo).** El eje existió durante tres commits y se deshizo entero — se deja escrito para que nadie lo vuelva a construir sin saber qué da.

**Qué era.** `MotionBeat.referenceFrameMs` —el instante que mejor muestra cada tramo— existe desde que hay timeline y **no lo lee nadie**. El eje extraía ese fotograma del video ORIGINAL y generaba el ancla con TRES referencias: avatar (identidad, escenario, ropa), producto y el cuadro real (pose). Además le daba ancla al PRIMER lote, invirtiendo la regla de arriba: el avatar es una imagen válida del ESCENARIO y no de la POSE, y el anuncio de referencia ABRE con el gotero ya en la mejilla.

✅ **La imagen que producía era correcta, verificado en píxeles:** cara, suéter y habitación del avatar, el frasco del usuario (no el del original), **el gotero ya en la mejilla y el frasco sostenido abajo**, y sin un carácter de texto — el fotograma trae la marca de agua de TikTok, el arroba del autor y el subtítulo quemado, y el bloque de pose los nombraba y los prohibía uno por uno.

❌ **Y AUN ASÍ EL CLIP NO EMPIEZA AHÍ.** Medido por el **fotograma 0**, que es lo único que discrimina con un render: *"¿ejecutó la coreografía?"* es el sorteo del modelo y no sobrevive n=1; *"¿el clip ARRANCA en esa foto?"* lo decide la imagen y se lee de un cuadro.

| línea que citaba el ancla | fotograma 0 del clip |
|---|---|
| `same framing and same room` | saca el gotero del frasco ❌ |
| `the first frame of this shot IS that photograph` | sostiene el frasco cerrado, hablando ❌ |

Las dos veces el ancla mostraba el gotero en la mejilla. **Es el techo del modo de referencia, no una redacción floja:** las anclas son material citado como `@image(n)` — no hay fotograma inicial ni interpolación forzada, y eso lo dice el diseño del sistema tres párrafos más arriba. **No lo intentes otra vez por el lado del texto.** La palanca que queda para la POSE es el **ORDEN de las imágenes** (el ancla de apertura en `@image(1)`), y choca de frente con *"el orden ES el contrato"* y con el `+3` de `anclasPorTiempo`: es un cambio a pensar, no un ajuste.

⚠️ **Lo que SÍ replicó, 2 de 2 renders, y por eso NO justificaba el eje:** la habitación del avatar en los cinco fotogramas de los dos clips. Es el mismo resultado que el avatar ya da solo — o sea el beneficio medido era redundante y el costo era **+1 imagen del hub por sesión** más la descarga del original.

⚠️ **Un hallazgo que sobrevive al revert: `ffmpeg-static` SEGFAULTEA (SIGSEGV, rc 139) con una entrada https.** `-ss <t> -i <url>` parecía lo barato (buscar el instante y bajar solo lo necesario) y devuelve cero bytes; el MISMO binario y el MISMO comando sobre el archivo local dan el cuadro. Quien quiera un fotograma remoto en este repo tiene que bajar el archivo primero.

⚠️ **COSTO: 4,6 imágenes por sesión** medido sobre las 31 sesiones con guión (173 lotes → 143 anclas), contra ~0 antes. Las paga el HUB. Se generan **en paralelo entre todos los lotes**, así que el tiempo de pared es el de la más lenta (~60 s) y no la suma — entra en el `maxDuration = 300` de la ruta.



---

## Veo 3.1 — el contrato, revertido el 2026-08-24

🔴 El render dejó Veo y volvió a grok (`grok-imagine/image-to-video`). Son dos endpoints,
dos parsers y dos contratos distintos del mismo proveedor: `veo3_fast` vive en `/api/v1/veo/*`
con `successFlag` numérico, y grok en el marketplace (`jobs/createTask`) con `state` string y
`resultJson` como STRING con JSON adentro. Mezclarlos deja el polling esperando para siempre.

⚠️ **[HISTORIA — revertido el 2026-08-24, ver arriba] MIGRACIÓN A VEO 3.1 (2026-08-19).** El render dejó `grok-imagine-video-1-5-preview` y pasó a **`veo3_fast` 720p**. Motivo: el movimiento salía robótico y grok no tiene entrada de voz ni keyframes — era un techo de modelo, no solo de prompt. Plan completo y probes en `docs/superpowers/plans/2026-08-19-video-veo31-nanobanana-plan.md`. **La migración está COMPLETA**: el avatar sale de Nano Banana Pro en 9:16, el render usa `FIRST_AND_LAST_FRAMES_2_VIDEO` con frames generados por adelantado, y existen `motion_profile`, varios personajes (hasta 4) y el eje de voz en off. **Lo que NO está verificado:** el precio real de `veo3_fast` 720p, una tanda completa por el wizard, y el modo de varios personajes en un render de verdad. Las secciones de más abajo que hablan del presupuesto de 4096 caracteres describen a grok y son HISTORIA, no doctrina — están marcadas.

**[HISTORIA — el contrato vigente es el de grok, arriba] Contrato con Veo 3.1 (`docs.kie.ai/veo3-api`).** El modelo es **`veo3_fast`** y **vive en otro endpoint que el resto del marketplace**: `POST /api/v1/veo/generate` → `taskId`; `GET /api/v1/veo/record-info?taskId=` → `successFlag` (**0** en curso, **1** ok, **2|3** falló) con el video en `data.response.resultUrls[0]` (un ARRAY, no el string con JSON adentro que usaba el marketplace). Grok y Nano Banana Pro siguen en `jobs/createTask`. Reglas duras, todas blindadas por `kie.test.ts`:
- **`duration` acepta EXACTAMENTE 4, 6 u 8 segundos.** Nada de decimales ni de 15. `snapDuration` (kie.ts) es donde se decide qué se pierde al ajustar: de las duraciones legales en las que la locución SÍ entra a `CPS_MAX`, elige la más cercana a la duración original, con empate hacia la más corta. Redondear siempre hacia arriba mete silencio; hacia abajo corta diálogo a mitad de frase, que es peor.
  ⚠️ **`snapDuration` tiene DOS condiciones, no una.** La dura (`>= chars / CPS_MAX`) es que el texto se pueda decir. La blanda (`<= chars / CPS_MIN`, con `CPS_MIN = 9`) es que no sobre tanto tiempo que el modelo rellene: **medido, 23 caracteres en 6 s (3,8 car/s) hicieron que Veo dijera la frase DOS VECES** — *"Y es nuestro mural y es nuestro top mural"*. Ese mismo lote fue además el que falló con *"unable to generate audio"* en el primer intento. Entre las que cumplen las dos se elige la más cercana a la duración original; si ninguna cumple la blanda se toma la más corta de las que cumplen la dura. Una toma MUDA queda fuera de la regla: sin habla no hay nada que repetir y su duración es un beat visual.
- **`prompt` topa en 60.000 caracteres** (`422 "The prompt word cannot exceed 60000 characters"`). Son 14,6× los 4096 de grok, y por eso **la escalera de degradación de `buildLotePrompt` se BORRÓ** en vez de portarse.
- **`generationType` decide qué significan las imágenes, y los modos son EXCLUYENTES:** `REFERENCE_2_VIDEO` (1–3 referencias, solo fast/lite, solo 8 s) o `FIRST_AND_LAST_FRAMES_2_VIDEO` (1–2 keyframes: primero y último).
- **El prompt puede ir en ESPAÑOL** y la locución entrecomillada se dice literal, con acento latinoamericano — medido con dos renders. La afirmación de que Veo 3.1 solo acepta inglés es falsa, y `enableTranslation` **no** toca el texto entrecomillado. No hace falta ningún split bilingüe.
- **Veo devuelve HTTP 200 con `code: 422` adentro** en los errores de validación. Mirar solo `res.ok` deja pasar el fallo como éxito y el polling espera para siempre un `taskId` que no existe.

⚠️ **EL CANARIO GRATIS, para probar el body sin gastar:** mandar `duration: 5` (inválido) devuelve 422 **sin `taskId`**, o sea la validación corre antes de despachar y no cobra. Cualquier otro campo —modo, modelo, largo de prompt, número de imágenes— se verifica gratis mandándolo junto a esa duración inválida. Así se midieron el tope de prompt y las combinaciones de modo sin gastar un solo render.
