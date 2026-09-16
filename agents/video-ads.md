## Tool: Generador de Video Ads (`generador-video-ads`)

🔴 **LEE ESTO ANTES QUE CUALQUIER SECCIÓN DE ABAJO: ESTE ÁRBOL ES UN REINICIO, Y EL DOCUMENTO NO SE REINICIÓ CON ÉL (2026-09-07).** El commit `a3a25d6` (2026-09-04, *"el generador vuelve a su primera versión funcional (fb71891)"*) devolvió el generador a la versión del 13 de agosto y borró 15.406 líneas, por COSTO: Wan a 720P cobra `precio × (entrada + salida)`, ~$7,20 por anuncio de 45 s. Después se re-portaron FASE 2 y 3 y se construyó encima el arco *"la coreografía llega entera al render"*. **El motor de este árbol es `grok-imagine-video-1-5-preview`** (prompt 4.096, clips 1–15 s, 720p, hasta 7 imágenes) y el prompt del lote va en ESPAÑOL. **No existen acá**: `wan/3-0-video`, `tramo.ts`, `motion.ts`/`MotionTimeline`, `anchors.ts` (imágenes ancla), `concat.ts`, `micro`/`objetoEnMano`, `hablantes`/`personajes`/`vozEnOff`, `mergeMicroCortes`/`MIN_TOMA_SEG`, `reconciliarConVentana`, `verificarDialogos`/`verificarAcciones`/`coreografiaEscasa`, `acceptRewrite`/`buildCoherenceInstruction`, `limpiarDialogos`, la escala de encuadre del forense, el contrato de idioma (campos visuales en inglés), los nichos de ropa y el avatar por nano-banana. Las secciones que los describen como cableados hablan de `main` y de `video-prompt-maestro` (PR #107) / `origin/video-wan-3`. **Lo que SÍ sigue valiendo de esas secciones es lo MEDIDO sobre grok**, porque es el mismo motor: ~15 renders sin ejecutar la coreografía de aplicación, prosa vs candado de movimiento sin efecto (A 2/6, B 1/6), un beat por clip que no replica (1 de 3), anclas de pose correctas en píxeles y el clip que no arranca ahí (2/2), el bloque de escenario en texto que hace derivar el fondo (2/2), y el experimento de 4 motores donde solo los que reciben el VIDEO como señal (Kling, xAI Edit, Seedance; después Wan con el prompt real de `buildLotePrompt`) copian la coreografía.

**Veredicto sobre el techo, con esa evidencia:** con grok, *replicar el patrón de movimiento con exacta precisión* está tocado y medido — la representación textual del movimiento es una palanca muerta con n ≥ 12 renders. Lo que quedaba de margen en este árbol era de PIPELINE, no de motor, y se cerró en la ronda de abajo. Para el movimiento fino la única vía con evidencia es un motor que reciba el tramo del original (Wan a 480P costaría ~$3,60 por anuncio de 45 s; Seedance-2-fast ~$3,16; grok ~$1), y es decisión de costo del dueño del repo.

✅ **CINCO ARREGLOS DETERMINISTAS DE ESTA RONDA (2026-09-07), todos medidos sobre las 25 sesiones con guión de la base (lectura pura, cero renders):**

1. **El avatar COPIA vestuario y escenario, con el encuadre de apertura del original** (`character.ts`). El reinicio devolvió el prompt a *"vestuario y escenario equivalentes"*, la redacción que este documento ya midió el 2026-08-26 como la causa de *"no se parece ni un poco"*: los dos avatares más recientes de esta rama salieron con *"white button-up shirt… modern home kitchen"* sobre un original de suéter rosa y estantería de madera, mientras las seis sesiones hechas con el `character.ts` de `main` sí copiaban. Como `Image1` es la ÚNICA fuente del escenario en el prompt del lote (a propósito: describirlo en texto hace derivar el fondo), el ambiente del original no podía llegar al clip por ninguna vía. Solo alcanza a avatares NUEVOS: **regenerá el avatar de la sesión activa antes del próximo render.**
2. **Un lote con tomas de DOS planos anuncia el plano POR TOMA, con corte seco, y deja de pedir "una sola toma continua"** (`buildLotePrompt`, `cortes` opcional). Medido: **25 de 107 lotes** venían de dos planos y se emitían como `CÁMARA: Primer plano fijo. · Plano medio con zoom` dentro de una toma continua — grok renderiza uno y descarta el otro. El plano se anuncia solo cuando cambia. Sin costo de reparto; la alternativa con costo (frontera por cámara en `groupIntoLotes`, 1,15×) sigue siendo decisión del dueño.
3. **`LOTE_MAX_CHARS = 15 × CPS_MAX = 300` cierra el lote también por caracteres, y `generate-lotes` pone el piso de habla en la duración** (`clampDuration(max(duración, chars / CPS_MAX))`). Medido sobre grok que a 281 caracteres dice el 100 % y a 577 balbucea; en la base 5 lotes pasaban de 300 y **26 de 107 se renderizaban más cortos de lo que su texto necesita**. Costo: 104 → 107 lotes.
4. **Micro-temblor solo con cámara no fija.** `CÁMARA: …, estable. Grabado con teléfono en mano, con micro-temblor` eran dos órdenes opuestas en una línea, en **82 de 107 lotes**.
5. **`camaraFallback` deja de ser el plano del corte 1** (afirmaba una escala como hecho en lotes de producto) **y `repairCutTiming` gana `MIN_VISIBLE_SEG = 3`**: un corte mudo era holgura pura y el reparto lo vaciaba para financiar a los hablados — 8 de 13 mudos de la base quedaron < 1 s. Acotado a la duración que el corte ya tiene, así no infla nada.

✅ **Y EL ACABADO DEL AVATAR SE FIJA EN CÓDIGO, NO EN LA INSTRUCCIÓN (`REALISMO_AVATAR`, `promptDeAvatar`).** Lo ÚNICO que llega al generador de imagen es `promptCreacion`, que lo redacta un LLM: la regla de realismo vivía solo en `buildIdentityInstruction`, o sea dependía de que el modelo se acordara de copiarla — la misma apuesta que este documento registra cinco veces perdida. Y acá pierde peor, porque el LLM está describiendo a una persona para un anuncio y su vocabulario por defecto es el de la publicidad de belleza: *"piel radiante, luminosa, perfecta"* dentro del prompt ES el acabado de plástico que la regla venía a evitar. Ahora el bloque se anexa siempre y **al FINAL** (en difusión la cola pesa, así que manda sobre cualquier adjetivo que se haya colado antes): textura desigual con poros, vello fino, lunares asimétricos, brillo graso conviviendo con zonas mates, rojez natural, **cara no simétrica**, luz direccional desigual y grano de teléfono; y una cola de prohibiciones (piel alisada o de muñeca, "glow" uniforme, aerógrafo, filtro de belleza, simetría exacta, render 3D, CGI, HDR, el acabado lavado y sin poros que delata a una IA). La instrucción del LLM deja de pedir el acabado y pasa a **prohibirle ese vocabulario**, que era la otra mitad. ⚠️ **Las imperfecciones son LEVES y de una cara real: nada de heridas, erupciones, cicatrices ni lesiones** — el producto suele ser skincare y un avatar con lesiones contradice lo que el anuncio promete. `character_prompt` persiste ahora el prompt REALMENTE enviado, no el del LLM: ese campo tiene que decir qué se renderizó. Sin bump de huella (`scriptFingerprint` hashea la URL del avatar, no su prompt) y **solo alcanza a avatares NUEVOS**: la caché es por `character_url`, así que hay que regenerar el personaje para verlo.

🔴 **UN FRAGMENTO QUE ARRANCA A MITAD DEL CORTE HEREDA EL ESTADO DE LAS MANOS Y SABE QUE LA GOTA YA CAYÓ (`repartirAccion`, 2026-09-07).** Reportado por el dueño del repo sobre el lote 3 de `00471f8a`, el único clip malo de una tanda de cuatro: *"entre el segundo 3 y 4 el avatar se echa una gota de serum en la mano mientras sostiene el frasco y gotero y luego estos dos desaparecen de sus manos"*. Verificado fotograma a fotograma: el clip arranca sacando el gotero, suelta la gota en la palma, las dos manos suben a la cara vacías y el frasco reaparece en el segundo 7; en el original (15–35 s) el frasco está en la derecha a la altura del pecho todo el tramo y la izquierda extiende.

**La causa está en el reparto, no en el motor.** El corte 3 dura 20 s y dice, en orden: *sujeta el frasco con la derecha; aplica una gota con el cuentagotas; extiende con las yemas; mira y señala*. Se partió en 12 + 5,6 + 2,4 s y `repartirAccion` repartió los hechos EN ORDEN, que es lo correcto — pero el primer hecho no es un movimiento, es un ESTADO que vale todo el corte, y la transferencia del segundo hecho ya había ocurrido cuando arranca el tercero. El lote 3 abría con *"extiende el suero con las yemas"* a secas: sin saber qué tiene en las manos ni que el suero ya está en la piel, grok inventó el dispensado entero para tener suero que extender, y después no supo qué hacer con el frasco. Es la REGLA DE CONTEXTO ABSOLUTO en su forma más chica: cada clip se renderiza sin memoria, y un fragmento del medio necesita que se le diga dónde estaba.

Dos cosas, ninguna inventa coreografía: (1) el fragmento hereda **el ÚLTIMO estado de manos declarado antes de él** (un tramo que abre con *sujeta/sostiene/mantiene/tiene* y nombra una mano) — el último y no el primero, porque *"pasa el frasco a la izquierda"* a mitad del corte cambia el estado; (2) si un fragmento ANTERIOR contiene una transferencia (*aplica/deja caer/suelta/vierte/deposita* + *gota/suero/producto*) y éste no, se le agrega *"el producto ya está en la piel desde antes: no vuelve a dispensar"*. Dos fragmentos del mismo corte en el MISMO lote no lo repiten (dedupe al emitir). Con test sobre la cadena real del corte 3.

✅ **VERIFICADO CON UN RENDER DEL MISMO LOTE (45 créditos del usuario, `taskId 5232539d…`):** el frasco se queda en la mano derecha los 8 segundos, la izquierda extiende con las yemas sobre la mejilla (4,5–6 s), el cuentagotas vuelve al frasco, y no hay gota en la palma. **Los dos defectos reportados desaparecen.** ❌ Lo que NO obedeció: *"no vuelve a dispensar"* — igual saca el gotero y suelta una gota en la mejilla antes de extender (2–4,5 s). Por eso la línea pasó a su forma POSITIVA, describiendo el estado de arranque (*"el suero ya está sobre la piel desde el inicio y el cuentagotas dentro del frasco, cerrado"*): a un modelo de difusión una prohibición le llega débil y un estado declarado es un dato. ⚠️ Esa reformulación es una hipótesis con n = 0; lo medido (n = 1) es que la negativa no alcanzó. Re-renderizar un lote suelto se hizo con un script a mano que rehace el prompt con las funciones de la ruta, crea la tarea con la key del usuario, sondea, copia al bucket y escribe `lotes[i]` con su huella nueva; no hay UI para eso.

🔴 **Y EL RENDER SIGUIENTE DIJO QUE NO ALCANZABA: LA FRONTERA ENTRE FRAGMENTOS TIENE QUE SER UN ESTADO CERRADO (2026-09-07, pedido del dueño del repo).** Con el estado heredado, el lote 3 igual destapó, se echó gotas y el cuentagotas desapareció al pasar a masajear. Su pedido, literal: *"que el lote 2 destape el frasco, se aplique las gotas mientras habla y tape el frasco, y en el lote 3 con el frasco tapado en la mano se masajee la mejilla con la mano libre… que el sistema construya automáticamente los cortes, los prompts y los lotes así, sin importar qué video sea"*. El defecto de fondo: el reparto cortaba el corte por la LOCUCIÓN (frases) y repartía los hechos por CANTIDAD, sin mirar en qué estado quedaban los objetos en la frontera — y una frontera con el cuentagotas fuera del envase es un objeto que el clip siguiente no sabe que existe.

`repartirAccion` es ahora una **máquina de estados sobre vocabulario CERRADO** (`esApertura`, `esCierre`, `esTransferencia`, `esEstadoDeManos`, `PIEZAS` — se amplían en el diff, no aflojando patrones), y hace tres cosas, ninguna inventa coreografía:

1. **La frontera se corre hasta después del cierre.** Si en la frontera el aplicador está fuera (se destapó, se sacó, o se aplicó CON el cuentagotas) y más adelante el corte lo cierra, la frontera pasa a después de ese cierre: abrir, aplicar y cerrar quedan en el MISMO clip. Un cierre real siempre gana a la proporción.
2. **Si el corte nunca lo cierra, se cierra al final del fragmento que lo abrió** (*"vuelve a poner el cuentagotas en el envase y lo cierra"*). Es la única línea sintética, y es una necesidad física, no un gesto inventado: el fragmento siguiente arranca con el envase cerrado en la mano porque eso es lo que el original muestra cuando la otra mano trabaja sobre la cara — y porque el forense debió decirlo (ver la regla nueva abajo). Solo se dispara en **3 de 111 lotes** de la base.
3. **Cada fragmento que no es el primero ABRE con el estado, y cada uno que no es el último CIERRA con él.** Apertura: el último estado de manos declarado antes (*"Sujeta el frasco con la mano derecha"*), *"el envase está cerrado, con el cuentagotas dentro"* (si alguna vez se abrió), *"la mano izquierda está libre"* (derivada de la mano que sostiene — nombrada, nunca "la mano libre" a secas) y *"el producto ya está sobre la piel desde el inicio"* (si hubo transferencia antes y este fragmento no dispensa). Cierre: *"termina con el envase en la mano derecha, cerrado"*. Es el `START STATE` / `END STATE` del candado V2, pero solo en las FRONTERAS de lote y solo con lo que el forense dijo — que es donde un estado declarado es un dato y no una cuota.

**Entre dos fragmentos del MISMO corte que caen en el MISMO lote ese andamiaje se quita al emitir** (`esAndamioDeFrontera`): dentro de un clip continuo no se "termina" ni se vuelve a abrir el estado. Solo tiene sentido entre lotes, que es donde no hay memoria.

**La contraparte en el FORENSE, subida al titular de las manos** (paso caro, solo análisis nuevos): *"Y CIERRA DICIENDO DÓNDE QUEDÓ CADA PIEZA QUE SALIÓ DEL ENVASE —de vuelta en el frasco, en qué mano, o fuera de cuadro— y con qué termina cada mano"*. El corte 3 de `00471f8a` decía *"aplica una gota con el cuentagotas en la izquierda; extiende con las yemas"* y nunca dónde terminó el cuentagotas: con la regla, el cierre sintético deja de hacer falta.

✅ **Medido sobre las 26 sesiones (lectura pura):** 111 lotes (los mismos), MAX 3.941 de 4.096 (sin mover), **8 lotes** llevan andamiaje de frontera y 3 cierre sintético. Sobre la sesión reportada, el lote 2 emite *sujeta con la derecha → aplica con el cuentagotas → vuelve a ponerlo y lo cierra → termina con el envase cerrado en la derecha*, y el lote 3 abre *cerrado en la derecha, izquierda libre, suero ya puesto → extiende con las yemas*. Es exactamente la secuencia que pidió el dueño del repo. ⚠️ **Sin render**: lo medido es el prompt; que grok honre *"el envase está cerrado"* es la hipótesis, y se comprueba re-renderizando los lotes 2 y 3 de esa sesión.

🔴 **EL DISEÑO ESTRUCTURAL: HECHOS CON TIEMPO Y COBERTURA TOTAL, CORTE POR TIEMPO EN ESTADO CERRADO, Y LA CÁMARA NUNCA SE SUPONE (2026-09-07, decisión del dueño del repo: "sí, completo").** Con la frontera cerrada puesta, el lote 2 salió bien y el lote 3 siguió mal (cámara en desplazamiento sobre un original fijo, el frasco flotando al cambiar de mano, la mano mostrada con suero, el frasco a cámara en un momento que el original tiene en otro). Su lectura, literal: *"la idea no es ir puliendo detalle a detalle… debemos solucionar el tema de estructura"*. Y los cuatro defectos son UNO: **grok rellena cada segundo que el prompt no cubre** con su prior de anuncio de skincare, y el pipeline le dejaba huecos por tres puertas. Ninguna de las tres depende del video.

1. **`Corte.hechos` — cada hecho con `desde`/`hasta` en segundos desde el inicio del corte, y los hechos CUBREN el corte entero, incluida la quietud declarada** (*"sostiene el frasco a la altura del pecho con la derecha y habla a cámara", 4.0–10.0*). `accion` se DERIVA de la lista (`normalizarHechos`), así que todo lo que la leía (plantilla, FASE 3, `muestraPersona`, el reparto viejo) sigue funcionando y un análisis anterior —sin `hechos`— se comporta como siempre. Schema: `hechos: z.array(HechoSchema).catch([])` (en el `required`, infalible, sin `null` donde escaparse — la lección de `micro`), y las casillas `.catch(0)`/`.catch('')`. `normalizarHechos` ordena, recorta a la ventana del corte, **corrige los tiempos contados desde el inicio del VIDEO** (el modelo lo hace a veces: si el último `hasta` se pasa y restando el inicio del corte entra, se resta) y **rellena los huecos con el último estado de manos declarado + "y habla a cámara"**, logueándolo: es la lectura más conservadora posible, no un gesto inventado. ⚠️ Un estado que además es un EVENTO (*"sostiene el frasco con la derecha y APLICA una gota"*) NO se hereda como estado (`EVENTO` en `esEstadoDeManos`): heredarlo repetía la aplicación en el clip siguiente.
2. **`trozosPorTiempo` — el corte de una toma larga es por TIEMPO y en ESTADO CERRADO.** Los puntos de corte legales siguen siendo los fines de frase de la locución (un clip no parte una frase), cada uno en un instante proporcional a sus caracteres; se toma la frontera **más lejana que entra en 15 s Y cuyo instante es un estado cerrado** (`aplicadorFueraEn`: el aplicador dentro del envase y sin una apertura a medias); si ninguna lo es, la más lejana que entra, y `andamiar` cierra el envase ahí (la regla anterior). `repartirPorTiempo` le da a cada fragmento los hechos cuyo punto medio cae en su ventana, y **un hecho SOSTENIDO que cruza la frontera se arrastra al fragmento siguiente** (masajea 18 s, sostiene y habla); un EVENTO (sacar el aplicador, cerrarlo) ocurre una vez, donde cae su punto medio. Sin ese arrastre el corte 4 real de `00471f8a` —dos hechos, el segundo de 18 s— dejaba el segundo fragmento en *"sin gesto nuevo"* mientras el original sigue masajeando. Se usa solo cuando los tramos de FASE 3 y los hechos del forense cuentan lo mismo (se emparejan por índice: el texto es el reescrito, con el producto renombrado; la ventana es la del forense); si no, cae al reparto proporcional de siempre. `groupIntoLotes(tomas, cortes)` recibe los cortes por `tiempoOriginal`, nunca por `n`, y `Section6Lotes` pasa los mismos a la vista previa para que cuente los mismos lotes que el servidor.
3. **La cámara nunca se supone.** El forense declara `camara` **empezando por el movimiento** (*fija / en mano / paneo / zoom / desplazamiento*) y después el encuadre; `buildLotePrompt` solo agrega el micro-temblor si la cámara dice *"en mano"* (antes lo agregaba por defecto y con "fija" al lado eran dos órdenes opuestas; en la base **0 de 111 lotes** lo llevan ahora, porque ningún forense anterior dice "en mano" — correcto: no se sabe), y **sin dato la línea CÁMARA no se emite** (`camaraDeLote` con fallback vacío) para que la imagen decida.
4. **Sin relleno.** Una línea en el prompt: *"Entre hechos sostiene lo que tiene y sigue hablando; ningún gesto fuera de la lista."* Con los hechos cubriendo el clip, la quietud ya viene declarada; la línea es la contraparte. Se suelta en el escalón corrido (el piso del presupuesto), donde lo que manda es entrar. **Huella v7 → v8.**

**Los tiempos se usan para CORTAR, no van en el prompt**: está medido (12 renders del candado V2) que las ventanas de tiempo en el prompt no mejoran la ejecución en grok, y el prompt que ejecutó la coreografía no las lleva.

✅ **Medido antes de escribir nada: corpus (26 sesiones, lectura pura): 111 lotes (los mismos), MAX 3.970 de 4.096, 0 lotes con temblor, 1 sin línea de cámara (el que ya caía al fallback), 1 sin bloque de producto (el montaje de ropa).** Los análisis guardados no traen `hechos`, así que ahí el reparto es el de siempre; la cobertura y el corte por tiempo alcanzan solo a análisis NUEVOS.

✅ **Y el forense NUEVO cumplió el contrato a la primera corrida real** (`scripts/probe-forense-hechos.ts`, una llamada de video, sin escribir): sobre el original de `00471f8a`, **5 de 5 cortes con hechos**, ventanas que cubren cada corte de punta a punta con **0 rellenos**, y la cámara empezando por el movimiento en los 5 (*"Fija, plano medio corto, frontal"*, *"Zoom in rápido, primer plano del producto"*). El corte 4 (20 s) volvió como *0–2 s aplica con el gotero* → *2–20 s se aplica con los dedos, sosteniendo el frasco con la derecha*: exactamente la estructura que el dueño del repo pidió (lote 2 abre, aplica y cierra; lote 3 con el frasco cerrado en la mano, masajea). ⚠️ Lo que el forense NO hizo ni con la regla en titular: decir dónde volvió el gotero — el cierre sintético sigue haciendo falta. ⚠️ `n = 1`, y **ningún render verificó la ronda**: lo medido es el prompt.

⚠️ **Y EL FORENSE ES ESTOCÁSTICO EN LA GRANULARIDAD, ASÍ QUE HAY DOS DEFENSAS.** El segundo sorteo sobre el MISMO video devolvió **un solo hecho por corte** con varias cláusulas adentro (*"retira el gotero, deja caer una gota y vuelve a insertarlo", 0–3.4*) y el corte 4 de 20 s sin decir dónde queda el frasco. (1) **`expandirHechos`** (lotes.ts) parte un hecho con varias cláusulas en una por cláusula repartiendo su ventana en proporción a los caracteres — la misma suposición proporcional del reparto sin tiempos, aplicada dentro del hecho — para que el corte por tiempo no se apague justo en los cortes largos. (2) **`probe-forense-hechos.ts --write` no persiste un análisis con un corte de más de 8 s y un solo hecho** (la firma del colapso): vuelve a tirar, hasta tres veces. El tercer sorteo pasó: dos hechos en cada corte largo, el gotero de vuelta al frasco en los cortes 1 y 4, y el frasco con mano en los 5. **Es el que quedó escrito en `00471f8a`**; el guion de esa sesión está DESINCRONIZADO hasta re-extraer la plantilla y re-adaptar en el wizard. ⚠️ El guard vive en la sonda y no en `analyze-reference`: ahí un reintento automático es una llamada de video pagada por el hub sin que el usuario lo sepa, y es decisión de costo del dueño del repo.

🔴 **Y EL PRIMER RENDER DEL DISEÑO ESTRUCTURAL DESTAPÓ LA SEGUNDA FIRMA: LA TRAYECTORIA SIN EVENTO (2026-09-07).** Con el forense nuevo, el reparto nuevo y el guion re-adaptado, el dueño del repo: *"está casi perfecto, solo que el lote 1 no abre con el avatar echándose el serum con el gotero en la mejilla, solo lo destapa y lo vuelve a tapar"*. El render es fiel al prompt: el corte 1 del sorteo persistido decía *"la mano derecha sostiene el cuentagotas sobre la mejilla"* → *"vuelve a introducir el cuentagotas en el frasco"* — la trayectoria de la mano SIN el evento de la gota, el defecto que este documento ya tiene medido y cuya regla en titular no alcanzó en ese sorteo (en el primero sí venía *"aplica una gota en la mejilla izquierda"*). **`defectosDelForense` (lotes.ts) lo caza en código**: un corte donde el aplicador SALE (`esApertura`) y VUELVE (`esCierre`) sin que el producto llegue al cuerpo (`esTransferencia`) es un sorteo que no se acepta, igual que el colapso a un hecho. Lo usan la sonda (hasta 3 tiradas) **y la ruta `analyze-reference`, que vuelve a tirar UNA vez (`FORENSE_REINTENTOS = 1`) y se queda con el sorteo con menos defectos** — es una llamada de video pagada por el hub (centavos) contra un render entero pagado por el usuario (~$1) que sale con la apertura mal. De paso `esCierre` reconoce *"vuelve a introducir/insertar"* y *"cierra el cuentagotas"*, y `esTransferencia` reconoce *"lo aplica en su mejilla"* sin nombrar el producto — las formas reales de los sorteos. Un análisis anterior a los hechos no se juzga.

⚠️ **EL GUARD TAMBIÉN LLEVA EL REPARTO DEL DIÁLOGO (`verificarDialogos`, portado de la rama maestro), y hacía falta:** el cuarto sorteo pasó el guard de entonces con dos frases en una ventana de 4 s (43 car/s, que `repairCutTiming` tapa inflando el corte) y la línea de la marca repetida en dos cortes. Tres chequeos, ninguno un juicio: diálogo repetido entre cortes, la suma de los diálogos que no reconstruye `guionOriginal` (tolerancia 10 %), y diálogo que no entra en su VENTANA.

⚠️ **Y EL COLAPSO SE JUZGA DESPUÉS DE `expandirHechos`.** Con el guard estricto, tres sorteos seguidos cayeron por "corte largo con un solo hecho" cuando ese hecho traía tres acciones separadas por *"posteriormente"* / *"finalmente"* — que el reparto ya parte. Los conectores de secuencia (*luego, después, entonces, posteriormente, finalmente, a continuación, seguidamente*) y el reflexivo (*"se toca"*) entran en `partirEnTramos`, y un hecho de tres acciones cuenta como tres. **Cinco sorteos en total sobre el mismo video para conseguir uno que pase**: el forense es tan estocástico en la estructura como en la lateralidad. La sonda conserva el MEJOR (menos defectos) y solo con `--force` lo escribe con defectos; la ruta se queda con el mejor de dos. El quinto es el que quedó en `00471f8a`, y abre con *"saca el cuentagotas con la izquierda, lo aplica en su mejilla derecha"*.

🔴 **EL SEGUNDO RENDER DEL DISEÑO DESTAPÓ LA TERCERA FIRMA: EL CONFLICTO DE MANOS (2026-09-07).** Reportado sobre la sesión `493a486d`: *"el frasco desaparece en el lote 3 cuando masajea, y en el lote 4 es de color celeste"*. Leído el prompt: el lote 3 decía *"sostiene el frasco con la derecha, cuentagotas con la izquierda"* → *"masajea… con ambas manos"* — las dos manos ocupadas y las dos masajeando, el frasco no tiene adónde ir. Y el lote 4 arrancaba sin decir en qué mano está el frasco, porque el forense escribió *"con la derecha"* sin la palabra "mano" y `esEstadoDeManos` la exigía: sin frasco declarado, grok inventa uno cuando reaparece, del color que quiere. Dos arreglos: **`esEstadoDeManos` acepta "con la derecha / izquierda"**, y **`conflictosDeManos` es la regla 4 de `defectosDelForense`**: sigue qué sostiene cada mano (formas finitas y gerundios: *sostiene / sosteniendo el frasco con la…*, *cuentagotas con la izquierda*, *con ambas manos*), qué la libera (el cierre del aplicador; *deja / suelta / apoya el frasco*; *fuera de cuadro*), y marca una acción corporal (*masajea, extiende, toca, gesticula, señala, aplica*) hecha *con ambas manos* o con la mano ocupada — *aplica con el cuentagotas en esa mano* es su uso, no un conflicto. ⚠️ **La mano de la acción es la que va DESPUÉS del verbo y dentro de SU cláusula**: la primera versión leía la primera "con la mano" del tramo y rechazaba *"sostiene el frasco con la izquierda y se toca el mentón con la derecha"* (dos falsos positivos reales, uno con gerundio: *"masajea con las yemas, sosteniendo el frasco con la mano izquierda"*). **Y la sonda guarda en disco la mejor tirada** (`$TMPDIR/forense-<sesión>.json`, `--desde` la re-juzga sin llamar al modelo): un falso positivo del guard le costó a esta ronda una tirada buena perdida. Sobre `493a486d` hicieron falta 3 tiradas más; la que quedó abre con la gota y masajea *"con los dedos de la mano izquierda, sosteniendo el frasco con la derecha"*. Corpus tras aceptar "con la derecha" como estado: 116 lotes (27 sesiones), MAX 3.970, sin cambios.

⚠️ **Lo que NO se tocó:** el lenguaje del prompt (español contra un modelo *English only*; sigue siendo la palanca sin medir más barata), la densidad por lote, y el motor.

✅ **LOS N CLIPS SE PEGAN EN UN SOLO MP4 — RESTAURADO DE `main` (2026-09-07, `concat.ts` + ruta `concat` + botón «Descargar los N clips en un video»).** El reinicio lo había borrado con la era de Wan. Vuelve byte a byte lo que ya estaba medido: `-c copy` sin re-encode (los clips de grok salen con parámetros idénticos), el `-map 0:v:0 -map 0:a:0` obligatorio (los mp4 de grok traen un tercer stream `mjpeg` y un concat mal mapeado da un archivo corrupto, no un error), `+faststart`, y las DOS líneas de `next.config.ts` (`serverExternalPackages` por el `__dirname` reescrito a `/ROOT`, y `outputFileTracingIncludes` porque el binario es un archivo de datos que ningún `require` menciona — sin ellas el síntoma es un `ENOENT` solo en producción). No gasta cuota ni llama a ningún modelo; no persiste nada (el mp4 va en el cuerpo del POST y la UI descarga desde un blob; `X-Clips-Faltantes` dice si va incompleto). El test corre el ffmpeg REAL sobre mp4 de verdad y exige exactamente dos streams: con `spawn` mockeado pasaría igual con el bug puesto. `ffmpeg-static` seguía en `package.json` sin ningún lector; vuelve a tener uno.

🔴 **LA ACCIÓN VA PRIMERO Y EL ESTADO DESPUÉS; EL CIERRE VA PEGADO A LA APERTURA; Y LA GOTA SE EXTIENDE (2026-09-07, tercer reporte sobre `493a486d`).** Tres observaciones del dueño del repo con los prompts REALES al lado:

1. **Lote 3 empezaba echándose suero en la mano sin destapar el frasco, y masajeaba después.** El prompt abría con CUATRO líneas de estado (*sostiene el frasco con la derecha · el envase está cerrado · la izquierda libre · el producto ya está sobre la piel*) y recién en la quinta *"masajea la mejilla"*. Está medido sobre grok que lo escrito al principio ocurre al principio del clip: llenó ese arranque con un gesto de "preparar" producto, y *"cerrado"* sí lo obedeció (por eso no destapó). `andamiar` emite ahora **la acción sostenida primero y el contexto detrás** cuando el fragmento arranca a mitad de una acción; si arranca con un EVENTO (destapa, aplica) el estado se queda delante, porque describe lo que hay antes del evento.
2. **Lote 2 decía *aplica con el cuentagotas en la izquierda → masajea con los dedos de la izquierda → vuelve a poner el cuentagotas*** — la misma mano masajeando con el gotero todavía en ella. El cierre sintético se insertaba al FINAL del fragmento; ahora va **justo después del último hecho que dejó el aplicador fuera**, que es el orden físico del original (cierra, y recién entonces la mano libre trabaja).
3. **Lote 1 no masajeaba después de la gota, porque el forense no lo escribió**: corte 1 termina en la gota y el corte 2 abre con *"sostiene el frasco frente al pecho con ambas manos, señalando la etiqueta"*; el original extiende con las yemas a los 3,3 s. Es un hecho que el modelo se saltó y ningún guard exigía. Regla en el titular de la transferencia (*"lo que cae sobre la piel se extiende: el hecho siguiente dice con qué mano lo trabaja, aunque caiga en el corte siguiente"*) y **guard determinista** en `defectosDelForense`: tras una transferencia sobre una zona de la PIEL, el siguiente hecho —saltando cierres del envase y estados puros de manos, y mirando el corte de al lado si hace falta— tiene que ser de extensión (`esExtension`, vocabulario cerrado: masajea, extiende, esparce, difumina, frota, movimientos circulares, toques; `toca`/`presiona` solo con zona). Lo que cae en un vaso o una cuchara no se juzga; la última gota del video, sin nada detrás, tampoco.

**Lo que NO se tocó: el color del producto entre lotes.** Los cuatro prompts llevan el mismo bloque de producto e `Image2`; que varíe *ligeramente* entre clips es sorteo del modelo (el bloque arregló el color EQUIVOCADO, no la variación fina). La palanca es re-tirar el lote con el botón, o el motor.

**Y DOS FALSOS POSITIVOS DEL GUARD, cazados al re-tirar el forense de esa sesión (6 tiradas):** (a) `conflictosDeManos` leía *"aplica una gota con el cuentagotas **y sostiene** el frasco con la derecha"* como la derecha aplicando — la coordinada `y sostiene/sujeta/mantiene` parte ahora la cláusula, como ya lo hacían `mientras` y `sosteniendo`; (b) el chequeo de ritmo por ventana rechazó **la tirada limpia** (gota → *"extiende la gota sobre la mejilla con las yemas de la mano izquierda"* a los 2,5–3,8 s, exactamente lo que el original hace) por 129 caracteres en *"6 s"* = 21,5 car/s: `tiempo` viene en segundos ENTEROS y el corte medía 6,2. Ahora la estimación fina del corte vale hasta el error de redondeo (+1 s, no más: más allá sería dejar que el modelo se apruebe solo) y el techo lleva la misma holgura del 10 % que la suma del guion — lo que se caza es el corte MAL PARTIDO (30, 41 y 64 car/s en esas mismas tiradas), no lo que `repairCutTiming` arregla con décimas. Esa tirada quedó escrita en `493a486d`.

⚠️ **`scriptFingerprint` v8 → v9**: cambia el ORDEN emitido con los mismos insumos. ⚠️ **Sin render**: lo medido es el prompt. Y el guard nuevo es del paso caro — solo alcanza a análisis NUEVOS; la sesión reportada se re-analizó con el probe.

✅ **BOTÓN «RENDERIZAR DE NUEVO SOLO EL LOTE N» (`rerender-lote/route.ts`, 2026-09-07).** Hasta acá, corregir UN clip malo costaba el video entero: la huella es de la sesión completa y "generar otra versión" re-renderiza los N lotes (el lote 3 de arriba se rehizo con un script a mano). Ahora cada tarjeta de lote terminado (éxito o fallo) tiene su botón. La ruta reconstruye el lote con **los mismos insumos que `generate-lotes`** —`insumosDeRender` y `promptDeLote` se extrajeron a `render-lotes.ts` justamente para que haya UNA fuente: mismo prompt, misma huella, y lo único que cambia es el sorteo del modelo—, crea la tarea con la key del USUARIO, escribe solo `lotes[i]` (los hermanos conservan clip y huella) y deja que el sondeo de `lote-status` recoja el estado, copie el mp4 al bucket y reconcilie `render_done`. ⚠️ **No pasa por el gate per-video** (`video-generation`): no es una generación nueva, es un clip suelto pagado por el usuario; lo que sí aplica es el backstop diario global y se registra `video-render` para que el costo se vea. ⚠️ **Exige que el reparto coincida con lo guardado** (misma cantidad de lotes): si el guión cambió y ahora salen otros lotes, un clip suelto no tiene a qué hermanos pegarse — 409, y ahí es "generar de nuevo". Un lote todavía en vuelo no se duplica (409). Con test de ruta (4 casos).

⚠️ **Costo cero y sin bump de huella, medido:** el número de lotes no cambia en ninguna de las 25 sesiones, el MAX de prompt sigue en 3.941, y `accionVisual` es insumo de la huella, así que las sesiones afectadas cambian de huella solas (6 lotes de la base) y las demás la conservan. ⚠️ **Consecuencia para la sesión reportada:** su huella cambia, así que reanudar NO es gratis — un "generar de nuevo" re-renderiza los cuatro lotes. Re-renderizar solo el lote 3 hoy es a mano. ⚠️ Ningún render verificó el parche.

**Huella `scriptFingerprint` v6 → v7.** Presupuesto tras los cinco: mediana 1.815 · p90 2.902 · MAX 3.941 de 4.096; **un solo lote** (el 1 de `430c5961`, el montaje de ropa de 29 cortes, nicho hoy bloqueado) suelta el bloque de producto por el plano por toma — estaba a 15 caracteres del tope.

⚠️ **Lo que NO se tocó, y por qué:** el estado de las manos entre tomas (la regla ya está en el forense como titular; el 93 % del corpus es forense ANTERIOR a ella — es re-analizar, no código, y derivar el estado parseando prosa sería inventar coreografía); el movimiento del ENTORNO (solo 11 de 258 cortes lo nombran: `accion` pide el cuerpo; es una cláusula más en el prompt del forense, paso caro, y sin medir que grok la honre); la densidad (p90 12 hechos por lote, máx 36, contra los 2-4 que grok ejecuta: cerrar por número de hechos cuesta lotes); y el idioma del prompt (español contra un modelo documentado *English only*; el render que ejecutó la coreografía en la otra rama llevaba los campos visuales en inglés — **es la palanca sin medir más barata: un A/B de 2 draws**). ⚠️ **Ningún render verificó esta ronda.**

🔴 **EL NÚMERO QUE SE DICE ES EL NÚMERO QUE SE VE (2026-09-08, reportado sobre `c32d229a`).** El dueño del repo, sobre una listicle de "tres razones": *"los renders se equivocan al hacer un gesto con la mano de conteo, mientras el avatar dice el número — dice 1, hace 2 con la mano, dice 2, hace 3"*. La causa es la de siempre por otra puerta: **la locución enumera, el prompt no dice cuántos dedos, y grok rellena el hueco con su prior** — un presentador que dice "número uno" levanta un dedo, y el modelo lo hace le pida el prompt o no.

⚠️ **LA MITAD DEL TRABAJO FUE DESCARTAR LA HIPÓTESIS BONITA, Y SALIÓ GRATIS.** La primera lectura era que el numeral del rótulo `Toma N` —que la plantilla imprime justo encima de la locución, con numeración GLOBAL al video— era el que se colaba, porque el desfase cuadraba exacto: `Toma 2` decía *"Número uno"*, `Toma 3` decía *"Número dos"*, `Toma 4` decía *"Número tres"*. Es la misma clase que el `"Toma 1:"` que ya se colaba DENTRO de la locución y se pronunciaba. **Es falsa**, y lo dice un fotograma del propio lote 1: ahí el rótulo y la palabra apuntan en direcciones OPUESTAS (`Toma 1` sobre *"**Tres** razones para tomar…"*) y no hay ningún conteo; y en la toma 2 (`Toma 2` sobre *"Número **uno**"*) tampoco aparece la mano en 19 fotogramas a 3 fps. Cambiar la plantilla y bumpear la huella por eso habría sido gratis en el mal sentido. **Antes de tocar el prompt, buscá el fotograma donde las dos hipótesis predicen cosas distintas.**

⚠️ **Y EL DEFECTO EXACTO NO SE REPRODUCE: lo que hay es peor de describir y el mismo de arreglar.** Revisados los tres clips de esa sesión fotograma a fotograma, **el gesto de la mano libre no tiene NINGUNA relación con el número dicho** — en *"número dos"* abre la palma entera, en *"número tres"* curva los dedos, y en *"número uno"* no saca la mano. El *"+1"* del reporte es lo que el ojo lee de un gesto arbitrario; no lo escribas acá como medido.

⚠️ **LO QUE SÍ ESTÁ MEDIDO, Y ES EL HALLAZGO: el estado declarado PERDIÓ contra el número hablado.** El prompt de la toma 3 dice literal *"la mano izquierda permanece fuera de cuadro"* y el render gesticula con esa mano igual. O sea la asimetría que este documento ya usa para el estado de las manos vale también acá y en la dirección incómoda: **una cantidad declarada es un dato, pero un estado declarado no frena un gesto que el AUDIO está pidiendo.** Por eso no se arregla prohibiendo el conteo — se arregla poniéndole el número correcto al que va a ocurrir.

**`numeroEnunciado` (lotes.ts) deriva la cantidad de las palabras que el avatar ya está diciendo**, así que no inventa coreografía: vocabulario CERRADO de formas de ÍTEM —el sustantivo ANTES del número (`número dos`, `razón tres`, `paso 3`) o un ordinal al abrir cláusula (`Segundo,`, `Y tercero,`)— y **nunca un numeral pelado**. Tope 5, que es lo que se cuenta con una mano. La línea se emite ÚLTIMA, pegada a la locución que contiene el número: `levanta dos dedos con la mano izquierda`.

⚠️ **EL GATE ES LA ENUMERACIÓN Y NADA MÁS, y la primera versión hacía exactamente lo contrario de lo buscado.** Condicionaba además a que el forense declarara un gesto vago de la mano libre — y sobre los datos reales eso se invierte: la toma 2 (*"señala al frente"*, o sea CON gesto) es la que salió bien sin conteo, y la toma 3 (*"permanece fuera de cuadro"*, o sea SIN gesto) es la que produjo el defecto. El gate le habría agregado el conteo a la toma sana y se lo habría saltado a la enferma. **Lo que el forense dijo de la mano no predice lo que la mano hizo.**

**Tres fail-safes, cada uno por un modo de fallo distinto:** sin mano libre que NOMBRAR no se emite nada (*"la mano libre"* a secas no describe nada, y es el término que el forense tiene prohibido por nombre); con `ambas manos` tampoco (no hay mano libre); y si la mano libre ya tiene una PIEZA declarada tampoco, porque ahí contar con ella pediría una tercera mano — el defecto de al lado. Y hubo un CUARTO que se borró en la ronda siguiente: la cantidad y *"permanece fuera de cuadro"* sobre la MISMA mano son dos órdenes opuestas en el mismo prompt, y esta ronda lo resolvió quitando la CLÁUSULA (`sinManoFueraDeCuadro`) — al revés de lo correcto. **Esa función ya no existe**: ver la ronda de abajo, donde la mano fuera de cuadro pasa a apagar el conteo y la cláusula se queda.

✅ **Medido con `scripts/probe-conteo.ts`** (lectura pura de la base, cero LLM, cero renders, no escribe): **27 sesiones · 117 lotes · 187 tomas · 15 que enumeran · 4 con conteo emitido · MAX 3.970 de 4.096 (sin moverse)**. Sobre la sesión reportada, **3 de 3 ítems contados** (`un dedo` / `dos dedos` / `tres dedos`), la cláusula contradictoria de la toma 3 eliminada, y **los dos falsos positivos rechazados**: *"**Tres** razones para tomar"* (anuncia la lista, no es un ítem) y *"tomar **cinco** gramos al día"* (numeral en el CTA). Esas seis locuciones son el fixture del test: si alguien afloja el vocabulario a un numeral pelado, el CTA sale levantando cinco dedos.

⚠️ **4 de 15 es el techo conocido y está nombrado en el código.** Las 11 que faltan se parten en dos: unas no tienen ninguna mano que nombrar (*"Entre los segundos 0:05 y 0:06."*) y otras la nombran a mitad de frase (*"La mujer sostiene la botella con la izquierda"*, *"inicia el video sosteniendo…"*), donde `esEstadoDeManos` —anclado al ARRANQUE del hecho— no llega. **NO se afloja ese detector**: lo leen también el reparto, el andamiaje de frontera y los dos guards del forense, y este documento ya avisa que se amplía agregando palabras, no aflojando patrones. El upgrade, si hace falta cobertura, es una lectura propia (la mano que va después del verbo de sostener, dentro de SU cláusula, como ya hace `conflictosDeManos`) más un guard que no pise una mano libre con acción declarada.

⚠️ **La mitad del FORENSE se evaluó y se descartó, a propósito.** Pedirle que diga cuántos dedos levanta no aporta nada que la locución no tenga —*"número dos"* son dos, siempre— y como grok cuenta igual de lo que oye, su respuesta tampoco cambiaría la emisión; encima solo alcanzaría a análisis NUEVOS y sería otra regla en el bloque de `accion`, cuyo titular de la transferencia sí tiene medición detrás. Si algún día se quiere que el corpus REGISTRE si el original cuenta, ahí sí.

⚠️ **`scriptFingerprint` v9 → v10**: cambia el texto emitido con los mismos insumos, que es justo lo que una huella de insumos no ve. ⚠️ **Ningún render verificó esta ronda**: lo medido es el prompt.

🔴 **UNA MANO FUERA DE CUADRO NO ESTÁ LIBRE: EN UN UGC EN SELFIE SOSTIENE EL TELÉFONO (2026-09-08, mismo reporte, segunda ronda).** Con el conteo ya cableado, el dueño del repo revisó el ORIGINAL y encontró la premisa rota: *"en ningún momento usa su mano izquierda para contar, porque la tiene ocupada sosteniendo el celular con el que está grabando… en los renders es un video estático y tiene ambas manos libres, en el original tiene todo el tiempo el producto en la mano derecha y graba con el celular con la izquierda mientras se desplaza ligeramente por el ambiente"*. `manoLibre` deriva *"la izquierda está libre"* de que la derecha sostenga el producto, y eso es falso para todo el formato selfie — que es el formato de la mayoría del UGC.

⚠️ **EL FORENSE SE CONTRADICE DENTRO DE LA MISMA SESIÓN, Y LA MITAD CIERTA ES LA PALANCA.** En `c32d229a` los cortes 1, 2, 3 y 6 dicen que la izquierda queda *"fuera de cuadro"* y los cortes 2, 4 y 5 le atribuyen gestos a esa misma mano (*"señala al frente"*, *"gesticula"*, *"movimientos gestuales con la mano izquierda libre"*). **Una mano fuera de cuadro no se puede observar gesticulando**: lo que se mueve es el ENCUADRE, porque ella camina con el teléfono. Además el forense declara *"Cámara fija"* en **6 de 6 cortes** de un video grabado en mano.

**`manosFueraDeCuadro` (lotes.ts) lo cierra en código, y repara las sesiones YA guardadas** (no hace falta re-analizar). Lectura por ORACIÓN y hacia atrás: la mano nombrada más cerca ANTES de *"fuera de cuadro"*, sin un objeto de por medio. Así no marca *"baja la botella fuera de cuadro con su mano derecha"* (el objeto, y la mano nombrada después) ni *"mirando hacia la derecha fuera de cuadro"* (una dirección, sin la palabra mano). Verificado contra los **23 hechos** de la base que dicen "fuera de cuadro", que son los dos casos por mitades.

⚠️ **EL ALCANCE ES EL VIDEO ENTERO, NO EL CORTE, Y LO DECIDEN LOS DATOS.** Por corte, en la sesión reportada se mataría el conteo de la toma 3 (*"permanece fuera de cuadro"*) y **sobrevivirían los de las tomas 2 y 4**, que son los que dicen *"gesticula con la izquierda"* — o sea justo la mitad equivocada de la contradicción. La mano que sostiene la cámara no vuelve a estar libre a mitad del video. `insumosDeRender` mide sobre TODOS los lotes y pasa el resultado a `buildLotePrompt`, que lo une con lo que declare su propio lote: sin esa segunda mitad, un caller que omita el parámetro volvería a contar con una mano que su propio prompt manda fuera de cuadro.

⚠️ **Y `sinManoFueraDeCuadro` SE BORRÓ: borraba una observación CIERTA.** Quitaba del prompt la cláusula *"la mano izquierda permanece fuera de cuadro"* para que no contradijera al conteo — premisa correcta (dos órdenes opuestas en el mismo prompt), resolución al revés: **la cláusula gana**. Con el gate puesto no le queda ningún caller con efecto (toda forma que su regex contiguo cazaba la caza también `manosFueraDeCuadro`, que apaga el conteo antes).

✅ **Medido sobre la base con `probe-conteo.ts` (lectura pura, cero LLM, cero renders): 28 sesiones · 120 lotes · 193 tomas · 18 que enumeran · conteo emitido 7 → 3 · prompt MAX 3.970 sin moverse.** Los 4 que se van son los 4 defectuosos y están nombrados: **3 de `c32d229a`** (la sesión reportada) y **1 de `ee48f801`**, cuyo forense dice *"La mano izquierda permanece relajada a su costado, fuera de cuadro"* — el mismo defecto en otra sesión, que nadie había mirado. Los 3 que quedan son de `2b69d547`, la única que emite conteo y **no declara ninguna mano fuera de cuadro en ningún corte**.

⚠️ **`2b69d547` ES EL LÍMITE HONESTO DEL ARREGLO EN CÓDIGO, y conviene saberlo:** es un re-análisis del MISMO video original, y su forense nunca dice "fuera de cuadro" — dice que la izquierda gesticula. El código repara lo que el forense DECLARA; que el forense deje de leer un selfie como un plano fijo con las dos manos libres es el paso CARO y **solo alcanza a análisis NUEVOS**.

**La contraparte en el FORENSE, en los dos sitios donde se declara cada campo** (que es la única ubicación con medición detrás, cuarta vez que este documento lo registra):
1. **En `camara`**: se borró el cierre *"un UGC grabado con el teléfono apoyado es fijo"* —le daba al modelo el caso apoyado como el paradigma del formato y nunca nombraba el selfie— y se nombran **las dos** formas de grabar un UGC: teléfono APOYADO → cámara fija; SOSTENIDO por la persona que habla → el cuadro se mueve con su cuerpo, y eso es *"en mano"*, nunca *"fija"*. Con el aviso explícito de que "fija" es el default de un video hecho con IA y no se escribe por descarte.
2. **En el titular de las manos**: si la persona se graba a sí misma, una de sus manos sostiene el teléfono, está ocupada y fuera de cuadro TODO el video (se dice en el primer corte y no se vuelve a usar), y **una mano fuera de cuadro no se describe gesticulando** — si lo que se mueve es el encuadre, eso es movimiento de CÁMARA y va en `camara`.

⚠️ **Se evaluó un campo nuevo de video (`manoQueGraba`) y NO se cableó en esta ronda.** No solapa con `camara` (movimiento) ni con `hechos` (qué hacen las manos), así que no es la trampa del campo duplicado; pero solo alcanzaría a análisis NUEVOS, y lo que repara las 28 sesiones guardadas es el gate. Se agrega cuando se vaya a re-correr el forense para verificar que el prompt nuevo lee bien el selfie — con `.catch('')` dentro del `required`, nunca `.nullable().catch(null)`.

⚠️ **Y LA MISMA PREMISA ROTA LA EMITÍA OTRA LÍNEA: EL ANDAMIAJE DE FRONTERA DICE "LA MANO X ESTÁ LIBRE".** `andamiar` la DERIVA de la mano que sostiene, exactamente como `manoLibre`, así que arreglar solo el conteo dejaba el prompt afirmando con todas las letras lo que el dueño del repo dice que es falso. Medido: de las **6** veces que esa línea se emite en la base, **3 son sobre una mano que el propio video declara fuera de cuadro** (`ee48f801` ×2, `b046742e` ×1). Se filtra al EMITIR y no dentro de `andamiar`: aquella corre por corte y dentro de `groupIntoLotes`, o sea antes de que el video esté medido. Post-fix: **6 → 3 líneas, 0 choques**.

⚠️ **NO LLEVA BUMP DE HUELLA, y el número es el argumento.** Cambia el texto emitido con los mismos insumos —lo que una huella de insumos no ve—, así que el reflejo es bumpear; pero **24 de las 28 sesiones tienen lotes PAGADOS** y un bump las invalida a todas. En vez de eso `sinLibre` entra como insumo **y solo cuando existe**: una lista vacía deja el texto canónico byte-idéntico al de antes. Medido comparando los prompts y las huellas de las 28 sesiones antes y después: **el prompt cambia en 3** (`c32d229a`, `ee48f801`, `b046742e`), **la huella se mueve en 9** —las que declaran una mano fuera de cuadro— y **19 conservan las dos**. Las 6 de diferencia son over-invalidación fail-closed, contra las 28 que costaba el bump. Mismo criterio que `repartirAccion`.

⚠️ **EFECTO SECUNDARIO DEL CAMBIO EN `camara`, para que no se lea como regresión:** `buildLotePrompt` agrega el micro-temblor **solo** cuando la cámara dice "en mano", y este documento tiene medido que **0 de 111 lotes** lo llevan porque ningún forense anterior lo dice. El prompt nuevo empuja al selfie hacia "en mano", así que el primer análisis nuevo va a ser el primer prompt de este árbol que emita `Grabado con teléfono en mano, con micro-temblor natural`. Es lo buscado, y no está verificado con ningún render.

⚠️ **Y LO QUE NO SE ARREGLA ACÁ, anotado para no perseguirlo sin datos: el lote 2 de `c32d229a` empaqueta DOS conteos distintos en UN clip continuo de 13 s** (*"levanta dos dedos"* en la toma 3 y *"levanta tres dedos"* en la toma 4), y el render hizo la seña del 2 en los dos — la misma clase que *"un lote con dos encuadres se renderiza con uno solo"*. La evidencia es **n=1 y está confundida** con la mano ocupada, y el gate se lleva los dos conteos de ese lote, así que no hay nada que medir. Si algún día un video con una mano genuinamente libre emite dos conteos en el mismo lote, ESE es el caso para mirar una frontera de lote por conteo.

⚠️ **Ningún render verificó esta ronda**: lo medido es el prompt y el corpus.

🔴 **LA MANO QUE GRABA ES ESTADO DEL VIDEO, NO UN HECHO SUELTO; VESTUARIO, ETIQUETA Y SALIDA DEL PRODUCTO GANAN CANDADOS (2026-09-09, sesión `1e6835fd`).** En los tres renders de la última sesión terminada se midieron cuatro síntomas: lote 1 cambió la blusa de cuello alto por cuello V y perdió la manga izquierda, y el bote se desvaneció hacia abajo; lote 2 dejó de sostener el teléfono con la izquierda y recoloreó el logo; lote 3 cambió el teléfono de brazo. Los prompts guardados mostraron las causas. La izquierda aparecía como sostén del teléfono dentro de algunos hechos, pero nada la mantenía ocupada entre hechos ni entre lotes; peor, la toma 5 ordenaba literalmente *"gesticula con ambas manos"*. El bote negro sí estaba descrito, pero la forma y el color del logo dependían de la frase genérica *"reprodúcelos idénticos"*. La ropa dependía de la misma frase.

**`manoQueGraba` entra al `ForensicReport` como dato GLOBAL** (`derecha | izquierda | ninguna | indeterminado` en la instrucción; `z.string().catch('')` en el schema para que siga en `required` sin romper jsonb viejo). `manoQueGrabaDe` prefiere ese campo y repara sesiones guardadas leyendo solo una afirmación literal del tipo *"mano izquierda sostiene el teléfono"*; el fallback *selfie/en mano + una única mano fuera de cuadro* solo corre si no existe esa afirmación. `insumosDeRender` lo calcula una vez para todo el video. Cada prompt emite un bloque `SELFIE` y repite el estado al abrir CADA toma: la mano mantiene físicamente el teléfono fuera de cuadro de principio a fin, el brazo sigue extendido hacia la cámara y no cambia de lado. Los gestos contradictorios se reconcilian con la única mano disponible (*"gesticula con ambas"* → derecha cuando la izquierda graba), y el guard del forense vuelve a tirar un análisis nuevo que asigne un gesto a la mano de cámara.

**La bajada se vuelve una trayectoria física positiva.** Cuando un hecho dice que el bote/frasco/envase baja fuera de cuadro, el prompt agrega que la mano que lo agarra baja con él y que ambos salen juntos por el borde inferior, con el producto sólido y visible hasta salir. El detector exige una bajada explícita del objeto o de *"lo"*: no se activa en *"lleva el bote al encuadre, la izquierda sostiene el teléfono fuera de cuadro"*, falso positivo cazado por la sonda antes de cerrar la ronda.

**Dos candados visuales citan las imágenes sin redescribirlas:** `PERSONA Y VESTUARIO` conserva rostro, cabello, prenda, cuello, ambas mangas, tejido y color —también sobre el brazo que graba—; `ETIQUETA` conserva forma y color exactos del logo/wordmark, texto, tipografía y distribución, y declara el envase sólido/opaco en cada fotograma. Si una toma patológica con decenas de hechos no entra, estos dos duplicados de Image1/Image2 son el último piso que se suelta; coreografía, teléfono e integridad de piezas nunca se recortan.

✅ **Verificado sobre la sesión real por el camino de producción, lectura pura:** lote 1 ahora explicita blusa/mangas, teléfono a la izquierda en sus dos tomas y la salida conjunta de mano+bote; lote 2 repite la izquierda con el teléfono en sus dos tomas y fija el logo; lote 3 transforma *"gesticula con ambas manos"* en *"gesticula con la mano derecha"* y conserva el teléfono en la izquierda hasta el final. Corpus: 30 sesiones, 125 lotes, máximo **3.975 de 4.096** caracteres. `scriptFingerprint` v10 → v11 porque el contrato del prompt cambió con los mismos insumos. ⚠️ **Sin render nuevo:** se verificaron datos y prompts, no obediencia visual del modelo.

🔴 **CORRECCIÓN — LA CÁMARA ES ESTADO DEL CORTE, NO DEL VIDEO ENTERO (2026-09-09).** El contrato global de la ronda anterior era demasiado ancho: un video real puede alternar selfie, teléfono apoyado, operador en mano, estabilizador, desplazamientos y ángulos entre cortes. Mantener `manoQueGraba` y una sola descripción para todo el video convertía los tramos estáticos en selfie o fusionaba dos cortes consecutivos cuando sus strings de cámara coincidían. El campo global queda únicamente como compatibilidad para jsonb viejo; la fuente nueva es cada `Corte`.

**Cada corte lleva una matriz forense obligatoria:** `soporteCamara`, `movimientoCamara`, `encuadreCamara`, `anguloCamara`, `manoQueGraba` y `evidenciaCamara`. Los seis usan `.catch(...)`: siguen dentro del `required` que recibe el modelo y un análisis histórico continúa parseando. `camara` se deja vacío en la respuesta y `normalizarCamara` lo deriva de la matriz antes de persistir; una dimensión `indeterminado` se omite, nunca se rellena con un valor probable. El prompt obliga a medir cada intervalo aislado, prohíbe heredar de cortes vecinos y separa movimiento del sujeto de movimiento óptico: caminar dentro de un fondo inmóvil no es travelling, acercar la cara no es zoom y mirar arriba no convierte el eje en contrapicado. Una clasificación no indeterminada sin `evidenciaCamara` entra a `defectosDelForense` y provoca el reintento existente.

**La propagación conserva fronteras y orden.** `camaraDeLote` deduplica fragmentos del mismo corte por `tiempoOriginal`, pero ya no deduplica dos cortes distintos por tener la misma descripción. `buildLotePrompt` anuncia la matriz exacta al abrir cada corte fuente y prohíbe agregar, intercambiar o heredar soporte, movimiento, encuadre y ángulo. También se borró la inferencia *"en mano → micro-temblor natural"*: una cámara en mano puede estar estabilizada y solo el movimiento observado autoriza ese efecto. La mano del teléfono se resuelve por corte; `ninguna` o `indeterminado` local bloquea el fallback global, de modo que un corte de trípode recupera ambas manos aunque el anterior sea selfie.

✅ **Verificado sin gastar render ni LLM:** **1.194/1.194** pruebas web fuera del timeout conocido de `concat.test.ts`, TypeScript limpio y sonda de lectura sobre **32 sesiones · 134 lotes · 219 tomas**, con prompt máximo **3.948 de 4.096**. `scriptFingerprint` v11 → v12 porque cambió la plantilla y ahora incluye la secuencia de manos de cámara por lote. ⚠️ Los análisis guardados conservan su `camara` textual; la matriz quirúrgica se obtiene al volver a ejecutar FASE 1 sobre un video. ⚠️ **Sin análisis forense nuevo ni render nuevo:** está verificado el contrato, la propagación y la compatibilidad, no la obediencia visual del modelo.

🔴 **EL RÓTULO DEL FORENSE NO PUEDE GANARLE A LA EVIDENCIA FÍSICA (2026-09-09, sesión `4d2cc9b0`).** Los prompts nuevos sí habían llegado byte por byte a los tres lotes; que solo el primero pareciera correcto fue azar del render. Los siete cortes declaraban `selfie_en_mano`, `manoQueGraba=derecha` y a la vez mostraban la derecha sosteniendo/agitando el bote. Cinco declaraban la izquierda fuera de cuadro y tres además le ordenaban gesticular. El resultado era insoluble: una misma derecha debía sostener teléfono y producto, mientras la izquierda debía estar fuera de cuadro y gesticular. La misma matriz decía `movimientoCamara=fija` con evidencia de *"microtemblor solidario al brazo"*.

**La corrección tiene tres barreras.** El instructivo forense exige que `evidenciaCamara` nombre el lado y la prueba, cruza la mano del teléfono contra producto y gestos, y prohíbe llamar `fija` a un cuadro con microtemblor/deriva/desplazamiento. `defectosDelForense` vuelve a tirar el análisis si cualquiera de esos cruces falla. Después del reintento, `normalizarManosDeCamara` deja persistida la única mano físicamente posible cuando la evidencia es inequívoca; esto cubre el caso en que los dos sorteos fallan. En render, `manoQueGrabaEnCorte` repite la misma resolución para reparar jsonb histórico: en selfie, si una sola mano sostiene el producto, la contraria sostiene el teléfono. Si el forense dio un gesto a esa mano y la otra ya está ocupada con el producto, el gesto se elimina; trasladarlo a la otra mano produciría una segunda imposibilidad. La cámara canónica propaga la evidencia observable cuando el rótulo `fija` la contradice.

✅ **Sonda read-only sobre la sesión exacta:** los tres prompts guardados eran los contradictorios; los tres reconstruidos cambian. Lote 1: **3.233**, lote 2: **3.156**, lote 3: **3.562** de **4.096** caracteres. En los siete cortes la mano resuelta es la izquierda, siempre fuera de cuadro con el teléfono; la derecha conserva el bote. Los gestos izquierdos desaparecen de los cortes 3, 5 y 6 sin reaparecer en la derecha. Pasan **1.196/1.196** pruebas web fuera del timeout conocido de `concat.test.ts`, las 185 dirigidas y TypeScript. `scriptFingerprint` v12 → v13 para impedir que una reanudación mezcle clips de ambos contratos. ⚠️ **Sin nuevo análisis pagado ni render:** se validaron el informe guardado, el guard, la normalización y los prompts finales.


Genera un video ad UGC vertical (9:16) con **`grok-imagine/image-to-video` vía KIE AI**, con la API key del propio usuario (BYOK). Espeja el generador de anuncios (sesión en tabla propia + wizard de 5 pasos + `gen-quota`), con divergencias obligadas. El wizard propio tiene **7 pasos** (`lib/video-ads/steps.ts`, `STEP`, índices 0–6: `REFERENCE, PRODUCT, CHARACTER, VALIDATION, TEMPLATE, SCRIPT, LOTES`) — más que el de anuncios porque analiza una referencia, bloquea identidad/voz y reparte el render en lotes antes de poder generar nada.

**Una sola línea de entrada.** El VIDEO ORIGINAL es obligatorio: es la fuente de verdad de estructura, orden, ritmo, cámara y número de tomas (`docs/superpowers/plans/2026-08-12-video-ugc-plan-a-analisis.md`, continuado por `docs/superpowers/plans/2026-08-12-video-ugc-plan-b-generacion.md`). Los modos `character-ref`/`character-gen` originales (elegir cómo nace el personaje desde cero) se eliminaron con el recableado al PROMPT MAESTRO — sin referencia no hay ADN estructural que copiar, que es el valor de la tool. Esto NO es lo mismo que la generación de personaje de FASE 4 (ver abajo): esa sigue viva, pero como paso obligatorio dentro del flujo de referencia, no como modo alternativo de entrada.

**El índice de paso es una constante compartida (`lib/video-ads/steps.ts`, `STEP`), no un número repetido.** Las rutas que escriben `video_sessions.step`, `VideoWizard.tsx` y cada sección del wizard importan `STEP` en vez de escribir el índice a mano. Nació de un bug real: un recableado corrió "Producto" de índice 2 a 1 y "Personaje" de 3 a 2, y una ruta se quedó escribiendo el índice viejo. Al reanudar una sesión justo después de ese paso, el wizard aterrizaba en "Validación" con `validation` en null, y esa sección hace `if (!validation) return null` — pantalla en blanco, y de paso se saltaba el paso que recoge etnia y acento. `SCRIPT` (adaptación del guión) y `LOTES` (render) se agregaron al final de la misma constante cuando el PLAN B los introdujo — no hardcodeados en otro lado.

**Los INPUTS del paso "Producto" (`angle`, `problem`) se persisten en el mismo POST que analiza la foto.** `Section1Product` exige los cinco campos (producto, qué es, ángulo, público, problema) antes de habilitar "Continuar", pero solo `angle` y `problem` viajaban únicamente en el store del cliente hasta el submit del paso 2 — recargar entre pasos los perdía, y recuperarlos exigía re-subir la foto (`ready` depende de `!!file`, estado local), lo que repetía la llamada pagada a Gemini. Ahora `analyze-product/route.ts` los recibe en el mismo FormData que la foto y los persiste junto al resto (columnas de `20260812000001_video_spec_rewire.sql`).

**FASE 0 — gate de validación bloqueante.** `validation.ts` construye una matriz determinista (sin LLM: preguntar "¿el usuario entregó esto?" no necesita un modelo, y pedírselo abriría la puerta a que lo rellene). El wizard bloquea mientras una variable crítica siga pendiente. ⚠️ **Etnia y acento NUNCA se marcan confirmados desde la referencia**, ni habiendo foto de personaje: el spec lo prohíbe explícitamente y una foto no confirma origen cultural — son campos LIBRES en `Section2Character` (sin chips ni defaults) y si faltan, la FASE 0 los marca `[CONFIRMACIÓN REQUERIDA: …]` y el flujo se detiene ahí.

⚠️ **CON VARIOS PERSONAJES LA FASE 0 BLOQUEA POR CADA UNO (slice 5).** Etnia y acento son los dos campos que el spec prohíbe inferir, y que uno los tenga no cubre al otro: un anuncio con el padre sin acento saldría con una voz genérica que nadie eligió. Cada fila lleva el rol (`Acento · padre`) para que se vea a quién le falta qué. Con **un solo** personaje —o sin la lista— la matriz es exactamente la de antes, sin sufijos: hay un test que lo fija. La foto confirma la APARIENCIA de ese personaje y **nunca su etnia**, igual que en el camino de uno.

**`Section2Character` es una lista de hasta 4** (`MAX_PERSONAJES`), con agregar y quitar; el campo "rol" solo aparece cuando hay más de uno, porque con uno no hace falta nombrarlo. La lista arranca con un personaje armado desde los campos singulares, así que una sesión a medio llenar o reanudada no pierde lo escrito, y al guardar **sincroniza los campos singulares con el protagonista** — el camino legado los sigue leyendo y desincronizarlos dejaría la validación mirando datos viejos.

⚠️ **La ruta `/inputs` MEZCLA POR ID, no pisa.** El wizard solo manda lo que el usuario define; el avatar, el bloque de consistencia y los perfiles de voz y movimiento los genera FASE 4 y viven en la misma columna. Escribir el array del wizard tal cual los borraría, y volver a este paso a corregir una tilde obligaría a **re-generar N avatares** — que es dinero. Con test.

**FASE 1 — la unidad de análisis es el CORTE REAL, no la frase.** El pipeline viejo pedía un beat por cambio visual *o* por frase, lo que llegara primero; eso fabricaba cortes donde el original tenía una toma continua y destruía el ritmo al reconstruir. Ahora: "no dividas una toma continua solo porque cambia el diálogo". Los elementos gráficos (subtítulos, watermark) se capturan en su **propio campo** (`elementosGraficos`), nunca dentro de `accion` ni `camara` — así no viajan al render como algo a reproducir.

**FASE 3 — adaptación literal del guión (`lib/video-ads/adapt.ts`).** La única libertad permitida al rellenar el Fill in the Blank de la plantilla con los INPUTS del usuario es gramatical (género, número, concordancia, tiempos verbales); todo lo demás se copia. `AdaptedScript.tomas: TomaFinal[]` conserva `tiempoOriginal` (la marca de tiempo del análisis forense, no recalculada) y reporta la diferencia de caracteres contra el original — es la métrica objetiva de "no te fuiste de largo". Un guión con `variablesPendientes` no vacío no se puede renderizar: se gastaría un lote leyendo un corchete en voz alta.


⚠️ **UN CORTE MUDO LLEGABA AL RENDER DICIENDO "No aparece" EN VOZ ALTA (`limpiarDialogo`, forensic.ts).** El prompt de FASE 1 pide `textoOverlay` *"(o 'No aparece')"* y el modelo generaliza ese marcador a `dialogo` cuando el corte no tiene habla. FASE 2 y FASE 3 lo copian literal —que es exactamente lo que tienen que hacer— y termina en el prompt del lote como `Locución:`, o sea el generador lo pronuncia. Medido en la sesión `02fa1205`: el corte 3 traía `dialogo: "No aparece. No aparece."` y el corte 2 la frase real con el marcador pegado al final, y el guión final del usuario salió con **tres "No aparece." seguidas**. El `guionOriginal` de esa misma sesión está limpio, así que el forense sí sabía que el tramo era mudo: lo contaminado es solo el campo por corte.

Se arregla en dos lados porque uno solo no alcanza. **El prompt** ahora dice que un corte sin habla lleva `dialogo` vacío y que "No aparece" es el marcador de `textoOverlay` y solo de ese campo. **Y el código** lo limpia igual (`limpiarDialogos`, en las mismas dos puertas que `repairCutTiming`): el prompt no es garantía, y la limpieza en código es lo que repara las sesiones YA guardadas. Se descartan solo frases COMPLETAS que son el marcador — *"la mancha ya no aparece"* no se toca — y el modo de fallo del acote es dejar pasar un marcador raro, no comerse diálogo legítimo.

⚠️ **Y sacar el marcador no alcanza: una toma muda tiene que DECLARARSE muda.** El silencio por omisión es ambiguo para un modelo que genera audio, y ante una toma sin línea rellena con habla inventada. `buildLotePrompt` emite *"Sin diálogo: la persona NO habla en esta toma. Solo acción y sonido ambiente; no inventes frases ni muevas la boca como si hablara."*

⚠️ **Y en la UI una toma muda no se puede ver como un campo sin llenar.** `segmentar('')` devuelve `['']`, así que la toma silenciosa renderiza un textarea vacío, indistinguible de "te faltó escribir esto". El riesgo no es cosmético: si el usuario lo rellena, le agrega al anuncio diálogo que el original no tenía — justo lo que la REGLA DE ADAPTACIÓN LITERAL prohíbe. `Section5Script` marca esas tomas con **"sin diálogo"** en vez del contador de caracteres (un `0/85 car` se lee como error) y pone un placeholder que dice que dejarla vacía es lo correcto. El vacío sobrevive el ida y vuelta del editor (`unir(segmentar('')) === ''`) y el botón de avanzar no lo bloquea: ese gate solo mira los marcadores `[PENDIENTE:`.

⚠️ **CUATRO ERRORES DEL GUION ADAPTADO, CUATRO CLASES DISTINTAS.** Reportados sobre una sesión real de serum, y cada uno se arregla en un sitio distinto:

| lo que salió | clase | dónde se arregla |
|---|---|---|
| *"**Toma 1:** Este serum esta cambiando…"* | formato — se PRONUNCIA | código (`quitarRotuloDeToma`) |
| *"nos da **calma inmediata de inmediato**"* | el valor choca con su andamiaje | código (`chocaConElAndamiaje`) |
| *"niacinamida pura, ácido hialurónico y **hepéres**"* | ingrediente inventado | prompt |
| *"esta cambiando **las manchas de acné**"* | el valor no cuadra con el verbo | prompt |

⚠️ **Y EL SANEO DEL RÓTULO VA EN EL PUNTO ÚNICO ANTES DE PERSISTIR, no en cada camino.** El primer intento parcheó los dos sitios que escriben `locucion` tras aceptar una reescritura… y el rótulo llegó igual al guión guardado, porque hay un TERCERO: el ajuste de andamiaje (`acceptScaffoldFix`) escribe `toma.locucion` por su cuenta. Ahora se sanea al armar el objeto `adapted`, que es por donde pasan los tres. En `acceptRewrite` se conserva la limpieza aparte porque ahí es para MEDIR: un rótulo baja la fidelidad y tira al piso una reescritura buena.

⚠️ **EL RÓTULO DE LA TOMA SE COLABA DENTRO DE LA LOCUCIÓN.** El modelo copió el *"Toma 1:"* con el que se le presenta cada toma en el prompt y lo metió en el texto hablado — y todo lo que está en `locucion` se pronuncia, el mismo modo de fallo que `limpiarDialogo` con *"No aparece"*. Es raro (**1 de 151 tomas** de la base) y catastrófico cuando pasa, así que se limpia en código: un rótulo al ARRANQUE de la línea nunca es diálogo. Se saca ANTES de medir la fidelidad, si no el rótulo tira al piso una reescritura que por lo demás está bien.

🔴 **`quitarRotuloDeToma` TAMBIÉN SE PERDIÓ EN EL REINICIO, Y SE RE-CABLEÓ (2026-09-08).** Tercera baja del mismo commit `a3a25d6`, junto con el arreglo de las sesiones fantasma: los dos párrafos de arriba describían una función que **no existía en el árbol**. La fuente de la fuga sigue en pie —`buildAdaptInstruction` le presenta cada toma como `Toma ${t.n}`— así que el modelo puede volver a copiar el rótulo al texto hablado en cualquier momento.

⚠️ **HAY DOS RÓTULOS `Toma N` EN EL PIPELINE Y SOLO UNO SE SANEA — no los confundas.** El que se limpia es el del prompt de FASE 3 (`buildAdaptInstruction`), porque su salida ES la locución y el modelo puede copiarlo ahí. El otro es el de `buildLotePrompt` (`Toma ${t.n} (X s)`, lotes.ts), que se construye AGUAS ABAJO de la locución y por tanto no puede filtrarse dentro de ella: ahí no hay nada que arreglar. Es el mismo numeral que se investigó y se descartó como causa del conteo con los dedos (ver esa ronda arriba).

**Vive en `fill.ts` y no en `adapt.ts`, por dirección de imports:** `adapt.ts` ya importa de `fill.ts`, así que al revés sería un ciclo. Los DOS caminos que persisten `locucion` lo llaman: el punto único donde `adapt-script/route.ts` arma el objeto `adapted` (por donde pasan el relleno de la plantilla y los ajustes de andamiaje, que escriben `toma.locucion` por su cuenta) y `applyScriptEdits` (las ediciones a mano del usuario, que es el otro POST que guarda). `acceptScaffoldFix` conserva la limpieza aparte porque ahí es para MEDIR — el valor limpio no sale de esa función a propósito. **En este árbol no hay `acceptRewrite`**, así que los escritores son dos y no tres.

⚠️ **LA PUNTUACIÓN ES OBLIGATORIA EN EL PATRÓN, Y ES EL HALLAZGO NUEVO DE ESTA RONDA: `Toma` es el IMPERATIVO de "tomar", y en un nicho de suplementos es la dosis.** *"Toma 2 al día"*, *"Toma 1 cápsula en la mañana"* — un patrón que solo pida `toma` + número se come exactamente eso, y comerse la dosis del producto es mucho peor que dejar pasar un rótulo. El patrón exige el separador (`:`, `.`, `)`, `]`, `|`, guion) que marca la línea como rótulo, así que el modo de fallo del acote es **no limpiar**, nunca destruir texto. Medido sobre las 229 tomas guardadas: **0 traen el rótulo** (o sea el guard es PREVENTIVO, no repara nada visible) y **2 traen la forma imperativa** que hay que proteger. Fail-safe además: si el rótulo era la línea entera se devuelve intacta — una toma vacía renderiza un textarea que se lee como *"te faltó escribir esto"*, y el usuario lo rellenaría con diálogo que el original no tiene.

⚠️ **El test de `acceptScaffoldFix` hubo que DIMENSIONARLO, y la primera versión era decoración.** Sobre una locución larga el rótulo mueve el largo ~19 %, por debajo del umbral de ±35 %: el chequeo lo dejaba pasar igual, así que la aserción pasaba con el saneo revertido. Con la línea corta del caso documentado (*"Andas muy cansada."*, 18 caracteres) los 8 del rótulo son el 44 % y sí tumban el ajuste. **Verificado revirtiendo**: sin el saneo, ese test falla y los otros pasan.

⚠️ **NO lleva bump de huella, y se comprobó en vez de suponerlo:** `scriptFingerprint` hashea `t.locucion` como INSUMO, así que la huella se mueve sola en cualquier sesión cuyo texto cambie de verdad — y como ninguna de las 229 tomas trae el rótulo, hoy no se mueve ninguna. Bumpear invalidaría sesiones con lotes ya pagados sin ninguna razón. Mismo razonamiento que `repartirAccion`.

⚠️ **UN VALOR PUEDE CHOCAR CON LA PALABRA DE AL LADO.** La plantilla decía *"y tambien nos da [beneficio 3] de inmediato"* y el modelo eligió *"calma inmediata"*. El valor es correcto para su etiqueta y absurdo en su frase. Los guards que ya estaban no lo ven: el de 3-gramas busca que el valor REPITA tres palabras seguidas del andamiaje, y acá la colisión es de UNA palabra con otra forma. `chocaConElAndamiaje` compara la raíz (6 caracteres) del valor contra las **dos palabras pegadas al hueco** — no contra todo el andamiaje. ⚠️ Ese acote está medido: comparar contra el andamiaje entero daba **2 falsos positivos de 6** sobre las 151 tomas de la base, los dos por *"niacinamida"* junto al *"Niacinamide"* del nombre comercial, que es una frase natural. Y va en `rejectBadValues` y no en `acceptRewrite` porque rechazar la reescritura no arregla nada: el piso determinista trae el mismo choque.

⚠️ **UN INGREDIENTE SE COPIA DE LA ETIQUETA, LETRA POR LETRA — y prohibir "inventar" NO alcanza.** Primero volvió *"hepéres"*, que no es una palabra: el modelo reprodujo de memoria un componente de la etiqueta (`PHE-RESORCINOL`) y lo destrozó. Con la regla puesta en su primera forma —*"no lo deduzcas ni lo aproximes"*— la corrida siguiente devolvió **"HEPES"**: un químico REAL que tampoco está en esa etiqueta.

Ahí está la lección: **el modelo no estaba inventando al azar, estaba completando de memoria**, así que una prohibición de intención no lo detiene — él no cree estar inventando. La regla tuvo que volverse de PROCEDIMIENTO: *búscalo en el texto de la etiqueta que tienes arriba; ¿no está ahí, tal cual? entonces no va*. Y con el criterio explícito de que **no importa si el ingrediente existe de verdad, importa si está en ESTA etiqueta**.

✅ **La versión procedimental FUNCIONÓ:** la corrida siguiente devolvió *"niacinamida, PHE-Resorcinol y agua termal"* — los tres correctos para ese producto.

⚠️ **PERO ACERTÓ POR MEMORIA, NO COPIANDO, Y ESO DESTAPÓ LA CAUSA RAÍZ.** La `brandingDescription` capturada de esa sesión **no nombraba un solo ingrediente**: decía *"La marca se identifica por el logotipo 'LA ROCHE-POSAY'… El estilo es minimalista, clínico y limpio, típico de productos dermatológicos de alta gama"*. O sea una descripción del ESTILO GRÁFICO, no una transcripción. El modelo no tenía de dónde copiar y volvió a completar de memoria; esta vez le salió bien.

**El prompt del scan de video nunca pidió transcribir la etiqueta.** Decía *"describe the physical object precisely (shape, size in hand, label, colors, visible text)"* — una sola frase genérica para los dos campos. El de ANUNCIOS sí lo pide explícitamente (*"brandingDescription = only the text and graphics actually printed on the product"*), y la diferencia se mide: **anuncios transcribe en 19 de 31 scans y video solo en 10 de 27**, con 8 que devuelven estilo.

Ahora el prompt de video separa los dos campos y exige la transcripción letra por letra —marca, nombre, claims, lista de ingredientes, dosis, volumen— con la advertencia de que **es la ÚNICA fuente que el guión tiene de lo que el producto contiene**. Sin eso, la regla de FASE 3 (*"copia el ingrediente de la etiqueta"*) es inejecutable por construcción.

✅ **VERIFICADO CONTRA UNA FOTO REAL, y cierra la clase entera.** Con el prompt nuevo, la misma foto devolvió: *"LA ROCHE-POSAY LABORATOIRE DERMATOLOGIQUE PURE NIACINAMIDE 10 SERUM CONCENTRADO ANTIMANCHAS REPARA. ILUMINA NIACINAMIDA PURA. PHE-RESORCINOL CON AGUA TERMAL DE LA ROCHE-POSAY"* — una transcripción, contra el *"El estilo es minimalista, clínico y limpio"* de antes.

Y el guión que salió de ahí: *"contiene niacinamida pura, phe-resorcinol y agua termal"*, los tres **copiados** de la etiqueta y no completados de memoria. El nombre comercial también sale completo (*"Pure Niacinamide 10"*, antes *"Pure Niacinamide"*) y hasta el claim impreso llega al copy (*"Su concentrado antimanchas es para…"*). El ingrediente inventado no vuelve porque ahora hay de dónde copiar — que es lo que la regla de FASE 3 pedía desde el principio.

⚠️ **Y EL VALOR TIENE QUE FUNCIONAR EN SU FRASE, no solo responder a su etiqueta.** *"[aspecto a mejorar]"* con valor *"las manchas de acné"* produjo *"este serum esta cambiando las manchas de acné"*: correcto para la etiqueta del hueco, imposible con el verbo que lo precede. Es el mismo eje que ya cubre el corrector de coherencia —que lee el texto ARMADO— pero acá se pide en la primera pasada, que es más barato que corregirlo después.

⚠️ **Los valores de los huecos se verifican en código antes de sustituirlos (`rejectBadValues`, `fill.ts`).** `fillTemplate` copia sin interpretar —esa es su virtud— así que un mal valor del modelo se convierte en texto imposible. Caso real (sesión `79b94ab9`): con la plantilla `Este es el [Producto] de la marca [Producto] y se llama [Producto].`, el modelo devolvió como valor del primer hueco **la oración entera ya rellenada**, y al sustituirla dentro de la frase que ya la contenía salió *"Este es el Este es el suero de la marca La Roche-Posay y se llama Suero de niacinamida de la marca Suero de niacinamida de la marca…"* — lo que el dueño del repo llamó "un monstruo de Frankenstein". Se rechaza un valor si (1) pasa de 60 caracteres, (2) contiene el nombre del propio hueco, o (3) **repite tres palabras seguidas del andamiaje de SU toma** (el texto de la locución con los corchetes quitados, normalizado sin acentos ni puntuación) — ese 3-grama es la firma exacta del eco. Dos palabras no alcanzan: "de la" aparece en media lengua española. Lo rechazado queda como `[PENDIENTE: …]` y lo escribe el usuario. Verificado contra los valores reales de esa sesión: rechaza los 3 malos, deja pasar los 12 buenos. ⚠️ El prompt de FASE 3 **no debe contener anti-ejemplos con forma de valor**: la frase que el modelo emitió era casi literal del bloque "caso real que salió mal" que el propio prompt le daba. Un anti-ejemplo con forma de valor es una plantilla que rellenar.

⚠️ **Un video de referencia SIN CORTES da UNA sola toma con el guión entero, y eso rompe cualquier tope dimensionado para una toma "normal".** Una cabeza parlante grabada de una sola pasada —de lo más común en UGC— produce 1 corte, 1 toma y 1 línea editable. Caso real: 33 s continuos = **706 caracteres en una única locución** contra un tope de 600 en `POST …/script`, y el usuario no pudo guardar ediciones que ya había escrito. Verificado con `ffprobe` (0 cambios de escena incluso con umbral 0.06): el análisis forense tenía razón, el video no tiene cortes; el bug era el tope. `MAX_LINEA = 2500` se dimensiona contra ese caso (un minuto de locución a `CPS_MAX` son ~1200 caracteres). Los topes se comprueban **fuera del schema de zod** para poder decir qué línea y por cuánto se pasa: un `.max()` colapsa todas las causas en un mismo mensaje, y eso obligó a leer los logs del servidor para diagnosticar un error de validación propio.

⚠️ **Y el usuario NO PUEDE VER que se va a cortar, que es de dónde sale la queja "no hizo cortes".** `Section4Template` muestra *"Cortes detectados — 1"* sobre un video de 33 s, y ahí se forma la conclusión de que el sistema no partió nada; los lotes solo aparecen en el paso 7, después de pasar por plantilla y guión. Ahora esa misma sección calcula el reparto **con `groupIntoLotes`, la misma función que usa el render**, y avisa: *"una toma continua de 33s … se dividirá en 3 clips (11.7s · 14.6s · 6.7s)"*. Es información, no un cambio de datos — el corte siempre se hizo.

**La PLANTILLA se muestra partida por FRASE (`segments.ts`).** ⚠️ **El GUION ya no** (2026-08-24): llega autocompletado, así que se muestra para LEERLO —una línea de prosa por toma, con su contador de ritmo, sus ajustes de andamiaje y su marca de toma muda— y un botón lo convierte en UN solo textarea con todo el guión (`aTextoPlano`/`deTextoPlano`, `guion-plano.ts`). Con huecos que había que rellenar a mano, una caja por frase tenía sentido; con el guión ya completo lo que estorba es el formulario. ⚠️ El textarea único lleva una **cabecera `--- Toma N ---`** por toma y al guardar se exige que el número de tramos coincida con `adapted.tomas.length`: si no cuadra se BLOQUEA el guardado y se dice por qué, nunca se adivina el reparto. `adapted.tomas` sigue sin partirse, por las tres degradaciones de siempre (`resyncTomaDurations` empareja por índice, `tiempoOriginal`, `scriptFingerprint`) — el textarea es presentación, el dato sigue siendo una locución por toma. Con test. Un video sin cortes da una toma con el guión entero, y trabajar 706 caracteres en un único textarea es impracticable. `Section4Template` numera las frases de cada toma y `Section5Script` da una caja por frase. El corte va por punto natural de frase — el mismo criterio con el que `splitLongToma` reparte en clips — así lo que se edita por separado se parece a lo que después se renderiza por separado.

⚠️ **Es presentación pura: `adapted.tomas[].locucion` sigue siendo UN string por toma**, y al guardar se vuelve a unir (`unir`). Se resolvió por la UI y NO partiendo `adapted.tomas` justamente por las tres degradaciones de abajo. El ida y vuelta sin editar devuelve el texto idéntico (probado sobre el guión real de 706 caracteres → 7 frases → idéntico), así que abrir el paso no puede ensuciar el dato por sí solo; lo único que se normaliza es el espacio de más ENTRE frases, que en texto hablado no significa nada.

El render de ese caso **no** está roto: `splitLongToma` parte la toma larga por frases en FASE 5 (regla 7 del spec), y los 33 s salieron como 3 lotes de 11.8/12.3/8.9 s. Lo único que queda grande es la línea del editor. **No partas `adapted.tomas` para arreglar eso**: `resyncTomaDurations` empareja por índice y empezaría a devolver `null` (la reparación de tiempos dejaría de llegar al render), `tiempoOriginal` se compartiría entre fragmentos y cambiaría la forma de la huella — tres degradaciones silenciosas en caminos que manejan dinero, a cambio de un textarea más corto.

⚠️ **Con una sola toma larga la alineación falla más, y eso deja `normalizeSlots` sin efecto en TODO el guión.** En el caso real `alignSlots` devolvió `null` porque el modelo parafraseó dos palabras dentro de un bloque de 658 caracteres. `extract-template` ahora devuelve `desalineadas` al cliente y `Section4Template` lo muestra: antes solo se veía en los logs del servidor, donde el usuario —el único que puede re-extraer o corregir a mano— no lo ve. No aflojes `alignSlots` para tolerar paráfrasis: así es como empieza a atribuir mal los tramos.

⚠️ **EL TEXTO DE LA ETIQUETA DEL PRODUCTO ES UNA FUENTE, Y DURANTE UN TIEMPO SE TIRABA.** `product_scan` tiene dos campos: `productDescription` (la forma del envase) y `brandingDescription` (el texto impreso: marca, ingredientes, dosis, beneficios). El scan los leía de la foto y los persistía, pero **a la FASE 3 solo le llegaba `productDescription`** y al corrector de coherencia no le llegaba ninguno. Medido en una sesión real: la etiqueta decía *"Melatonin, 10mg Per Serving, Fall Asleep Faster, Stay Asleep Longer, 100% Drug-Free"* y el guión salió con **11 huecos pendientes** — ingrediente, dosis, beneficios — cuya respuesta llevaba rato guardada en la base. Al cablearla: **11 → 3** pendientes en esa sesión y **4 → 0** en otra. El spec ya lo decía (*"La imagen proporcionada por el usuario es la fuente de verdad visual del producto"*, y la jerarquía de FASE 3 lista IMAGEN DEL PRODUCTO): omitirla era la desviación, no incluirla. ⚠️ La etiqueta suele venir en otro idioma y en mayúsculas de packaging, así que el prompt exige **traducirla y adaptarla, no pegarla** — si no, se cambian 11 pendientes por 11 fragmentos en inglés dentro de un anuncio en español.

⚠️ **CORRECCIÓN DEL REGISTRO — el "incidente PHE-resorcinol" NUNCA EXISTIÓ.** Durante varias rondas este documento y el prompt de FASE 3 citaron como caso emblemático de alucinación que el modelo escribió *"contiene niacinamida, PHE-resorcinol y agua termal de La Roche-Posay"*, supuestamente "la fórmula de otra marca sacada de memoria". **Es falso, y lo desmiente la propia sesión guardada**: el producto del usuario ERA un serum de La Roche-Posay, y `product_scan.brandingDescription` contiene literalmente *"NIACINAMIDA PURA, PHE-RESORCINOL, CON AGUA TERMAL DE LA ROCHE-POSAY"*. El modelo leyó la etiqueta y acertó. Lo mismo con la supuesta "marca Pure inventada": la etiqueta dice `PURE NIACINAMIDE 10 SERUM`. La regla de no inventar sigue en pie porque es correcta por sí misma, pero **su justificación era un caso que probaba lo contrario**, y mientras estuvo ahí le enseñó al modelo a desconfiar de la única fuente autorizada que tenía. Si vuelves a leer ese ejemplo en algún commit viejo, es historia, no doctrina.

⚠️ **EL MODELO REDACTA, EL CÓDIGO VERIFICA — cambio de garantía CONSTRUCTIVA a VERIFICADA.** `fillTemplate` sigue existiendo, pero ya no es lo que produce el guión: es el PISO. En la misma llamada de valores se le pide al modelo la locución de cada toma **reescrita**, como la escribe el spec (que redacta el guión con el original delante, por eso no tiene costuras rotas). `acceptRewrite` (fill.ts) la mide contra el andamiaje de la plantilla y la acepta o la tira al relleno determinista, **por toma**: una que derive no arrastra a las buenas.

Esto se había abandonado antes por buenas razones —el modelo conservaba el 66–71 % de las palabras y nada lo detectaba— y ahora se puede porque sí hay detección. `FIDELIDAD_MIN = 0.85` está deliberadamente por encima de ese 66–71 %: una reescritura que pase el filtro no es de las que derivaban.

Cuatro guards, todos por un fallo medido, y todos necesarios porque **la reescritura es texto libre y no pasa por `rejectBadValues`**:
1. **Fidelidad de andamiaje** ≥85 % — si no, era otro anuncio.
2. ~~**Invención** (`ungrounded`)~~ — **QUITADO el 2026-08-24, ver "EL GUION SALE COMPLETO" abajo.** Exigía que toda palabra de contenido (5+ letras) apareciera ya en la plantilla, los inputs, los valores o la etiqueta. Es HISTORIA: hoy el modelo tiene la orden de autocompletar los huecos deduciendo, y una palabra deducida es por definición "sin respaldo" — con el guard puesto, cada reescritura autocompletada caía al relleno determinista y el guión volvía a salir con corchetes. La función sigue en `fill.ts` porque `rejectBadValues` la puede recibir por parámetro, pero **nadie se lo pasa**.
3. **Eco** (`repeticionInmediata`): un tramo repetido dos veces seguidas — *"estás en mis veintitantos como yo como yo"*.
4. **Pendientes**: menos marcadores que el piso = resolvió un hueco por su cuenta. Sobrevive, pero hoy es casi inerte: con el guión autocompletado el piso ya no suele traer marcadores que perder.

**Medido sobre la sesión de 11 tomas: 10/11 aceptadas**, 1 caída al piso por resolver un pendiente sola. Las costuras que tres rondas de parches no habían arreglado salen bien (*"andas muy cansada"*, *"te ayuda a dormir más rápido"*). ⚠️ La variabilidad entre corridas sigue alta (pendientes 2/5/7 en la misma sesión), así que el botón "adaptar otra vez" sigue siendo parte del flujo.

⚠️ **EL GUION SALE COMPLETO: los huecos se AUTOCOMPLETAN (2026-08-24, decisión del dueño del repo).** Invierte la política que este documento defendía arriba (*"un hueco vacío es un resultado correcto; uno inventado es inservible"*). La regla nueva parte la pregunta en dos, y esa partición es lo importante:

- **La PLANTILLA no se inventa nunca.** El texto que rodea a los corchetes es del anuncio original y se copia palabra por palabra. Lo que lo hace cumplir en código sigue siendo `FIDELIDAD_MIN = 0.85` sobre el andamiaje (`acceptRewrite`), que NO se tocó — ese guard *es* la orden.
- **Lo que va DENTRO de los corchetes sí se completa**, con una escalera explícita en el prompt: (1) lo que está literal en los INPUTS o en la etiqueta del envase; (2) lo que se deduzca de ello (ángulo, problema, público, categoría, la foto); (3) lo más verosímil para un producto de esa categoría. El motivo es de producto: el guión es un borrador que el usuario lee y corrige línea por línea antes de renderizar, y un borrador completo se corrige, uno con agujeros se rellena a mano.

**Lo que sigue vacío a propósito**, y es la única excepción: lo que el usuario tendría que salir a demostrar — premios, avales médicos, estudios clínicos, certificaciones y garantías. Ahí un `[PENDIENTE: …]` sigue siendo mejor que una afirmación que le explota en la cara.

⚠️ **Quitar el guard es OBLIGATORIO, no un extra: sin eso el cambio es un no-op.** `ungrounded` rechazaba toda palabra de contenido ausente de las fuentes — exactamente lo que ahora se pide producir. Con el guard puesto, el prompt nuevo se escribe, el modelo obedece, `acceptRewrite` lo tira, `fillTemplate` pone los corchetes de vuelta y el síntoma es *"no cambió nada"*: el peor modo de fallo posible, porque se reporta como éxito.

⚠️ **LA ORDEN VA EN LA SEGUNDA LÍNEA DEL PROMPT, NO ENTRE LOS BULLETS — y está medido.** Con "rellena siempre" metida entre los quince bullets de *"reglas de los valores"*, dos corridas de la misma sesión dieron **4 y 9** pendientes (la segunda, PEOR que los 8 que esa sesión ya tenía guardados): el modelo se quedaba con el tono conservador del encabezado. Subida a headline, tres corridas de la MISMA sesión dieron **5 / 7 / 2**.

✅ **Medido con `scripts/probe-adapt-autocompletado.ts`** (una llamada de texto a Gemini por sesión, cero imágenes y cero cuota de imagen; no escribe en la base), sobre sesiones reales ya guardadas:

| sesión | pendientes guardados | tras el cambio | reescrituras aceptadas |
|---|---|---|---|
| Mascara Megavolumen (19 huecos) | 0 | 0 | 5/5 |
| Leggins Peluche (22 huecos) | 0 | 0 | 6/6 |
| SteelFit (25 huecos) | 8 | **5 / 7 / 2** (3 corridas) | 5–7 de 7 |

⚠️ **La variabilidad entre corridas SIGUE ALTA** — es la misma que este documento ya anotaba (2/5/7 en otra sesión) y no la arregla un prompt. El botón *"No me convence — adaptar otra vez"* sigue siendo parte del flujo. Y el residuo de SteelFit no es ruido: los huecos que aguantan las tres corridas son `[cantidad de peso]`/`[unidad de medida]` (una promesa de resultado) y `[tipo de garantía]`/`[duración de garantía]` — o sea justo la clase que el prompt se niega a inventar. El guard funciona.


⚠️ El **ajuste de andamiaje** (`acceptScaffoldFix`, la excepción de la directiva 13) queda en gran parte redundante: si el modelo reescribe la locución entera ya no necesita un permiso especial para tocar el conector. No se borró — hay que comprobar antes si llega a dispararse alguna vez. Dos mecanismos para el mismo trabajo es como el formulario de `filled` sobrevivió seis rondas de más.

**FASE 3 son DOS llamadas: rellenar a ciegas y después releer lo armado (`buildCoherenceInstruction`).** La primera pasada devuelve pares `id → valor` y el guión lo ensambla `fillTemplate` con código, así que el modelo **nunca lee el resultado**: mide cada valor contra la ETIQUETA del hueco, no contra la oración que queda. Eso produjo valores correctos para su etiqueta e ilegibles en su frase — un input crudo del usuario donde la oración pedía un adjetivo (*"andas muy no puedo dormir por las noches"*), un beneficio donde pedía un ingrediente (*"tiene sueño reparador"*), un momento del día donde pedía una cantidad (*"con solo tomar antes de dormir"*). La segunda pasada sí ve el texto armado.

Reglas del corrector, todas por un fallo previo: solo puede devolver **correcciones de VALOR**, nunca locución (si pudiera, se perdería en silencio la fidelidad del 100% fuera de los corchetes); sus correcciones vuelven a pasar por `rejectBadValues` (si no, serían una segunda puerta a `fillTemplate` sin el guard que la primera tiene); **vaciar un hueco es una corrección válida** pero NO por defecto: primero se mira la etiqueta (ver abajo), y solo si ni los INPUTS ni el envase lo dicen se vacía — ahí sí, un pendiente es mejor que un ingrediente inventado; y su prompt **no lleva ejemplos con forma de frase rellenada**, porque el artefacto bajo revisión ES una frase rellenada y eso es exactamente lo que el modelo copió la última vez. Si el corrector falla, se conserva el relleno de la primera pasada: no puede costar la adaptación entera.

⚠️ **La ÚNICA excepción a la copia literal: el ajuste de andamiaje (`acceptScaffoldFix`).** Hay frases donde NINGÚN valor cabe — el original dice *"andas muy ___"* y el producto nuevo no tiene adjetivo que poner ahí. Con el andamiaje congelado ese hueco no tiene solución. El spec lo contempla en la **directiva crítica 13** (*"pequeños ajustes gramaticales exclusivamente para: género; número; concordancia; tiempos verbales; naturalidad mínima indispensable"*), y esto es esa licencia acotada en código.

⚠️ **EL CASO MÁS FRECUENTE ES EL ARTÍCULO, y el prompt no lo nombraba.** Medido en un anuncio real: el original decía *"si te encuentras en la Galería Santa Lucía"*, FASE 2 dejó `en la [ubicación específica]` y el valor correcto era una ciudad, así que el guión salió diciendo *"si te encuentras en **la Lima**"*. `correcciones` **no puede** arreglarlo —el artículo es andamiaje, no valor, y ninguna ubicación encaja detrás de "la"—, así que el único mecanismo es `ajustes`; pero su sección solo describía el caso del adjetivo que no existe (*"andas muy ___"*). Con el caso nombrado y su ejemplo medido, **3 de 3 corridas** devuelven el ajuste correcto (*"en Lima"*, quitando el artículo sin tocar la ciudad) y `acceptScaffoldFix` lo acepta: el largo se mueve −3,6 % y los otros valores sobreviven.

**El límite está en QUÉ artefacto se toca: la plantilla nunca.** Es la que tiene que espejar la referencia. El ajuste se aplica solo sobre el guión ADAPTADO, que es el anuncio nuevo y donde el spec permite la naturalidad mínima.

El corrector debe nombrar el `idHueco` que no se puede rellenar, y código verifica que ese hueco exista **en esa toma** — eso ata el cambio a su justificación en vez de ser un permiso abierto. Después `acceptScaffoldFix` exige: el largo se mueve menos de ±35 %, se conserva al menos la mitad de las palabras, **todos los demás valores de la toma siguen presentes**, ningún `[PENDIENTE: …]` desaparece (no se resuelve un pendiente por la puerta de atrás) y no se introducen marcadores nuevos. ⚠️ El valor del hueco nombrado se EXCLUYE de esa comprobación a propósito: es justamente el que no cabía, y exigir que sobreviva rechazaba el único caso para el que la excepción existe — se descubrió porque el primer test de ruta falló por eso. Lo rechazado se loguea con su motivo y la toma queda como estaba.

`AdaptedScript.ajustesAndamiaje` guarda el texto de **ANTES**, no un contador: la justificación entera de permitir el cambio es que sea auditable, y `Section5Script` lo muestra como *antes / ahora* sobre la línea afectada. El campo es `.optional()` de verdad — `generate-lotes` hace `AdaptedScriptSchema.parse` sobre el jsonb guardado y sin eso cada sesión anterior reventaría con un 500 al renderizar.

⚠️ **`ajustes` arrastra la misma obsolescencia que se arregló para `locuciones`, y no está cubierta.** El bucle de `acceptScaffoldFix` corre DESPUÉS de re-aplicar la reescritura y mide la propuesta contra `toma.locucion`, que a esas alturas ya es la reescritura o el piso; el modelo la escribió mirando el texto anterior a sus propias correcciones. El modo de fallo es el rechazo (y se loguea con su motivo), no una publicación silenciosa, por eso no bloquea — pero es deuda conocida, no terreno inexplorado. Y sí se dispara en producción: los logs de la sesión `6a1e6157` traen `ajuste de la toma 1 rechazado — pierde el valor …` y `— el largo cambia demasiado (31%)`, así que la nota de abajo ("nunca se observó") vale para la *aplicación*, no para la propuesta.

⚠️ **Medido: en 3 corridas sobre la sesión real el modelo NO usó la excepción ni una vez** — prefiere vaciar el hueco (*"andas muy [PENDIENTE: situación personal]"*), que para ese caso es la respuesta correcta porque sí existe un adjetivo válido ("cansada") y escribirlo es trabajo de una palabra para el usuario. Que el último recurso se use como último recurso es la señal buena.

✅ **ACTUALIZACIÓN (2026-08-26): el camino de APLICACIÓN sí se observó en producción.** Sesión `2849e595`, log `andamiaje de la toma 3 ajustado (Ajuste de la frase para eliminar el artículo redundante debido al valor insertado.)` — o sea exactamente el caso del artículo que esta sección documenta como el más frecuente, propuesto por el modelo y ACEPTADO por `acceptScaffoldFix`. En la misma sesión se vio también un rechazo por largo (37 %), así que las dos ramas están ejercitadas por datos reales y no solo por los tests de ruta.

⚠️ **Los ids que devuelve el corrector se resuelven con `resolveSlotId`, no por búsqueda exacta.** El modelo reescribe el nombre del hueco al devolverlo y pierde detalles: en una corrida real mandó `situacion personal / edad / hito#1` (sin tilde) e `ingrediente 4` (sin `#1`). Con búsqueda exacta esas correcciones se aplicaban a NADA **mientras el log decía que sí** — el fallo más caro, el que se reporta como éxito. Se compara normalizado y se asume `#1` cuando falta el sufijo; lo que no resuelve se loguea en vez de tragarse.

⚠️ **Medido, y el resultado es parcial: el corrector NO garantiza un guión gramatical.** Sobre la sesión real, en 3 corridas: vacía de forma fiable los valores de categoría equivocada (el ingrediente inventado desaparece siempre — que es la clase peligrosa), pero *"andas muy ___"* sale mal en las tres (cambia el valor sin acertar la forma que pide el verbo) y *"con solo tomar [momento]"* no lo detecta nunca. El número de pendientes varió 1/4/4 entre corridas: **la salida no es estable**, y por eso el botón "No me convence — adaptar otra vez" sigue siendo parte del flujo. La red real contra la gramática es la edición línea por línea, no este chequeo.

**El spec dice "No preguntes nada" — y por eso el guión se edita, no se rellena por formulario.** Lo que el modelo no puede completar con seguridad queda como `[PENDIENTE: nombre]` dentro del texto, y `Section5Script` muestra **una línea editable por toma** (la locución) para que el usuario lo escriba él. Hubo una versión con un campo por variable pendiente que reenviaba esos valores al prompt (`filled`): se eliminó por dos motivos, y el segundo es el que importa. El primero es que preguntaba exactamente lo que la FASE 3 prohíbe preguntar. El segundo es que **no servía para el fallo real**: cuando el modelo elige mal un valor —`[Problema]` en un hueco de edad, o una concordancia rota como "un efecto iluminadora"— lo que hay que tocar es la frase, y un campo etiquetado "Resultado" no deja tocarla. Editar la línea cubre los dos casos con un mecanismo en vez de dos. La escritura va por `POST …/script` (`applyScriptEdits`, sin LLM y sin cuota: es texto); **se edita por TOMA y no sobre `guionFinal`**, porque las tomas son lo que `groupIntoLotes` lee y `guionFinal` es solo su concatenación — guardar el texto unido dejaría al usuario leyendo un guión corregido mientras el render manda los marcadores originales. `caracteresAdaptado`, `diferenciaCaracteres` (siempre contra el original del forense, así que encadenar ediciones no la hace derivar) y `variablesPendientes` se recalculan en el servidor desde el texto, nunca se aceptan del cliente. El botón de avanzar se bloquea con ediciones sin guardar: el render lee `adapted` de la BASE, no del store.

⚠️ **VARIOS PERSONAJES EN FASE 4 (slice 3): una sola llamada, N avatares.** `IdentidadesSchema` devuelve una identidad por personaje —`promptCreacion`, `bloqueConsistencia`, `voz` y `movimiento`, con el `id` del personaje— y **se resuelven TODAS en la MISMA llamada a propósito**: el modelo los ve juntos y puede diferenciarlos. Una llamada por personaje devolvería cuatro variantes de la misma persona, que es el fallo que este diseño evita. El prompt exige explícitamente que se vean Y suenen distintos, en rasgos concretos, y que **no se uniformen los acentos** (la FASE 0 los exige uno por uno, así que uniformarlos borraría el dato).

✅ **Verificado en vivo sobre la sesión `e6b5beda`** (hijo y padre): devolvió 2 identidades genuinamente distintas — rostro redondo con cabello oscuro ondulado contra rostro delgado con pómulos marcados y canas ralas; voz *"mexicano de ciudad, medio, 30-35 años"* contra *"mexicano rural, grave, 55-65 años"*; movimiento *"fluidos pero con momentos de rigidez"* contra *"serenos y deliberados, postura firme y arraigada"*. Cada uno conservó el acento que le dio el usuario.

**Los avatares se generan en PARALELO, uno por personaje**, cada uno con SU foto de referencia. `buildCharacterParts` acepta varias fotos y **el orden importa**: el prompt las cita por el orden de `personajes`, así que mezclarlas le da a un personaje la cara de otro. Costo: N imágenes de Nano Banana Pro por sesión en vez de 1.

⚠️ **Las columnas singulares se siguen escribiendo con los datos del PROTAGONISTA.** El render todavía las lee (eso cambia en el slice 4), así que dejar de escribirlas dejaría el video sin personaje entre un slice y el otro.

**FASE 4 + 4.5 — identidad visual y perfil de voz bloqueados (`lib/video-ads/character.ts`, ruta `character/route.ts`).** El `bloqueConsistencia` (`consistency_block`) es el artefacto central de todo el render por lotes: como el generador de video no recuerda nada entre tareas, la ÚNICA forma de que el personaje sea el mismo en el lote 1 y en el 3 es repetir su descripción íntegra en cada prompt (ver FASE 5). Si el usuario subió una foto de personaje en `Section2Character` (opcional), ES la fuente de verdad para edad, piel, cabello, facciones y complexión, y se manda como imagen al modelo antes del texto. ⚠️ **EL AVATAR SIEMPRE SE GENERA, Y AHORA CON NANO BANANA PRO EN 9:16 (2026-08-19).** Dos cambios juntos:

1. **La foto del usuario ya NO se usa como personaje.** Antes, si la subía, no se generaba nada y esa foto iba directo al render — o sea el anuncio abría con una imagen de encuadre y luz arbitrarios. Es la foto de referencia de la IDENTIDAD; el avatar se GENERA a partir de ella, que es lo que pide la FASE 4 del spec. La foto queda en `character_url` y el avatar en la columna nueva **`avatar_url`** (`20260819000001_video_avatar_url.sql`). Las sesiones viejas tienen `avatar_url` en null y el render cae a `character_url`, así que se comportan igual que antes.
2. **gpt-image-2 → `nano-banana-pro`** (`lib/video-ads/nano-banana.ts`), sin fallback. Conserva la identidad y la prenda desde una sola foto con una fidelidad muy superior —verificado sobre el avatar real de la sesión de ropa: cara, peinado, plumeti, cuello en V y los dos volantes, exactos— y hace **9:16 nativo**. El 2:3 se justificaba con que el personaje nunca iba solo en el render; con el modo de frames de Veo el avatar **es el primer fotograma del clip**, así que su encuadre es el del anuncio.

⚠️ **Y EL AVATAR NACE EN EL ESCENARIO DEL ORIGINAL, NO EN FONDO NEUTRO — desviación deliberada de la FASE 4 del spec.** "Fondo neutro" es correcto cuando el avatar es una foto de referencia; con el modo de frames dejó de serlo. El avatar es el primer fotograma y de él salen todos los frames frontera, así que **un avatar sobre pared blanca hace que el anuncio entero transcurra sobre una pared blanca**. Medido en la sesión `02fa1205`, cuyo original es una tienda con maniquíes, estantes de vidrio y un letrero "NOVATA": los cinco clips salieron en un estudio vacío. Y como en modo frames el prompt del lote ya no manda descripción de escenario, si la escena no está EN LA IMAGEN no está en ningún lado.

⚠️ **Nombrar el escenario ABRE el plano si no se lo acota.** Medido: al mencionar la tienda, el avatar pasó de plano medio a cuerpo entero — el modelo se aleja para "mostrar" el lugar. El prompt dice que el escenario va DETRÁS y desenfocado, que es contexto y no el tema de la foto, y que el encuadre manda sobre el decorado. Post-fix: plano medio con la tienda desenfocada al fondo.

⚠️ **Nano Banana Pro va por el endpoint del MARKETPLACE, no por el de Veo.** `jobs/createTask` + `jobs/recordInfo`, con `state` string y `resultJson` como STRING con JSON adentro; Veo 3.1 responde `successFlag` numérico y un array. Son dos contratos distintos del mismo proveedor y mezclar los parsers deja el polling esperando para siempre. Las referencias van **por URL**, no en base64 (hasta 8, ≤30 MB c/u), prompt máx 10.000. Medido en vivo: ~58 s por imagen, por eso la ruta es síncrona (con `maxDuration = 300`) y no necesita el ida y vuelta por base de datos que sí necesita un lote de video.

⚠️ **El prompt del avatar NO debe nombrar un teléfono como metáfora de encuadre.** Medido: pedirle *"ángulo bajo como un teléfono apoyado en un escritorio"* hace que **dibuje el teléfono en trípode dentro del cuadro**. Se pide el encuadre y aparte se prohíbe explícitamente que se vean teléfonos, cámaras o trípodes. `VoiceProfile` (idioma, acento, ritmo, tono, timbre…) sale del mismo análisis y viaja íntegro a cada lote.

**Lo que NO se copia de anuncios (y por qué):**

1. **El video sube directo al bucket.** El body de una función serverless de Vercel está topado en 4.5 MB. `POST …/upload-url` firma la subida, el browser hace `PUT`, y a la ruta de análisis le llega solo la URL pública (`lib/video-ads/upload-client.ts`). Tope del video: **14 MB** — por encima, Gemini no lo acepta inline (base64 infla 4/3) y habría que ir a la Files API. El número vive en `lib/video-ads/limits.ts` (no en `upload-client.ts`, que es `'use client'`) para que el browser Y `analyze-reference/route.ts` lo importen del mismo lugar: el chequeo del cliente es solo UX, así que el servidor vuelve a exigirlo (`fetchAsBase64` revisa `content-length` antes de bufferear) para que un request armado a mano no reviente el runtime por memoria.
2. **TODA llamada de texto/visión de esta tool va a GEMINI (`callVideoAds`, `lib/video-ads/llm.ts`), no a `callStructured`.** El resto del hub es OpenAI-primario (gpt-4o-mini) y para esta tool ese modelo ERA el techo real de calidad, no un detalle de config. Medido sobre la sesión `6a1e6157`, con el guión original ya delante y el prompt corregido — el original decía *"Tres razones para tomar **Gomi Energy** para Ella"*, la FASE 2 bautizó el hueco `[tipo de producto]` y el producto nuevo se llama Kukamonga:

   | modelo | 3 corridas |
   |---|---|
   | gpt-4o-mini | *"para tomar **gomitas de melatonina** para adultos y jóvenes desde los 12 años"* (3/3) |
   | gemini-2.5-flash | *"para tomar **Kukamonga** para adultos y jóvenes"* (3/3) |

   "gomitas de melatonina" ES la respuesta correcta a la etiqueta `[tipo de producto]`, y equivocada al anuncio. Distinguir esas dos cosas con el original delante es el "contextual awareness" que el PROMPT MAESTRO tiene por correr de una pasada en un modelo grande, y **no se compra con más reglas de prompt sobre un modelo chico** — se intentaron tres rondas antes de mirar qué modelo era. Lo mismo con las notas del formulario pegadas crudas. Excepciones deliberadas: el **render** (KIE, no es un LLM) y la **generación del avatar** (`openaiGenerateImage`, gpt-image-2 sin fallback) — el *análisis* de identidad de esa misma ruta sí va por Gemini. `analyze-reference` ya llamaba a Gemini directo por otra razón (gpt-4o-mini no acepta partes de video).

⚠️ **FASE 3 le manda al modelo EL GUIÓN ORIGINAL, y esa es la mitad que sostiene todo.** Durante mucho tiempo `buildAdaptInstruction` pasaba los cortes como `{n, tiempo, accion, camara}` — sin `dialogo` — y `guionOriginal` no aparecía en ninguna parte: el modelo que elige los valores **nunca había visto una palabra de la locución original**. Con solo la etiqueta del hueco y sus palabras vecinas, la categoría del producto es una respuesta tan válida como el nombre comercial. El spec no tiene ese problema porque su REGLA DE ADAPTACIÓN LITERAL es literalmente `ORIGINAL:` / `ADAPTACIÓN:` una debajo de la otra. Ahora el prompt lleva ese mismo par por toma, y `slotOriginals` (`fill.ts`, sobre `alignSlots`) agrega **qué decía el original en cada hueco**. El bloque por toma es lo que no puede faltar: el per-hueco se cae cuando `alignSlots` no alinea, y justo las sesiones de una sola toma larga son las que más fallan. Regla nueva y necesaria: **el nombre del hueco es orientativo, el original manda** — lo bautizó otro paso y a veces nombra mal el dato.

⚠️ **NO le pases el original al CORRECTOR de coherencia.** Se probó (una categoría "no cumple la función del original", con el texto original al lado de cada valor) y empezó a devolver **el producto viejo** como corrección: `ingrediente 1 → "maca roja"`, `situación personal → "cansada y sin energía para esos momentos"`. Es el mismo mecanismo que ya documenta `fill.ts`: cualquier texto con la forma del artefacto que el modelo tiene que producir se convierte en algo que copiar. La primera pasada sí lo lleva y ahí es correcto — su trabajo es sustituirlo; el del corrector es juzgar lo ya escrito.

⚠️ **El encabezado de FASE 3 decía "no reescribas el guion: no se usaría"** — texto de cuando `locuciones` no existía, que quedó contradiciendo a la sección que sí pide la reescritura. Medido: el modelo obedecía a la primera instrucción y devolvía una reescritura tan pegada como el relleno automático.

⚠️ **Y la reescritura aceptada se BORRABA al aplicar las correcciones.** `adapt-script` acepta la locución que redactó el modelo, loguea `N/N tomas usan la reescritura` — y después, si el corrector devolvía una sola corrección, `fillTemplate` reconstruía la toma entera desde la plantilla. Como el corrector casi siempre corrige algo, **la reescritura no llegaba a producción casi nunca**: el corrector leía un texto y sus correcciones producían otro, el pegado con sus costuras rotas (*"andas muy no poder dormir por las noches"*). Ahora se vuelve a intentar con el piso nuevo. `acceptRewrite` ya rechaza la propuesta que resuelve sola un hueco vaciado; lo que no ve es un valor **cambiado**, así que eso se comprueba aparte — una reescritura que todavía contiene el valor viejo es texto anterior a la corrección y cae al piso.

⚠️ **Se probó exigir respaldo (`ungrounded`) también a los VALORES y se descartó.** Nació de un fallo real: con una etiqueta que solo dice *"Kukamonga"* y *"90 mg de melatonina"*, gpt-4o-mini entregó *"extracto de valeriana"*, *"vitamina B6"* y *"GABA"* — un guión **renderizable, con 0 pendientes, afirmando una composición falsa*. Pero el guard rechaza también las traducciones de la etiqueta que el propio prompt pide, y medido dejaba 9 pendientes en un guión de una toma. Con Gemini el modelo deja esos huecos pendientes por su cuenta (3/3 corridas, cero ingredientes inventados), así que la causa era el modelo y no la falta de un guard encima. `rejectBadValues` conserva el parámetro `fuentes` opcional por si vuelve a aparecer; hoy nadie se lo pasa. ⚠️ **Y desde el 2026-08-24 tampoco lo usa `acceptRewrite`**: la política es autocompletar (ver "EL GUION SALE COMPLETO"), así que exigir respaldo a un valor deducido lo tiraría por definición. Lo que sigue prohibido no son las palabras nuevas sino los claims que comprometen al usuario, y eso lo lleva el prompt.

3. **El render (FASE 5, más abajo) SÍ existe** y usa Gemini solo indirectamente (los pasos previos que arman el prompt) — el render en sí llama a KIE, no a un LLM de texto.

⚠️ **La API key de KIE la pone el USUARIO y NO HAY RESPALDO DEL HUB** (`user_settings.kie_api_key`, se carga en `/cuenta`): por eso esta tool viene incluida en los tres planes y no gasta créditos de imagen. La reciben por parámetro `createVideoTask`/`getTaskDetail` **y también `generateImage` de `nano-banana.ts`** — el avatar y los frames son tareas pagadas igual que el video, y hasta 2026-08-24 los pagaba el hub. `KIE_API_KEY` del entorno ya NO se lee. Sin key, la tool entera está gateada en su página de entrada. Ver "BYOK" en la sección de suscripción — sobre todo por qué la key se valida ANTES del gate de cuota.

⚠️ **EL CAP DE CLIP BAJA A 15 s (2026-08-25, decisión del dueño del repo).** `grok-imagine/image-to-video` acepta 30 y durante un día ése fue el cap; grok **pierde la consistencia del personaje y del entorno en clips largos**, así que `LOTE_MAX_SEC = 15`. La API no cambió — el que baja es nuestro cap, y vuelve a coincidir con los 15 s del spec por otro camino. Cuesta el DOBLE de llamadas pagadas; lo que compra es que el clip se parezca al personaje.

⚠️ **Y CON 15 s APARECE UN AGUJERO QUE EL TECHO DE 30 TAPABA: el piso de habla de `clampDuration` perfora el cap.** Ese piso es `ceil(caracteres / CPS_MAX)` y manda sobre todo lo demás a propósito (el texto tiene que poder decirse; violarlo corta la frase). Con 30 s nunca se rozaba; con 15, un lote de 400 caracteres devuelve **20 s** y se renderiza un clip por encima del cap que el módulo publica. Y esos 400 caracteres son un caso REAL: `repairCutTiming` garantiza el ritmo sobre los cortes del FORENSE, pero FASE 3 reescribe la locución y el usuario la edita a mano — este documento ya tiene medido un corte que pasó de 82 a 272 caracteres en los mismos 5 s. `LOTE_MAX_CHARS = LOTE_MAX_SEC × CPS_MAX` cierra el lote también por caracteres, con la misma aritmética. ⚠️ Una toma que SOLA se pasa del presupuesto no se arregla cerrando el lote: ahí gana el piso, un clip largo de más antes que una frase cortada. Misma jerarquía que dentro de `clampDuration`.

⚠️ **EL DETALLE ATÓMICO (`Corte.micro`) — y la parte difícil no fue pedirlo, fue hacerlo entrar.** Pedido del dueño del repo: que el prompt copie *"cada movimiento, cada expresión, el lipsync, el cabello, el vaivén de las manos, el balanceo del cuerpo, más rigidez si no se mueve mucho, el movimiento del entorno"*. `accion` dice QUÉ hace el cuerpo; `micro` dice CÓMO. **Cinco casillas y no una** —`cuerpo`, `manos`, `rostro`, `cabello`, `entorno`— por el mismo motivo por el que `calidadMovimiento` y `manerismos` no se pudieron colapsar: con un solo campo el modelo cubre un eje y se olvida de los otros cuatro. **La quietud es una observación, no una casilla vacía**: *"torso casi inmóvil, solo respiración"* es una respuesta correcta, y dejarlo vacío hace que el generador invente movimiento que el original no tiene. El lipsync entra dentro de `rostro` (cuánto se abre la boca al hablar), que es la parte que un generador de video puede ejecutar.

⚠️ **MEDIDO ANTES DE ESCRIBIR UNA SOLA LÍNEA DE EMISIÓN: no entraba.** Sobre las 22 sesiones reales con guión adaptado quedaban **~21 caracteres libres por toma**. El desglose dice por qué: de los 5.000 del prompt, el contenido (personaje 379, producto 430, escenario 358, voz 380, coreografía 392, locución 189 — medianas) suma ~2.130, y los otros **~2.500 eran ANDAMIAJE FIJO en prosa inglesa**. Ahí estaba el presupuesto.

**El andamiaje se reescribió en telegrama sin perder una sola regla** (la cabecera de idioma, `CONTINUOUS TAKE`, `CONTINUITY`, el bloque `CUTS`, `NO TEXT / NO OVERLAY`), y la etiqueta por toma pasó de `Spoken line (Latin American Spanish, verbatim)` a `Says` — 47 caracteres × cada toma × cada lote, para repetir algo que la cabecera ya dice. ⚠️ Lo que NO se tocó es que la línea EXISTA por toma: es la sincronización audio↔imagen, y este documento ya registra qué pasa cuando se pierde (*"una habla muy rápido y la otra muy lento"*).

✅ **Verificado contra la API con `scripts/probe-forense-atomico.ts`** (un análisis forense real, video incluido): el modelo devuelve telegrama de verdad — **`micro` en 5/5 cortes, largo mediano 37 caracteres por casilla, 0 casillas sobre 120, 0 cortes en prosa**, y la quietud declarada (*"fijo sin movimiento"*, *"fondo quieto, luz natural estable"*). El lipsync sale accionable (*"boca articula cada sílaba"*, *"boca abierta con énfasis"*).

✅ **Y proyectado sobre las 22 sesiones reales con `scripts/probe-video-presupuesto.ts`** (lectura pura de la base, cero LLM): con la voz fija y el detalle puesto, **85 de 87 lotes emiten las cinco casillas COMPLETAS**, 2 recortadas y **ninguno sin detalle**.

⚠️ **El bloque `micro` se ENCOGE con la búsqueda binaria del piso, no se suelta.** Medido: soltarlo dejaba 7 de 87 lotes **sin prompt válido** — y ahí `buildLotePrompt` lanza con la cuota ya gastada. Medio detalle sigue siendo más de lo que había, así que el modo de fallo pasa a ser "menos detalle" en vez de "no se puede renderizar". Tiene además su propio escalón (`NIVEL_MICRO_CORTO`), después del guion global y del overlay compacto —que DUPLICAN información— y antes de tocar la coreografía.

⚠️ **FUSIÓN DE CORTES POR CONTINUIDAD (`unirTomasContinuas`) — no es `mergeMicroCortes` con otro nombre.** Une cortes consecutivos que YA SON la misma toma, para que no gasten cuatro cabeceras, cuatro líneas de cámara y cuatro bloques `micro` diciendo una sola cosa. Las dos funciones tienen que existir: `mergeMicroCortes` arregla cortes DEMASIADO CORTOS para renderizar (1 s) y para lograrlo **sacrifica** el encuadre del más corto; ésta no sacrifica nada. Corre después de aquella, y solo si la sesión no tiene guión adaptado (fusionar cambia `tiempo`, que es la clave de emparejamiento de medio pipeline).

Cuatro condiciones, todas COMPARACIONES y no criterios — es la "matemática" que pidió el dueño del repo: misma clase (`muestraPersona`), mismo encuadre, misma `vozEnOff`, y **CONTINUIDAD DE PROPS**. Esta última es la que justifica todo: *"en un momento tiene un objeto en su mano, al siguiente ya no lo tiene, o se está aplicando un serum con un gotero y el gotero desaparece mágicamente"*. En el original ese salto es un corte de montaje y se lee como tal; dentro de un clip continuo es un objeto teletransportándose.

`objetoEnMano: {inicio, fin}` va como **CAMPO** y no se deduce leyendo `accion` con búsqueda de texto: la continuidad es una comparación exacta entre dos estados. Se compara normalizado (el modelo escribe *"El frasco"* en un corte y *"frasco"* en el siguiente), mismo criterio que `resolveSlotId` y `resolvePersonaje`. ⚠️ **Fail-closed**: sin el campo en los dos cortes no se une nada, así que toda sesión analizada antes de esto se comporta como siempre. ⚠️ **Converge adentro**, porque unir A+B habilita AB+C y dos listas de cortes para el mismo contenido son dos `scriptFingerprint` distintas.

⚠️ **Medido: en el video real de producción, 0 uniones de 5 cortes — y es CORRECTO.** Sus cinco cortes tienen trabajos de cámara genuinamente distintos (*"posición fija frontal"* contra *"zoom digital lento"* contra *"plano completo, handheld"*), así que unirlos habría metido el corte adentro del clip. El ahorro por esta vía solo aparece cuando el original repite el mismo setup; **el grueso del presupuesto lo liberó la compresión del andamiaje**, no la fusión.

### 🔴 VUELTA AL PROMPT MAESTRO — el prompt del lote recupera su forma (2026-09-03)

**Decisión del dueño del repo, con sus palabras:** *"TODO EL SISTEMA DE VIDEO ESTÁ CONTAMINADO DESPUÉS DE TANTAS ITERACIONES PARA TRATAR DE ARREGLARLO. Vamos a volver a la fuente de verdad, el prompt maestro."* La fuente es `PROMPT_MAESTRO_VIDEO_UGC_ACTUALIZADO.md` y su OUTPUT — PARTE 3.

**Lo que lo detonó es un CONTRAEJEMPLO, no una opinión.** Generó desde el wizard de KIE, con `grok-imagine-video-1-5-preview` y un prompt con la forma del spec, un clip que **sí ejecuta la coreografía**: suelta la gota en la mejilla, la masajea y lleva el frasco al pecho. Verificado acá fotograma a fotograma, y sin cortes de escena (detección a umbral 0,15 y 0,3): **una toma continua**. Lo que este repo emitía para el mismo tipo de contenido no lo ejecuta nunca.

Las diferencias, puestas lado a lado:

| | el prompt del spec (funciona) | el que emitía este repo |
|---|---|---|
| acciones | **2-3 eventos distintos**, lista numerada, **sin marcas de tiempo** | 6 ventanas de 1,5 s |
| qué dicen | *"Left hand gently touches the drop on her cheek, beginning to massage"* | *"Massaging skin"* · *"Rubbing cheek"* · *"Massaging cheek area"* |
| redundancia | la mano derecha se nombra cuando cambia | *"right hand: Holding bottle"* **seis veces** |
| forma | oraciones | telegrama |
| ocupación | prompt corto, casi todo contenido | 4.963 de 5.000 |

**Cinco de nuestros seis tramos eran la misma acción rebanada.** Un modelo que no puede distinguir un tramo del siguiente hace un gesto genérico y se queda quieto — que es exactamente lo que salía. **La densidad empujó en la dirección equivocada: no hacían falta más tramos, hacían falta tramos DISTINTOS.**

**EL MODELO VUELVE A `grok-imagine-video-1-5-preview`.** ✅ Canario gratis (2026-09-03): **prompt 4.096** (4.097 rechazado por largo), **7 imágenes aceptadas**, `aspect_ratio` validado contra lista y `9:16` la pasa, `duration` entera con 0 y 999 fuera de rango, `mode` y `nsfw_checker` aceptados. ⚠️ El rango exacto de `duration` **no se pudo aislar gratis**: cada canario enmascara al siguiente (con `aspect_ratio` basura la API ya no evalúa la duración). No importa: todo lote cae en 1–15 por la regla del spec.

⚠️ **904 CARACTERES MENOS DE PROMPT**, así que el presupuesto vuelve a ser un problema real — y por eso la emisión nueva es más corta, no más larga.

**La forma que se emite ahora**, literal del spec: `Prompt de Generación Visual (Contexto Absoluto)` con los bloques rotulados (Personaje, Producto, Escenario e iluminación, Cámara, Continuidad, Perfil de Voz y Acento, Regla de Video Limpio), después `Secuencia de Acciones Visuales` con `Toma N — X segundos` y una **lista NUMERADA** por toma, y al final `Guion de Locución Final`. En español, con los campos visuales en inglés — el contrato de idioma de FASE 1 encaja sin tocarse.

⚠️ **DE DÓNDE SALEN LAS ACCIONES NUMERADAS, que es la decisión de diseño y no el formato.** La REGLA DE ACCIONES del spec pide posición inicial → movimiento → interacción → dirección de manos → manipulación del producto → mirada → posición final. Eso es, campo por campo, lo que trae un `MotionBeat`, así que **el timeline de V2 se REUSA como fuente** y lo único que se descarta son sus ventanas de tiempo. Los beats `micro` se absorben en el evento anterior. Sin timeline —toda sesión guardada— se parte `accionVisual` por sus separadores, que es el camino de siempre.

⚠️ **LOS TRES CIERRES DE LOTE PROPIOS DE ESTE REPO SE FUERON, y es la decisión del dueño del repo, NO un re-descubrimiento.** La FASE 5 del spec tiene una sola regla: agrupar en orden, tope de 15 s, nunca partir una toma salvo que ella sola pase. Y su propio ejemplo mete un plano medio y un primer plano en el mismo lote (*"A sequence of two shots"*). Lo que se quitó, con su medición apuntada en `groupIntoLotes` para reponerlo sin re-descubrirlo: **`maxPlanos`** (lotes con dos encuadres 18 → 0 por 1,15×), **`clasePorTiempo`** (lotes que mezclan persona y producto 8 → 0 por 1,07×) y **`LOTE_MAX_COREO`** (prompts con la coreografía truncada 10 → 5 de 135). Las tres mediciones siguen siendo ciertas y las tres describen síntomas del prompt anterior.

⚠️ **`LOTE_MAX_CHARS` SE QUEDA, y la distinción importa:** no da forma al reparto, protege contra un fallo medido del RENDER —a 577 caracteres grok deja de recitar y empieza a improvisar— que el spec no contempla porque sus tomas vienen cronometradas del original a un ritmo decible, y las nuestras las reescribe FASE 3 y las edita el usuario.

⚠️ **Y CON EL CAP EN 15 s EL PISO DE HABLA PUEDE NO CABER.** Con el modelo anterior el techo eran 30 s y un piso de 20 entraba; acá la API no acepta más de 15, así que `clampDuration` recorta y el texto saldría apurado. Lo que impide llegar a ese caso es justamente `LOTE_MAX_CHARS` (15 × `CPS_MAX` = 300). Con test.

⚠️ **`MIN_TOMA_SEG` VUELVE A 3 y su test deja de exigir IGUALDAD con el piso del modelo.** El piso de la API es ahora **1 s**, y fusionar hasta 1 s no fusionaría nada: un corte de 1 s es renderable para la API y sigue sin ser una toma que valga un clip. Los 3 s son el valor propio de la fusión —el que tenía antes de que se lo comiera el piso del modelo de turno— y coinciden con la toma más corta del spec. El test pasa a `>=`.

⚠️ **EL ESCENARIO VUELVE AL PROMPT, y eso revierte una medición de 4 renders.** El spec lo exige por lote (REGLA DE CONTEXTO ABSOLUTO); está medido que el bloque de escenario en TEXTO hace derivar el fondo cuando contradice a la imagen del avatar (2 de 2 draws por brazo). Se emite igual, **y por eso es el PRIMER escalón que la escalera suelta**: si el fondo vuelve a derivar, el arreglo es bajarlo un nivel, no rediscutir el spec.

**Lo que se BORRÓ de la emisión, todo junto para que se vea el tamaño de la acumulación:** el CANDADO DE MOVIMIENTO (`START STATE` / `TIMED MOTION` / `END STATE` y sus tres prohibiciones), el bloque `SOUND` (que este documento ya marcaba *"SIN VERIFICAR"*), el detalle atómico por corte (`micro`, cubierto ahora por las acciones numeradas), el recorrido por mano (`manosDe`, misma razón), el guion global duplicado, el párrafo de overlay de quince sinónimos —reemplazado por la Regla de Video Limpio del spec, un tercio del largo— y la escalera de **siete** escalones, que queda en **tres** (escenario → etiqueta del producto → recorte de acciones). `probe-motion-lock.ts` se retiró con ellos: A/Beaba una máquina que ya no existe.

⚠️ **TRES CAMBIOS DE ORDEN EN EL PROMPT (2026-09-04), salidos de cruzar una auditoría del pipeline
con la guía pública de ESTE modelo. Ninguno toca el CONTENIDO: los mismos bloques, el mismo texto.**

1. **LA COREOGRAFÍA VA ARRIBA, no en el bloque 12 de 13.** Estaba detrás de ~3.000 caracteres de
   contexto. La guía de grok 1.5 dice que *"cada fotograma informa al siguiente, y la acción escrita
   al PRINCIPIO del prompt aparece al principio del clip"*, y el ejemplo oficial de xAI abre con el
   movimiento, no con el catálogo de referencias. Ahora va justo después de `References:`.
2. **EL BLOQUE DE MOVIMIENTO PASA DE SEGUNDO A ÚLTIMO EN LA ESCALERA, y estaba en el peor lugar
   posible.** El argumento para soltarlo temprano era que no está en el OUTPUT del spec y que la
   secuencia numerada ya dice lo concreto. Lo que ese argumento no pesaba es el modo de fallo del
   motor: **grok se queda ESTÁTICO cuando no se le pide movimiento**. O sea el síntoma de soltarlo
   es exactamente el defecto que más se reporta de esta tool ("se queda casi quieto todo el tiempo").
3. **EL ENCUADRE ENTRA EN LA ESCALERA (`NIVEL_CAMARA_CORTA`).** Medido sobre 146 lotes reales,
   `camaraDeLote` llega a **411 caracteres** y era el único bloque grande que **no estaba en ningún
   escalón**, así que su costo se lo terminaba pagando la coreografía en el piso.

**El orden de la escalera ES la regla:** primero se suelta lo que DUPLICA lo que las imágenes ya
muestran (escenario → encuadre → etiqueta del producto) y último lo que no dice nadie más (el
movimiento). Queda en **cuatro** escalones + el recorte de acciones.

✅ **Medido con el MISMO script sobre los 146 lotes reales, antes y después** (lectura pura, cero
llamadas a modelos):

| | antes | después |
|---|---|---|
| prompts completos | 106 | **108** |
| sin el bloque de movimiento | 20 | **15** |
| en el PISO, con la coreografía truncada | 12 | **8** |

O sea **5 lotes recuperan el movimiento y 4 dejan de perder coreografía**, y lo que se paga a cambio
es la etiqueta del producto recortada en 7 lotes más — que es exactamente el intercambio buscado,
porque la etiqueta la muestra `@image(2)` y la coreografía no la muestra nadie.

⚠️ La medición **no incluye las imágenes ancla** en `images`, así que los prompts reales son algo
más largos que los medidos; los números son comparables entre sí (mismo script) pero no con los de
una auditoría que sí las incluya.

⚠️ **`scriptFingerprint` v14 → v15**: la huella hashea INSUMOS y no el texto producido, así que un
cambio de plantilla le es invisible — sin el bump, reanudar pegaría un clip con el prompt viejo a
uno con el nuevo mientras `isPaidResume` jura que es el mismo contenido.

⚠️ **Los tres cambios están fijados por tests que FALLAN con el código anterior** (verificado
revirtiendo cada uno). El de la escalera hubo que escribirlo con cuidado para que discrimine:
*"sin movimiento ⟹ sin escenario"* se cumplía también con el orden viejo y no mide nada; lo que solo
es cierto con el orden nuevo es que **en el escalón donde la etiqueta ya se recortó, el movimiento
siga estando**.

✅ **LA CITA DE LAS IMÁGENES SE MUDA A LA CLÁUSULA — 4 RENDERS, 2 DRAWS POR BRAZO
(`scripts/probe-cita-imagen.ts`, 2026-09-04).** El repo declaraba una LEYENDA en la primera línea
(`References: @image(1) = la persona · @image(2) = el producto`) y después **no la volvía a nombrar
nunca** en el cuerpo. El ejemplo oficial de xAI hace lo contrario: cita la referencia DENTRO de la
frase que la usa (*"The woman from `<IMAGE_1>`… the shirt from `<IMAGE_2>`"*).

⚠️ **LA VARIABLE NO ES EL TOKEN, ES DÓNDE SE CITA — y hay que leerlo así.** Por KIE el prompt es
texto libre que se reenvía a grok: ni `@image(2)` ni `<IMAGE_2>` los parsea ningún deserializador,
los dos son palabras. Con dos imágenes, persona y producto se distinguen solas por contenido, así
que cambiar solo el token sería un no-op. Lo que puede mover la aguja es que el rol viaje **pegado a
la descripción que lo usa**. El brazo B cambió las dos cosas juntas porque ésa es la forma
documentada; **si hace falta aislar cuál mitad ganó, ese A/B está sin hacer.**

Mismo lote (`7e4ccbcf` lote 1, 10,4 s), diff de **3 líneas** entre brazos:

| | etiqueta del frasco legible | la apertura con el gotero |
|---|---|---|
| **A1** (leyenda `@image(n)`) | ❌ etiqueta genérica, texto ilegible | ❌ nunca separa el gotero |
| **A2** (leyenda `@image(n)`) | ✅ *"Niacinamide 10"* en 3 de 5 cuadros | ~ algo en la mano, el gotero no llega a la cara |
| **B1** (`<IMAGE_n>` en la cláusula) | ✅ *"La Roche-Posay · Niacinamide 10"* | ✅ **gotero afuera y junto a la mejilla**, cuadros 1-2 |
| **B2** (`<IMAGE_n>` en la cláusula) | ✅ la más legible de las cuatro | ✅ **gotero afuera y junto a la cara**, cuadros 1-2 |

**B: 2 de 2 en los dos observables. A: 1 de 2 y 0 de 2.** Costo: **$0,90 los cuatro renders**
(45 créditos cada uno).

⚠️ **EL OBSERVABLE FUERTE ES LA ETIQUETA, NO EL GOTERO.** Que el gotero salga es coreografía, y
este documento tiene medido tres veces que ahí manda la varianza del seed (`n = 3` en el A/B de un
beat por clip). La etiqueta es binding de la imagen del producto, que es justamente lo que la cita
declara. Con n=2 por brazo esto **no es un efecto medido, es una señal favorable** — lo que hace
adoptable el cambio es que sale gratis, no que esté probado.

✅ **Y el "gratis" está medido, no supuesto: 146 lotes reales, +57 caracteres cada uno, y CERO
bajan de escalón** en la escalera de degradación. Era la única forma en que este cambio podía hacer
daño (empujar un lote a soltar el movimiento o a truncar la coreografía) y no ocurre.

⚠️ **`scriptFingerprint` v15 → v16**, por el motivo de siempre: la huella hashea insumos, no el
texto emitido.

⚠️ **Con varios personajes la cláusula NO se toca.** `bloqueDe` emite `Character P1: …` y ahí no hay
un mapeo imagen→personaje en esa función; solo cambia el token de la leyenda. Es el camino sin
ejercitar (medido: de 18 sesiones con lista de personajes, ninguna tiene más de uno).

⚠️ **`scriptFingerprint` v12 → v13**, y los ESTADOS salen del hash: el prompt ya no los emite, y hashear un insumo que el prompt no lee es el espejo del bug que esa función existe para evitar. Los beats SÍ se siguen hasheando, porque son la fuente de las acciones numeradas.

**Herramienta de control: `scripts/probe-prompt-lote.ts`** imprime el prompt real de cualquier lote de una sesión guardada, con los mismos insumos que la ruta. Cero llamadas a modelos, cero renders. Es lo que hay que leer al lado del ejemplo del spec antes de gastar nada.

✅ **VERIFICADO CON UN RENDER REAL, Y ES EL PRIMERO DE TODA ESTA RONDA QUE EJECUTA LA COREOGRAFÍA.** Lote 1 de `7e4ccbcf` (11 s, prompt de 3.502 de 4.096 sin recortar), con las dos acciones numeradas:

```
1. Sostiene gotero con mano derecha, lo levanta y muestra la gota; mano izquierda
   sostiene el frasco. Mirada a cámara.
2. Muestra el frasco a cámara con ambas manos, luego aplica gota en mejilla izquierda.
```

Los seis fotogramas del clip, en orden: sostiene el gotero con el frasco abajo → lo levanta y lo muestra → presenta el frasco a cámara con las dos manos → sigue presentándolo hablando → **la mano sobre la mejilla con el producto visible** → extiende sobre el pómulo. **Las dos acciones, en su orden.** Contra el mismo tipo de contenido, la emisión anterior daba *"sostiene el frasco y habla los once segundos"*.

✅ **Y LA LOCUCIÓN SALE EN ESPAÑOL PALABRA POR PALABRA: 99 % de cobertura**, transcrita y comparada con el oráculo mecánico de `probe-audio-espanol.ts`. Lo único que se mueve son los acentos y "los 30" dicho como "los treinta", que es la transcripción y no el habla. **Hacía falta medirlo**: que grok dijera el español entrecomillado estaba verificado sobre el modelo ANTERIOR, y este es otro modelo.

⚠️ **UN HECHO POR LÍNEA, y no un ítem por acción — lo cazó el ojo del dueño del repo sobre ese mismo render.** Su observación: *"cuando saca el gotero no llega a aplicar la gota en el rostro CON EL GOTERO, sino que saca el gotero, deja caer la gota en el frasco y la gota aparece en la mejilla"*. Y el contraste con el prompt del wizard es exacto:

| | el que se ejecuta al detalle | el que emitíamos |
|---|---|---|
| | `Holding gotero in right hand.` | `1. Sostiene gotero con mano derecha, lo levanta y muestra la gota; mano izquierda sostiene el frasco. Mirada a cámara.` |
| | `Gently releasing one clear drop onto her left cheek.` | `2. Muestra el frasco a cámara con ambas manos, luego aplica gota en mejilla izquierda.` |
| | `Product bottle is held below.` | |
| | `Looking at the camera with a confident smile.` | |

**No era la lista numerada —eso ya estaba— sino cuánto entra en cada ítem.** Con *"sostiene + levanta + muestra"* en un solo renglón el modelo lo resuelve como UN gesto (mostrar el gotero) y la aplicación de la línea siguiente queda huérfana del instrumento, así que la gota "aparece". `partirEnHechos` parte por punto, punto y coma, el separador de fusión y `, luego`; con timeline, cada casilla del beat es su propia línea.

⚠️ **Y NO SE PARTE POR COMA A SECAS, que es un falso positivo medido:** *"Mira producto y luego a cámara"* son dos destinos de la MISMA mirada y partirlo deja *"a cámara"* sin verbo. Under-partir es preferible a producir fragmentos sin verbo — misma jerarquía que el acote de `limpiarEscenaDeFoto`.

✅ **ARREGLADO EN FASE 1, Y LA UBICACIÓN DE LA REGLA VOLVIÓ A DECIDIR.** El prompt que funciona dice *"releasing one clear drop of SERUM **onto her left cheek**"* —instrumento, objeto y destino en una cláusula— y el nuestro decía *"aplica gota en mejilla izquierda"*, sin nombrar con qué. Dos reglas nuevas:

1. **`accion`: un hecho por cláusula, separadas por punto y coma.** Su encabezado decía literalmente *"es SOLO un resumen legible… no gastes detalle acá"*, que era cierto cuando la coreografía viajaba por otro lado y dejó de serlo cuando `accion` pasó a ser la fuente de la lista numerada.
2. **`leftHand` / `rightHand` nombran el instrumento Y el destino en la misma frase**, con sus anti-ejemplos (`applying serum to cheek` → `releases one drop with the dropper onto her left cheek`).

⚠️ **La segunda no funcionó hasta moverla A DONDE SE DECLARA EL CAMPO.** Puesta en el encabezado del bloque de `motion` el refinamiento siguió devolviendo *"applying serum to cheek"*; movida junto a la línea que enumera `body, headAndGaze, leftHand, rightHand`, la corrida siguiente devolvió *"rubs cheek in upward circles"*, *"fingertips tap forehead"*, *"holds bottle below chin"*. **Es la tercera vez que este documento registra lo mismo** (la escala de encuadre y `micro.manos` fueron las otras dos): una regla lejos de su campo es una sugerencia.

❌ **Y LAS VENTANAS DE 1,5 s SE APAGARON EL MISMO DÍA QUE SE MIDIERON, porque resolvían un problema de la emisión VIEJA.** Aquella mandaba ventanas de tiempo y se quedaba corta de tramos; la del spec manda **pocos hechos DISTINTOS**. Medido sobre este mismo video con las ventanas puestas: un corte de 20 s volvió con **14 beats, diez de ellos** *"sostiene el frasco · relajada"* — que con un renglón por casilla son ~56 ítems numerados para un clip, contra los 3 a 5 del shot list del spec. Sin ventanas vuelve a 2-3 beats por corte, que es la granularidad correcta. `VENTANA_BEAT_SEG` queda en `null` con su medición escrita: **la palanca nunca fue la cantidad, sino que los tramos se distingan entre sí.**

⚠️ **EL FORENSE DESCRIBÍA LA TRAYECTORIA Y SE SALTABA EL EVENTO — reportado sobre el arranque del anuncio.** Las palabras del dueño del repo: *"empieza con el gotero en mano derecha y el frasco en izquierda, y de frente aplica el producto en la mejilla, ese es el primer movimiento de todo el video y es lo que el forense debe rescatar"*. Verificado contra el original fotograma a fotograma (0,5 s gotero en la mejilla · 1,1 s aplicando · 2,2 s bajando · 2,75 s de vuelta al frasco · 3,3 s los dedos extendiendo).

El análisis devolvía: *"holding the dropper above her cheek"* → *"moving dropper away from cheek"* → *"closing the dropper into the bottle"*. **Tres posiciones ciertas de la mano, y el evento —la gota saliendo del gotero y cayendo en la piel— sin escribir.** El render ejecuta lo que lee: hace el viaje del gotero y no aplica nada.

**Se arregla en los DOS lados, y hacían falta los dos:**
1. **El prompt** (junto a la declaración de los campos, que es donde este repo ya midió tres veces que hay que ponerlo): *si el producto llega al cuerpo en algún momento del corte, UN beat tiene que decir la TRANSFERENCIA* —`releases two drops onto her left cheek`— *y su `productStateAfter` decir que el producto está EN la piel. `near the cheek`, `above her cheek` o `moving away` dicen dónde está la mano; no son el evento. Acercarse y retirarse son sus CONSECUENCIAS.*
2. **La emisión**, porque el dato ya estaba y se tiraba: tras el cambio de prompt la cadena decía *"Dropper releasing drop onto cheek"* y `accionesNumeradas` imprimía solo el estado del ÚLTIMO beat del clip. Ahora el cambio de estado del producto se emite **en su evento**, no al final.

✅ **Verificado con un render:** el clip pasa a llevar el gotero a la mejilla, sostenerlo ahí y devolverlo al frasco — la apertura del original, que antes no ocurría.

⚠️ **`--solo-motion` re-corre SOLO el refinamiento sobre los cortes guardados**, y es la forma de iterar el prompt del movimiento sin volver a segmentar el video: los cortes no se mueven, el guión no se desincroniza, y cuesta una llamada en vez de dos.

⚠️ **LA ACCIÓN LA ESCRIBE FASE 1 COMO UNA ORACIÓN — `MotionBeat.action`, y las cuatro casillas se BORRARON.** Coser la frase en el emisor desde `body` + `headAndGaze` + `leftHand` + `rightHand` producía un inventario (*"is holding the dropper with her right hand while her left hand is holding bottle in place"*); el prompt del wizard que sí se ejecuta al detalle las trae redactadas. Ahora el forense devuelve *"She maintains the bottle in her left hand and places a drop of serum on her cheek with the right hand"* y el prompt la emite tal cual.

⚠️ **Y LA ORACIÓN ARRANCA POR LA ACCIÓN QUE AVANZA — la mano que solo sostiene va al final, en subordinada.** Medido con un render: escrita al revés, *"She **maintains the bottle** in her left hand and places a drop of serum on her cheek"*, el clip ejecutó el verbo principal —sostener el frasco y hablar— y **se saltó la gota entera**; el gotero ni siquiera se separó del frasco. Con la acción adelante, *"She **releases one drop** onto her cheek with the dropper, while her left hand holds the bottle at chest level"*, el mismo lote ejecutó las cuatro oraciones en orden: extrae el gotero, lo lleva a la mejilla, lo devuelve al frasco, y en la toma 2 se toca el pómulo con el índice. **El modelo filma la cláusula principal; una acción subordinada no se filma.**

La regla trae su contraparte, porque si no el modelo disfraza la quietud de acción: *cuando en un beat NO avanza nada —solo sostiene y habla— eso se dice como cláusula principal* (`She holds the bottle at chest level and speaks to the camera`). La quietud declarada es un dato; un beat estático vestido de acción, no.

⚠️ **NO ALCANZÓ CON DEJAR DE PEDIRLAS: hubo que borrarlas del schema.** Con `action` agregada y la instrucción diciendo explícitamente *"do NOT also fill body, headAndGaze, leftHand or rightHand"*, el refinamiento devolvió **las cuatro llenas y `action` VACÍA en los 5 cortes** — el campo que el modelo ya sabía contestar le ganó al nuevo. Es la **quinta** vez que este repo lo paga (`izquierda`/`derecha`, `Micro.posicion`, `objetoEnMano`, `productInteraction`) y la conclusión escrita es siempre la misma: **el arreglo es borrar el duplicado, no insistir en el schema.**

⚠️ **Y EL ESTADO DEL PRODUCTO DEJÓ DE APENDARSE al final de la oración**, por lo mismo: la frase ya nombra instrumento y destino, así que agregarlo daba *"places a drop of serum on her cheek, **and serum on cheek**"*. Los estados siguen en el beat porque de ellos salen `objetoEnManoFromMotion` y el validador de la cadena.

⚠️ **`--solo-motion` PISA SIEMPRE, y la ruta NO.** Aquélla solo acepta el refinamiento cuando trae MÁS beats —para no cambiar un timeline por uno más pobre— y esa regla bloquea justo el caso de este script: cambiar el FORMATO de los beats sin cambiar su número. Medido: tras agregar `action` la corrida devolvía los beats viejos porque 3 no es mayor que 3, y el campo nuevo quedaba en `undefined` sin que nada lo dijera. **Huella v13 → v14.**

⚠️ **`norm` (motion.ts) es defensivo con `undefined` por esto mismo:** los beats llegan de un jsonb guardado y un campo agregado después no existe en las filas viejas — normalizar una sesión anterior reventaba con *"Cannot read properties of undefined"*.

✅ **LA ORACIÓN DE ACCIÓN PASA A TENER PLANTILLA — lista CERRADA de verbos y verificación en código (2026-09-04, decisión del dueño del repo).** Reportado como *"algunos clips salen bien y otros no tanto"*, y el diagnóstico se hizo mirando los CINCO lotes reales de `7e4ccbcf` antes de tocar nada:

| lote | lo que emitía | |
|---|---|---|
| 3 | *"She **deposits** a drop of serum on her left cheek **with the dropper**, while holding the bottle steady"* | ✅ el patrón que se ejecuta |
| 1·s1 | *"She **speaks to the camera** while holding the open dropper near her cheek"* | ❌ la acción, en la subordinada |
| 4 | *"She **holds** the bottle up near her chin… **and talking**"* — 9,8 s | ❌ la cláusula principal no avanza |
| 2 | *"**bottle rotation**"* | ❌ ni sujeto ni verbo |

**El esqueleto del prompt del lote ya era una plantilla y no varía; lo único que variaba es la ranura de las acciones numeradas, y ahí el patrón bueno salía 1 de cada 3.**

**La plantilla (`REGLA_ACCION`, forensic.ts) tiene cinco ranuras en orden fijo** — sujeto · verbo de evento · objeto y dónde aterriza · instrumento · la otra mano en subordinada al final — y **tres formas con precedencia**: `A · TRANSFER` (el producto llega al cuerpo) → `B · HANDLING` (algo cambia de estado sin llegar al cuerpo) → `C · DECLARED STILLNESS` (no avanza nada, y se dice como cláusula principal). La precedencia es la que mata los tres fallos: el lote 1·s1 y el 4 son B disfrazados de C.

⚠️ **LA LISTA DE VERBOS ES CERRADA (`VERBOS_ACCION`), y es lo que estandariza de verdad.** Tres clases —transferencia, manipulación, quietos— y las clases NO son decoración: el verificador usa `quietos` para cazar el beat que cambia el estado del producto y se describe con un verbo que no avanza. **Se amplía agregando verbos ahí, no dejando que el modelo invente**: un producto que no se pueda describir con la lista (un parche, un roll-on) necesita su verbo escrito, y ese cambio es visible en el diff; un verbo libre no lo es.

⚠️ **Y ESTABA EN UN SOLO PROMPT DE LOS DOS — ésa era la mitad silenciosa del problema.** El pase GENERAL de FASE 1 seguía pidiendo `body` · `headAndGaze` · `leftHand` · `rightHand`: **cuatro campos que ya no existen en el schema**. O sea que cada vez que el refinamiento falla (va en `try/catch`) o no trae más beats que el pase general, `action` volvía VACÍA y el lote caía a la prosa sin que nada lo reportara. La plantilla vive ahora en UNA constante que emiten los dos prompts — **la regla va donde se declara el campo**, tercera vez que este documento lo registra. Con test que exige las tres formas y la lista en los dos, y que ninguno vuelva a nombrar los campos borrados.

**`verificarAcciones` lo comprueba en código y SOLO LOGUEA** (decisión del dueño del repo). Cuatro reglas, cada una por una de las frases de la tabla: (1) arranca con el sujeto — caza el fragmento; (2) el primer verbo está en la lista cerrada — caza la redacción libre y el `speaks` de apertura; (3) si `productStateBefore ≠ productStateAfter`, el verbo no puede ser de clase quieta; (4) sin coletilla `and talking`. Un beat SIN oración también se reporta: es el modo de fallo silencioso de arriba.

⚠️ **NO REPARA, y es deliberado:** reescribir la oración en código sería inventar coreografía, que es exactamente lo que el spec prohíbe. Mismo criterio que `verificarDialogos` y `coreografiaEscasa`. Cuando esté medido cuánto se dispara, el upgrade barato es reintentar el refinamiento — `reanalizar-forense --solo-motion` cuesta UNA llamada y no re-segmenta el video.

✅ **Medido sobre las sesiones guardadas (lectura pura, cero LLM): 12 de 20 beats — el 60 % — están fuera de plantilla**, y los cuatro motivos se disparan (6 verbo fuera de lista · 3 coletilla de habla · 2 fragmento · 1 verbo quieto con el producto en movimiento). Ninguna regla es letra muerta, y el número explica el *"algunos sí y otros no"*.

✅ **Y VERIFICADO CON UNA CORRIDA REAL DEL REFINAMIENTO** (`reanalizar-forense --solo-motion`, una llamada de texto, sin escribir en la base): **las 10 oraciones salieron con la FORMA de la plantilla** — `She <verbo> <objeto> with <instrumento>, while her <lado> hand <estado>.` Cero fragmentos, cero coletillas de habla, cero apertura con `speaks`, y el corte de la aplicación devolvió la transferencia con su instrumento (*"She releases one drop of serum onto her left cheek with the dropper, while her left hand holds the bottle at chest level"*) seguida del masaje. Contra el 60 % de antes, quedan 5 marcadas.

✅ **LA ORACIÓN GANA CÓMO, NO SOLO QUÉ — `MANERA_ACCION` (2026-09-04).** La plantilla decía qué
evento ocurre y con qué instrumento, y **nunca a qué velocidad ni con cuánta fuerza**. Medido antes
de pedirlo, sobre las 30 oraciones guardadas: **1 trae manera (3 %)**, y esa única la pone en la
SUBORDINADA (*"holds the bottle firmly"*), o sea sobre la mano que no avanza.

⚠️ **NO ES UN SEXTO HUECO, y esa distinción es la que decide si el eje existe.** Este documento
tiene medido CINCO veces que un campo nuevo que solapa con otro ya contestado vuelve vacío. Acá el
cualificador va DENTRO de la cláusula que el modelo ya escribe, con **lista cerrada** (`quickly ·
slowly · gently · firmly · carefully · in one smooth motion`) por el mismo motivo que los verbos:
se amplía en el diff, no dejando que el modelo invente.

⚠️ **Y VA AL FINAL DE LA CLÁUSULA PRINCIPAL, NUNCA DELANTE DEL VERBO — ahí estaba el riesgo real.**
`verboDe` busca el verbo **pegado al sujeto** (`resto.startsWith(v + ' ')`), así que un `She quickly
raises…` haría que `verificarAcciones` marque *"el primer verbo no está en la lista cerrada"* en
TODA oración con manera: el instrumento roto justo donde se mide. Es la misma lección que dejaron
`repartirAccion` y el contrato de idioma — **al cambiar el formato que produce el forense hay que
mirar quién lo parsea aguas abajo**. El verificador además **nombra ese caso aparte**: decir "el
verbo no está en la lista" sobre una oración cuyo verbo SÍ está es un diagnóstico que miente.

⚠️ **`motionProfile.calidadMovimiento` no lo cubre**: ése es el carácter del personaje y es el MISMO
en los 5 lotes del anuncio. Esto es por beat. Dos campos con la misma pregunta en granularidades
distintas no son duplicados — mismo criterio que `micro` contra un beat.

✅ **VERIFICADO CON UNA CORRIDA REAL DEL REFINAMIENTO** (`reanalizar-forense --solo-motion`, una
llamada de texto, sin escribir en la base): manera en **2 de 10 beats**, las dos al final de la
cláusula principal —*"She rotates the bottle between both hands **carefully**"*, *"She lowers the
bottle to her chest **slowly**"*— y **`oración de acción: todas en plantilla`**, o sea el
verificador no se rompió. 2 de 10 es lo que la regla pide: solo donde el ritmo se VE (una rotación
y un descenso); los otros ocho son sostenes y una transferencia a ritmo corriente. ⚠️ `n = 1`, y
**que esas dos sean ciertas del video no se comprobó fotograma a fotograma** — lo medido es que el
modelo la emite, es selectivo y no rompe el parser.

⚠️ **Solo alcanza a análisis NUEVOS** (paso caro). Y **no lleva bump de huella**: cambia el VALOR de
`accionVisual`, que `scriptFingerprint` ya hashea como insumo, no la plantilla de `buildLotePrompt`.

⚠️ **Y LAS QUE QUEDAN SON LA LISTA CORTA, NO EL MODELO: `gestures`, `presents` y `rotates`.** Tres verbos legítimos, elegidos bien y con la oración bien formada, que la lista no tenía. **Se agregaron — ése es el mecanismo funcionando, no una excepción**, y hay un test con las tres frases reales para que un recorte futuro de la lista se vea. La quinta (`points to` con el producto cambiando de estado) se deja marcada: o el beat debía ser forma B, o la cadena de estados está mal encadenada; las dos cosas son algo que mirar, no un falso positivo del guard.

⚠️ **Es un cambio del paso CARO: solo alcanza a análisis NUEVOS.** Las sesiones guardadas conservan sus oraciones; para pasarlas a la plantilla hay que correr `reanalizar-forense --solo-motion`, que no re-segmenta el video. **NO lleva bump de huella:** `scriptFingerprint` protege la plantilla de `buildLotePrompt`, que no se tocó — lo que cambia es el VALOR de `accionVisual`, que la huella ya hashea como insumo.

🔴 **EL REPARTO DEL DIÁLOGO ENTRE CORTES ERA EL DEFECTO QUE CONTAMINABA TODO CUESTA ABAJO, y estuvo invisible hasta que se midió el RITMO DEL HABLA de un clip.** Reportado como *"el pace del habla estuvo demasiado rápido"*, y la cadena completa resultó ser:

| | medido en `7e4ccbcf` |
|---|---|
| los cortes **2 y 3 traían LA MISMA línea** | 82 caracteres duplicados → el guión adaptado se infló **+143 caracteres (19 %)** |
| el corte 1 traía **163 caracteres en una ventana de 4 s** | **40,8 car/s**, el doble de lo decible — dos frases que en el original van de 0 a 10 s |
| `repairCutTiming` lo tapó | infló ese corte a 8,2 s tomando tiempo de los que tenían holgura, así que el análisis guardado se veía consistente |
| el síntoma, tres pasos más abajo | el clip habla a **20,0 car/s** contra los **16,3** del original |

**`verificarDialogos` (forensic.ts) lo comprueba en código, y solo REPORTA.** Tres chequeos: diálogo repetido entre cortes, la concatenación que no reconstruye `guionOriginal`, y —el que se auto-ocultaba— diálogo que no entra en su **VENTANA** (`tiempo`), nunca en la duración ya reparada.

⚠️ **NO REPARA, y la diferencia con `verificarHablantes` es deliberada:** aquél tiene un fallback seguro —descartar la atribución y quedarse con `dialogo`, que es el comportamiento de siempre— y un reparto mal partido no lo tiene. Adivinar dónde va cada frase sería inventar el corte. Se loguea y se muestra, como `coreografiaEscasa` y `desalineadas`.

**Y la regla en el prompt de FASE 1**: el diálogo de un corte es SOLO lo que se dice dentro de su ventana, pegar todos en orden tiene que reconstruir el guion exacto, y —lo que apunta a la causa— *si el texto no entra en la ventana, el corte está mal partido: revisá dónde está su límite real, casi siempre hay un corte de edición que no se detectó*.

✅ **MEDIDO DESPUÉS, y el ritmo se arregló EN LA FUENTE:**

| | antes | después |
|---|---|---|
| cortes | 5, con ventanas que no cuadraban con las duraciones | 5, cada uno con su ventana real (3 · 7 · 5 · 20 · 11 s) |
| guión adaptado | +143 caracteres | **+17** |
| ritmo del análisis | — | **16,5 car/s** contra los 16,5 del original |
| lote 1 | **20,0 car/s** | **17,0** |
| problemas | 3 | **0** |

Lo que queda es que los lotes 2 a 4 andan en 18-19 car/s: eso ya no es el reparto sino que FASE 3 escribe un poco largo por toma, que es otra palanca y `Section5Script` ya avisa por línea sobre 1,3×.

⚠️ **`--write` NO PERSISTE UN ANÁLISIS CON PROBLEMAS.** El forense es **estocástico**: dos corridas seguidas sobre el mismo video dieron 5 cortes limpios y 3 cortes con dos problemas — y la mala se llegó a guardar antes de poner el guard. Guardar la tirada mala contamina la plantilla, el guión y los cinco prompts de render, y el síntoma aparece recién en el clip; volver a correr cuesta dos llamadas y descontaminar la sesión cuesta rehacerla entera. `--force` existe para cuando el defecto está en el video y no en la tirada.

⚠️ **RE-ANALIZAR UNA SESIÓN DESINCRONIZA SU GUION, y hay que saberlo antes de apretar.** `scripts/reanalizar-forense.ts` re-corre FASE 1 sobre una sesión guardada (existe porque este documento repite *"solo alcanza a análisis NUEVOS"* en cada arreglo del paso caro). Replica el orden exacto de la ruta y **no escribe sin `--write`**; antes compara las ventanas de tiempo nuevas contra las viejas y dice cuántas tomas del guión se quedan sin corte. Medido en `7e4ccbcf`: el análisis nuevo devolvió **5 cortes donde había 4** y **3 de 4 tomas quedaron huérfanas**, así que después de re-analizar hay que volver al paso de plantilla y re-adaptar el guión en el wizard. Es la misma razón por la que `repairCutTiming` no toca `tiempo`.

⚠️ **`n = 1`, y hay que leerlo así.** Es un lote, un seed, una sesión. Lo que prueba es que la emisión nueva SÍ produce el clip que se le pide —que es exactamente lo que la anterior no lograba en doce renders— no que lo haga siempre.

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

⚠️ **EL REPARTO SE QUEDÓ SIN LEER EL SEPARADOR NUEVO, Y ESO DEJABA FRAGMENTOS SIN UNA SOLA INSTRUCCIÓN DE MOVIMIENTO (2026-09-02, `repartirAccion`).** Reportado como *"se pierden movimientos: aplicarse el serum con el gotero, acercar el rostro"*.

`repartirAccion` parte la coreografía por ` Luego, `, que **lo escribe `mergeMicroCortes` al fusionar**. Pero desde que FASE 1 pide los cortes de más de 10 s **por tramos con marca de tiempo** (`0-5 s: …; 5-10 s: …`), un corte largo **sin fusionar** trae su separador como un `;`, no como ` Luego, `. La función veía UN tramo y se iba por la rama de "sin separador": todo al primer fragmento, el resto en blanco.

Medido en la sesión `ca62aaed`, una toma de 20 s partida en 11,6 + 6 + 2,3 s:

| fragmento | antes | después |
|---|---|---|
| lote 2 · 11,6 s | los **4 tramos** (o sea 20 s de coreografía en 11,6) | *"aplica una gota en el rostro · distribuye con movimientos circulares en pómulos y cuello"* |
| lote 3 · 6 s | **VACÍA** | *"habla mirando a cámara mientras sostiene el frasco"* |
| lote 3 · 2,3 s | **VACÍA** | *"finaliza tocando su barbilla y rostro"* |

O sea **8,3 s de los 45 — el 18 % del anuncio — se renderizaban sin ninguna instrucción de movimiento**, y ahí el modelo improvisa. Eso es exactamente el síntoma reportado.

⚠️ **ES UNA REGRESIÓN DE LA MEJORA DE FASE 1, no un hueco viejo.** Antes de que se pidieran los tramos, un corte de 20 s llegaba como UNA frase de prosa y no había nada mejor que repartir; ahora la información de tiempo existe y se estaba tirando. La lección general: **al cambiar el FORMATO que produce el forense hay que mirar quién lo parsea aguas abajo.**

⚠️ **LAS MARCAS DE TIEMPO SE CAEN AL PARTIR, y eso es la otra mitad del arreglo.** Son relativas a la toma ENTERA, mientras que la duración de cada fragmento sale del reparto proporcional del TEXTO HABLADO: un fragmento de 6 s que recibe *"10-15 s: …"* le pide al modelo que no haga nada durante los primeros diez segundos de un clip que dura seis. **Ninguna re-numeración las vuelve ciertas** — el fragmento no hereda la ventana de tiempo de sus tramos — y dos instrucciones que se contradicen en el mismo prompt es el modo de fallo que este documento ya registra cuatro veces. Mientras la toma NO se parte, las marcas se conservan intactas: ahí sí son ciertas.

⚠️ **Medido sobre el corpus, el arreglo mueve poco HOY y mucho MAÑANA:** de 215 cortes con acción, solo **4 traen tramos** (la mejora de FASE 1 es reciente y solo alcanza análisis nuevos) y **169 no traen ningún separador**. Sobre las 33 sesiones guardadas el reparto pasa de **35 a 31 tomas mudas** (161,9 → 146,3 s). El residuo son cortes largos que nunca se fusionaron y cuyo forense es anterior a los tramos: ahí no hay nada que repartir y la rama de "todo al primero" sigue siendo la correcta. Con cada análisis NUEVO ese residuo se achica solo. Los dos separadores se normalizan a uno antes de partir, así que el caso *fusionado Y con tramos* (1 de 215) convive sin pelearse. Con tests sobre la cadena real de esa sesión.

⚠️ **EL SCAN DESCRIBE LA FOTO Y NO SOLO EL PRODUCTO — y eso viajaba al render (`product-scan.ts`).** El síntoma llegó por otro lado: `adapted.tomas[0].accionVisual` terminaba con *"El producto descansa sobre una superficie blanca plana y produce una sombra suave a la derecha. No está flotando."* — escenografía de catálogo dentro del campo de COREOGRAFÍA. Pero la causa **no está en FASE 3**: está en `product_scan.productDescription`, que es de donde el modelo la copió.

`productDescription` sale de mirar la foto del envase, y el modelo describe de paso **la puesta en escena de esa foto**: sobre qué superficie está apoyado, qué sombra proyecta, de dónde viene la luz. Medido sobre los **35 scans guardados, 9 (26 %) traen al menos una frase así**, con *"No está flotando."* como la más común (6 de 16 frases).

⚠️ **No es cosmético: ese campo se emite ÍNTEGRO en el prompt de CADA lote.** O sea el render recibía *"el producto descansa sobre una superficie blanca plana"* dentro de un clip donde la persona lo tiene en la mano en una sala — la misma clase de contaminación que `SETTING AND LIGHTING`, por otra puerta. El síntoma en `accionVisual` era el más visible, no el más caro.

**Tres puertas, y las tres hacen falta:**
1. **El prompt del scan** ahora dice explícitamente que describa el objeto y NUNCA la fotografía (nada de superficie, sombra, dirección de luz, ángulo de cámara, fondo, ni si flota), con el motivo: en el video va en la mano de alguien, así que la toma de catálogo de la que salió no es parte del producto.
2. **`getVideoSession` limpia al LEER**, en una sola puerta — mismo criterio que `aKind` en anuncios. Es lo único que repara las sesiones YA guardadas, y el scan es una llamada de visión pagada que no se justifica re-correr por esto. Los dos consumidores (`generate-lotes` y `adapt-script`) leen por ahí.
3. **`analyze-product` limpia al ESCRIBIR**, para que la fila nazca limpia.

⚠️ **EL ACOTE ES ANGOSTO A PROPÓSITO, y la primera versión ya se pasó.** Con `sobre un fondo` en el patrón se comía *"Las letras son en su mayoría en blanco y rosa sobre un fondo negro"*, que SÍ describe la etiqueta. El modo de fallo correcto es **dejar pasar una frase de escenografía, nunca borrar la identidad del envase**: por eso `sombra` exige un adjetivo de sombra proyectada (si no se comería una *"sombra de ojos"*, que es un producto entero) y por eso, si al limpiar no queda nada, se devuelve el original.

✅ **Verificado contra los 35 scans reales: 16 frases quitadas en 9 scans, todas escenografía de la foto, cero descripción de producto perdida y ninguno vacío.** Con tests sobre el caso real, sobre los dos falsos positivos y sobre el fail-safe.

🔴 **CORRECCIÓN — LA ESCENOGRAFÍA DE FOTO TIENE UNA SEGUNDA FUENTE, Y ES EL SYSTEM PROMPT: ESTA TOOL CORRÍA BAJO EL DE ANUNCIOS ESTÁTICOS (2026-09-06).** Arriba se atribuye *"No está flotando."* enteramente a `product_scan.productDescription`. Medido sobre la sesión `c3dc2777`, esa atribución es INCOMPLETA: las SEIS `accionVisual` del guion adaptado terminaban con *"El producto no está flotando."* y **la frase no está en ningún insumo de la sesión** — ni en `productDescription` (que ahí solo describe el frasco y transcribe la etiqueta), ni en la etiqueta, ni en el forense, ni en los inputs. La puso el modelo, obedeciendo.

`callVideoAds` pasaba `undefined` como system prompt, o sea el **default de `callStructured`: `lib/prompts/gemini-system.md`**, que abre con *"You are a static ad replication engine"* y ordena entre sus reglas de oro *"Always extract product physical position… physicalPosition must be one declarative sentence ending with the negative: 'No está flotando.'"*. Correcto para un anuncio estático, donde el producto ES una foto de catálogo; veneno para un video, donde está en la mano de alguien. **Branding y landing ya tenían system prompt propio** (`BRANDING_SYSTEM_PROMPT`, `LANDING_SYSTEM_PROMPT`); el video se había quedado con el ajeno, y lo peor es dónde aterriza la orden: `accionVisual` es el ÚNICO campo que le dice al render qué hace el cuerpo, y se emite en el prompt de cada lote.

⚠️ **El forense corría bajo el mismo prompt**, y por la misma puerta: `analyze-reference` llama a `geminiCallStructured` sin systemInstruction. Eso explica el defecto que este documento anotaba como cosmético y sin causa (*"`sujeto` volvió con «Not está flotando.» pegado al final"*): no era un tic del modelo, era una instrucción.

`lib/prompts/video-system.md` es el system prompt de la tool y lo pasan las DOS puertas (`callVideoAds` y la ruta del forense). Dice lo que esta tool necesita y el de anuncios no puede decir: que la referencia es una imagen en MOVIMIENTO y la coreografía es lo que se copia; que **un aplicador (cuentagotas, cuchara, tapa) es coreografía y no un dato del producto viejo**; y que no se describe la superficie, la sombra, la luz ni si el producto flota. Con test en las dos puertas que falla con el default puesto.

⚠️ **`limpiarEscenaDeFoto` sobre el scan NO alcanzaba y no es su culpa:** limpia el campo del que el modelo copia, no la orden que lo hace escribir. Son dos fuentes y hacen falta las dos puertas. La contraparte acá es `sinEscenaDeFoto` (`lotes.ts`), que quita la oración al EMITIR el prompt del lote: repara los guiones YA guardados —incluido el de una sesión con lotes pagados— sin re-correr FASE 3. ⚠️ **Huella v3 → v4**: eso cambia el TEXTO que `buildLotePrompt` emite con los mismos insumos —igual que redondear la duración de la toma con `r1`— y `scriptFingerprint` hashea insumos, así que sin el bump un resume pegaría un clip del prompt viejo a uno del nuevo. Mismo acote angosto y mismo fail-safe: solo la oración completa sobre flotar o apoyarse, y si al limpiar no queda nada se devuelve el original.

🔴 **Y EL FORENSE YA CORRECTO SEGUÍA DANDO CLIPS MALOS: LA COREOGRAFÍA SE DUPLICABA AL PARTIR LA TOMA (2026-09-07).** Reportado por el dueño del repo con el forense ya arreglado: *"a mi parecer la secuencia de acciones ahora sí salió tal cual es en el video original, pero el modelo aún no interpreta bien las instrucciones porque genera los videos con errores"*. El defecto está río abajo del guion: `splitLongToma` reparte la duración y la locución, y copiaba `accionVisual` **entera** con el spread `{ ...t }`.

Medido sobre las 38 sesiones guardadas, corriendo `groupIntoLotes` de verdad (no leyendo `adapted.tomas`, donde el reparto todavía no ocurrió): **71 de 253 fragmentos (28 %) y 462 s de 1655** con la coreografía duplicada, en 21 de 38 sesiones. En la sesión reportada, el corte de 19,3 s pedía sus cuatro hechos completos dentro de un clip de 11,1 s **y otra vez** en los dos fragmentos del lote 4 — o sea dos clips seguidos intentando el mismo gesto, que es exactamente el síntoma.

⚠️ **EL CONFOUND SE RESOLVIÓ ANTES DE ESCRIBIR CÓDIGO, y era la mitad de la pregunta.** Un duplicado puede venir de la toma partida o de que FASE 3 emita el MISMO texto para dos cortes distintos, y el arreglo es distinto en cada caso. Separando por `tiempoOriginal`: **71 por la partición y 0 por texto repetido entre cortes**. Un solo defecto, en un solo sitio.

**`repartirAccion` reparte los hechos EN ORDEN**, proporcional a la duración de cada fragmento por resto mayor, con al menos uno cada uno cuando alcanza. Sin separador que aprovechar, todo va al PRIMER fragmento y los demás quedan sin línea: **vacío es recuperable, duplicado no**. Corre en `partirToma`, un envoltorio sobre `splitLongToma` — el reparto necesita ver la lista de fragmentos cerrada y la recursión de aquella devuelve de a uno.

⚠️ **Y SÍ SE PARTE POR COMA, contra lo que este documento tenía escrito — pero con un guard, no aflojando el criterio.** El falso positivo medido sigue siendo real (*"Mira producto y luego a cámara"* son dos destinos de la MISMA mirada y partirlo deja *"a cámara"* sin verbo). Lo que lo distingue de un hecho nuevo es que **el fragmento huérfano no empieza con un verbo**. `VERBOS_TRAMO` es una lista CERRADA (~42 verbos de coreografía) y solo se parte por coma cuando la cláusula siguiente abre con uno; sin coincidencia no se parte. Se amplía agregando verbos ahí —visible en el diff— y no bajando el umbral, mismo criterio que las listas cerradas del resto del repo.

**Hacía falta:** partiendo solo por punto y punto y coma, el reparto funciona en **15 de 22** tomas partidas de la base y es un **no-op justo en la sesión que el usuario reporta**, cuyos cuatro hechos van separados por coma (*"se aplica producto en mejilla, extiende suavemente con dedos, realiza toques ascendentes, muestra el frasco a cámara"*). Con el guard de verbo: 17 de 22.

✅ **Medido sobre la base entera, antes y después:**

| | fragmentos con la coreografía duplicada | sin ninguna línea de movimiento |
|---|---|---|
| antes | **71 de 253 (28 %) · 462 s** | 0 |
| después | **0** | 5 (2 %) · 20 s |

Los 5 vacíos son el fail-safe funcionando: tomas cuya acción es UN solo hecho (*"P1 alterna entre sostener el producto y masajear su rostro"*) partidas en dos fragmentos. Es la dirección correcta del fallo y un orden de magnitud menos que los 462 s duplicados.

⚠️ **Y LA MITAD DEL ARREGLO VA EN EL FORENSE, que es donde nace el separador.** La `accion` viene a veces con `;` y a veces con comas, así que el reparto dependía de cómo redactó el modelo esa vez. La regla nueva está en el bloque de `accion` —donde se declara el campo, cuarta vez que este documento lo registra— y es un TITULAR, no un bullet: *"UN HECHO POR CLÁUSULA, SEPARADOS POR PUNTO Y COMA"*, con el motivo escrito (un corte largo se parte en varios clips y sin el punto y coma no hay dónde cortar) y la coma reservada para lo que pertenece a un mismo hecho. **Solo alcanza a análisis NUEVOS**; el guard de verbo es lo que repara las sesiones ya guardadas.

⚠️ **NO LLEVA BUMP DE HUELLA, y se comprobó en vez de suponerlo.** `scriptFingerprint` hashea `t.accionVisual` de cada toma del lote como INSUMO, y el reparto cambia justamente ese valor: la huella se mueve sola. Medido sobre las 31 sesiones con lotes guardados: **cambia en las 21 afectadas** (20 con lotes ya pagados, que pasan a contar como generación nueva, fail-closed) y **las 10 sanas la conservan**, así que no se les re-cobra. Bumpear la versión habría invalidado esas 10 sin ninguna razón.

⚠️ **De paso, el punto doblado de la línea de cámara** (*"Plano medio corto, estable.."*): la `camara` del forense suele venir con su propio punto y la plantilla agregaba otro.

⚠️ **TRES EFECTOS DEL REPARTO QUE HABÍA QUE MEDIR APARTE, y dos eran defectos nuevos.**

1. **Sale MÁS BARATO: 166 → 162 lotes.** `groupIntoLotes` cierra el lote también por `LOTE_MAX_COREO` —la suma de las `accionVisual` de sus tomas—, y un fragmento con su tramo ocupa menos que con la acción entera, así que entran más tomas por lote. Cuatro llamadas pagadas menos sobre las 38 sesiones. Es la misma excepción que `MIN_TOMA_SEG`: un cambio de reparto es decisión del dueño del repo **salvo cuando el costo BAJA**.
2. **La escenografía de foto se limpia ANTES de partir, no solo al emitir.** *"El producto no está flotando."* es una oración COMPLETA, así que sobrevive al split como tramo propio y podía quedar siendo la **única instrucción de movimiento** de un clip — el defecto que `sinEscenaDeFoto` existe para evitar, reentrando por la puerta del reparto (y su fail-safe `limpio || accion` se lo devuelve intacto justo en ese caso). Medido: **44 tramos** de escenografía pura que el orden nuevo evita, y 0 fragmentos con esa acción como única.
3. **Un fragmento sin hecho propio DECLARA la quietud (`SIN_HECHO_NUEVO`).** Con la acción vacía el prompt emitía `Toma 5 (5.8 s): ` y nada detrás: un carril que la plantilla dibuja y el prompt no llena, que este documento ya registra tres veces como la forma de que el modelo lo llene solo. No dice *"sigue lo anterior"*: el clip se renderiza sin memoria de nada fuera de su propio prompt, y los dos fragmentos de una toma partida caen a menudo en lotes distintos.

⚠️ **Y el ejemplo de la regla nueva del forense es de OTRO producto** (*"abre la tapa con el pulgar; vierte una cucharada en el vaso"*). El primer borrador usaba la gota con el cuentagotas sobre la mejilla — que es literalmente la coreografía del video que se está analizando, o sea un anti-ejemplo con la forma del artefacto puesto dentro del prompt que lo produce. Sexta vez.

⚠️ **Lo que NO se midió:** ningún render. Que los clips dejen de repetir el gesto es una predicción hasta que se renderice — lo que está medido es que el prompt ya no pide la coreografía dos veces. Y el reparto es **solo español**: una `accion` en inglés se sigue partiendo por punto y punto y coma pero no por coma (2 tomas de la base), que es la dirección segura.

✅ **Y LA PALANCA QUE ESTE DOCUMENTO DEJABA PENDIENTE YA ESTÁ CABLEADA: LA COREOGRAFÍA SE EMITE CON UN HECHO POR LÍNEA (2026-09-07).** Era la nota *"la coreografía viaja como un run-on de varios hechos en UNA línea"*, y es independiente del reparto: aquél decide **qué** hechos le tocan a cada fragmento, esto decide **cómo** se escriben. `buildLotePrompt` imprime ahora la cabecera de la toma en su renglón y cada hecho como su propio bullet, cortando con `partirEnTramos` — **los MISMOS cortes que usa el reparto**, así que no hay una segunda definición de qué es un hecho:

```
MOVIMIENTO:
Toma 1 (3.4 s):
  - Sujeto sostiene el frasco con la mano derecha.
  - Saca el aplicador cuentagotas con la izquierda y suelta una gota sobre el pómulo izquierdo mientras mira a cámara.
  Dice, literal: “Este suero me está cambiando la piel.”
```

**El texto es el mismo; cambia dónde corta.** El prompt del wizard que este repo verificó fotograma a fotograma escribe cada hecho en su renglón (`Holding gotero in right hand.` / `Gently releasing one clear drop onto her left cheek.`); el nuestro los metía todos en un renglón, y ahí el modelo los resuelve como UN gesto — de ahí la gota que "aparece" en la mejilla sin que el gotero llegue nunca.

⚠️ **`MOVIMIENTO:` va SIEMPRE, y casi se pierde justo donde más falta hace.** El rótulo colgaba del caso de UNA toma (era la cabecera cuando no había `Toma N`), así que un lote con VARIAS —el que más hechos tiene que ordenar— abría con la lista de tomas pegada a la regla de piezas, sin nada que dijera que lo que sigue es la coreografía. Ahora es una línea propia y las tomas van debajo. Con test.

✅ **Medido sobre los 156 lotes reales** (lectura pura de la base, cero LLM): **mediana 1.812 · p90 2.654 · MAX 4.081 de 4.096 · 0 lotes sin bloque de producto**, y **799 hechos sobre 239 tomas = 3,34 por toma**, que es la granularidad del shot list del spec. Un lote queda sobre 3.800 y tres sobre 3.500: el margen es de 15 caracteres en el peor caso, y por eso hace falta un escalón más.

⚠️ **SEGUNDO ESCALÓN DE DEGRADACIÓN: SE SUELTA EL FORMATO, NO EL CONTENIDO.** Si ni siquiera sin el bloque de producto entra, los mismos hechos vuelven al renglón corrido — se ejecutan peor, están todos. Recortar la coreografía sería perder lo único que dice qué hace el cuerpo. **Ojo con cuánto compra, porque no es una red general:** son ~4 caracteres por hecho, o sea rescata una banda de ~130 caracteres sobre un tope de 4.096. Se descubrió dimensionando su test tres veces (40 hechos: el corrido también se pasa; 34: se pasa por 3; 33: entra). Existe por el lote más pesado de la base, no por precaución.

⚠️ **`scriptFingerprint` v5 → v6.** La huella hashea INSUMOS, no el texto emitido: un cambio de corte es exactamente lo que no ve, y es justo lo que cambia cómo se ejecuta el clip. Sin el bump, reanudar pegaría un clip del renglón corrido a uno con un hecho por línea mientras `isPaidResume` jura que es el mismo contenido.

⚠️ **ESOS 3,34 HECHOS POR TOMA SON DE ANÁLISIS VIEJOS Y VAN A SUBIR.** Los 156 lotes medidos salieron de forenses ANTERIORES a la regla *"UN HECHO POR CLÁUSULA, SEPARADOS POR PUNTO Y COMA"*, que solo alcanza a análisis NUEVOS: sus acciones son más largas y menos numerosas. El andamiaje del bullet escala con el NÚMERO de hechos y `LOTE_MAX_COREO` topa los CARACTERES — los mismos 2.450 caracteres repartidos en 60 hechos cortos cuestan ~250 más que en 10 largos, y el tope no distingue. **`MAX 4.081 de 4.096` es una foto de los datos de hoy, no un techo que el cap haga cumplir.** Si un análisis nuevo empieza a rozarlo, el que se mira es `LOTE_MAX_COREO`, y eso es decisión del dueño del repo porque cuesta un lote pagado.

⚠️ **El segundo escalón reproduce la forma ANTERIOR a este cambio**, y por eso el peor caso está acotado: `MOVIMIENTO:` global, `Toma N (X s)` por toma y los hechos en renglón corrido — un salto de línea donde había un espacio, el mismo texto. O sea el lote que se renderizaba antes se sigue renderizando, en el peor caso un escalón más abajo. (Es una lectura del diff, no una medición: hoy el escalón no se dispara en ningún lote real.)

⚠️ **Lo que NO se midió, y no hay que leerlo como medido: ningún render.** Que el gotero llegue a la cara es una PREDICCIÓN. Lo medido es que el prompt ahora separa los hechos, que ninguno de los 156 lotes se pasa del tope y que hay dos escalones antes de que un lote se quede sin prompt.

🔴 **CUATRO DEFECTOS DE RENDER, UNA SOLA CAUSA: EL PROMPT NO NOMBRABA EL PRODUCTO EN NINGUNA PARTE (2026-09-07).** Reportados por el dueño del repo sobre los clips de esta sesión: *"terceras manos, goteros duplicados, frascos sin tapa, frascos de otro color"*. Leído el prompt REAL de un lote pagado (sesión `05f62534`), el diagnóstico se cae solo: el prompt es **apariencia-por-imagen-y-nada-más**. Ni una palabra sobre el envase, y la única referencia a `Image2` es una LEYENDA en la línea 2 que después no se vuelve a nombrar.

Y el dato existía y se tiraba: `product_scan.productDescription` de esa misma sesión dice *"Botella de vidrio de forma cilíndrica con un tinte púrpura traslúcido. Cuenta con un tapón cuentagotas de color blanco…"* — el color Y que **el cuentagotas ES la tapa**. Con eso sin decir, el modelo dibuja un segundo gotero (y entonces el frasco necesita una tapa que no tiene) y el color deriva.

⚠️ **NO ES EL BLOQUE DE ESCENARIO OTRA VEZ, y la distinción es la que autoriza el cambio.** Lo que este documento tiene medido (4 renders, 2 draws por brazo) es que `forensic.fondo` —una descripción del VIDEO ENTERO— **contradice** a la imagen del avatar y el fondo deriva. Una descripción del producto que **coincide** con `Image2` es el caso REDUNDANTE, no el contradictorio, y el producto nunca se probó. La línea que decía *"no las redescribas ni las cambies"* sí había que tocarla: dejarla junto a un bloque que describe el producto es el modo de fallo de dos órdenes opuestas en el mismo prompt que este documento ya registra seis veces. Ahora dice *"reprodúcelos idénticos"*.

**Tres cambios, y ninguno inventa coreografía:**

1. **`productoFisico` — las TRES primeras oraciones de `productDescription`.** El resto es la transcripción de la etiqueta, que `Image2` muestra mejor que un párrafo; lo que la imagen no sostiene sola es el color y las piezas. Mismo recorte que el `NIVEL_PRODUCTO_FISICO` de la época del presupuesto apretado, acá aplicado siempre. **Son tres y no dos porque está medido**: de las 24 descripciones que nombran una pieza (tapa, cuentagotas, aplicador), con dos oraciones sobreviven **21** y con tres, **23** — y el presupuesto no se mueve (MAX 3.965 de 4.096 en los dos casos). ⚠️ Se parte con el MISMO lookbehind que `partirEnTramos` y no con `/[^.]+/`: un volumen de etiqueta (*"30 ml / 1.01 fl oz"*) tiene un punto sin espacio detrás, así que la partición ingenua gasta las oraciones disponibles en una sola y se come justo la que nombra el aplicador. Hoy son 2 descripciones de la base con esa forma; el arreglo es gratis. Se le pasa `sinEscenaDeFoto` por la misma puerta que la coreografía: en el video el producto está en la mano de alguien, así que la superficie y la sombra de la foto de catálogo no son parte del producto.
2. **Se cita la imagen DENTRO de la cláusula que la usa** (*"PRODUCTO — el de Image2, y se ve así durante todo el clip: …"*), que es la variable que el A/B de 4 renders midió a favor. **El token no se toca** —`Image2` es lo que este árbol ya usa en la leyenda, y AGENTS.md advierte que el token no era la variable— y el índice **se deriva del array `images`**, no se escribe a mano: el orden es el contrato.
3. **`reglaPiezas` — una invariante FÍSICA, no un gesto.** *"Dos manos y nada más: para tomar algo, primero suelta lo que tenía. La tapa y el aplicador son los del envase de Image2: no hay una segunda copia, y el envase no se queda sin la suya."* Va en el prompt porque cada clip se renderiza sin memoria de lo que la toma anterior dejó en cada mano. Es la contraparte de render de la regla del forense sobre dónde termina cada pieza separable, igual que *"sin texto en pantalla"* lo es de `elementosGraficos`. Comprimida a una línea por el precedente medido del bloque de video limpio.

✅ **El presupuesto se midió ANTES de escribir la emisión, sobre los lotes reales (lectura pura, cero LLM): mediana 1.723 · p90 2.529 · MAX 3.965 de 4.096, y CERO lotes se pasan.**

⚠️ **PERO EL ANDAMIAJE FIJO CRECIÓ ~180 CARACTERES, Y ESO BAJA EL TECHO DE COREOGRAFÍA.** Lo destapó el test sintético que fija el caso pesado (8 tomas con la coreografía detallada de FASE 1): con la emisión nueva ese lote pedía **4.191 de 4.096** y `buildLotePrompt` lanzaba, o sea esa sesión dejaba de poder renderizarse. **`LOTE_MAX_COREO` 2600 → 2450**, que es exactamente lo que creció el andamiaje. Re-medido sobre las 36 sesiones: **162 → 163 lotes**, UNA llamada pagada de más en toda la base. Barrido: 2500 sigue reventando el caso pesado, 2450 ya no.

⚠️ **Y hay UN escalón de degradación, en la dirección que este repo ya tiene medida:** si el prompt no entra, lo primero que se suelta es el bloque de producto —lo único que DUPLICA lo que la imagen ya muestra— y la invariante de piezas no se suelta nunca (no la dice nadie más). Con el techo en 2450 no se dispara en ningún lote real; existe porque sin él un lote de una sesión se quedaba sin prompt, que es el peor modo de fallo (la ruta lanza con el usuario sin poder renderizar).

⚠️ **`producto` es OBLIGATORIO en `buildLotePrompt` aunque acepte la cadena vacía.** `scriptFingerprint` lo exige, así que un caller que lo omitiera compilaría igual y produciría una huella que describe un producto que su prompt no lleva — una divergencia silenciosa entre lo que se renderiza y lo que la huella jura. Verificado además que la ruta es el ÚNICO caller (`probe-prompt-lote.ts` no existe en este árbol).

⚠️ **`scriptFingerprint` v4 → v5, y ADEMÁS el producto entra en la huella.** El bump cubre el cambio de plantilla (que una huella de insumos no ve); hashear `producto` cubre lo otro: es un insumo NUEVO, y sin él un re-scan del producto cambiaría el prompt sin mover la huella.

✅ **LA TERCERA MANO SE ARREGLA EN EL FORENSE, Y SUBIENDO LA REGLA A TITULAR — no agregando una novena.** La regla ya estaba escrita y completa (*"una mano que señala ya soltó lo que tenía… empieza diciendo qué tiene cada mano ANTES del primer movimiento"*), **entre ocho bullets**, y no se cumplió: la toma 2 de la sesión reportada dice *"señalando el envase con la mano izquierda"* mientras esa misma mano terminó la toma 1 con el cuentagotas. Es literalmente *"entre quince bullets, una orden es una sugerencia"*, y la única palanca medida para eso es el titular. El bullet **se recortó** a lo que el titular no cubre: dos copias de la misma orden en el mismo prompt es el modo de fallo de siempre.

⚠️ **De paso cierra el residuo que este documento dejó anotado sin arreglar** (*"señala con la mano libre"*): el prompt PEDÍA *"qué hace la mano libre mientras tanto"* — o sea el término salía del propio prompt. El titular lo prohíbe por nombre (*"«La mano libre» no describe nada: di «la izquierda», y di qué tiene"*) y el bullet ya no lo usa. Con test que exige que la frase no vuelva.

✅ **Y EL TITULAR NUEVO NO DILUYÓ AL DE LA TRANSFERENCIA — comprobado con una corrida real** (`probe-forense-manos.ts`, una llamada de texto, sin escribir en la base). Era el riesgo de agregar un TERCER titular al bloque de `accion`, y el de la transferencia es el que tiene medición propia detrás. El forense nuevo devolvió 4 cortes, **la transferencia abre el corte 1** (*"Sostiene cuentagotas en mano derecha; aplica una gota sobre mejilla derecha; …"*), un hecho por cláusula con punto y coma en los 4, y **cada corte cierra nombrando qué mano sostiene el frasco** — incluido el caso exacto que fallaba: *"gesticula con mano izquierda sobre rostro; mano derecha sostiene frasco"*, contra el *"señalando el envase con la mano izquierda"* guardado, que no decía nada de la otra mano ni de lo que la izquierda había soltado. ⚠️ `n = 1` y el forense es estocástico: en esa corrida la aplicación salió sobre la mejilla **derecha** y el análisis guardado decía izquierda. La lateralidad varía entre tiradas y este cambio no la toca.

⚠️ **Lo que NO se midió, y no hay que leerlo como medido: ningún render.** Que dejen de salir terceras manos, goteros duplicados y frascos de otro color es una PREDICCIÓN. Lo medido es que el prompt ahora nombra el color y las piezas en los 156 lotes de la base, que ninguno se pasa del tope y que el forense pide el estado de las manos como titular. Comprobarlo cuesta un render pagado con la key del usuario. Y el forense es el paso CARO: la regla nueva **solo alcanza a análisis NUEVOS**, mientras que el bloque de producto repara todas las sesiones guardadas sin re-correr nada.

🔴 **EL INSTRUMENTO SE PERDÍA EN FASE 3, NO EN EL FORENSE — y lo causaba un ejemplo del propio prompt.** Reportado como *"Grok agrega una tercera mano"* y *"el primer clip no empieza echándose el serum con el gotero en la mejilla izquierda"*. El forense es la parte SANA: vio el cuentagotas en los cortes 1 y 4 (*"sostiene un cuentagotas con la mano derecha… la mano izquierda sostiene el frasco fuera de foco"*). Lo que llegó al render fue *"sostiene un **frasco** de Pure Niacinamide Serum con la mano derecha… la mano izquierda sostiene el **tapón**"*, y en el corte 4 `cuentagotas` → `dosificador`.

La causa está escrita en el bloque `── ACCIONES ──` de `adapt.ts`: ofrecía conservar el instrumento *"(o su equivalente en el producto nuevo: una gomita se toma con los dedos, **un frasco se destapa**)"*. El producto nuevo ES un frasco, así que el modelo tomó el ejemplo y produjo exactamente eso: frasco en una mano, tapón en la otra. **Quinta vez que este documento registra lo mismo: un ejemplo con la forma del artefacto es una plantilla que rellenar.** Ahora la regla dice que el instrumento se copia tal cual, que no es un dato del producto viejo, y nombra la consecuencia de romperlo en vez de dar un ejemplo copiable.

⚠️ **Y LOS DOS SÍNTOMAS SON UN SOLO DEFECTO.** Con el cuentagotas convertido en frasco y el frasco en tapón, las dos manos quedan ocupadas con envases mientras la coreografía le pide a la derecha sostener, aplicar y presentar, y a la izquierda señalar sin que nada diga que soltó lo que tenía. **Grok resuelve esa contradicción dibujando un brazo más.** No hay que portar `micro`, `objetoEnMano` ni `MotionTimeline` para arreglarlo: la versión en árbol es que la `accion` diga qué sostiene cada mano ANTES del primer movimiento y dónde termina cada pieza que se separa del envase.

✅ **Medido con `scripts/probe-coreografia.ts`** (una llamada de TEXTO por corrida, cero imágenes, cero cuota de imagen, no escribe en la base): sobre la misma sesión, **3 corridas de 3 conservan 2/2 los instrumentos que el forense nombró y devuelven 0/6 tomas con escenografía de foto** — contra 0/2 y 6/6 guardados.

⚠️ **Ese 0/6 es de los DOS cambios juntos, no del system prompt solo:** el prompt nuevo y el bloque ACCIONES prohíben los dos describir si el producto flota. No hace falta desacoplarlo —los dos se quedan— pero no lo leas como el efecto aislado del system prompt.

⚠️ **`callVideoAds` cubre CUATRO rutas, no solo la adaptación**, así que cambiarle el system prompt re-abre lo que se hubiera verificado bajo el viejo. La que importa es `analyze-product`: de ahí sale `brandingDescription`, la única fuente que el guion tiene de lo que el producto contiene, y este documento ya pagó dos veces el ingrediente completado de memoria. ✅ Re-verificado con `scripts/probe-scan-etiqueta.ts` sobre la misma foto: vuelve la transcripción completa y en el idioma del envase (*"PURE NIACINAMIDE 10 SERUM, CONCENTRADO ANTIMANCHAS, REPARA, ILUMINA, NIACINAMIDA PURA, PHE-RESORCINOL, CON AGUA TERMAL DE LA ROCHE-POSAY"*), sin traducir ni resumir.

✅ **Y LA TRANSFERENCIA TUVO QUE SUBIR A TITULAR: DE BULLET NO FUNCIONÓ, Y ESO ESTÁ MEDIDO.** El forense describía la TRAYECTORIA (*"sostiene un cuentagotas frente a su rostro… luego baja el cuentagotas"*) y se saltaba el EVENTO: la gota saliendo y cayendo en la piel. Puesta la regla como un bullet más de la lista de `accion`, el re-análisis devolvió otra vez el viaje (*"lo acerca a la mejilla, lo observa y lo vuelve a acercar, después lo retira"*). Subida a **titular, antes de la lista** —*"ANTES QUE NADA: si el producto toca el cuerpo en este corte, ese hecho se escribe primero y completo — qué sale del envase, con qué, y sobre qué lado de qué zona"*— las dos corridas siguientes abrieron con la aplicación: *"sostiene frasco con mano izquierda y cuentagotas con la derecha, **aplica gota sobre mejilla izquierda**, retira cuentagotas hacia arriba"* y *"lo retira del frasco, lo acerca a la mejilla izquierda y **suelta una gota**. La mano izquierda sostiene el frasco por el cuerpo."* Es el mismo hallazgo que la política de autocompletado de FASE 3: **entre quince bullets, una orden es una sugerencia.**

⚠️ **Solo alcanza a análisis NUEVOS** (el forense es el paso caro) y **re-analizar desincroniza el guion** de una sesión ya adaptada, así que `scripts/probe-forense-manos.ts` NO escribe en la base. Para una sesión guardada, lo que sí se recupera gratis es FASE 3: *"adaptar otra vez"* devuelve el instrumento.

⚠️ **Lo que NO se midió:** ningún render. Los dos síntomas se leen hoy en los datos —el instrumento sustituido es determinista y la aplicación ausente se ve en la `accion`—, pero que Grok deje de dibujar la tercera mano es una predicción hasta que se renderice un clip. `n = 2` en el forense y `n = 3` en FASE 3, una sesión.

⚠️ **Residuo observado en el forense nuevo, sin arreglar:** un corte devolvió *"señala con la mano libre"* mientras la izquierda sostiene el frasco. La frase "mano libre" es la misma trampa con otro nombre; si vuelve a aparecer, el arreglo es prohibirla por nombre en la regla de las manos, no agregar otra regla.

⚠️ **El detalle atómico tampoco se repite DENTRO de un clip.** `microPorTiempo` va por `tiempoOriginal`, así que los dos fragmentos de una toma partida lo recibían idéntico en el mismo prompt. Entre LOTES sí se repite y **debe**: cada clip se renderiza sin memoria del anterior (REGLA DE CONTEXTO ABSOLUTO).

⚠️ **EL ESTADO DE LAS MANOS ES POR MANO Y EN ORDEN — un `{inicio, fin}` no alcanza.** El dueño del repo lo describió con el caso exacto: *"la mujer tiene el producto en la mano izquierda y mueve la mano derecha para destaparlo y aplicárselo, luego lo tapa, sigue sosteniendo el producto con la mano izquierda"*. Con un solo string para las dos manos y dos instantes, eso se aplasta a `frasco → frasco`: se pierde que la izquierda no suelta nunca, que la derecha hace tres cosas distintas y —lo peor— que **la tapa sale y vuelve**. De ahí *"en el lote 1 la tapa reaparece mágicamente en el frasco"*.

`objetoEnMano` gana `izquierda`, `derecha` y **`accesorios`** (el estado de las piezas que SE SEPARAN del producto: tapa, gotero, cuchara), los tres como secuencias con flechas. `puedenUnirse` compara además el último estado de accesorios contra el primero del siguiente, y `unirManos` los ENCADENA al fusionar en vez de quedarse con los del corte dominante. Y **se emite** (`manosDe`): sin eso sería `elementosGraficos` otra vez — extraído, persistido y leído por nadie.

⚠️ **Y LOS TRES CAMPOS SON `.nullable().catch(null)`, NO `.optional()` — la diferencia decidió si el eje existe o es un no-op.** Nacieron opcionales por el motivo correcto (ninguna sesión guardada los trae y un `.nullable()` a secas reventaría su `parse`), pero un campo opcional **sale del `required` del JSON Schema y lo que no se le exige el modelo lo omite en silencio**. Medido en la primera sesión analizada con el schema nuevo: `izquierda` y `derecha` volvieron en **0 de 4 cortes** — y no por falta de información, porque la misma `accion` decía *"Sujeta frasco con izquierda, saca gotero con derecha"*. El dato estaba; el campo no se llenaba. Es la cuarta vez que este repo paga esa lección (`body_focus` en landing, `style` en el ADN de marca, `template` en el copy A/B). Con test que fija que los cinco campos estén en el `required`.

⚠️ **LAS MANOS DEGRADAN DESPUÉS QUE EL DETALLE.** `micro` se recorta ya en `NIVEL_MICRO_CORTO`; el recorrido de las manos solo en el piso de la búsqueda binaria. El pelo y el fondo son textura; el estado de la tapa es lo que impide que un objeto reaparezca en el aire. Costo medido de sumar el bloque: de 85/87 lotes con el detalle completo se pasa a **75/89**, con 14 recortados y ninguno sin emitir.

⚠️ **EL AVATAR IMPONÍA SU ENCUADRE A TODO EL ANUNCIO, Y ERA UN VALOR FIJO.** El prompt de identidad pedía la imagen *"como una foto de teléfono real (plano medio, ángulo levemente bajo)"* — un literal, sin mirar la referencia. Como esa imagen es `@image(1)` en todos los lotes y la imagen le gana al texto, ese "plano medio" se convertía en el encuadre del anuncio ENTERO: medido sobre un anuncio grabado en primer plano, los cuatro clips salieron con la persona mucho más lejos que el original.

Ahora el avatar nace con el encuadre del **primer corte que MUESTRA A UNA PERSONA** — es el primer fotograma del anuncio, así que su encuadre es el de apertura. Se salta los cortes sin persona a propósito: un anuncio que abre con un plano de detalle del producto no da un encuadre útil para un retrato. Sin ningún corte con persona (un anuncio íntegramente en voz en off) se cae al valor de siempre. Y el prompt del lote agrega que las imágenes de referencia **no fijan el encuadre**: si el clip es más cerrado o más abierto que la referencia, manda la línea `CAMERA`.

⚠️ **EL RITMO DEL ORIGINAL SE COLAPSABA EN UNA ETIQUETA.** `edicion.ritmo` distingue bien un anuncio *"rápido y dinámico"* de uno *"pausado y conversacional"*, y llega a la instrucción de identidad. Pero medido sobre seis sesiones guardadas, `calidadMovimiento` **empieza con "movimientos fluidos" en las SEIS**, sin importar cuál fuera el ritmo. O sea el eje no llegaba al render — y este campo es su ÚNICO camino, porque `buildLotePrompt` no lee `edicion.ritmo`.

El arreglo NO es emitir `ritmo` en el prompt del lote: eso duplicaría lo que el bloque `MOVEMENT` ya dice, y este documento tiene medido cinco veces que un campo que duplica una pregunta ya respondida no aporta. Se arregla en la fuente, con el mismo patrón que `style`, `typography` y `creativeConcept`: se exige la concreción (*"gesticula en casi cada frase, con las manos moviéndose rápido a la altura del pecho"* contra *"un gesto cada dos o tres frases, las manos vuelven al regazo"*) y se **prohíbe explícitamente** la etiqueta *"movimientos fluidos y continuos"*, que es la que devuelve todo video y no distingue nada.

✅ **Y UNA HIPÓTESIS QUE RESULTÓ FALSA, para que nadie la persiga otra vez:** el techo blando de `clampDuration` NO está recortando el b-roll. Medido sobre las 116 combinaciones reales de la base: **0 lotes recortados, 0 segundos perdidos**. Ya está acotado a `tomas <= 1` **y** `locucionChars > 0`, así que una toma muda está exenta por construcción. Hay un test que fija esa propiedad.

⚠️ **EL MODELO DECLARA LA DURACIÓN DOS VECES Y SE CONTRADICE — Y EL B-ROLL ES EL QUE PAGA (`reconciliarConVentana`).** Cada corte trae `tiempo` (su ventana, *"00:10 - 00:15"*) y `duracionSeg`. Son el mismo dato medido dos veces y **no coinciden en 34 de 222 cortes** de la base.

Cuál miente se decide con evidencia, no a ojo: medido sobre las 33 sesiones guardadas, las ventanas **encadenan sin un solo hueco ni un solo solape** y su suma da la duración total en 32 de 33. Forman una línea de tiempo coherente; `duracionSeg` es la estimación suelta y es la que se desvía.

⚠️ **Y se desvía CONTRA LOS CORTES MUDOS.** De los 12 cortes sin diálogo de la base, **9 están por debajo de 3 segundos**, con desacuerdos como ventana 8 s → duración 3,5 s, o 5 s → 3,4 s. El modelo estima la duración a partir del habla, así que un plano de producto o un b-roll **nace hambriento**, antes de que el reparto lo toque. Ése es el origen de que los 8 segundos de frasco a pantalla completa del anuncio de serum llegaran al render como 3,4 s.

⚠️ **CORRE SOLO EN LA PRIMERA PUERTA, Y ESO NO ES UN DETALLE.** `analyze-reference` es donde llegan los números crudos. En `extract-template` NO se repite: allá las duraciones ya pasaron por `repairCutTiming`, que las mueve a propósito —sin tocar `tiempo`— para que el diálogo se pueda decir. Medido: aplicar la reconciliación sobre los datos ya reparados de la base **resta 19,2 s netos**, o sea deshace la reparación y devuelve diálogo impronunciable.

⚠️ **FAIL-CLOSED:** si las ventanas no forman una línea coherente (alguna ilegible, un hueco o un solape de más de medio segundo, o una suma que no se parece al total), no se toca nada.

⚠️ **Y SIN EL PISO VISIBLE, LA RECONCILIACIÓN NO SIRVE DE NADA — son un solo arreglo, no dos.** `analyze-reference` llamaba a `repairCutTiming` SIN `minVisibleSeg` (default 0), y un corte mudo tiene mínimo de habla 0: para el reparto es holgura pura y lo puede vaciar entero para financiar a los hablados. O sea el b-roll que la reconciliación levanta en una línea se drenaba en la siguiente. Ahora se le pasa `MIN_TOMA_SEG`, que se acota a la duración que el corte ya tiene, así que impide el vaciado sin inflar nada. Hay dos tests que fijan justamente eso: sin piso el beat mudo se vacía, con piso sobrevive y el diálogo de los hablados sigue siendo decible.

⚠️ **LO QUE NO SE PUDO MEDIR:** el beneficio no es verificable sobre la base, porque todo lo guardado ya pasó por la reparación y la función corre antes. Lo que hay es el mecanismo, la evidencia de que las ventanas son coherentes y los cortes mudos no, y los tests deterministas sobre el caso real. La comprobación de verdad es un análisis nuevo.

⚠️ **EL AVATAR CONTRADECÍA AL ORIGINAL, Y EL AVATAR LE GANA AL TEXTO.** Es la causa raíz de *"no se parece ni un poco al original"*, y explica la mitad de los demás síntomas. Medido sobre un anuncio de serum: el forense leyó BIEN el original —*"jersey tejido rosa pálido"*, *"pared crema, marco de puerta de madera oscura"*— y el prompt del avatar salió pidiendo *"a white loose-fitting blouse over a black top"* en *"a bright, modern residential kitchen background"*. Nadie pidió una cocina: la instrucción decía *"vestuario equivalente"* y *"reproduce el TIPO de espacio"*, y el modelo tomó esa latitud.

El daño no queda en el avatar. Esa imagen es `@image(1)` en TODOS los lotes y **la imagen le gana al texto**: los cuatro clips salieron con la ropa equivocada, uno transcurrió literalmente en la cocina del avatar, y los otros tres en habitaciones distintas entre sí — porque el bloque `SETTING AND LIGHTING` del prompt y la imagen se contradecían y el modelo resolvió el empate distinto cada vez.

**El vestuario y el escenario se COPIAN; lo único que no se copia es la CARA** (el avatar es una persona nueva por requisito legal). No son identidad: son la escenografía del anuncio que se está replicando. La instrucción ahora pide reproducir los ELEMENTOS que el forense nombró —superficies, colores, muebles, temperatura de luz— y dice explícitamente que no se sustituyan por un lugar "del mismo estilo". En ropa/zapatos el vestuario sigue sin copiarse: ahí es el producto.

⚠️ **EL ENCUADRE SE DECLARA POR DÓNDE CORTA EL CUADRO, NO POR UNA ETIQUETA.** En ese mismo anuncio, grabado en primer plano, el forense escribió *"Plano medio, frontal"* en 3 de 4 cortes; el render obedeció y el video salió con la persona mucho más lejos que el original. La etiqueta sola no es medible y cada modelo la usa distinto. El prompt exige empezar por el punto de corte —*"corta a la altura del pecho"*, *"corta a la altura de la cintura"*— con la escala completa de hombros a cuerpo entero, y para un plano sin persona, qué llena el cuadro y cuánto.

⚠️ **Y LA UBICACIÓN DE ESA INSTRUCCIÓN IMPORTA — el primer intento no funcionó.** La escala se puso como bloque FLOTANTE antes de la sección de cortes, mientras la definición del campo decía *"ver la escala de abajo"* apuntando hacia arriba. Medido en la sesión siguiente: el modelo siguió devolviendo la etiqueta (*"Plano medio, frontal, fija"*). Ahora vive DENTRO de la definición de `camara`, como sub-bloque del campo — que es exactamente lo que funcionó con `micro.manos`: la instrucción tiene que estar donde se declara el campo. Con test que fija el orden y que no queden referencias colgantes.

✅ **Lo que ese intento SÍ mejoró, aunque no en el formato pedido:** los cortes dejaron de compartir etiqueta. Donde antes 3 de 4 decían *"Plano medio, frontal, estática"*, la sesión siguiente devolvió *"Plano medio"*, *"Primer plano del producto"*, *"Primer plano"*, *"Primer plano"* — o sea el modelo empezó a distinguir encuadres entre cortes. Lo que falta es la calibración absoluta.

⚠️ **UNA TOMA DE PRODUCTO NO PUEDE COMPARTIR CLIP CON UNA DE PERSONA (`clasePorTiempo`).** El original dedica **8 segundos seguidos** al frasco casi a pantalla completa; esa toma terminó compartiendo lote con una toma hablada de 19 s y quedó en **~1,5 s de los 8**. En un clip con 371 caracteres de locución el modelo se pasa el tiempo hablando — y le pasa a cualquier b-roll de cualquier UGC, no a este video.

⚠️ **Y LA FRONTERA DE PLANO ESTABA MUERTA EN PRODUCCIÓN.** `generate-lotes` calculaba `planoPorTiempo`, se lo pasaba a `groupIntoLotes`… y nunca pasaba `maxPlanos`, que por defecto es `Infinity`. O sea el mapa se computaba y no cerraba nada. Medido sobre las 25 sesiones con guión, las tres opciones:

| | lotes | que mezclan persona y producto | costo |
|---|---|---|---|
| como estaba (sin frontera) | 108 | 8 | 1× |
| `maxPlanos = 2` | 112 | 8 | 1,04× |
| `maxPlanos = 1` | 137 | 2 | 1,27× |
| **frontera de CLASE** | **116** | **0** | **1,07×** |

La frontera de clase gana porque ataca el defecto exacto: cierra cuando cambia QUÉ SE MUESTRA (persona / solo producto), no ante cualquier cambio de encuadre — dos planos de la misma persona hablando siguen compartiendo clip. `maxPlanos` se queda como parámetro, sin usar.

⚠️ **EL PRODUCTO SALÍA FLOTANDO A PANTALLA COMPLETA, y es un problema de LEYENDA, no de contenido.** `@image(2) = the product` declaraba qué ES la imagen y nada sobre cómo puede USARSE, así que animar hacia la foto de referencia es una lectura legal del input. El prompt ahora declara que las referencias definen **apariencia** y no son tomas a reproducir, y que el producto existe dentro de la escena —en las manos o sobre una superficie— nunca como recorte flotante, inserto de producto ni imagen a pantalla completa. Protege igual a `@image(1)`.

⚠️ **COORDENADAS EN PÍXELES: NO — Y EL VOCABULARIO QUE LAS REEMPLAZA NECESITÓ SU PROPIA CASILLA.** El dueño del repo preguntó si servirían unos `x1,y1`. `grok-imagine` es un modelo de difusión de video, no un detector: no los honra y gastarían caracteres que la escalera ya se está comiendo. Lo que **sí** entiende es el vocabulario relativo al encuadre — *"tercio derecho a la altura del pecho"*, *"entra por el borde inferior"*, *"sale por arriba"*.

⚠️ **HACEN FALTA LAS DOS COSAS A LA VEZ, Y SE APRENDIERON UNA POR CORRIDA.** El campo tiene que estar en el `required` **y** su parse tiene que ser infalible. Con una sola de las dos, el eje desaparece:

| qué se puso | qué pasó, medido |
|---|---|
| objeto `.optional()`, casillas `z.string()` | el modelo **omite el objeto entero**: `micro` y `objetoEnMano` volvieron con las claves AUSENTES en los 5 cortes |
| objeto `.nullable().catch(null)`, casillas `z.string()` | una casilla omitida hace fallar el parse del objeto y el catch devuelve `null`: **se pierden las seis**, incluido el detalle que el modelo SÍ produjo |
| objeto `.nullable().catch(null)`, casillas `.nullable().catch(null)` | los objetos vuelven 6/6 **pero las casillas nuevas salen `null` en los 6 cortes**: el schema le ofrecía la salida |
| **objeto `.nullable().catch(null)`, casillas `.catch('')`** | ✅ exigidas, infalibles y sin `null` donde escaparse |

⚠️ **Y LA CAUSA REAL NO ERA EL SCHEMA: UN CAMPO QUE SOLAPA CON OTRO QUE EL MODELO YA LLENÓ VUELVE VACÍO.** Con las 11 casillas ya exigidas, infalibles y sin `null` donde escaparse, `izquierda`, `derecha`, `accesorios` y `posicion` **seguían saliendo vacías** — mientras la casilla `micro.manos` devolvía espontáneamente *"derecha aplica gota, izquierda sostiene frasco"* y `objetoEnMano.inicio` devolvía *"frasco, cuentagotas"*. El modelo no se negaba: **ya había contestado la pregunta y no la repetía en otro campo**. El prompt las pedía (verificado: las cuatro aparecen en la instrucción).

La lección general, y la que hay que recordar antes de agregar el próximo campo al forense: **el arreglo es borrar el duplicado, no insistir en el schema.**

- **`izquierda`/`derecha`: eliminados.** `micro.manos` es el hogar único del eje por mano, y su instrucción ahora pide la secuencia explícita (*"izquierda: sostiene frasco todo el corte · derecha: destapa → aplica → vuelve a tapar"*) más el estado de cualquier pieza separable.
- **`Micro.posicion`: eliminado.** Solapaba con `camara`, que el forense llena 5/5. El vocabulario de encuadre se pide DENTRO de `camara` y llega por la línea `CAMERA:` que ya existía.
✅ **Verificado en la primera sesión analizada tras la eliminación** (6 cortes): `micro.manos` **6/6**, y **6/6 nombrando cada mano con el formato pedido** — *"derecha: aplica gota → aparta cuentagotas · izquierda: sostiene frasco"*. Eso es exactamente el eje que se pidió, y llega al render por una casilla que sí llena. `inicio`/`fin` 6/6 y la fusión por continuidad 6 → 4 cortes.

⚠️ **LA PUESTA EN CUADRO NO SE PUDO OBTENER, Y SE PROBARON TRES FORMAS.** Como bullet dentro de las reglas de `accion`: 0/4 y 0/5. Como casilla propia (`Micro.posicion`, en el `required`): 0/6. Plegada dentro de la instrucción de `camara` —el campo que el forense llena 5/5—: **0/6 otra vez**, con las seis diciendo *"Plano medio, frontal, estática"* y ninguna referencia de posición en cuadro. Es el mismo patrón del solapamiento: `camara` ya tiene su respuesta canónica (plano, posición, movimiento, zoom) y el añadido no entra. **Es un eje que este modelo no da; no lo intentes una cuarta vez sin cambiar de modelo o de paso.**

⚠️ **Y `accesorios` sigue volviendo vacío** (0/6 en esa sesión, 5/5 en otra anterior): el modelo ya nombró el cuentagotas dentro de `micro.manos` y no lo repite. **La información SÍ llega al render** por esa casilla —*"aplica gota → aparta cuentagotas"*—, que es para lo que se le agregó a su instrucción el estado de las piezas separables. Lo que se pierde cuando está vacío es solo el guard determinista de `puedenUnirse`, que es fail-open.

- **`accesorios`: se queda.** Es el único campo estructurado que expresa un estado que VUELVE (tapa puesta → fuera → puesta), algo que `inicio`/`fin` no pueden por construcción, y es lo que lee `puedenUnirse`. Es fail-open: vacío no bloquea nada.

✅ **Medido con `scripts/probe-forense-atomico.ts` tras la eliminación** (un forense real): `micro.manos` **7/7** y cargando el eje por mano, `objetoEnMano` 7/7, largo mediano 30 caracteres por casilla, 0 en prosa. Y la fusión por continuidad pasó de **0 uniones a 2** (7 cortes → 5): `inicio`/`fin` llenan de forma fiable, que es lo que ese guard necesita. Presupuesto: **84 de 94 lotes** con el detalle completo, 10 recortados, ninguno sin emitir.

⚠️ **LA CUARTA FILA EXISTE PORQUE `.nullable()` LE OFRECE AL MODELO UNA SALIDA LEGAL.** `z.string().nullable().catch(null)` emite `{"default": null, "anyOf": [{"type":"string"},{"type":"null"}]}` — o sea el schema le dice que `null` es un valor válido **y que es el default**. Medido: con esa forma los dos objetos volvieron 6/6 y las cinco casillas viejas se llenaron, pero `izquierda`, `derecha`, `accesorios` y `posicion` salieron `null` en los 6 cortes. El prompt las pedía —verificado, las cuatro aparecen en la instrucción—; el modelo simplemente tomó lo que el schema le ofrecía.

`z.string().catch('')` emite `{"default": "", "type": "string"}`: sigue en el `required`, sigue siendo infalible (`{}` parsea a cadena vacía, una basura también) y **no hay ningún `null` donde escaparse**. La cadena vacía es falsy, así que todo el código que ya preguntaba `if (!x)` no cambia. Hay un test que recorre las propiedades de los dos schemas y falla si alguna vuelve a ofrecer `null`.

La última fila funciona porque con el `.catch` por casilla el parse del objeto **no puede fallar** (`MicroSchema.safeParse({})` devuelve éxito con todo en null), así que el `.catch` de afuera nunca destruye nada: solo existe para meter el campo en el `required` sin romper las sesiones guardadas. Hay un test que fija esa infalibilidad — devolver una casilla a `z.string()` a secas reintroduce la fila 2.

⚠️ **El `.catch(null)` sobre el objeto, con casillas obligatorias, es la trampa.** Al agregar `posicion` se puso `micro: MicroSchema.nullable().catch(null)` "por consistencia" con `objetoEnMano`. Efecto medido en vivo: el modelo llenó `objetoEnMano` **5/5** y `micro` volvió **`null` en los 5 cortes**. La causa es que `.catch` sobre el OBJETO convierte cualquier casilla omitida en la pérdida de las SEIS: falla el parse del objeto entero y el catch devuelve null. O sea que el detalle atómico que el modelo SÍ había producido se tiró en silencio — el peor modo de fallo posible, porque destruye dato bueno y no reporta nada.

Con el `.catch` por casilla, cada una sigue en el `required` (el modelo debe responderlas) y una que falte queda en `null` sin arrastrar a las otras cinco; el objeto vuelve a `.optional()`, que es como venía funcionando 5/5. Con test que fija las dos mitades.

⚠️ **Pero puesto como un bullet dentro de las reglas de `accion` salió en 0 de 4 y 0 de 5 cortes, en dos sesiones seguidas.** Una instrucción sin campo que la haga cumplir es una sugerencia: el modelo la lee y sigue de largo. `Micro.posicion` es la sexta casilla y entra en el `required` del schema — exactamente lo que llevó a `izquierda`/`derecha` de 0/4 a **5/5** sin tocar una palabra del prompt. De paso, `micro` entero pasó de `.optional()` a `.nullable().catch(null)`: hoy vuelve 5/5 porque el prompt insiste mucho, pero eso es suerte y no garantía.

Costo medido de la casilla: de 85/89 lotes con el detalle completo a **79/94**, 15 recortados y ninguno sin emitir.

⚠️ **EL DETALLE ATÓMICO ROMPIÓ `muestraPersona`, Y ESE GUARD ES EL QUE EVITA EL FLAT-LAY FUSIONADO.** Efecto colateral medido sobre la primera sesión analizada con el prompt nuevo: al pedirle telegrama, el forense empezó a escribir también `accion` sin sujeto —*"Sujeta pipeta con mano derecha, aplica producto en mejilla, mira a cámara"*— y `muestraPersona` busca justamente un sustantivo (*mujer, modelo, persona*) dentro de esa prosa. Resultado: **los TRES cortes de la sesión daban `false`** siendo los tres planos de persona hablando a cámara.

El fallo es silencioso y toca tres sitios: `mergeMicroCortes` y `puedenUnirse` lo usan para no encadenar un plano de producto con uno de persona, y `anchors.ts` para decidir si un fotograma lleva cara. Con todo clasificado igual, el guard deja de guardar — y es exactamente el fallo que AGENTS.md ya documenta (*"el flat-lay entre dos planos de la modelo → tres sub-tomas con fondos distintos"*).

`corteMuestraPersona` lo resuelve preguntándole al campo que lo DECLARA: en un plano sin persona el prompt exige que `cuerpo`, `rostro` y `cabello` digan *"no aparece"*. Es el reparto de "el modelo observa, el código decide" que este repo ya usa para la polaridad de landing. Basta con que UNA de las tres partes esté descrita —un plano de manos sigue siendo plano de persona a efectos de continuidad y de fotograma— y sin `micro` se cae al heurístico de siempre, así que ninguna sesión guardada cambia. Con test sobre el caso real.

⚠️ **FUERA EL ACENTO Y LA VOZ DEL WIZARD (2026-08-25, decisión del dueño del repo).** Eran dos campos —uno **obligatorio y bloqueante** en la FASE 0— y ahora la voz sale de **`VOZ_POR_DEFECTO`** (character.ts): dos perfiles fijos en español latino neutro, uno de hombre (30-40 años) y uno de mujer (25-35). **Revierte a propósito una regla que este documento tenía como dura** (*"etnia y acento NUNCA se marcan confirmados desde la referencia"*).

⚠️ **Y LA VOZ SE VOLVIÓ COMPLETAMENTE FIJA CUANDO HAY UN SOLO PERSONAJE (2026-09-02).** El bloque `VOICE PROFILE` **ya era byte-idéntico entre los lotes de una sesión** — medido sobre los 4 prompts guardados de `ca62aaed`: 1 bloque distinto de 4. Lo que NO era estándar es entre sesiones: `VOZ_POR_DEFECTO` fija 11 de los 13 campos y los otros dos (`edadVocal`, `timbre`) los ponía el modelo siempre.

⚠️ **Y ese campo libre se CONTRADECÍA con el perfil fijo, que es el defecto de verdad.** En esa sesión el mismo bloque llevaba `entonacion: "Natural y cercana, **sin locución publicitaria**"` (fijo) junto a `timbre: "…con una entonación natural y expresiva propia de una **locución de redes sociales**"` (del modelo). Dos instrucciones opuestas dentro del mismo prompt, el modo de fallo que este documento ya registra cuatro veces. El modelo infla ese campo la mitad de las veces: **10 de 35 perfiles guardados traen un `timbre` de más de 40 caracteres**, contra los 24 del fijo.

`edadVocal` y `timbre` existen por UNA razón —que dos personajes del mismo sexo no suenen idénticos en el mismo anuncio— y **con un solo personaje no hay de quién diferenciarse**: son variación pura en un anuncio que se renderiza clip por clip y después se concatena. Medido: de **18 sesiones con lista de personajes, NINGUNA tiene más de uno**, y el botón *"+ Agregar otro personaje"* está vivo en la UI (o sea es uso real, no una función apagada como los nichos bloqueados). Con varios, los diferenciadores se conservan —es su motivo de ser— pero **recortados a etiqueta corta**: un timbre es una etiqueta, no una frase de estilo con opiniones sobre la locución.

⚠️ **Lo que esto NO arregla:** si la voz suena distinta entre clips, no es el prompt — es el mismo no-determinismo de grok que hacía cambiar el fondo. El prompt ya mandaba la misma voz a los 4 lotes.

⚠️ **LA FILA "Voz" SALIÓ DE LA MATRIZ DE VALIDACIÓN (decisión del dueño del repo).** Era un vestigio: su campo salió del wizard el 2026-08-25, así que `inputs.voice` no lo llenaba NADIE y la fila imprimía *"No especificada"* en todas las sesiones. Una fila que siempre dice lo mismo no es una confirmación, es ruido en la pantalla donde el usuario revisa lo que sí decidió. Era `critica: false`, así que quitarla no puede cambiar si el gate deja pasar — hay un test que fija las dos cosas. `UserInputs.voice` y la columna `voice` quedan sin ningún lector: **no se migran, se dejan de leer** (precedente de `ph_user_seen` y `testimonial_avatars`).

⚠️ **LA ETNIA NO SE TOCÓ** y sigue siendo obligatoria por personaje: es lo que sostiene la REGLA DE NO-ASUNCIÓN y lo que mantiene vivo el gate de FASE 0 uno por uno con varios personajes.

El modelo ya no devuelve el `VoiceProfile` entero: devuelve **`sexoVocal`** —que sí es una observación, está en la foto y en el video— más `edadVocal` y `timbre`. Esos dos siguen viniendo de él porque con la voz base compartida son **lo único** que impide que dos personajes del mismo sexo suenen idénticos en el mismo anuncio. Las columnas `accent`/`voice` **no se migran, se dejan de leer** (precedente de `ph_user_seen` y `testimonial_avatars`).

**Huella v9 → v10.** Cambian el cap, el reparto, la plantilla del prompt y la voz. La huella hashea INSUMOS y no el texto producido, así que el cambio de plantilla le es invisible: sin el bump, reanudar pegaría un clip de 30 s con la voz vieja a uno de 15 s con la nueva mientras `isPaidResume` jura que es el mismo contenido.

✅ **GROK DICE LA LOCUCIÓN EN ESPAÑOL PALABRA POR PALABRA — MEDIDO (2026-08-27, `scripts/probe-audio-espanol.ts`).** Era el riesgo más grande de la tool desde la vuelta a grok: la doc del modelo dice que el prompt es *English only* y la locución viaja entrecomillada en español. **No hizo falta gastar un render**: se transcribieron con Gemini clips YA pagados y se compararon contra la locución exacta que se les pidió, que es un oráculo mecánico.

| clip | resultado |
|---|---|
| 10 s, 178 caracteres | **100 %** — las 31 palabras literales |
| 7 s, 98 caracteres | una sola palabra cambiada (*"es este"* por *"es el"*), el resto exacto |
| **15 s, 281 caracteres** | **100 %** — la locución ENTERA, las dos frases, en español |

Y en el de 15 s leyó además el **10** de la etiqueta del frasco (*"Pure Niacinamide 10 Serum"*), que no estaba en el guion: no solo pronuncia el texto, mira el producto.

⚠️ **DOS MÉTRICAS ANTERIORES DIERON EL VEREDICTO CONTRARIO SOBRE LOS MISMOS CLIPS, y por eso el probe IMPRIME además de puntuar.** La primera avanzaba un puntero sobre las palabras esperadas y **se atascaba en la primera que faltaba sin recuperarse nunca**: con una palabra cambiada de diecisiete reportó **11 %**, o sea "grok no dice el español" sobre una locución correcta. La segunda (LCS por palabra) dio 88 % por artefactos del guion — `anti-envejecimiento`/`antienvejecimiento` y `La Roche-Posay`/`La Roche Posay`, y **las dos normalizaciones posibles del guion pierden uno de los dos casos, que salieron en el MISMO clip**. La que vale es **LCS a nivel de CARÁCTER sin espacios**, donde ninguno de los dos existe. Hay un test (`probe-audio-espanol.test.ts`) con los pares REALES observados, más una traducción al inglés y una locución cortada, que son lo que la métrica tiene que seguir castigando.

⚠️ **`GEMINI_VIA=direct` HOY NO FUNCIONARÍA:** medido al escribir este probe, la `GOOGLE_API_KEY` del entorno devuelve `429 "Your prepayment credits are depleted"`. El escape documentado para devolver el recurso al SDK de Google existe en el código y no tiene saldo detrás.

⚠️ **EL PROMPT DESCRIBE LA IMAGEN Y NO DESCRIBÍA EL SONIDO — bloque `SOUND` (2026-09-02, huella v10 → v11).** `VOICE PROFILE` dice cómo suena la VOZ y la línea por toma dice qué se dice; del resto de la banda de audio no había **ni una palabra**, y grok genera el audio entero. Lo que llenaba ese silencio lo elegía el modelo, y con la concatenación (`concat.ts`) eso dejó de ser un detalle: cuatro clips con cuatro camas de música distintas se oyen como cuatro anuncios pegados, que es justo lo que el video final viene a evitar. El bloque nombra las tres capas —ambiente de la habitación, foley de la acción, nada de música ni reverb añadido— y **no re-describe el escenario**, que ya viaja arriba y está en las referencias.

⚠️ **EL ESCALÓN LO CORRIGIÓ UNA CORRIDA REAL, no una intuición.** Puesto junto al guión global (`NIVEL_SIN_GUION_GLOBAL`), en la sesión completa de 4 lotes **sobrevivía en 2**: los otros dos degradaban por presupuesto y quedaban sin ninguna instrucción de audio. Un anuncio donde la mitad de los clips lleva el ambiente pedido y la otra mitad lo que grok invente es exactamente la costura que el bloque vino a cerrar.

El orden de la escalera es su propia regla: **lo que se suelta primero es lo que DUPLICA información**. El guión global sale del mismo texto que las líneas por toma y el párrafo de overlay dice quince veces la misma orden; el sonido no lo nombra NADIE más. Así que sobrevive a los dos y cae en `NIVEL_MICRO_CORTO`, cuando se empieza a recortar detalle real. Hasta ahí `accionVisual` está intacta en todos los niveles, así que el corrimiento **no le quita un solo carácter a la coreografía**. Con test que fija la implicación: no puede existir un nivel con guión global y sin sonido.

⚠️ **SIN VERIFICAR, y hay que leerlo así.** `probe-audio-espanol.ts` mide que grok DICE la locución palabra por palabra; **que además honre una descripción de ambiente no lo mide nadie todavía**. Es una hipótesis con su escalón puesto, no un arreglo medido — la comprobación es un render y una escucha.

⚠️ **Lo único observado, y NO es atribuible:** los 4 clips del probe del escenario salieron con el bloque puesto, y en el espectrograma se ven ráfagas de habla sobre un piso de ruido bajo, **sin ninguna banda armónica sostenida — o sea sin cama de música**. No hay brazo de control para esta línea, así que eso no prueba que el bloque haga nada: puede ser el comportamiento por defecto de grok. Si se quiere cerrar, es un A/B de la línea SOUND, no de otra cosa.

⚠️ **LO QUE NO SE HIZO, y por qué.** La guía de prompting de grok que originó esto trae 20 consejos y la mayoría ya están implementados o ya fueron REFUTADOS acá: *"una acción principal por clip"* falló la replicación 2 de 3 veces (ver arriba, `n = 3`) y *"los prompts negativos no son fiables"* choca con los 7 clips sin un solo carácter de texto que produce `BLOQUE_OVERLAY`. Los que SÍ eran ejes nuevos —un solo movimiento de cámara (#6) y verbos de física (#11)— son cambios del prompt de FASE 1, o sea el paso caro, y solo alcanzarían a los análisis NUEVOS.

❌ **480p SE MIDIÓ Y NO SE CABLEA — cierra el pendiente de parametrizar `resolutionFor()`
(2026-09-04).**

✅ **Canario gratis:** `480p`, `720p` y `1080p` los tres PASAN la validación (mandados con una
`duration` inválida, la API solo se queja de la duración); un valor inventado se rechaza por nombre
(*"resolution is not within the range of allowed options"*). O sea 480p existe y es elegible.

⚠️ **Y CUESTA 33 % MENOS: 30 créditos contra 45,1** por el MISMO lote de 10 s — medido con un
render real y el saldo antes/después, así que KIE sí cobra por resolución.

❌ **Lo que compra ese descuento es lo que el anuncio vende.** 480p devuelve **416x752** (no
480x854) y la etiqueta del frasco deja de leerse — justo el observable que el A/B de la cita de
imagen acababa de mejorar. ⚠️ Caveat honesto: en ese draw el frasco ocupa menos cuadro, así que
parte de la diferencia es encuadre y no resolución; pero el presupuesto de píxeles sobre la
etiqueta es 1,7× menor y se ve en el fotograma a escala nativa.

⚠️ **Y NO SE PARAMETRIZA, que era el pendiente:** no hay UI, no hay columna y ningún caller pasaría
otra cosa. Además **`concat.ts` pega con `-c copy`**, que exige parámetros idénticos entre clips, así
que la resolución solo podría ser por SESIÓN y nunca por lote. Un parámetro con un llamador y un
valor es la interfaz-con-una-implementación que este repo evita en otros lados. **El hallazgo es la
palanca con su precio, no el dial**: si algún día el costo del render pesa más que la etiqueta, acá
está el número.

✅ **LOS QUINCE SINÓNIMOS DEL BLOQUE DE VIDEO LIMPIO NO COMPRAN NADA — 4 RENDERS
(`scripts/probe-overlay.ts`, 2026-09-04).** `REGLA_VIDEO_LIMPIO` decía la misma orden quince veces
(*"No captions. No subtitles. No overlays. No titles. No stickers. No emojis…"*), 313 caracteres.
Este documento ya tenía medido que el bloque **funciona** —7 clips sin un carácter de texto sobre
originales saturados de subtítulos y watermark de TikTok— pero **nunca hubo brazo de control**, así
que no se sabía si protegían los sinónimos o la orden a secas.

✅ **EL PREMIO SE MIDIÓ ANTES DE GASTAR**, sobre los 146 lotes reales (lectura pura): comprimiendo
a 183 caracteres, **completos 99 → 105 y sin movimiento 30 → 25**. Seis lotes recuperan el prompt
entero y cinco recuperan el bloque de movimiento — el mismo orden de magnitud que los tres cambios
de orden. Sin ese número el A/B no valía la pena; con él, sí.

| | texto en pantalla, en los 5 fotogramas |
|---|---|
| **A1 · A2** (bloque completo, 313 car.) | ✅ ninguno |
| **B1 · B2** (una línea, 183 car.) | ✅ ninguno |

**Los 20 fotogramas de los cuatro clips salen sin un solo carácter de texto, sin watermark y sin
UI.** Costo: **$0,90** los cuatro renders.

⚠️ **LAS DOS ÚLTIMAS FRASES NO SE COMPRIMEN MÁS, y no son relleno:** *"Only the character, the
product and the real room"* es lo que impide objetos inventados, y *"Text printed on the product
itself stays"* es lo que impide que el modelo **BORRE la etiqueta del frasco** al obedecer la
prohibición de texto. Hay un test que exige las dos y que la letanía no vuelva.

⚠️ **LO QUE NO SE MIDIÓ, y no hay que leerlo como medido: la tasa base de fuga.** No hubo brazo SIN
bloque, así que esto dice que **comprimir no introduce texto**, no que el bloque sobre. Y ese
experimento no conviene: 36 de 36 análisis guardados detectan subtítulos o watermark en su original,
publicar un clip con una caption quemada de otra marca es un riesgo real, y el fail-safe es
conservar la protección. `n = 2` por brazo, un lote, una sesión.

⚠️ **`scriptFingerprint` v16 → v17.** Cambia la plantilla del prompt.

⚠️ **EL PROBE SE INVIRTIÓ AL ADOPTAR EL RESULTADO:** el brazo A reconstruye el bloque LARGO, porque
el corto ya es lo que emite el código. Sin eso el probe deja de ser re-corrible — mismo criterio que
`probe-setting.ts` con el escenario.

✅ **EL ESCENARIO DEJA DE VIAJAR COMO TEXTO — MEDIDO CON 4 RENDERS (2026-09-02, `scripts/probe-setting.ts`).** Es el consejo #1 de esa guía (*"la imagen define la escena; el prompt define lo que cambia"*) y era el único con respaldo propio: el A/B de prompt ya había medido que el 38 % del largo da el mismo clip, pero con **n = 1**, y este documento tiene tres rondas perdidas por exactamente ese error.

`SETTING AND LIGHTING: ${escenario}` salía de `forensic.fondo`, que describe el **video ENTERO** dentro del prompt de UN clip (de ahí el sillón de la sesión de ropa). Contra la imagen del avatar —que ES la escena, en píxeles— eso es una contradicción, y el modelo la resuelve distinto en cada draw. Ese es el mecanismo de la costura que se ve al concatenar: *"el FONDO cambia entre clips"*.

A/B sobre el MISMO lote, quitando ESA LÍNEA y nada más (el diff entre los dos prompts es una línea), **dos draws por brazo**:

| | fondo del clip |
|---|---|
| avatar de referencia | cocina blanca moderna: alacenas, backsplash de mármol, refri de acero, olla terracota, banqueta de madera |
| **A1** (con escenario) | pasillo con marco de puerta oscuro y espejo — **no es la cocina** |
| **A2** (con escenario) | otra habitación distinta — **ni la cocina ni A1** |
| **B1** (sin escenario) | **LA COCINA, exacta** |
| **B2** (sin escenario) | **LA COCINA, exacta** — idéntica a B1 |

**2 de 2 en cada brazo.** Con el bloque el fondo no es ni el de la imagen ni el mismo entre draws; sin él, la imagen manda y el resultado es estable. Y libera **208 caracteres medidos** del presupuesto que se come la coreografía (neto −169 con la continuidad reescrita).

⚠️ **`forensic.fondo` NO SALIÓ DEL PIPELINE: sigue alimentando el prompt del AVATAR** (`character.ts`), que es donde el escenario del original TIENE que entrar — es la mitad del arreglo del 2026-08-26 (*"el avatar contradecía al original"*). Lo que se elimina es decirlo **dos veces y en dos idiomas distintos**.

⚠️ **Y HUBO QUE REESCRIBIR `CONTINUITY` EN EL MISMO CAMBIO.** Decía *"setting and lighting identical throughout, **exactly as above**"*, y ese "above" era el bloque que se acaba de borrar: dejarlo es una referencia colgando, el modo de fallo que este repo ya registró tres veces (el `06c8259` de anuncios, `estable` contra el micro-temblor, *"no reescribas"* contra la sección que pide reescribir). Ahora nombra la fuente que de verdad manda: *"the room and lighting are the ones in the reference image"*. Con test que prohíbe las dos cosas (que vuelva el bloque y que vuelva el "as above").

✅ **Y EL CASO DE ACUERDO SE CERRÓ CON UNA SESIÓN COMPLETA POR EL WIZARD (2026-09-02, sesión `ca62aaed`).** El A/B midió el caso donde imagen y texto se contradicen; faltaba el otro. Corrida entera por la ruta real —forense 28,6 s → producto → personaje → plantilla (5 cortes → 3 tomas) → guión → 4 lotes → 4 renders, todos `success`—, con el avatar ya nacido en el escenario del original (`fondo`: *"estantería de madera oscura, marco de puerta al fondo, luz cálida"*). **Los 4 clips y el avatar transcurren en la MISMA habitación**: misma estantería con libros y portarretratos, mismo marco de puerta, misma planta, mismo suéter. Contra el registro de la sesión anterior CON el bloque (*"pasillo, cocina con banquetas, pared lisa, habitación con piso de madera"*), la costura del fondo desapareció. Video final: 45,19 s contra los 46,4 s del original.

⚠️ **CAVEAT DE LA MEDICIÓN, y es el que hay que tener presente antes de generalizar:** un lote, una sesión, y su avatar se generó **31 minutos ANTES** del arreglo del 26-ago — o sea es exactamente el caso donde imagen y texto se contradicen (el forense decía *"pared crema, marco de puerta de madera oscura"* y el avatar salió en una cocina blanca). Con el avatar ya nacido en el escenario del original los dos coinciden y el bloque pasa a ser **redundante** en vez de **contradictorio**. En ninguno de los dos casos aporta, y en uno hace daño.

❌ **LA PREMISA DEL CAP DE 15 s ES FALSA, Y LO QUE DE VERDAD SE ROMPE ES OTRA COSA (2026-08-27, `scripts/probe-cap-30.ts`, 4 renders).** El cap bajó de 30 a 15 porque *"grok pierde la consistencia del personaje y del entorno en clips largos"*, y eso DUPLICÓ las llamadas pagadas. Medido con **dos draws por duración**, como exige la regla de n=1 de este documento:

**La consistencia visual aguanta 30 segundos, en 2 de 2 draws.** Misma cara, misma camisa blanca sobre top negro, misma cocina de fondo y mismo frasco en los 15 fotogramas de cada clip. Cero deriva de identidad, de vestuario o de escenario. La razón por la que se bajó el cap no ocurre.

⚠️ **LO QUE SE ROMPE ES LA LOCUCIÓN, y eso nadie lo estaba mirando.** Transcritos con `probe-audio-espanol.ts`:

| duración | caracteres | car/s | locución |
|---|---|---|---|
| 7 s | 98 | 14,0 | ✅ |
| 10 s | 178 | 17,8 | ✅ **100 %** |
| 15 s | 281 | 18,7 | ✅ **100 %** |
| 18 s | 281 | 15,6 | ✅ **100 %** |
| **30 s** | **577** | 19,2 | ❌ **56 %** |
| **30 s** (2º draw) | **577** | 19,2 | ❌ **70 %** |

A 30 s deja de recitar y empieza a improvisar: *"Les quiero enseñar mi producto favorito"*, *"Yo la uso en la mañana"* — frases que no están en el guión. Y el segundo draw es todavía más claro: **repite la primera oración TRES VECES** y después degenera en balbuceo (*"por su suero esta utilidad ni piel meo es este"*). Es el mismo modo de fallo que este documento ya registra para Veo con el techo blando (*"Y es nuestro mural y es nuestro top mural"*), pero por el extremo largo.

⚠️ **CONSECUENCIA PRÁCTICA: el cap que ata de verdad es `LOTE_MAX_CHARS`, no `LOTE_MAX_SEC`.** Vale **300** (15 × `CPS_MAX`) y las mediciones lo respaldan sin haberlo buscado: 281 caracteres funcionan y 577 no. O sea el número correcto ya estaba puesto, pero por el motivo equivocado.

⚠️ **Y ABRE UNA OPTIMIZACIÓN QUE NO SE PUEDE CABLEAR TODAVÍA:** si lo que limita es el TEXTO, un lote con poca locución —o mudo— podría durar más de 15 s sin riesgo, y menos clips es menos costuras (ver la concatenación: el fondo cambia ENTRE clips, no dentro). Lo verificado es 18 s con 281 caracteres; **25 s con 200 caracteres es extrapolación y necesita sus propios 2 draws**. No subas `LOTE_MAX_SEC` sin medirlo: es exactamente el error que este documento acaba de cometer tres veces seguidas.

⚠️ **VUELTA A GROK: `grok-imagine/image-to-video` (2026-08-24, decisión del dueño del repo).** Deshace la migración a Veo 3.1 del 2026-08-19 y cambia cinco cosas a la vez, todas encadenadas: el modelo, el cap de clip (8 s → **30 s**), el sistema de imágenes (keyframes → **anclas**), el generador de imagen (Nano Banana Pro → **gpt-image-2**) y el idioma del prompt (español → **inglés**, con la locución en español). Todo lo que este documento diga de `veo3_fast`, `FIRST_AND_LAST_FRAMES_2_VIDEO` o del tope de 60.000 caracteres es HISTORIA a partir de acá.

**Contrato (`lib/video-ads/kie.ts`, `docs.kie.ai/market/grok-imagine/image-to-video`).** El modelo vuelve al MARKETPLACE: `POST /api/v1/jobs/createTask` → `taskId`; `GET /api/v1/jobs/recordInfo?taskId=` → `state` STRING y `resultJson` como **string con JSON adentro**. Veo usaba `/api/v1/veo/*`, `successFlag` numérico y un array — son dos parsers distintos y mezclarlos deja el polling esperando para siempre un video que ya está listo.

⚠️ **Y NO ES EL MISMO GROK DE LA PRIMERA ÉPOCA.** `grok-imagine-video-1-5-preview` tomaba `duration` INTEGER 1–15, prompt de 4096 y rechazaba `mode`. Éste toma `duration` **STRING 6–30**, prompt de **5000** y acepta `mode`. Copiar el cliente viejo tal cual no funciona.

✅ **MEDIDO CON EL CANARIO GRATIS (`scripts/canary-grok.ts`, 2026-08-24).** La validación de KIE corre ANTES de despachar, así que un campo inválido vuelve **sin `taskId` y sin cobrar**: mandando una `duration` fuera de rango se verifica gratis todo lo demás, y al revés, mandando un prompt de 5001 caracteres se verifica gratis la duración. Confirmado sin gastar un solo render:

| probe | resultado |
|---|---|
| prompt de 5000 | aceptado (solo se queja de la duración) |
| prompt de 5001 | **rechazado** — *"The text length cannot exceed the maximum limit"* |
| 7 imágenes | aceptadas |
| `duration` `"6"` / `"12"` / `"30"` | las tres válidas |
| `duration` como number | **también** válida — el `String()` es por la doc, no porque el number falle |

⚠️ **LOS ERRORES VIENEN EN HTTP 200 CON `code: 500` ADENTRO** (no 422, y no en el status). Mirar solo `res.ok` deja pasar el fallo como éxito; por eso `createVideoTask` exige `data.taskId`.

⚠️ **`nsfw_checker` va en `true` y eso ACTIVA el filtro.** El default de la API es `false`, que lo apaga. Es la clase de campo que se copia mal leyendo por encima.

⚠️ **`aspect_ratio` sigue siendo inválido con UNA sola imagen.** Hoy no ocurre en ningún camino: `imagenesDe` manda siempre avatar + producto (+ anclas), o sea ≥2. `vertical.ts` sigue siendo el salvavidas documentado para ese caso, sin usar.

**`clampDuration` reemplaza a `snapDuration`.** Con un rango CONTINUO 6–30 el ajuste es un clamp entre dos cotas en vez de una búsqueda sobre `{4,6,8}`, pero conserva las dos lecciones que ya estaban medidas: el **piso duro** (`>= chars / CPS_MAX`, el texto tiene que poder decirse) y el **techo blando** (`<= chars / CPS_MIN`, para que no sobre tanto tiempo que el modelo repita la frase — medido en su momento: 23 caracteres en 6 s hicieron que dijera la línea dos veces). Si chocan, manda el piso.

⚠️ **EL TECHO BLANDO SOLO APLICA A UN CLIP DE UNA SOLA ESCENA, y ese acote es obligatorio con el cap de 30 s.** La medición que lo justifica es de un clip de 6 s con UNA línea corta: ahí el modelo no tenía nada más que hacer y repitió la frase. Un clip de 30 s con varias tomas es otra cosa — cada toma trae su propia `accionVisual`, y el silencio entre escenas es la textura que se está copiando del original. Sin el acote, el techo recortaba el clip a lo que "merece" su texto y **descartaba escenas en silencio**: medido, un lote de 30 s con 200 caracteres caía a 22 s y uno con 120 caracteres a **13 s**, o sea 17 segundos de shot list tirados — y justo los que ya tienen su imagen ancla generada y pagada. Con test.

**FASE 5 — lotes de ≤30 s.** `LOTE_MAX_SEC = 30`, 3,75× el techo de Veo. Efecto directo sobre el dinero: los mismos cortes caben en muchos menos lotes, y cada lote es una llamada pagada.

⚠️ **`maxPlanos` PASÓ DE 1 A "SIN LÍMITE", y eso invierte una regla que este documento tenía como medida.** La medición era real —un clip con dos encuadres se renderizaba con uno solo, el otro se perdía en silencio— pero su **premisa cambió**: se hizo sobre Veo, donde el clip solo recibía texto y dos keyframes, así que el modelo tenía que INVENTAR cómo se ve la escena nueva. Ahora cada escena lleva su propia imagen ancla y el prompt describe el corte entre ellas. Con 30 s de techo, mantener el corte por plano daría clips de 1–2 s (el video de ropa medido daba 24 clips para 28 s). Sigue siendo un PARÁMETRO, no un hardcode: es el dial de costo, y bajarlo a 1 recupera el comportamiento anterior.

**IMÁGENES ANCLA (`lib/video-ads/anchors.ts`) — reemplazan a `frames.ts`, que se borró.** El modelo acepta hasta 7 imágenes por tarea: avatar + producto + hasta **5 anclas**. La primera escena de cada lote arranca del avatar; cada escena SIGUIENTE recibe un fotograma generado que le dice cómo se ve. Una escena nueva empieza cuando cambia el encuadre o cambia quién está en cuadro (`muestraPersona`, el mismo criterio con el que `mergeMicroCortes` decide qué fusionar).

⚠️ **NO es el sistema de keyframes con otro nombre.** Aquel generaba el primer y el ÚLTIMO fotograma para que el modelo INTERPOLARA entre los dos, y por eso los lotes formaban una cadena que no se podía romper. Las anclas son material de REFERENCIA citado como `@image(n)`: no hay interpolación forzada, no hay frame de cierre y cada ancla es independiente. Se guardan en la misma columna `frames` (es un `string[]` y sirve igual, así que no hay migración) y se reusan al reanudar.

⚠️ **El orden de `imagenesDe` ES el contrato.** La leyenda `@image(n)` se arma recorriendo ese array y `anclasPorTiempo` calcula el índice de cada ancla asumiendo que las plazas 1 y 2 son avatar y producto. Reordenarlo le da a una toma la imagen de otra.

**Transiciones: cortes secos, no efectos.** Con varias escenas por clip el prompt emite un bloque `CUTS` que pide cortes duros como los de un montaje real y prohíbe explícitamente crossfades, disolvencias, whip pans, transiciones de zoom, morphing y speed ramps — y exige que persona, vestuario, producto, habitación y luz NO cambien al otro lado del corte. Con una sola escena vuelve el bloque `CONTINUOUS TAKE` de siempre.

⚠️ **VOLVIÓ LA ESCALERA DE DEGRADACIÓN DEL PROMPT, y no es opcional.** Se había BORRADO con Veo (60.000 caracteres, nada que recortar). Con **5.000** y clips de hasta 30 s, el mismo prompt tiene que sostener ~4× las tomas en 1/12 del espacio: sin escalera, `buildLotePrompt` lanzaría en cuanto un lote tenga contenido real. Los niveles y su orden se recuperaron del commit `a660c68^` en vez de re-derivarse — vienen de incidentes medidos. Lo que se cede primero es lo que DUPLICA información; la línea hablada de cada toma **nunca** se suelta (es la única señal de qué frase va con qué acción, y perderla en un lote y no en otro produjo *"una habla muy rápido y la otra muy lento"*).

## V2 — el movimiento pasa a ser un artefacto estructurado (`motion.ts`)

⚠️ **EL DEFECTO QUE LO MOTIVA:** el movimiento viajaba como PROSA de punta a punta (`accion`, `micro` → `accionVisual` → prompt), y una prosa preserva la IDEA del gesto pero no su estructura temporal. Grok recibía *"aplica una gota y masajea"* para 11 segundos y se inventaba el reparto. `MotionTimeline` no es una descripción más rica: es una **máquina de estados** —cada beat declara qué había antes y qué queda después— y por eso el encadenado se puede **verificar en código**.

⚠️ **EL SCHEMA NO PUEDE OFRECERLE UNA SALIDA AL MODELO, Y ACÁ COSTÓ UNA MEDICIÓN ENTERA.** La primera versión declaró `motion: MotionTimelineSchema.nullable().catch(null)`, copiando la forma de `micro`. Resultado sobre un video real: **0 de 5 cortes con timeline.** Ni uno. La causa es la que este documento ya registra para las casillas de `micro`: `.nullable().catch(null)` emite `{"default": null, …}`, o sea el schema le dice que `null` es válido **y que es el default** — y con un objeto tan grande esa salida es irresistible. Con **`.catch(TIMELINE_VACIO)`** —en el `required`, infalible y sin ningún `null` donde escaparse— la misma llamada devolvió **5 de 5**. Es la quinta vez que este repo paga esta lección; ahora hay un test que falla si el JSON Schema del campo vuelve a contener `"null"`.

⚠️ **Y LOS SUB-OBJETOS TAMBIÉN INFALIBLES:** con `startState: MotionStateSchema` a secas, un estado malformado hace fallar el objeto entero y el `.catch` de afuera devuelve el timeline VACÍO, destruyendo los beats que el modelo SÍ produjo. Es exactamente la trampa documentada con `micro`.

⚠️ **`objetoEnMano` DEJA DE PEDIRSE: SE DERIVA.** Preguntaba lo mismo que `productStateBefore` del primer beat y `productStateAfter` del último, **en la misma granularidad** — el duplicado que este repo midió que vuelve vacío (0 de 4, 0 de 6). `objetoEnManoFromMotion` lo reconstruye del timeline, así que sus dos consumidores (`puedenUnirse`, `unirManos`) **no cambian una línea**. Es el §35.5 pregunta 5 resuelto sin borrar nada que alguien lea.

⚠️ **`micro` SÍ SOBREVIVE, y la distinción importa:** es el agregado POR CORTE (alimenta `corteMuestraPersona` y la línea compacta del prompt); un beat es un tramo DENTRO del corte. Dos campos con la misma pregunta en granularidades distintas no son duplicados.

⚠️ **LOS TRAMOS EN PROSA SE ELIMINARON** (el `"0-2 s: …; 2-4 s: …"` de la víspera). Eran una lista de beats pobre en texto, inventada para esquivar el techo de cláusulas del modelo. Con estructura real sobran, y mantener las dos habría sido pedir el mismo contenido dos veces. Es el "preferir borrar una regla a agregar otra que la compense".

⚠️ **EL PASE DE REFINAMIENTO VA CABLEADO, Y ES UNA LLAMADA POR VIDEO — NO POR CORTE.** Medido sobre el mismo video, tres variantes:

| | beats por corte | total | eslabones rotos | llamadas extra |
|---|---|---|---|---|
| pase general (FASE 1) | 1, 1, 1, 1, 1 | 5 | — | 0 |
| **dedicado, 1 llamada/VIDEO** ← cableado | 2, 3, 2, 3, 2 | **12** | ~0–1 | **1** |
| dedicado, 1 llamada/CORTE | 2, 3, 3, 4, 3 | 15 | **3** | **5** |

⚠️ **Por corte NO vale la pena, y el motivo es contraintuitivo: más llamadas dieron PEOR calidad.** Compra un 25 % más de beats a 5× el costo, pero con menos contexto el modelo **deja de mantener la cadena de estados del producto** (3 eslabones rotos contra ~0) y se saltó un `referenceFrameMs`. Trocear más fino la misma pregunta tiene rendimientos decrecientes y un costo de coherencia; no lo repitas sin volver a medirlo.

**Cómo está cableado, y las tres decisiones que lo hacen seguro:**
1. **Va en `try/catch` y ANTES de persistir nada.** Si el refinamiento falla, la sesión se guarda con el movimiento del pase general — peor pero utilizable. Misma forma que el corrector de coherencia cayendo al relleno de la primera pasada: un paso de mejora nunca puede costar el paso que ya se pagó.
2. **Solo pisa si trae MÁS resolución** (`m.beats.length > actual`): nunca se cambia un timeline por uno más pobre, y un corte que el pase no supo refinar se queda con el suyo.
3. **Kind propio `video-motion`, SIN tope per-step.** Se registra para que aparezca en el panel de consumo y cuente al backstop diario, pero un segundo gate sobre la misma ruta solo podría dejar la sesión con el análisis hecho y el movimiento a medias — la ruta ya está topada por `video-forensic`. Mismo criterio que `video-render`.

⚠️ **EL BEAT SE ADELGAZÓ DE 18 A 10 CAMPOS, Y EL RESULTADO REFUTA LA HIPÓTESIS QUE LO MOTIVÓ — pero se conserva igual.**

La hipótesis era que el techo de densidad era **presupuestario**: si un beat cuesta 18 campos, el modelo emite menos beats de los que emitía frases, así que abaratarlo debería multiplicarlos. Medido sobre el mismo video:

| | pase general | pase dedicado |
|---|---|---|
| beat de 18 campos | 5, 5 (dos corridas) | 9, 12 |
| **beat de 10 campos** | **8** | **11** |

**En el pase DEDICADO no se movió** (11 cae dentro del 9–12 que ya daba el gordo). Si el techo fuera el costo por beat, partirlo casi a la mitad tenía que dar un salto, y no lo dio.

✅ **Pero en el pase GENERAL subió de 5 a 8**, y esa diferencia tiene una lectura: ahí el beat **compite** con la transcripción, los cortes, los personajes, la cámara y el resumen, así que abaratarlo libera presupuesto real. En el pase dedicado los beats son el único trabajo — no hay nada con qué competir, y por eso el adelgazamiento no compra nada.

⚠️ **CONCLUSIÓN, Y ES LA QUE IMPORTA PARA NO SEGUIR PERSIGUIENDO ESTO: el techo del pase dedicado NO es de presupuesto, es SEMÁNTICO.** El modelo simplemente juzga que un corte de 20 s contiene ~3 eventos. Ni más llamadas (una por corte: peor), ni beats más baratos (esto: sin efecto) lo mueven. Las palancas que quedan sin probar son de otra clase: pedirle el corte en tramos de video ya segmentados, o una cuota explícita de beats — y la cuota **el spec la prohíbe** porque fabrica movimiento que el original no tiene, que es exactamente lo que el render después ejecuta.

**El adelgazamiento se conserva igual**, y no por consuelo: mismo número de beats con **44 % menos superficie**, el pase general mejora, y los tres indicadores de calidad se mantienen en el máximo (**0 eslabones rotos, 0 beats sin `referenceFrameMs`, 5 de 5 cortes con timeline**). Es el mandato de des-ingeniería en su forma más literal: si dos implementaciones dan la misma conducta medida, gana la de menos piezas.

Lo que se fue del beat, y por qué — cada uno por el mismo criterio de "ya está contestado en la granularidad correcta":

| campo | dónde vive ahora |
|---|---|
| `id` | se deriva (`b1`, `b2`, …) |
| `referenceStartMs` / `referenceEndMs` | se derivan de la ventana del corte + `startSec/endSec` |
| `productInteraction` | es el par `productStateBefore/After` dicho otra vez en prosa |
| `cameraMotion` | `camara`, por corte — y con `maxPlanos = 1` hay un encuadre por clip |
| `environmentMotion` | `micro.entorno`, por corte |
| `face` | `micro.rostro`, por corte. La MIRADA se queda: sí cambia dentro del corte |
| `dialogueMode` | se deriva de `vozEnOff` y `dialogo`, que son del corte |
| `continuityCritical` | solapaba con `importance: 'major'`; la escalera solo lee una |

❌ **LA DENSIDAD SIGUE SIENDO EL PROBLEMA ABIERTO DE V2.** ~11 beats en 46 s son 0,24 beats/s contra los 0,67–1,33 que implica la guía del spec. Antes de construir encima (anclas de pose, MOTION LOCK, carga de movimiento) conviene saber que se construye sobre **2-3 beats por corte**, y que las tres palancas obvias ya están medidas y agotadas.

Lo que SÍ compró la estructura, y no es poco: **0 eslabones rotos** en la cadena de estados del producto, `referenceFrameMs` en el 100 % de los beats (que es lo que habilita las anclas de pose), y las dos manos separadas de forma fiable.

⚠️ **EL VALIDADOR TOLERA LA REDACCIÓN, y también por medición:** marcó roto un eslabón donde un beat dejaba *"Dropper held in front of face"* y el siguiente esperaba *"Dropper in front of face"*. Un validador que marca eso entrena a ignorarlo. `mismoEstado` compara palabras de contenido por subconjunto; una contradicción real (*"on the table"* contra *"at her face"*) sigue saltando.

✅ **LA DEUDA DEL PROMPT MIXTO SE CERRÓ EN LA FUENTE — CONTRATO DE IDIOMA (2026-09-03).** Este documento la describía como acotada y cara de arreglar (*"traducirlo exigiría una llamada de LLM por lote"*). El camino barato que se anotaba entonces —*"pedirle a FASE 1/FASE 4 esos campos también en inglés"*— es el que se tomó, y **no cuesta ni una llamada ni un carácter de más**.

La regla parte la salida por lo que hace cada campo, no por gusto:

| en ESPAÑOL — se pronuncia o lo lee una persona | en INGLÉS — va literal al prompt del render |
|---|---|
| `guionOriginal`, `dialogo`, `hablantes[].texto`, `textoOverlay`, `resumenParaUsuario`, la plantilla, los `valores` y las `locuciones` de FASE 3 | `accion`, `camara`, `transicion`, `micro.*`, `objetoEnMano.*`, `sujeto`, `vestuario`, `producto`, `fondo`, `edicion.*`, `accionVisual` de FASE 3, `promptCreacion`, `bloqueConsistencia`, `calidadMovimiento`, `manerismos`, `productDescription` |

⚠️ **`brandingDescription` NO ENTRA EN NINGUNA DE LAS DOS COLUMNAS: va en el idioma DEL ENVASE.** Es una transcripción letra por letra y es la única fuente que el guion tiene de lo que el producto contiene; traducirla la deja de ser una transcripción y reintroduce la clase entera del ingrediente inventado, que este documento ya pagó dos veces (*"hepéres"*, después *"HEPES"*).

⚠️ **FASE 2 NO NECESITÓ NADA, y conviene saberlo antes de tocarla:** `assembleTemplate` copia `accionVisual: c.accion` del corte del forense — el modelo de esa fase no lo produce, lo hereda. Agregarle una regla de idioma habría sido una línea de prompt para un campo que ese modelo no escribe.

🔴 **LO PRIMERO ERA QUE EL CAMBIO NO ROMPIERA LOS GUARDS, Y ESO NO ESTABA EN EL SPEC.** Tres funciones deterministas parseaban esos campos EN ESPAÑOL, y cada una falla en una dirección distinta:

| guard | qué le pasa con `accion`/`micro` en inglés |
|---|---|
| `corteMuestraPersona` | **falla ABIERTO.** Compara contra `/^no aparece$/`; con `"not visible"` ninguna casilla parece ausente, **TODO corte se clasifica como plano de persona** y un flat-lay vuelve a fusionarse entre dos planos de la modelo — el fallo exacto que la función existe para evitar |
| `muestraPersona` | **falla CERRADO.** Devuelve `false` para toda acción en inglés: no fabrica fusiones, pero apaga en silencio la frontera de clase de `groupIntoLotes` |
| `coreografiaEscasa` | **miente.** Parte por `luego|después|y`; en inglés cuenta menos movimientos justo en el log que se usa para medir si la densidad mejoró — o sea rompe el instrumento |

Es la misma lección que dejó `repartirAccion` el día anterior: **al cambiar el FORMATO que produce el forense hay que mirar quién lo parsea aguas abajo.** Los tres son bilingües ahora. `AUSENTE` es un centinela de vocabulario controlado (comparación anclada contra una lista corta), no una heurística sobre prosa, así que extenderlo es seguro.

⚠️ **Y EL PROMPT SOLO OBEDECIÓ CUANDO SE TRADUJERON LOS EJEMPLOS, NO LA REGLA — medido.** Con la regla de idioma escrita y los ejemplos todavía en español, la primera corrida real devolvió **4 de 6 campos técnicos en inglés**: `micro.*` y `transicion` se quedaron en español, y `transicion` volvió literalmente *"corte directo"*, que era **el valor del propio ejemplo del prompt** (*"jump cut / corte directo / continuidad / zoom digital"*). Es el patrón que este documento ya registra cuatro veces —**un ejemplo con forma de valor es una plantilla que rellenar**— y acá manda sobre una regla global escrita diez líneas más arriba.

El arreglo fue traducir los EJEMPLOS (el formato de `micro.manos`, el estado de los accesorios, el telegrama, el glosario de encuadre, el anti-ejemplo de `accion`), no insistir con la regla. Segunda corrida sobre la misma sesión: **5 de 5 campos medibles en inglés**, `transicion` → *"Hard cut"*, `micro.manos` → *"left: holds bottle · right: uncaps → applies to cheek → caps"* con el formato exacto pedido, y el centinela `not visible` presente en 1 de 5 cortes.

⚠️ **NO LLEVA BUMP DE HUELLA, y es contraintuitivo.** `scriptFingerprint` protege la **plantilla de `buildLotePrompt`**, que no se tocó; lo que cambia de idioma son VALORES (`consistencyBlock`, `productDesc`, `accionVisual`) que la huella ya hashea como insumos. Una sesión re-analizada obtiene huella nueva sola, y los parciales guardados conservan la suya. Bumpear acá invalidaría 20 sesiones con lotes pagados sin ninguna razón.

⚠️ **LAS SESIONES GUARDADAS NO SE TRADUCEN AL LEER.** Sería no-determinismo dentro de `getVideoSession` y movería las huellas de los parciales pagados. Se quedan mixtas; solo los análisis NUEVOS nacen con el contrato. `muestraPersona` sigue siendo el camino legado y por eso tenía que quedar bilingüe, no cambiar de idioma.

⚠️ **DEFECTO MENOR OBSERVADO, sin arreglar:** `sujeto` volvió con *"Not está flotando."* pegado al final — el mismo tic del modelo que ya se limpió en el scan del producto (`limpiarEscenaDeFoto`), apareciendo ahora en otro campo. Es cosmético y **anterior a este cambio**; si molesta, el arreglo es la misma limpieza aplicada a `sujeto`.

⚠️ **EL PROMPT VA EN INGLÉS Y LA LOCUCIÓN EN ESPAÑOL.** La doc dice *English only* y el dueño del repo lo confirmó por resultado. Pero el anuncio es para el mercado peruano: cada línea hablada va entrecomillada y rotulada como *Latin American Spanish, verbatim*, con una línea al principio del prompt que separa las dos cosas explícitamente. **Deuda conocida y acotada:** el CONTENIDO inyectado (bloque de consistencia, `accionVisual`, escenario, cámara, perfil de voz) lo produce el análisis forense en ESPAÑOL, así que el prompt queda mixto — andamiaje inglés, descripciones españolas. Traducirlo exigiría una llamada de LLM por lote (costo, latencia y no-determinismo justo donde `scriptFingerprint` necesita pureza) o re-correr el análisis de cada sesión guardada. El camino barato, si hace falta: pedirle a FASE 1/FASE 4 esos campos también en inglés.

⚠️ **TODAS LAS IMÁGENES PASAN A gpt-image-2, Y ESO REVIERTE EL BYOK DE IMAGEN.** Nano Banana Pro corría en KIE **con la key del usuario**; gpt-image-2 corre con la key de OpenAI **del hub**. O sea el avatar y las anclas vuelven a costarle al hub, deshaciendo esa mitad del cambio del `a57f87a`. El render sigue siendo BYOK. Lo que acota el gasto es la cuota que ya existe: `video-character` topa per-step (1 gen + 3 regens) y las anclas se generan dentro de `generate-lotes`, que topa en `video-generation` (3 por video) y no regenera al reanudar. ⚠️ **Decisión abierta:** `CREDIT_KINDS` sigue excluyendo los kinds de video, y su justificación escrita era *"el video lo paga el usuario con su key de KIE"* — que ya no vale para las imágenes. Cambiarlo altera lo que prometen los tres planes, así que no se tocó.

⚠️ **El gate de la tool sigue siendo la key de KIE, pero por otro motivo.** El avatar ya no es una llamada a KIE, así que `KieKeyRequired` dejó de ser "sin key esto falla" y pasa a ser un gate de COSTO DEL HUB: sin key el usuario no va a poder renderizar, y generarle igual el avatar es gastar dinero nuestro en algo que no va a usar.

**EL AVATAR ES UNA PERSONA NUEVA, NO LA DE LA FOTO.** La foto de referencia la puede haber sacado el usuario de cualquier lado, así que reproducir esa cara sería publicar la imagen de alguien que no dio permiso. El prompt toma el TIPO físico (rango de edad, complexión, tono de piel, estilo y color de cabello) y construye a otra persona con él, combinándolo con el brief del usuario: distinta nariz, boca, ojos y mandíbula. Es un requisito legal, no estético.

⚠️ **REALISMO ESTRICTO EN EL AVATAR Y EN LAS ANCLAS, exigido por el dueño del repo.** Es el fallo más visible de un generador de imagen sobre personas: piel de plástico, luz uniforme y cara de render. Y acá pesa el doble, porque esos fotogramas definen cómo se ve el clip entero — una piel acartonada en el ancla contamina todas las tomas que salgan de ella. Los dos prompts exigen textura real (poros, vello fino, lunares, brillo natural, líneas de expresión) e iluminación desigual, y prohíben explícitamente piel suavizada, tonos pastel, acabado acartonado, ilustración, render 3D, estilización, aerógrafo y filtro de belleza.

**Huella v8 → v9.** Cambian el motor, el cap de clip (o sea el reparto en lotes), el sistema de imágenes y la plantilla del prompt entera: un resume a través del cambio pegaría un clip de Veo a uno de grok jurando que es el mismo contenido. Los parciales anteriores cuentan como generación nueva, fail-closed.

⚠️ **LO QUE NO ESTÁ VERIFICADO, y es lo primero que hay que cerrar:** ningún render real corrió con este código. En particular, **que grok diga la locución en español palabra por palabra NO está medido** — con Veo sí lo estaba (dos renders), acá no, y la doc del modelo dice que el prompt es *English only*. Si grok traduce o destroza el español entrecomillado, el entregable se rompe y se descubre recién al renderizar. Tampoco están verificados el aspecto real de un clip de 30 s con varias escenas, ni que las anclas produzcan cortes limpios, ni el precio por clip.


⚠️ **[HISTORIA — revertido el 2026-08-24, ver arriba] MIGRACIÓN A VEO 3.1 (2026-08-19).** El render dejó `grok-imagine-video-1-5-preview` y pasó a **`veo3_fast` 720p**. Motivo: el movimiento salía robótico y grok no tiene entrada de voz ni keyframes — era un techo de modelo, no solo de prompt. Plan completo y probes en `docs/superpowers/plans/2026-08-19-video-veo31-nanobanana-plan.md`. **La migración está COMPLETA**: el avatar sale de Nano Banana Pro en 9:16, el render usa `FIRST_AND_LAST_FRAMES_2_VIDEO` con frames generados por adelantado, y existen `motion_profile`, varios personajes (hasta 4) y el eje de voz en off. **Lo que NO está verificado:** el precio real de `veo3_fast` 720p, una tanda completa por el wizard, y el modo de varios personajes en un render de verdad. Las secciones de más abajo que hablan del presupuesto de 4096 caracteres describen a grok y son HISTORIA, no doctrina — están marcadas.

**[HISTORIA — el contrato vigente es el de grok, arriba] Contrato con Veo 3.1 (`docs.kie.ai/veo3-api`).** El modelo es **`veo3_fast`** y **vive en otro endpoint que el resto del marketplace**: `POST /api/v1/veo/generate` → `taskId`; `GET /api/v1/veo/record-info?taskId=` → `successFlag` (**0** en curso, **1** ok, **2|3** falló) con el video en `data.response.resultUrls[0]` (un ARRAY, no el string con JSON adentro que usaba el marketplace). Grok y Nano Banana Pro siguen en `jobs/createTask`. Reglas duras, todas blindadas por `kie.test.ts`:
- **`duration` acepta EXACTAMENTE 4, 6 u 8 segundos.** Nada de decimales ni de 15. `snapDuration` (kie.ts) es donde se decide qué se pierde al ajustar: de las duraciones legales en las que la locución SÍ entra a `CPS_MAX`, elige la más cercana a la duración original, con empate hacia la más corta. Redondear siempre hacia arriba mete silencio; hacia abajo corta diálogo a mitad de frase, que es peor.
  ⚠️ **`snapDuration` tiene DOS condiciones, no una.** La dura (`>= chars / CPS_MAX`) es que el texto se pueda decir. La blanda (`<= chars / CPS_MIN`, con `CPS_MIN = 9`) es que no sobre tanto tiempo que el modelo rellene: **medido, 23 caracteres en 6 s (3,8 car/s) hicieron que Veo dijera la frase DOS VECES** — *"Y es nuestro mural y es nuestro top mural"*. Ese mismo lote fue además el que falló con *"unable to generate audio"* en el primer intento. Entre las que cumplen las dos se elige la más cercana a la duración original; si ninguna cumple la blanda se toma la más corta de las que cumplen la dura. Una toma MUDA queda fuera de la regla: sin habla no hay nada que repetir y su duración es un beat visual.
- **`prompt` topa en 60.000 caracteres** (`422 "The prompt word cannot exceed 60000 characters"`). Son 14,6× los 4096 de grok, y por eso **la escalera de degradación de `buildLotePrompt` se BORRÓ** en vez de portarse.
- **`generationType` decide qué significan las imágenes, y los modos son EXCLUYENTES:** `REFERENCE_2_VIDEO` (1–3 referencias, solo fast/lite, solo 8 s) o `FIRST_AND_LAST_FRAMES_2_VIDEO` (1–2 keyframes: primero y último).
- **El prompt puede ir en ESPAÑOL** y la locución entrecomillada se dice literal, con acento latinoamericano — medido con dos renders. La afirmación de que Veo 3.1 solo acepta inglés es falsa, y `enableTranslation` **no** toca el texto entrecomillado. No hace falta ningún split bilingüe.
- **Veo devuelve HTTP 200 con `code: 422` adentro** en los errores de validación. Mirar solo `res.ok` deja pasar el fallo como éxito y el polling espera para siempre un `taskId` que no existe.

⚠️ **EL CANARIO GRATIS, para probar el body sin gastar:** mandar `duration: 5` (inválido) devuelve 422 **sin `taskId`**, o sea la validación corre antes de despachar y no cobra. Cualquier otro campo —modo, modelo, largo de prompt, número de imágenes— se verifica gratis mandándolo junto a esa duración inválida. Así se midieron el tope de prompt y las combinaciones de modo sin gastar un solo render.

**Cada lote manda SIEMPRE dos imágenes (personaje + producto), nunca una sola** — así que el caso "`aspect_ratio` inerte con una sola imagen" que motivó `vertical.ts` (`toVerticalCanvas`, enlienzar a 1080×1920) no ocurre hoy en ningún camino real. `vertical.ts` sigue en el repo y sigue probado (`vertical.test.ts`), pero **no lo llama ningún código de producción** — es la pieza que resolvería el escenario de una sola imagen si algún día el render dejara de mandar el producto, no infraestructura activa. No lo borres pensando que es dead code sin más: es un salvavidas documentado para un modo que hoy no se usa, no un error.

**FASE 4.6 — `motion_profile`, el tercer artefacto bloqueado (`character.ts`, columna `motion_profile`).** `consistency_block` congela cómo se VE el personaje y `voice_profile` cómo SUENA; no había nada para cómo se MUEVE. Sale de la MISMA llamada de FASE 4 que ya extrae identidad y voz, así que no cuesta una llamada extra, y se repite íntegro en cada lote por la misma REGLA DE CONTEXTO ABSOLUTO — un personaje que se mueve distinto en el lote 3 que en el 1 es el mismo fallo que uno que cambia de cara.

⚠️ **SON DOS CAMPOS Y NO SE PUEDEN COLAPSAR EN UNO.** El fallo que esto arregla es que los renders salían "robóticos", y la trampa es leer eso como falta de energía: **un video sereno también tiene movimiento fluido** — la fluidez y la energía son ejes independientes. Con un solo campo el modelo devuelve *"energía media"* donde hacía falta *"movimientos lentos y continuos"*, y encima eso ya lo cubre el perfil de voz. `calidadMovimiento` es la FÍSICA del cuerpo (continuo o entrecortado, velocidad, desplazamiento de peso, qué hacen las manos cuando no hacen nada, dónde descansa la mirada entre frases); `manerismos` son los gestos involuntarios que NO cumplen función narrativa. Esto último es lo que `accionVisual` no puede cubrir por definición: describe solo movimientos con propósito, y un cuerpo que solo hace movimientos con propósito es un robot.

**El insumo que faltaba: `forensic.edicion.ritmo` y la acción de los cortes.** Los dos se medían, se persistían y **no llegaban a ningún prompt**. Ahora entran a la instrucción de identidad, que es donde se decide cómo se mueve el personaje nuevo.

✅ **Verificado con dos corridas reales sobre la sesión de ropa**, y el resultado confirma la separación: `calidadMovimiento` salió *"transiciones fluidas entre poses… el peso se desplaza de manera equilibrada… las manos y los brazos, cuando no interactúan con el producto, cuelgan relajados… la mirada atenta a la cámara, al producto o ligeramente desviada"* — los cuatro ejes, cero menciones de energía. `manerismos`: *"ajustarse el cuello de la ropa de forma repetitiva incluso cuando no es directamente funcional a la demostración"*. Y en la misma respuesta `voz.energia` decía *"Media-baja, transmite calma y confianza, sin euforia"*: movimiento fluido con energía baja en el mismo personaje, que es exactamente la distinción que el campo existe para hacer.

**[HISTORIA — `frames.ts` se borró; hoy son las IMÁGENES ANCLA de `anchors.ts`] MODO DE FRAMES.** Cada clip se genera entre DOS KEYFRAMES (`FIRST_AND_LAST_FRAMES_2_VIDEO`) en vez de desde una descripción: con dos poses conocidas el modelo tiene que INTERPOLAR un movimiento real en vez de inventar uno, y la identidad pasa de estar anclada en TEXTO (el bloque de consistencia repetido en cada prompt) a estarlo en IMAGEN. Los frames se GENERAN por adelantado con Nano Banana Pro, no se extraen del video: extraer exige haber pagado el clip anterior para saber dónde empieza el siguiente, y como el modo obliga al modelo a terminar en el frame que se le da, el generado ES el fotograma final. Se persisten en la columna `frames` y se reusan al reanudar — regenerarlos haría que el clip pendiente arrancara en una pose distinta de donde terminó el que ya se pagó, con los dos clips existiendo y nada reportándolo.

⚠️ **`fetch` EN NODE NO TIENE TIMEOUT, Y ESO COLGÓ EL DEV SERVER.** El bucle de polling de `nano-banana.ts` comprobaba su presupuesto DESPUÉS del `await fetch`. KIE dejó una conexión abierta sin responder, el await nunca volvió, y por tanto el tope de 240 s **no se evaluó ni una vez**: proceso al 0 % de CPU, dormido, con una conexión ESTAB a `api.kie.ai` y el request del navegador colgado indefinidamente. En Vercel el síntoma sería distinto y peor de diagnosticar — la función muere en `maxDuration` con las tareas de imagen ya creadas y pagadas.

Dos mitades, las dos necesarias: **`fetchKie`** (kie.ts) le pone `AbortSignal.timeout` a TODA petición a KIE —las de Veo y las del marketplace—, y el bucle comprueba el presupuesto **antes** del fetch, además de acotar el timeout de cada petición a lo que queda del plazo total. Una petición no puede sobrevivir al plazo que se supone que respeta. Cubierto por un test que cuelga el fetch a propósito y verifica que la llamada TERMINA.

⚠️ **Los frames se generan EN PARALELO DESDE EL AVATAR, y las tres opciones están medidas.** En cadena (cada uno del anterior) conserva la continuidad pero es serial: ~58 s × 6 frames = 348 s, por encima del `maxDuration = 300`. Desde el avatar de catálogo original NO la conserva — el segundo frame salió con el pantalón cambiado de blanco a azul, otro encuadre y un teléfono en trípode en cuadro. Desde el frame 0, que ya es la escena UGC real, sí la conserva y va en paralelo: misma habitación, mismo pantalón, misma luz y mismo encuadre, 52,5 s las dos imágenes juntas. El frame 0 es el avatar, que desde Nano Banana Pro ya nace 9:16.

⚠️ **LA CADENA SE ROMPE EN CADA CORTE DE MONTAJE.** Compartir el frame frontera solo tiene sentido si los dos lotes son la misma escena: si uno cierra en un flat-lay del producto y el siguiente abre con la persona, ese frame compartido obliga a UNO de los dos clips a interpolar de un plano a otro — o sea a hacer el corte DENTRO de un plano continuo, que es justo lo que este diseño evita. Medido en un render real: el clip fue persona → detalle de la etiqueta → persona en 4 segundos; el frame era correcto y compartirlo era el error. `frameSpecs` usa `muestraPersona` (la misma función con la que `mergeMicroCortes` decide qué fusionar) y le da su PROPIO fotograma inicial a todo lote cuya escena no continúa la anterior. El avatar es un plano de persona, así que un anuncio que abra con un flat-lay también necesita apertura propia.

⚠️ **UN FRAME ES UNA FOTO, NO UNA SECUENCIA — y `accionVisual` sí lo es.** `mergeMicroCortes` deja la coreografía como una cadena de hasta nueve acciones unidas con "Luego,". Pidiéndole "el instante en que TERMINA esta acción" con ese texto entero delante, Nano Banana Pro devolvió un **collage de seis paneles**, uno por sub-acción, y Veo interpoló hacia la grilla. `ultimaAccion` se queda con la última sub-acción —que es literalmente lo que "el final de la toma" significa— y el prompt exige explícitamente una sola fotografía, no un collage ni una grilla.

⚠️ **La coreografía menciona la ropa de OTRA persona.** Sale del análisis del video de referencia: en la sesión de ropa dice *"vestida con la blusa y falda negras"* mientras el producto del usuario es una blusa celeste. En un prompt de edición el texto le gana a la imagen, así que el prompt del frame acota explícitamente a tomar solo el movimiento e ignorar ropa, colores y rasgos.

✅ **Verificado end-to-end con los módulos reales** sobre la sesión `430c5961`: frames en paralelo (110 s), prompt de 7.315 caracteres (que con los 4096 de grok se habría truncado), y un clip de **8 s, 720×1280, una sola toma continua** — manos a la cintura, mira la manga, gira a perfil y vuelve — sin flat-lay intruso ni collage.

**[HISTORIA en lo que toca al tope: hoy son ≤30 s] FASE 5 — lotes (`lib/video-ads/lotes.ts`, `groupIntoLotes`).** El shot list (`AdaptedScript.tomas`) se parte en tramos de máximo `LOTE_MAX_SEC = 8` segundos, y **cada lote es un render independiente de KIE** — una llamada a `createVideoTask` por lote, nunca un guión completo en una sola llamada. La agrupación NO usa LLM: es aritmética pura (acumula tomas hasta que la siguiente excedería el tope, comparando con epsilon `1e-9` para que floats como `7.51+7.51` no pasen como `15.0`), y pedírsela a un modelo la volvería no determinista justo donde el tope es duro. ⚠️ **El tope lo pone el MODELO, no el spec:** el spec dice 15 s y `veo3_fast` acepta como mucho 8, así que el 15 del spec ya no se puede cumplir aunque se quiera. Consecuencia directa: un guión da ~2× lotes que con grok, y **cada lote es una llamada pagada**. Tomas más largas que el tope se recortan por frases (`splitLongToma`) antes de agrupar, nunca a mitad de una. El entregable son **N clips descargables**, no un mp4 único, porque cada lote es autónomo por diseño del spec. ✅ **LOS N CLIPS SE PEGAN EN UN SOLO MP4 (`lib/video-ads/concat.ts` + ruta `concat`, 2026-08-27).** El motivo que este documento repetía para no hacerlo —*"no hay ffmpeg en `apps/web` (Vercel)"*— describía el límite viejo de 250 MB de serverless y era FALSO: `vercel.json` tiene `"fluid": true`, o sea Fluid Compute, donde el paquete llega a **5 GB** y `ffmpeg-static` pesa ~80 MB.

Va con **`-c copy`, sin re-encode**, y eso está medido y no supuesto: los clips de grok salen todos con parámetros idénticos (h264 720x1280 yuv420p 24 fps, aac 48 kHz estéreo), así que el demuxer `concat` los pega sin tocar un fotograma. Importa por el costo — Vercel cobra **Active CPU** y un re-encode sí lo gastaría.

⚠️ **EL `-map 0:v:0 -map 0:a:0` ES OBLIGATORIO: los mp4 de grok traen un TERCER stream** (`mjpeg`, la miniatura). Sin él, qué se copia depende de qué elija el demuxer, y **el modo de fallo de un concat mal mapeado es un archivo CORRUPTO, no un error** — nadie lo mira antes de publicar. Hay un test que corre el ffmpeg REAL sobre mp4 de verdad y exige exactamente dos streams; con `spawn` mockeado pasaría igual con el bug puesto.

⚠️ **`ffmpeg-static` NECESITA DOS LÍNEAS EN `next.config.ts`, Y LA PRIMERA SE DESCUBRIÓ CORRIENDO LA RUTA.** Resuelve su binario con `__dirname` y **Next lo reescribe a `/ROOT` al empaquetar**: la ruta moría con `spawn /ROOT/node_modules/ffmpeg-static/ffmpeg ENOENT`. El test unitario NO lo ve, porque vitest no empaqueta — solo aparece llamando la ruta de verdad. Se arregla con `serverExternalPackages` (el mismo tratamiento que ya tenía `sharp`, por el mismo motivo). La segunda línea es `outputFileTracingIncludes`: el binario es un ARCHIVO DE DATOS que ningún `require` menciona, así que el trazador puede dejarlo fuera de la función y el síntoma sería el MISMO ENOENT pero solo en producción.

**No persiste nada**: el mp4 se arma en el momento y se devuelve en el cuerpo, con `X-Clips-Faltantes` diciendo cuántos lotes no llegaron a renderizar (un clip caído no se puede pegar, y saltarlo cambia el guión en silencio). Es un POST que responde bytes, así que la UI **no puede** usar un `<a download>`: descarga desde un blob. `ponytail:` si el video final se pide seguido, el upgrade es subirlo al bucket y responder 302.

✅ **Verificado end-to-end contra el dev server** sobre la sesión `2849e595` (4 lotes): **200 OK, 24,9 MB, 49,19 s exactos, h264 720x1280 + aac**, 34 s de los cuales casi todo es bajar los clips.

⚠️ **Y JUNTARLOS DESTAPA LA COSTURA QUE LOS DESCARGABLES SUELTOS ESCONDÍAN.** En ese video la identidad y el vestuario aguantan los 4 clips —misma persona, misma camisa, mismo frasco— pero **el FONDO cambia entre clips**: pasillo, cocina con banquetas, pared lisa, habitación con piso de madera. Es coherente con lo que este documento ya tiene medido (la imagen le gana al texto, y en modo anclas el escenario sale de la imagen, no del bloque de texto). Ver el video entero es lo que lo hace evidente.

**La cámara es POR LOTE (`camaraDeLote`, `lotes.ts`), no una sola del video entero.** El spec pide especificar la cámara en cada lote y "replicar el lenguaje visual detectado en el original"; antes se mandaba `cortes[0].camara` a todos, así que un guión que abría en primer plano y cerraba en plano medio salía entero en primer plano. El emparejamiento va por **`tiempoOriginal`, nunca por `n`**: `groupIntoLotes` renumera la secuencia completa después de `splitLongToma`, así que en cuanto una toma se parte el `n` deja de ser el índice de su corte y `cortes[n-1]` apunta a otro plano — `tiempoOriginal` es la marca del forense y los fragmentos la heredan intacta. Los planos repetidos entre cortes del mismo lote se deduplican por texto (gasta presupuesto de prompt sin agregar nada).

**El escenario se rotula `ESCENARIO E ILUMINACIÓN`, y hay un bloque `CONTINUIDAD`.** Los dos son bloques que el spec exige en cada lote. La iluminación NO tiene campo propio en el forense: ya viaja dentro de `fondo` (su prompt la pide junto a paredes, superficies y profundidad), así que lo único que faltaba era el rótulo — sacarla a un campo aparte obligaría a re-correr el análisis forense (el paso caro, con tope per-step) en cada sesión ya guardada. `CONTINUIDAD` está redactado **sin** "el mismo personaje" ni "igual que antes" a propósito: acá esas palabras significarían "idéntico a lo largo de este clip", pero son literalmente las frases que el spec prohíbe y que vigila el test `'nunca usa referencias a lotes anteriores'` — un generador que las lee busca un contexto anterior que no existe y devuelve otra persona.

⚠️ **VARIOS PERSONAJES EN EL RENDER (slice 4).** `buildLotePrompt` recibe `personajes` y `quien` (el mapa de `hablantesPorTiempo`, que empareja por `tiempo` y no por `n`, por el mismo motivo que `camaraDeLote`). Con **dos o más presentes** en el lote emite un bloque por persona —identidad, voz y movimiento juntos— encabezado por *"EN ESTE CLIP SALEN N PERSONAS"*, **no manda el perfil de voz global** (contradiría a los dos de arriba: el modelo no sabría cuál usar) y atribuye cada línea: `P2 (padre) dice: "…"`. Una toma con DOS hablantes no se atribuye a uno solo — vuelve a `Locución:`.

⚠️ **LA CADENA DE FRAMES SE ROMPE TAMBIÉN CUANDO CAMBIA QUIÉN ESTÁ EN CUADRO.** Ya se rompía entre un plano de persona y uno de producto; con varios personajes hace falta más: **un plano del padre y uno del hijo tampoco pueden compartir fotograma**, porque es un corte de montaje igual que el flat-lay y compartirlo obligaría a un clip a interpolar de una cara a otra. La "clase" de un frame dejó de ser un booleano y pasa a ser una clave que incluye los ids de quienes salen (`'—'` sin persona, `'persona'` sin atribución). Cada `FrameJob` sabe a quién retrata, y de ahí salen los avatares que se le pasan como referencia — en el mismo orden en que el prompt los nombra, porque cambiarlo le da a uno la cara de otro.

✅ **Verificado contra los datos reales: las 12 sesiones con guión adaptado producen EXACTAMENTE el mismo prompt y el mismo número de frames con y sin la lista de personajes.** Es la garantía que importa: todas son de un solo personaje y sin atribución, así que si el camino de uno cambiara, cambiarían todas a la vez. Hay además un test que lo fija (`SIN atribución el prompt es IDÉNTICO al de antes`).

**Huella v6 → v7**, con los personajes dentro (id, rol, avatar, bloque de consistencia, acento/tono/edad vocal y movimiento): el prompt y los frames dependen de todo eso y la huella no lo vería sola.

⚠️ **REGLA DE CONTEXTO ABSOLUTO.** El generador no recuerda el lote anterior, así que `buildLotePrompt` (mismo archivo, `lotes.ts`) repite ÍNTEGRAMENTE en cada lote el bloque de consistencia del personaje (`consistencyBlock`), la descripción del producto, el escenario, la iluminación y la cámara. Escribir "el mismo personaje" o "igual que en el Lote 1" produce otra persona — es exactamente el fallo que este diseño evita. `lotes.test.ts` (`'nunca usa referencias a lotes anteriores'`) verifica que frases como "el mismo personaje", "igual que en el Lote" o "mantener lo anterior" nunca aparezcan en el prompt final. ⚠️ **Ya NO hay presupuesto que administrar.** Con `KIE_PROMPT_MAX = 60000` el detalle forense de un lote real (~6.300 caracteres) entra entero, así que `buildLotePrompt` arma UN solo prompt y la escalera de niveles se eliminó. Queda un guard final que lanza si el prompt no entra — última red antes de un 422 con la cuota gastada, no un presupuesto.

⚠️ **DOS PALABRAS DEL PROMPT QUE TRABAJABAN EN CONTRA, corregidas con la migración.**

1. **`estable`.** `buildLotePrompt` inyectaba a mano *"Formato vertical 9:16, estable, enfoque en el personaje y el producto"* en TODOS los prompts, mientras el formato UGC se define por lo contrario: teléfono en mano o apoyado, ángulo bajo, micro-temblor. Era pedirle trípode a un lenguaje visual que no lo tiene. Ahora dice *"grabado con teléfono en mano con micro-temblor natural"*.
2. **Faltaba declarar la TOMA CONTINUA.** El bloque `CONTINUIDAD` prometía que personaje, producto y escenario no cambian, pero nunca decía que el clip fuera **un solo plano**. Un lote fusionado salió con tres sub-tomas y tres fondos distintos (pared, baldosas, sala con sofá) y el render era fiel al prompt — el prompt era el que pedía un montaje. Ahora hay un bloque `TOMA CONTINUA` explícito, que es lo que el spec pide y lo que la guía de UGC formula como *"no cuts in the video, one long continuous video"*.

⚠️ **EL `escenario` VIAJABA COMO JSON CRUDO, Y ESE ERA EL ORIGEN DEL SILLÓN — arreglado (`enProsa`, forensic.ts).** Gemini devuelve objetos y arrays en campos declarados `z.string()` y el schema los coacciona a un string con JSON adentro; `fondo` llegaba al prompt de render como 731 caracteres de `{"localizacionAparente": …, "paredes": …}`, con llaves y camelCase. Lo grave no era la sintaxis sino que el texto describe el VIDEO ENTERO dentro de un prompt de un solo clip —*"muebles: En un corte, se observa un sillón tapizado en tela gris claro"*— mientras el bloque `CONTINUIDAD` promete que nada cambia. **De ahí salió el sillón que apareció en un clip de la prueba de ropa, que se reportó como deriva del modelo y no lo era: el prompt lo ofrecía.** `enProsa` aplana a prosa y descarta los valores que EMPIEZAN describiendo otro corte. ⚠️ **Eso solo no alcanza, y está medido:** verificado contra el dato real de `430c5961`, el campo `texturas` decía *"Paredes lisas, tela suave del sillón, baldosas pulidas"* — con el sillón a mitad de frase, donde ningún filtro por prefijo llega. Ninguna limpieza de texto acota de forma fiable a un clip una descripción del video entero. **Por eso en modo frames el bloque de escenario no se manda:** la habitación, la luz y los muebles son los que se ven en los dos fotogramas, y describirlos otra vez en palabras solo puede contradecirlos. `enProsa` sigue valiendo para el prompt de identidad (`sujeto`/`vestuario`/`fondo`), donde el JSON crudo era ruido, y para el modo `reference`, donde el texto es lo único que define la escena.

⚠️ **EL TECHO DE 5000 NO ES LO QUE LIMITA LA CALIDAD — medido con dos renders reales (`scripts/probe-prompt-ab.ts`).**

Primero, el dato que lo sugirió. De los 13 clips que el dueño del repo juzgó en tres tandas, **solo UNO salió de un prompt truncado**:

| tanda | largos de los prompts | truncados |
|---|---|---|
| *"no se parecen ni un poco"* | 4815, 4666, 4437, 4173, 4451 | **0** |
| *"mucho mejor, pero…"* | 4845, 4662, 4229, 4441 | **0** |
| *"no se aplica el suero"* | 4998, 4912, 4681, 4893 | 1 |

La tanda PEOR —cocina en vez de habitación, blusa blanca en vez de suéter rosa, producto flotando, tapa reapareciendo— **no tenía un solo prompt lleno**. Tenía entre 200 y 800 caracteres libres. Ninguno de esos defectos era falta de espacio.

Después, la prueba directa: el MISMO lote renderizado dos veces, con el prompt completo (4896 caracteres) y con uno mínimo (1854, el **38 %**) que conserva identidad, producto, cámara, coreografía y línea hablada, y suelta voz, movimiento, detalle atómico, manos, escenario, guion global y el bloque largo de overlay.

**Los dos clips son prácticamente el mismo**: los dos ejecutan la aplicación con el gotero durante los primeros ~2 segundos y después sostienen el frasco hablando los 8 restantes. Los 3042 caracteres extra no compraron nada observable.

✅ **Y LA HIPÓTESIS QUE ESO ABRIÓ SE CONFIRMÓ (`scripts/probe-beat-por-clip.ts`, dos renders más).** El MISMO lote de 10 s partido en dos clips de un beat cada uno, con el prompt corto en los dos:

| | qué ejecutó |
|---|---|
| 1 clip de 10 s | aplica con el gotero ~2 s, después 8 s sosteniendo el frasco |
| **clip 1 de 6 s** (beat 1) | sostiene → lleva la mano a la tapa → **saca el gotero** → **aplica en la mejilla**, sostenido ~2,5 s |
| **clip 2 de 7 s** (beat 2) | **levanta el frasco con ambas manos** → **lo acerca a cámara** → **lo sostiene con una sola mano**: las tres sub-acciones |

**Un beat por clip se ejecuta entero.** Dos beats en un clip se ejecutan a medias, tenga el prompt 1854 caracteres o 4896. El límite es cuánta coreografía ejecuta grok por llamada, no cuánta le cabe al prompt.

⚠️ **El precio, medido sobre las 155 combinaciones reales: 1,72× llamadas pagadas** (155 → 266 lotes), con la duración media por clip cayendo de 7,6 s a 4,4 s. Es una decisión del dueño del repo y no un efecto colateral que se pueda tomar acá — igual que el resto de los cambios de reparto.

❌ **NO REPLICA EN UN SEGUNDO LOTE, ASÍ QUE NO SE CABLEA.** Repetido sobre el top asimétrico (`02fa1205`, nicho ropa, cuerpo entero), lote de 5,3 s con **4 beats y sin locución** — y esta vez con CONTROL, que la primera prueba no tenía:

| | qué ejecutó |
|---|---|
| **control**, 4 beats en 6 s | gira → vuelve de frente → manos juntas al abdomen → mano al pecho: **los cuatro**, comprimidos, + relleno inventado (manos a la cintura) |
| clip 1 de 6 s (beats 1-2) | gira a perfil y **se queda ahí ~4 s**, vuelve a cámara recién al final |
| clip 2 de 6 s (beats 3-4) | **inventa un estirón del dobladillo** ~3 s (no está en el guion), después sí mano al pecho y al abdomen |

**Partir no ganó: el control ejecutó más que los clips partidos.** Y lo que se ve en los dos clips partidos es el **piso de 6 s de grok** (`MIN_DURATION`) trabajando en contra: 5,3 s de contenido repartidos en dos clips son **12 s de video**, y grok rellena la holgura inventando. Es el mismo mecanismo que el techo blando de `clampDuration` ya documenta para la locución, sobre la coreografía.

⚠️ **Entonces lo que predice el fallo NO es el número de beats.** Los dos lotes difieren en otra cosa: el del suero son **micro-manipulaciones de objeto** (destapar, sacar el gotero, aplicar) dentro de un primer plano; éste son **poses de cuerpo** sin objeto. Grok encadena poses bien y se queda corto en la manipulación fina. Si algún día se parte, la regla acotada sería *beats con manipulación de objeto Y lote ≥12 s* (para que cada mitad tenga 6 s de contenido REAL y no de relleno), no un beat por clip a secas.

❌ **TERCER LOTE, EL DEL REGIMEN QUE SE PREDIJO A FAVOR, Y TAMPOCO.** Después de la nota de arriba se buscó en TODA la base el caso donde partir debía ganar —manipulación de objeto Y ≥12 s, para que cada mitad tenga contenido real y no relleno— y existe uno solo: `2849e595` lote 0, **14,3 s con 3 beats, los tres de manipulación** (saca el cuentagotas → aplica y masajea → muestra el frasco a cámara). Es OTRA sesión que la del A/B, verificado: no contiene aquel lote de 10 s.

| | qué ejecutó |
|---|---|
| **control**, 3 beats en 15 s | **los tres**: extrae el cuentagotas → aplica en la mejilla → masajea → muestra el frasco a cámara con la etiqueta de frente → vuelve el cuentagotas a la cara |
| clip 1 de 10 s (beats 1-2) | los dos, pero aplica en la **frente** y no en la mejilla |
| clip 2 de 7 s (beat 3) | lo ejecuta, con el frasco a cámara **menos limpio** que en el control |

**El control volvió a ser el mejor de los tres**, y encima es el que dio la única toma de producto con la etiqueta bien presentada — que es lo que el anuncio vende.

⚠️ **`n = 3`: el efecto apareció UNA vez y falló DOS, incluida la prueba diseñada a su favor.** La explicación más simple ya no es un límite estructural de grok sino **la varianza del seed**: cada uno de estos clips es un render único de un modelo estocástico. La frase de arriba (*"parece agotarse tras el primer beat"*) describe ese primer draw, no un comportamiento del modelo. **No partas los lotes por número de beats.** Lo que sí quedó medido y replicado es lo del prompt: el largo no es la palanca.

✅ **PERO LA PRUEBA DESTAPÓ UN DEFECTO QUE SÍ ES GENERAL, Y ERA UNA CONSTANTE HUÉRFANA: `MIN_TOMA_SEG` SE QUEDÓ EN EL PISO DE VEO.** Lo que se ve en los dos experimentos es el mismo mecanismo: cuando al clip le sobran segundos respecto de su contenido, grok rellena — inventando (el estirón del dobladillo, las manos a la cintura) o quedándose quieto (los 8 s sosteniendo el frasco). O sea la holgura es basura, y es medible sin gastar un render.

Medido sobre los lotes reales: **74 de 155 (48 %) le piden a grok más segundos de los que su contenido tiene**, y 47 de esos 74 es el piso del modelo. La causa es que `mergeMicroCortes` fusionaba hasta `MIN_TOMA_SEG = 4` mientras `MIN_DURATION` de grok es **6**: todo lo que queda entre 4 y 6 s nace con holgura. **El 4 era el piso de `veo3_fast` y se quedó ahí en la vuelta a grok** — su propio comentario lo decía (*"4 es `MIN_DURATION` de Veo 3.1"*), o sea no era un dial de costo sino una constante desactualizada.

Simulando el reparto entero sobre los 33 análisis forenses guardados:

| | lotes | inflados por el piso | holgura total |
|---|---|---|---|
| `MIN_TOMA_SEG = 4` (Veo) | 189 | 48 (25 %) | 8 % |
| `= 5` | 182 | 35 (19 %) | 7 % |
| **`= 6`** (grok) | **169** | **21 (12 %)** | **6 %** |

⚠️ **Y sale MÁS BARATO, no más caro** — 189 → 169 lotes, porque fusionar reduce llamadas pagadas. Es la excepción a que un cambio de reparto sea decisión de costo del dueño del repo: acá el costo baja y lo que se cierra es un defecto.

⚠️ **No se importa `MIN_DURATION` desde `forensic.ts`: `kie.ts` ya importa de ahí y sería un ciclo.** La constante queda duplicada, así que hay un test en `kie.test.ts` que exige `MIN_TOMA_SEG === MIN_DURATION`. Sin él se vuelven a desincronizar en el próximo cambio de modelo, que es exactamente lo que pasó.

⚠️ **Un test rompió al aplicarlo, y la aserción era la equivocada.** *"Con piso, el beat mudo conserva su duración real"* comparaba contra `MIN_TOMA_SEG` en vez de contra los 5 s de su ventana — coincidía por casualidad mientras la constante valía 4. El piso de `repairCutTiming` está acotado a la duración que el corte ya tiene (suelo contra el vaciado, no empujón), así que la comparación correcta es contra la duración real.

⚠️ **Y los dos se quedan quietos al mismo tiempo, lo que reubica el problema:** el límite no es cuánto le podemos contar a grok, es **cuánta coreografía ejecuta por clip** — parece agotarse tras el primer beat, con prompt largo o corto. Si eso se confirma, la palanca es **clips más cortos** (un beat por clip, más llamadas pagadas), no prompts más ricos.

⚠️ **Dos observaciones más de la misma prueba:** (1) el clip B conservó la habitación y el suéter **sin el bloque `SETTING AND LIGHTING`**, o sea que ese bloque (358 caracteres de mediana) es probablemente redundante con la imagen del avatar — coherente con que la imagen le gane al texto; (2) `n = 1`: un lote, un seed. No prueba que el prompt largo nunca ayude, prueba que acá no ayudó.

⚠️ **Y AL DESCRIBIR MÁS, LA COREOGRAFÍA EMPEZÓ A NO ENTRAR — el truncado NO era aleatorio.** Medido sobre 125 lotes reales: los que llegaban con la coreografía cortada pedían **1332 caracteres** contra **259** los sanos. O sea el recorte caía justo en los lotes con MÁS movimiento que copiar, que son exactamente los que importan. Verificado en un render: el prompt decía *"aplica una gota en la…"* y el clip salió con la chica sosteniendo el frasco once segundos sin aplicarse nada.

Tres cambios, medidos uno a uno sobre los mismos lotes:

| | truncados |
|---|---|
| como estaba | 16 de 124 |
| + `NIVEL_SIN_MICRO` (suelta el detalle atómico ENTERO) | 10 |
| + suelta también `MOVEMENT` en ese nivel | 10 → **10** |
| + `LOTE_MAX_COREO` (cierra el lote por presupuesto de coreografía) | **5** de 135 |

⚠️ **El orden de la escalera era el problema de fondo.** `micro` solo se ENCOGÍA (a 60 caracteres) y nunca se soltaba, así que en el piso la búsqueda binaria recortaba `accionVisual` y `micro` con el MISMO cap: el pelo y el fondo se llevaban presupuesto que le hacía falta a lo único que dice QUÉ HACE EL CUERPO. Ahora `micro` y `MOVEMENT` se sueltan enteros antes de tocar la coreografía — los dos son refinamiento, `accionVisual` es el contenido.

⚠️ **Y `LOTE_MAX_COREO` previene en el REPARTO lo que antes se descubría al armar el prompt**, con la misma aritmética que los cierres por duración y por caracteres de habla. Los 5 que quedan son tomas SUELTAS cuya propia coreografía excede el presupuesto: ahí cerrar el lote no ayuda, igual que con la duración.

⚠️ **LA FRONTERA DE PLANO SE ACTIVA (`maxPlanos = 1`), y ésa era la "transición muy extraña".** Un clip salió de plano de persona y terminó en un macro del frasco a pantalla completa, con un salto duro en medio. La frontera de CLASE no lo caza porque en ese plano **la persona sigue en cuadro**: lo que cambia es el TEMA del encuadre (*"primer plano, cámara fija, ángulo frontal"* contra *"primer plano, cámara fija, centrada en producto"*). Medido sobre 135 lotes: los que mezclan dos encuadres pasan de **18 a 0** por **1,15×** de llamadas. Cada clip se renderiza de una sola pasada, así que pedirle dos encuadres es pedirle un corte de montaje dentro de un plano-secuencia — y devuelve uno de los dos.

⚠️ **LA COREOGRAFÍA NO CRECÍA CON LA DURACIÓN DEL CORTE, Y ÉSA ES LA CAUSA DE "NO COPIA LOS MOVIMIENTOS".** Medido sobre **226 cortes** reales: la densidad media es **1,10 movimientos por segundo**, pero los cortes LARGOS caen a **0,15–0,26** — *"Aplica suero en frente y mejillas, esparciendo con los dedos"* para 19 segundos, *"Toca mejilla y cuello, finalizando mostrando el frasco"* para 11,2. El modelo escribe **una frase por corte sin mirar cuánto dura**, así que el generador se queda quieto el resto del tiempo.

Con el cap en 15 s y las dos fusiones, los cortes largos son ahora el caso NORMAL, no la cola: por eso este defecto se volvió el principal. El prompt de FASE 1 pide ahora la cuenta explícita —**un movimiento por cada 2 segundos**, encadenados en orden; un corte de 6 s necesita 3, uno de 20 s necesita 10— y aclara que la quietud declarada (*"se queda quieta mirando a cámara unos segundos"*) es un dato válido, un hueco no.

✅ **Medido tras el cambio, sobre un análisis nuevo del mismo video: 0,24 → 0,39 movimientos por segundo**, y los cortes cortos y medios pasan a cumplir el piso (3 s → 3 movimientos, 7 s → 4, 5 s → 3).

⚠️ **Pero los cortes LARGOS se quedan en ~4 frases pase lo que pase** — 20 s con 4 movimientos, 11 s con 4. El modelo se topa en un número de cláusulas por respuesta, no en la instrucción: pedirle "más" otra vez no mueve la aguja. Lo que sí es otra tarea es darle una ESTRUCTURA donde colgarlas, así que **por encima de 10 segundos se le pide el corte por TRAMOS con su marca de tiempo** (*"0-4 s: …; 4-9 s: …"*), uno cada 4 o 5 segundos. Convierte *"describí más"* en *"describí cada tramo"*. ⚠️ Sin medir todavía.

`coreografiaEscasa` lo comprueba en código y **solo LOGUEA**: el forense es el paso caro y no se re-llama por esto. Lo que aporta es visibilidad — el síntoma que llega al usuario es *"el video no copia los movimientos"* y hasta ahora había que deducir de dónde venía.

✅ **Y lo que SÍ funcionó, verificado en píxeles sobre el render siguiente:** el avatar salió con el **suéter rosa del original** (era blusa blanca sobre top negro), en la **habitación de muebles de madera oscura** (era una cocina moderna) y con el **encuadre cerrado** (era plano medio con la cintura en cuadro). Los tres arreglos del avatar se sostienen en los cinco clips.

⚠️ **EL PRESUPUESTO DE PROMPT SE ESTABA COMIENDO LA COREOGRAFÍA, que es justo lo que el usuario pidió que se copie.** Reportado como *"necesitamos que sea excesivamente detallado con los movimientos"* y *"que se copie el plano en el que aparece la persona"*. Medido sobre los `lotes` guardados: las dos sesiones más recientes (`30ff55d6`, `6a1e6157`) truncan `accionVisual` en **todos** sus lotes — en el lote 1 de `30ff55d6` las cinco tomas pedían 1332 caracteres de acción y recibían ~78 cada una, cortadas a mitad de palabra (*"…con ambas manos,…"*): se tiraba el 71 % del movimiento. El prompt de FASE 1 ya pide la coreografía con todo el detalle (qué mano, cómo agarra, cuándo entra y sale el producto del cuadro); el problema no era pedirla, era que no cabía. Tres cambios, medidos sobre esa sesión real (coreografía conservada en el lote 1: **29 % → 46 %**):

1. **`NIVEL_OVERLAY_COMPACTO`**, un escalón de degradación nuevo que comprime el párrafo de overlay a tres líneas ANTES de truncar `accionVisual`. Ese párrafo son quince sinónimos de la misma orden (*captions, subtítulos, títulos, lower thirds, banners, stickers, emojis, flechas, callouts…*); `accionVisual` es el único texto del prompt que dice qué hace el cuerpo. La búsqueda binaria del piso corre ahora sobre este nivel, no sobre `NIVEL_SIN_GUION_GLOBAL`.
2. **La duración de la toma se imprime con `r1`.** Llegaba cruda: `### Toma 1 — 0.8854477611940298 s`. Son ~14 caracteres de ruido por toma en un presupuesto que ya trunca movimiento, y además una precisión que el render no tiene (`clampDuration` le pide a KIE un entero).
3. **El plano se anuncia POR TOMA cuando el lote mezcla más de uno.** `camaraDeLote` deduplica y concatena los planos del lote en UN string, y esa línea era todo lo que el render sabía del encuadre. Con un plano alcanza; con dos es ambigua por construcción: en el lote 1 de `30ff55d6` las tomas 1–2 son *"Plano medio frontal"* y las 3–5 *"Primer plano del rostro y parte del pecho"*, y al generador le llegaba `Plano medio frontal · Primer plano…` sin forma de saber cuál va con cuál. `buildLotePrompt` recibe ahora `cortes` (opcional) y empareja por `tiempoOriginal`, **no por `n`**, por el mismo motivo que `camaraDeLote`.

⚠️ **Los dos recortes de la regla 3 son obligatorios y están medidos, porque este presupuesto se lo quita a la coreografía.** Emitir el plano en las cinco tomas costaba ~285 caracteres y hundía la coreografía del 54 % al 33 % — o sea arreglaba el encuadre rompiendo el movimiento, las dos mitades de la misma queja. Por eso: (a) solo si hay ≥2 planos distintos en el lote, y (b) solo cuando el plano **cambia** respecto de la toma anterior — un shot list se lee así, el plano vale hasta que se anuncia otro. Cuando se emite no se suelta en ningún nivel de degradación, mismo argumento que la `Locución:`.

⚠️ **Esto bumpea `scriptFingerprint` a `'v3'`** (v2 → v3): la huella hashea los INSUMOS de `buildLotePrompt`, no el texto que produce, así que un cambio de plantilla es invisible para ella y reanudar a través del cambio pegaría un lote con el prompt viejo a uno con el nuevo. Los parciales anteriores pasan a contar como generación nueva, fail-closed.

⚠️ **[HISTORIA — describe a grok, resuelto por la migración a Veo]** **EL TOPE DE 4096 NO ERA EL CUELLO DE BOTELLA — el 85 % del prompt son bloques fijos, y el más grande describe algo que el modelo ya ve.** Verificado contra el schema del modelo (`docs.kie.ai/market/grok-imagine/1-5-preview`): 4096 es tope duro y no se sube. Pero medido sobre `30ff55d6`, de 4096 caracteres la coreografía recibía 608 y los bloques fijos 3488. El más caro es **PRODUCTO: 677 caracteres del scan transcribiendo la etiqueta entera** (*"SÉRUM FACIAL CON VITAMINA C"*, *"PARA PIEL GRASA"*, *"Ilumina • Unifica • Antioxidante"*, *"30 ml / 1.01 fl oz"*) mientras el envase viaja como `@image(2)` en TODOS los lotes y el prompt ya ordena reproducirlo idéntico. Es contarle en palabras lo que está viendo en píxeles, y se paga con el único texto que dice qué hace el cuerpo.

`NIVEL_PRODUCTO_FISICO` es el escalón que recorta esa descripción a su parte física (las dos primeras oraciones + *"el resto de la etiqueta se lee de su imagen"*) justo antes de truncar la coreografía. Medido, mismo contenido: **lote 1 46 % → 84 %, lote 2 34 % → 69 %**.

Palancas medidas sobre esa misma sesión, para cuando haga falta más:

| palanca | lote 1 | lote 2 | costo |
|---|---|---|---|
| antes de todo esto | 29 % | ~29 % | — |
| overlay compacto + `r1` + plano por toma | 46 % | 34 % | $0 |
| **+ producto físico (hoy)** | **84 %** | **69 %** | $0 |
| + bloque de personaje recortado | 96 % | 77 % | riesgo de deriva de identidad |
| mitad de tomas por lote | 85 % | 100 % | **2× llamadas pagadas** |

⚠️ El recorte del **personaje** NO se aplicó aunque mide bien: el bloque de consistencia es lo único que sostiene que el lote 1 y el lote 3 sean la misma persona (REGLA DE CONTEXTO ABSOLUTO), y su imagen va adjunta pero la deriva de identidad es el fallo que este diseño entero existe para evitar. Recortarlo es cambiar el seguro por 12 puntos de coreografía; hace falta medirlo en renders reales antes, no en caracteres.

⚠️ **El otro modelo del marketplace acepta 5000 caracteres, y la nota de arriba sobre por qué se descartó está mal.** `grok-imagine/image-to-video` admite prompt de 5000 (+22 %) y **duración 6–30 s**, no 15 — o sea la línea *"se descartó porque topa en 15s por llamada"* no describe a este modelo. Que acepte 30 s no ayuda a la fidelidad por sí solo (un lote más largo mete más tomas compitiendo por el mismo prompt), pero los 5000 caracteres sí, y el reparto en lotes cambiaría de forma. Cambiar `MODEL` obliga a revisar el bloque entero de reglas de `kie.ts` — no es un cambio de string.

⚠️ **UN LOTE ES UN CLIP CONTINUO Y NO PUEDE CONTENER UN CAMBIO DE PLANO — esa era la causa real de "no copia el encuadre", y no el prompt.** Se llegó por descarte, con renders reales. Primero se anunció el plano POR TOMA (arriba): la información llegaba correcta al prompt y **el clip salió igual entero en plano medio**. El lote 1 de `30ff55d6` pedía "Plano medio" en las tomas 1–2 y "Primer plano del rostro" en la 3; el lote 2 era peor, **cuatro encuadres** (primer plano rostro+pecho → rostro+cuello → plano medio → plano general) en un solo clip de 15 s. Cada lote se renderiza de una sola pasada: pedirle dos encuadres es pedirle un corte de montaje dentro de un plano-secuencia, y devuelve uno de los dos.

`groupIntoLotes` acepta ahora un `planoPorTiempo` OPCIONAL y cierra el lote donde cambia el encuadre, además de donde se pasa de 15 s. Sin el mapa se comporta exactamente como antes — quien llama decide, porque **esto cuesta plata**. Y no es una regla nueva: FASE 1 ya define la unidad como el CORTE REAL y el entregable son N clips independientes, así que el corte cae naturalmente ENTRE clips, que es donde el montaje lo pone. Un lote que abarca dos planos no es un lote de menos, es un corte perdido.

**Verificado con un render real** del lote de "Primer plano frontal del rostro y cuello": encuadre cerrado de rostro y cuello, contra el plano medio (de cintura para arriba, con todo el fondo) que devolvía el mismo contenido dentro del lote de cuatro planos.

Efecto medido sobre `30ff55d6`, el mismo contenido:

| | lotes | planos por lote | coreografía |
|---|---|---|---|
| sin frontera | 2 | 2 y 4 | 85 % |
| **con frontera** | **5** | **1** | **100 %** |

⚠️ **El costo es 2,5× llamadas pagadas en ESE video** y depende del original: uno sin cortes sigue dando un lote. La cuota per-step no cambia (`video-generation` topa por VIDEO, no por lote), pero cada lote sigue registrando `video-render` y contando al backstop diario global. La huella no necesita bump: el número de lotes y las tomas de cada uno ya entran en `scriptFingerprint`, así que un reparto distinto da huella distinta y `isPaidResume` falla cerrado solo.

✅ **`camaraFallback` ARREGLADO (2026-08-27).** `generate-lotes` pasaba `cortes[0]?.camara` como fallback de `camaraDeLote` — o sea el encuadre del corte 1 mandado a TODOS los lotes cuando ningún `tiempoOriginal` empareja, que es exactamente el bug que esa función existe para arreglar, entrando por la puerta de atrás. Y no era inofensivo: la línea `CAMERA:` del prompt afirma ese plano como un HECHO, así que un lote de primer plano de producto salía pidiendo el plano medio de la primera toma hablada.

Ahora el default es **`CAMARA_SIN_DATO`**, que no declara ninguna escala: solo el carácter de cámara en mano, la única propiedad cierta para todo el formato. Sin escala, el encuadre lo decide la imagen de referencia — el mismo fail-safe de *preservar* que rigen la zona del cuerpo y la paleta en el generador de anuncios. Con tres tests, uno de los cuales exige que el string del default no contenga ninguna palabra de escala.

⚠️ **[HISTORIA — con Veo son 60.000 y esto dejó de aplicar]** **Lo que esto NO arregla: 4096 caracteres siguen siendo pocos para 5 tomas de detalle forense.** Aun con las tres mejoras el lote 1 conserva el 46 % de la coreografía. El resto del margen no está en el prompt sino en el REPARTO: `groupIntoLotes` llena hasta 15 s sin mirar cuánta coreografía implica, y un lote de 3 tomas entraría entero. Bajar el tope significa más lotes y **cada lote es una llamada pagada** — es decisión del dueño del repo, no un efecto colateral que se pueda tomar acá.

⚠️ **La `Locución:` por toma NO se suelta jamás.** (El orden de degradación que justificaba esto ya no existe — con 60.000 caracteres nada se suelta — pero la razón sigue siendo válida y por eso la línea se sigue emitiendo siempre.) La versión anterior la soltaba primero, razonando que duplicaba el bloque global. Es falso: el bloque global trae el TEXTO, la línea por toma trae la ALINEACIÓN — qué frase va con qué acción y en cuántos segundos. Se comprobó en la sesión `79b94ab9`: el lote 1 llegó a 4095/4096 caracteres y perdió la línea por toma; los lotes 2–4 la conservaron. El primer clip recibió un párrafo de 263 caracteres sin ninguna pista de cómo repartirlo entre sus cuatro tomas y el resto sí la tuvo — el dueño del repo lo describió como *"una habla muy rápido y la otra muy lento, no hay consistencia"*. Ahora se suelta primero el bloque global, que sale del mismo texto que las líneas por toma (soltarlo no pierde ni una palabra, solo deja de repetirlas juntas). Cada prompt también incluye `TEXTO / OVERLAY: NINGUNO` explícito (nada de subtítulos, watermarks ni UI) — la contraparte de render de la regla de FASE 1 que separó `elementosGraficos`.

⚠️ **VEO FALLA DE FORMA TRANSITORIA, Y UN LOTE FALLIDO ERA IRRECUPERABLE.** Medido en un render real de 5 lotes: uno devolvió *"The Google model was unable to generate audio for this request. Please try a different prompt."* y **el MISMO prompt, reenviado sin cambiar una coma, salió bien**. O sea el fallo es del proveedor, no del contenido, y reintentar es exactamente la respuesta correcta.

El problema es que no se podía. `resumeSeed` conservaba todo lote con `taskId`, y un lote fallido TIENE taskId — el de la tarea muerta. Así quedaba fuera de `pendientes` (`filter(l => !l.taskId)`), "reintentar" no recreaba nada, y si era el único que faltaba la ruta salía por el early return de "nada por crear". El usuario podía darle a reintentar para siempre sin que pasara nada. Ahora un lote con `status: 'fail'` vuelve a `base` y se recrea; uno en `generating` no, porque todavía puede terminar bien.

⚠️ **Huella de contenido al reanudar (`lib/video-ads/render-lotes.ts`): `resume` es la intención del cliente, no el permiso para saltarse la cuota.** `Section6Lotes` manda `resume: true` tanto para "reintentar" un render que quedó a medias (lote falló, la llamada se cortó) como para "generar de nuevo" después de volver a un paso anterior y re-adaptar el guión, el personaje o la voz — el mismo flag para dos intenciones distintas. El servidor, no el cliente, decide con la huella si eso es realmente una reanudación gratis: `scriptFingerprint` (SHA-256 sobre un texto canónico, no `JSON.stringify` porque Postgres reordena claves jsonb) hashea TODO lo que entra en el prompt — bloque de consistencia, descripción del producto, escenario, **la cámara de cada lote** (una por lote, con su largo delante: dos repartos distintos de los mismos planos tienen que dar huellas distintas), perfil de voz completo, URLs+roles de las imágenes, y cada toma de cada lote — deliberadamente más ancho que "el guión adaptado": re-hacer FASE 4/4.5 cambia la persona que el modelo genera, y un resume a través de ese cambio pegaría un lote con la identidad vieja y otro con la nueva. `isPaidResume(resume, existentes, base, huella)` solo devuelve `true` si `resume` es true, ya hay al menos un `taskId` pagado, el número de lotes no cambió, y **todos** los lotes guardados llevan la huella actual — sesiones legadas sin `scriptHash` (`null`) fail-closed: nunca se reanudan gratis. ⚠️ La huella hashea los **insumos** de `buildLotePrompt`, no el texto que produce: un cambio en la plantilla del prompt es invisible para ella, y reanudar a través de ese cambio pegaría un lote renderizado con el prompt viejo a uno con el nuevo mientras `isPaidResume` jura que es el mismo contenido. Por eso el texto canónico arranca con una **versión** (`'v2'` hoy; v1 → v2 al agregar continuidad, el rótulo de iluminación y la cámara por lote) — **tocar la plantilla del prompt obliga a bumpearla**, y los parciales viejos pasan a contar como generación nueva, fail-closed igual que las sesiones sin `scriptHash`. Cuando NO es una reanudación real, `generate-lotes/route.ts` responde **409** (`existentes.some(taskId) && !resume`, o el claim atómico `claimFreshLotes` que falla) en vez de dejar crear tareas duplicadas sobre lotes ya pagados.

⚠️ **Nada recalcula la duración de una toma a partir del texto adaptado, y por eso el paso del guión mide el ritmo por línea.** La duración de cada toma sale del análisis forense y viaja intacta hasta KIE: el clip dura esos segundos pase lo que pase con el largo del texto que lo rellena. Una línea que creció al doble hay que decirla al doble de velocidad; una que se acortó deja al modelo rellenando silencio. `diferenciaCaracteres` es **global** y solo informativo, así que un guión con +0% total puede tener una toma a +230% y otra a −40% sin que nada lo note — medido en la sesión real: corte 4 pasó de 82 a 272 caracteres en los mismos 5 s (54 car/seg, físicamente indecible). `Section5Script` muestra por línea `usados/caben` contra el ritmo del original (`caracteresOriginal / suma de duraciones`) y avisa por encima de 1.3×. **Avisa, no bloquea**: recalcular las duraciones para que el texto entre haría crecer el número de lotes, y cada lote es una llamada pagada — eso es una decisión del dueño del repo, no un efecto colateral.

⚠️ **El forense mide bien el TOTAL y mal el REPARTO, y por eso el cronometraje se repara en código (`repairCutTiming`, `forensic.ts`).** En la sesión `79b94ab9` el total daba 776 caracteres en 46 s = 16.9 car/seg (ritmo plausible en español), pero el corte 2 traía 60 caracteres en 2 s = **30 car/seg, imposible de pronunciar**, y los límites caían casi todos en múltiplos de 5: Gemini cuantiza los cortes a la resolución que alcanza a muestrear. Eso envenena todo lo que sigue, porque la duración del corte es la que termina pidiéndosele a KIE — una toma mal cronometrada sale atropellada aunque el guión adaptado sea perfecto.

La reparación es conservadora a propósito: **no re-cronometra nada que ya sea decible** (si todos los cortes caben devuelve el MISMO objeto, sin copiar), le da a los imposibles el mínimo que necesitan (`caracteres / CPS_MAX`), y ese tiempo **sale de los cortes con holgura en proporción a cuánta tienen**, así que el total se conserva exacto y el ritmo del original no se altera. Solo si el texto entero no entra en la duración del video crece el total — único caso en que `duracionTotalSeg` se mueve. Verificado sobre los cortes reales: el corte 2 pasa de 30 a exactamente 20 car/seg, el total queda en 46.0000 s con deriva 0.

⚠️ **`CPS_MAX = 20` es ABSOLUTO, no derivado del propio video.** Se probó el techo relativo (`promedio × 1.4`) y es una trampa: el promedio ya viene contaminado por los cortes mal medidos que la función existe para reparar, así que un video con varios errores se calibra contra sus propios errores — con 16.9 de promedio, un techo de 23.6 habría dejado el corte roto en 24 car/seg, reportando éxito sin arreglar nada.

⚠️ **La reparación NO toca `tiempo`, y eso no es un descuido.** `tiempo` apunta a DÓNDE estaba el corte en el video fuente; el spec lo trata como campo distinto de la duración ("Tiempo original de referencia" vs. "Duración objetivo" en el SHOT LIST FINAL). Dejarlo quieto evita tres roturas de golpe: sigue siendo la clave única con la que `camaraDeLote` empareja lote y plano, no cambia el formato que entra en `scriptFingerprint`, y no puede colisionar consigo mismo al redondear. La función es **idempotente por construcción** (al salir todo corte cumple `duración >= mínimo`, así que la segunda pasada encuentra déficit cero) — sin eso, el error de coma flotante del reparto daría dos huellas distintas para el mismo contenido.

⚠️ **Las duraciones dejaron de ser enteras, y la columna `duration` de `video_sessions` es `int`.** Los dos sitios que la escriben (`generate-lotes/route.ts`: el claim atómico y `saveRescue`) redondean con `Math.round`. Sin eso Postgres rechaza la fila entera con *"invalid input syntax for type integer"* y el render muere en el claim, antes de crear ninguna tarea — un 500 opaco en el navegador. Se redondea en vez de migrar la columna a `numeric` porque **nadie lee ese campo**: es un resumen para el dashboard y la décima de segundo no significa nada ahí. Cubierto por un test que se verificó quitando el fix.

Corre en **dos puertas**: `analyze-reference` (al escribir, para que lo persistido ya esté sano) y `extract-template` (para las sesiones analizadas antes de que esto existiera — ahí es gratis, ese paso no vuelve a mandar el video a Gemini, que es justo por qué `video-template` no tiene tope per-step). ⚠️ En la segunda puerta la reparación **también baja las duraciones nuevas al guión ya adaptado** (`resyncTomaDurations`, `adapt.ts`): `generate-lotes` agrupa sobre `adapted.tomas`, no sobre el forense, así que sin ese paso reparar una sesión que ya pasó por FASE 3 no llegaría al render y el video seguiría saliendo con los tiempos rotos, en silencio. Se re-sincroniza en vez de borrar `adapted` y forzar un re-adapt porque borrarlo tiraría las correcciones que el usuario escribió a mano línea por línea — acá solo cambian los segundos, el texto no se toca. Empareja por índice, que es como se construyó (`adapt-script` toma `cortes[i].tiempo` para el `tiempoOriginal` de la toma i); si los largos no coinciden no toca nada. El prompt de FASE 1 también pide decimales, prohíbe la rejilla de 5 s y exige que el diálogo sea decible en su corte, pero **eso es una pasada de prompt sin verificar**: lo que hace cumplir la regla es la reparación determinista.

🔴 **EL RENDER DE VIDEO NO TIENE TOPE DE REGENERACIONES — ni por video ni por lote (2026-09-07, decisión del dueño del repo, "solo en esta tool").** `video-generation` salió de `IMAGE_KINDS` y `VIDEO_GENERATION_LIMIT` (env `GEN_VIDEO_LIMIT`) se borró: `checkGenQuota` lo trata como un kind de texto —sin gate per-step— y `rerender-lote` nunca lo tuvo. Lo que sigue aplicando a los dos es el **backstop diario global** (500/día, anti-abuso), el BYOK (cada clip lo paga el usuario con su key) y el registro de `video-generation`/`video-render` en `ph_gen_usage` para el panel de consumo. `video-character` y `video-forensic` conservan su cap: esos los paga el HUB. El párrafo de abajo describe el tope que existía; se deja porque explica por qué la cuota era por VIDEO y no por lote, y por qué `isPaidResume` y el 409 siguen ahí (no son cuota, son "no duplicar lotes pagados").

**Costo (por VIDEO, no por lote) — HISTORIA desde 2026-09-07, ver arriba.** El render por lotes es la llamada más cara del hub por un orden de magnitud. `generate-lotes/route.ts` verifica la cuota de TODAS las tareas de una vez, ANTES de crear el primer lote — medio video renderizado es dinero gastado en algo inservible. Kind `video-generation` (en `IMAGE_KINDS`, `gen-quota.ts`) con tope **`VIDEO_GENERATION_LIMIT = 3`** (1 gen + 2 regens, env `GEN_VIDEO_LIMIT`) contado **por VIDEO completo**, sin importar en cuántos lotes se reparta (un guión de 2 lotes no se queda sin regens antes de arrancar, y uno de 4 no se topa al primer lote). Se probó topar por lote y se abandonó: un guión corto y uno largo consumían cuota de forma desigual sin relación con lo que el usuario realmente pidió. `video-render` se sigue registrando —una fila por lote, con `recordGenQuota(id, 'video-render', userId)`— para conservar visibilidad del costo real y seguir contando al backstop global diario, pero **ya no tiene tope per-step propio** (no está en `IMAGE_KINDS`): el que topa es `video-generation`, una sola vez por llamada exitosa que efectivamente arranca tareas (`!reanuda && creados > 0`). Reanudar un render parcial (llamada real a KIE por los lotes pendientes, sigue costando) no debe chocar contra el tope de `video-generation` que ya se cobró la primera vez, pero sí debe seguir respetando el backstop anti-abuso: por eso existe `checkGlobalBackstop()`, que expone SOLO esa capa (sin el gate per-step) para este caso puntual.

La otra llamada cara que corre en el flujo es el análisis forense (`video-forensic`, `analyze-reference`): manda hasta 14 MB de video a Gemini, no es gratis. Está en `IMAGE_KINDS` con el cap genérico (`GEN_PER_STEP_LIMIT`, 1 gen + 3 regens): es texto, no imagen, pero reutiliza el mismo mecanismo por ser igual de caro. `video-character` (FASE 4, generación de personaje con gpt-image-2) también está en `IMAGE_KINDS` con el mismo cap genérico. `video-template` (extraer la plantilla, "Extraer otra vez" en `Section4Template`) sí sigue sin tope per-step a propósito: reprocesa el análisis forense YA guardado, no vuelve a mandarle video a Gemini.

**Lecciones del diagnóstico 2026-08-11: un render de prueba replicó lo que NO debería reproducirse.** Cuando Grok generó un video a partir de referencias analizadas de forma ingenua, copió los **subtítulos quemados**, la **marca de agua de TikTok** y el **cierre de plataforma** del original; cambió el casting (morena latina → rubia pecosa), perdió el encuadre y, al durar más que el guión rellenado, Grok inventó frases para rellenar. El análisis forense (`forensic.ts`) se rediseñó para evitar cada una de esas trampas:

1. **Elementos gráficos separados — y NO se cablean al render: es una decisión, no un pendiente (2026-08-27).** Los subtítulos, watermarks, gráficos y overlays van al campo `elementosGraficos` (`forensic.ts`), NO a `accion` ni a `camara`. Ése es su trabajo real y sí lo cumple: es el **sumidero** que impide que un subtítulo viaje al render como algo que reproducir.

Lo que NO hace es llegar al prompt: `buildLotePrompt` no lo consulta, y lo que protege al render es el párrafo genérico `TEXTO / OVERLAY: NINGUNO`. Durante mucho tiempo esto figuró acá como pendiente. **Medido, no hace falta y probablemente sea contraproducente:**

- **36 de 36 análisis guardados detectan subtítulos, watermark o texto en su original** — o sea el caso no es raro, es universal. Los dos de los que se renderizó traen interfaz de TikTok, nombre de usuario, subtítulos dinámicos y un texto *"TENDENCIA"* en rosa.
- **En los 7 clips renderizados de esas dos sesiones no aparece ni un carácter de texto**, ni watermark ni UI. El bloque genérico ya gana sobre originales saturados de artefactos.
- **Nombrar el artefacto para prohibirlo es la forma clásica de invocarlo** en un modelo de difusión — y costaría presupuesto en un prompt de 5.000 caracteres que ya recorta coreografía, que es lo único que dice qué hace el cuerpo.

Si algún día un render SÍ reproduce un subtítulo, el campo está ahí y el cableado es de una línea. Hasta entonces, cablearlo sería cambiar un problema que no ocurre por uno que sí.

⚠️ **VARIOS PERSONAJES (hasta 4): `personajes` y `hablantes` — FASE 1.** El pipeline nació asumiendo una sola persona, pero los anuncios reales tienen varias: la sesión `e6b5beda` es un hijo médico y su padre, y el único `sujeto: z.string()` los recibió a los dos dentro (*"Hombre joven (doctor): … Hombre mayor (padre): …"*). El análisis SÍ los ve; faltaba dónde guardarlos por separado. Ese video tiene además **cuatro hablantes** (hijo, padre, reclutador, una señora), y por eso el tope es 4 y no 2.

**El hueco grave no es la identidad, es la ATRIBUCIÓN.** `cortes[].dialogo` no dice quién habla: en ese anuncio el corte 1 lo dice el PADRE, el 4 tiene dos voces y el 7 tres. Sin hablante, el render le da toda la línea a la misma persona.

⚠️ **`dialogo` NO cambia de significado — `hablantes` es su DESGLOSE, no su reemplazo.** Sigue siendo el texto completo del corte, porque `repairCutTiming` mide `dialogo.length`, `mergeMicroCortes` lo concatena y toda la FASE 2/3 lo copia: hacerlo estructurado habría tocado los ~12 sitios que lo leen como string plano. Los dos campos nuevos (`ForensicReport.personajes` y `cortes[].hablantes`) son **opcionales**, así que ninguna sesión guardada se rompe — sin ellos se lee como siempre, un solo hablante con toda la línea.

⚠️ **`verificarHablantes` comprueba en código lo único comprobable: que el reparto REPRODUZCA el diálogo.** El desglose es texto libre y nada impide que el modelo resuma, reordene o invente. Se comparan las palabras concatenadas contra `dialogo` ignorando puntuación y acentos (el modelo mueve una coma al partir la frase, y rechazar por eso tiraría un reparto correcto). Cuando no cuadra se descarta la atribución **de ese corte** y se conserva `dialogo`: el modo de fallo pasa a ser "sin atribución", que es el comportamiento de siempre y es seguro — atribuir mal le pondría la línea de un personaje a otro sin que nada lo reporte. Corre en las mismas dos puertas que `limpiarDialogos`, y en ese orden (limpiar → verificar → recronometrar). **Lo que NO se puede verificar en código es a QUIÉN se le asignó cada tramo**: para eso hace falta el audio, así que el paso del guión tiene que mostrarlo y el usuario validarlo.

**El accesor `personajesDe` (personajes.ts) es lo que hace todo esto aditivo.** Devuelve siempre una lista, y para una sesión anterior arma UN personaje con las columnas singulares (`character_url`, `avatar_url`, `accent`, `character_ethnicity`, `consistency_block`, `voice_profile`, `motion_profile`), que se quedan como camino legado. Así el resto del pipeline no distingue una sesión vieja de una nueva: cero migración de filas y cero re-análisis forzado. `resolvePersonaje` tolera lo que el modelo devuelve al citar un id (`p1`, `P1 (hijo)`, `hijo`) por la misma razón que `resolveSlotId`, y lo que no resuelve devuelve `null` en vez de adivinar.

⚠️ **EL EQUIPO DE GRABACIÓN TAMPOCO ES COREOGRAFÍA — misma regla que los elementos gráficos, otra clase de artefacto.** Medido en la sesión `02fa1205`: la presentadora del original sostenía un **micrófono de mano** a la altura del pecho durante los cinco cortes. El forense no lo reconoció y lo describió como *"sostiene un pequeño objeto plateado a la altura de su pecho"* — fiel, pero el video generado no tiene micrófono, así que el modelo interpretó "mano al pecho sosteniendo algo" como **tocarse el pecho**, y salió así en 4 de los 5 clips. (Es además el candidato más probable a haber disparado el *"unable to generate audio"* de ese lote.) El prompt de FASE 1 ahora excluye de `accion` el micrófono, la caña, el trípode, el aro de luz y el teléfono con el que graban, **incluso descritos por su forma**, y pide describir solo dónde está la mano. `BLOQUE_OVERLAY` suma la contraparte física: el render tampoco puede mostrar ese equipo. ⚠️ Es un cambio de prompt del paso CARO (manda el video a Gemini), así que solo aplica a análisis nuevos: las sesiones ya analizadas conservan la descripción vieja.

2. **Sin inferencia de casting.** El forense captura `sujeto` descriptivamente (edad, tono de piel, cabello, complexión) pero `buildForensicInstruction` prohíbe inferir etnia u origen cultural desde la apariencia (`forensic.ts:116–118`). El casting es una decisión del usuario en FASE 0/2, no una lectura del video.

3. **Corte real, no frase.** La regla fundamental es **una escena por cambio visual real**, no por cambio de diálogo (`forensic.ts:71`). Eso preserva el ritmo: una toma de 8s con tres frases es un corte, no tres. La estructura (`cortes[]` y `tomas[]`) registra encuadre y cámara por corte real.

4. **Duración del guión, no de la referencia.** La duración total sale del análisis (`ForensicReport.duracionTotalSeg`), pero el guión adaptado en FASE 3 puede tener una duración distinta porque el cierre de plataforma (que el original tiene) puede no aparecer en el copy rellenado. ⚠️ Eso último no es una regla que el código haga cumplir, es una expectativa sobre el comportamiento del modelo: si el análisis forense capturó la placa final como un corte real más (cumple la regla de FASE 1, "una escena por cambio visual real"), sobrevive como cualquier otro corte hasta el prompt — nada en `adapt.ts` ni en `lotes.ts` la filtra. El render (FASE 5) recalcula la duración sobre el guión confirmado (`totalDuration`, `render-lotes.ts`) — las marcas de tiempo del análisis no gobiernan cuánto dura lo que se renderiza — pero eso no dice nada sobre si la placa de cierre entró o no al guión.

⚠️ **La FASE 2 marca de MENOS, no de más — y el "entre 5 y 8" que hubo acá era invención de este repo.** El spec (líneas 597–599) solo dice *"No reemplaces palabras universales innecesariamente"*, sin número. Durante un tiempo este prompt tuvo una lista cerrada de 14 nombres, un techo de "cinco a ocho huecos", la regla "el corchete cubre el MÍNIMO" y una lista de palabras declaradas universales que incluía *"cara"*, *"cuello"*, *"de día y de noche"* y *"los 30"*. Todo eso estaba al revés.

Lo demuestra la plantilla que escribió el dueño del repo para el video de prueba: **23 huecos** sobre ~45 s, marcando la edad del avatar (`casi a punto de entrar a los 30`), la zona de aplicación (`cara y en cuello`), la frecuencia (`día y de noche`), el público (`todo tipo de piel`) y la evidencia en cámara (`cara sin maquillaje`) — todo lo que el prompt viejo declaraba corriente. El razonamiento correcto es el mismo que ya justificaba no recortar por conteo, llevado hasta el final: **desmarcar un hueco deja su palabra ORIGINAL en el guión del usuario**. `en cara y en cuello` sin marcar es falso para un champú, `de día y de noche` lo es para una mascarilla semanal, y `todo tipo de piel` es una afirmación sobre un producto que nadie validó. Marcar de menos publica texto ajeno; marcar de más solo deja un hueco que el usuario rellena.

El prompt actual: sin lista cerrada (nombres descriptivos en minúsculas, con barras cuando el dato admite lecturas — `[situación personal / edad / hito]`), la prueba es *"¿un anuncio de champú podría decir esta palabra igual?"*, el corchete cubre el **dato completo** (`hidratar las capas más profundas de la piel`, no `hidratar`) pero **no se traga el andamiaje** (`de la marca [nombre de la marca]`, no `[nombre de la marca]` cubriendo la fórmula), y se **numera cuando son datos distintos** del mismo tipo (`[ingrediente 1..3]`) pero **no** cuando es el mismo dato repetido (el tipo de producto sale tres veces sin número, porque las tres reciben la misma palabra).

**Medido contra la plantilla de referencia, re-extrayendo la misma sesión:** 10/23 exactos → **19/23**, 23 huecos totales (el mismo número), 0 tomas desalineadas. Residuo conocido: no marca `ingredientes naturales`, y parte mal `cara y en cuello`. ⚠️ El número está medido sobre el MISMO video del que salió la plantilla de referencia, así que hay riesgo de sobreajuste — las reglas son generales, la cifra no está validada en otro video.

⚠️ **`alignSlots` tolera las CONTRACCIONES del español, y no hacerlo descartaba tomas buenas.** `al` = a+el, `del` = de+el: cuando el hueco se lleva el artículo la contracción desaparece y el modelo escribe la forma suelta — el original dice *"ayuda **al** equilibrio hormonal"* y la plantilla queda *"ayuda **a** [beneficio]"*. Eso es lo gramaticalmente correcto, pero exigir copia byte a byte lo leía como "el modelo no copió" y dejaba la toma sin normalizar. Medido en una sesión real: **2 de 7 tomas** marcadas como desalineadas por esto, ambas perfectamente copiadas. La tolerancia es angosta (solo esas dos contracciones, y solo en el borde del hueco); una paráfrasis de verdad sigue devolviendo `null`.

⚠️ **`normalizeSlots` numera los nombres que colisionan, agrupando por FAMILIA.** Dos huecos con el mismo nombre reciben el mismo valor en la FASE 3 — es el fallo de los tres `[Producto]`, que reaparece entre tomas: en una sesión real `[beneficio 1]` salió en tres tomas para tres beneficios distintos. Acá se puede decidir en código porque `alignSlots` recupera **qué decía el original** en cada hueco: texto distinto = datos distintos = se numeran; texto igual (el producto nombrado tres veces) = **no** se tocan, porque las tres apariciones tienen que recibir la misma palabra.

Se agrupa por familia (el nombre sin su número final) y no por nombre exacto: el modelo ya numera a veces, y mal — repetir `beneficio 1` ES el defecto, así que saltarse los nombres que ya llevan dígito lo dejaba pasar. Renumerar la familia entera evita además chocar con un `beneficio 2` que ya existiera. Medido: 3 colisiones resueltas y la alerta de desalineadas de esa sesión pasó de `[3, 4]` a vacía.

**`normalizeSlots` (`fill.ts`) hace UNA sola cosa: renombrar los roles genéricos del producto.** Detrás de `de la marca` va `[nombre de la marca]`, detrás de `se llama` va `[nombre del producto]` — es angosto a propósito (dos marcadores, no un clasificador) y solo pisa nombres genéricos. ⚠️ Llegó a hacer dos cosas más, ambas eliminadas por ir en dirección contraria a la plantilla de referencia: desmarcaba los huecos cuyo original era un número (borraba justo el `[situación personal / edad / hito]` del "30") y fusionaba las enumeraciones del mismo nombre en una sola (colapsaba los tres ingredientes que deben ir numerados). **No las reintroduzcas.**

Se apoya en `alignSlots`, que reconstruye qué texto del diálogo ocupaba cada hueco aprovechando que el andamiaje es copia literal del corte. Devuelve `null` si el modelo no copió — esa toma se deja intacta y se cuenta en `desalineadas`, que es el detector de que la FASE 2 dejó de respetar la regla de copia. Corre DENTRO de la misma escritura de `extract-template`, antes de `validateTemplate` y antes de persistir: `extractSlots`/`fillTemplate` numeran por orden de recorrido (`nombre#n`), así que ningún id guardado puede haberse calculado sobre una plantilla previa.

**Plantilla extraída (FASE 2, `Section4Template`).** La sección muestra el esqueleto extraído de la referencia y la template Fill in the Blank que FASE 3 rellena. El tope de prompt de KIE (`KIE_PROMPT_MAX`, **60.000** con Veo 3.1) se comprueba en FASE 5 antes de crear cada tarea — pasarse costaría un 422 con la cuota ya consumida.

**Gate de assets verticales (bloqueante, `upload-client.ts` + `Section0Reference`).** El video de referencia se mide en el browser antes de subir y el wizard **no deja continuar** si es apaisado — el output es 9:16 y una fuente horizontal lo arruina río abajo. El criterio es `alto > ancho`, **no** 9:16 exacto: si la medición falla (HEIC, códec raro) **pasa igual** — dejar al usuario encerrado por un formato que el browser no decodifica es peor que un video horizontal. La foto de personaje en `Section2Character` pasa por el mismo chequeo de verticalidad; el product image NO se valida por ratio.

**Descarga y miniatura.** Cada clip en `Section6Lotes` se descarga con `?download=lote-N.mp4` sobre la URL de Supabase, no con el atributo `download` nativo a solas: el mp4 vive en el bucket (cross-origin) y el browser lo ignora, así que abría el video en otra pestaña. Supabase responde `content-disposition: attachment` con el query param (verificado por `curl -I`). En el dashboard, la card de una sesión usa **`video_url`** como miniatura — que ya NO es "el video final" sino **el primer lote que terminó de renderizar** (`lote-status/route.ts` lo estampa apenas hay un `videoUrl` en `lotes`, sea el primero, el segundo o cualquiera que termine antes) — y el browser pinta su primer frame (`#t=0.1`, porque muchos mp4 abren en negro); no hay póster generado (y **no porque falte ffmpeg** — ver la corrección en FASE 5: es instalable, simplemente nadie lo hizo). `ProjectHistory` distingue video de imagen por `.mp4` en la URL; si `video_url` es null (nada terminó aún, o el mirror al bucket propio falló y sigue siendo una URL de KIE que no matchea `.mp4`) cae al still del personaje o del producto. `done` en el GET de `/sessions` es `!!r.render_done` (**no** `!!r.video_url`, que solo dice "al menos un lote terminó"): `render_done` es una columna cacheada con la MISMA fórmula que usa `lote-status` (`renderDone`, `lib/video-ads/render-lotes.ts` — "TODOS los lotes tienen video o fallaron explícito"), escrita en el mismo `update` que ya toca `lotes` cada vez que `lote-status` o `generate-lotes` persisten. Se cachea (en vez de que `listVideoSessions` seleccione `lotes` y calcule ahí mismo) para no arrastrar el jsonb de `lotes` —con el `prompt` de cada uno, miles de caracteres— en una lista de 24 filas.

⚠️ **VOZ EN OFF: un formato entero que el pipeline no contemplaba (`vozEnOff`).** Todo esto nació asumiendo un protagonista VISIBLE que habla a cámara — el bloque de consistencia, el avatar como primer fotograma, el perfil de movimiento, la FASE 0 pidiendo etnia y acento. Pero un formato completo de UGC es **narración por encima de b-roll**: medido con un anuncio real de calzado (`Download (3).mp4`, 63 s), hay voz femenina durante todo el video —1.230 caracteres— y **la cara no aparece ni una vez**: son planos de pies con tacones y de manos sosteniendo el zapato. Sin esto el render pone a un avatar a hacer **lip-sync** de esa narración, que es exactamente lo que el original NO hace.

`cortes[].vozEnOff` es opcional: ausente o `false` significa "habla a cámara", el comportamiento de siempre, así que ninguna sesión anterior cambia. Se propaga por `tiempo` (no por `n`, mismo motivo que `camaraDeLote`) hasta tres sitios: `buildLotePrompt` rotula la línea `VOZ EN OFF (nadie habla en cuadro)` en vez de `Locución:`, declara que **ninguna boca se mueve** cuando el clip entero es narrado y retitula el guión global; y `buildFramePrompt` deja de exigir una cara — encuadra lo que la acción describa (pies, manos, detalle) aunque la persona quede fuera de cuadro.

✅ **Medido sobre ese video:** el forense marcó **16 de 17 cortes** como voz en off (el 17 es la placa final, que es muda) y describió al personaje como *"narradora… solo se muestran las manos y el torso superior en algunas tomas, o sus pies y piernas en otras"* — entendió que la cara nunca sale. El reparto da **17 cortes → 11 lotes**, 11 frames, y los 11 lotes salen declarados en off.

✅ **VERIFICADO CON UN RENDER REAL, y la apuesta central del eje se sostiene.** Un lote de 8 s con `vozEnOff`, dos frames de Nano Banana generados desde la foto del producto y el prompt de lote real: **la narración se oye completa y palabra por palabra** (*"Este modelo nunca llegó a tienda y aún así se agotó…"*, byte-idéntica a la esperada, sin repeticiones) **y no aparece ninguna cara ni ninguna boca** — los 8 segundos son piernas y pies con la bota sobre una escalera de madera, que es el formato del original. O sea Veo sí acepta generar audio hablado sin poner a nadie a pronunciarlo, que era lo único que este eje no podía dar por sentado.

Detalles medidos de esa corrida: 122 caracteres en 8 s = 15,25 car/s, dentro de la banda conversacional (`snapDuration` eligió bien); la bota se reprodujo fiel —cuero tan, elástico acanalado lateral, suela track, cierre trasero visible—; y el movimiento es real, no una foto animada: las piernas pasan de estar sentadas en el escalón a subir el peldaño. Archivos en `~/Downloads/probe-calzado/`.

⚠️ **BUG PRE-EXISTENTE QUE ESTO DESTAPÓ: `muestraPersona` leía las negaciones al revés.** El forense describe un plano de producto como *"Detalle del zapato, **sin persona** en cuadro"* y la búsqueda por palabra lo clasificaba como plano de PERSONA — o sea justo al revés. Un flat-lay mal clasificado se fusiona con planos de persona y comparte fotograma con ellos, que es el fallo que la función existe para evitar. Ahora la negación se comprueba primero, tolerando artículos (*"no se ve a la modelo"*). Afecta también a ropa y suplementos, no solo a calzado.

### Nichos (`lib/video-ads/niches.ts`) — ropa y zapatos

🚫 **BLOQUEADOS TEMPORALMENTE (2026-08-21, a pedido del dueño del repo): solo se ofrece suplementos.** Todo lo que describe esta sección sigue en el código y sigue siendo cierto — lo que cambia es que `NICHES_BLOQUEADOS = ['ropa', 'zapatos']` los saca del selector (`Section1Product` esconde los chips cuando queda un solo nicho activo) y `toNiche` los normaliza al default, con lo que `nicheSpec` devuelve el spec de suplementos en `character.ts`, `lotes.ts` y la ruta de personaje: una fila guardada con `niche='ropa'` deja de activar el camino de prenda. **Se desbloquea vaciando esa lista**, y los dos tests del camino de prenda (`character.test.ts`, hoy `it.skipIf`) vuelven a correr solos.

⚠️ **La columna SÍ conserva el nicho que el usuario eligió** — `analyze-product` escribe con `isNiche`, no con `toNiche`. Normalizar al escribir borraría la intención para siempre y al desbloquear no habría forma de distinguir esas sesiones. La normalización es de LECTURA, en cada consumidor.

⚠️ **La huella de reanudación pasa por `toNiche`** (`render-lotes.ts`): un nicho bloqueado tiene que hashear como suplementos. Sin eso, una sesión de ropa con lotes ya pagados reanudaría pegando un clip del camino de prenda a uno del camino de objeto mientras `isPaidResume` jura que es el mismo contenido. Medido contra la base al aplicar el bloqueo: **2 sesiones de ropa con lotes pagados** cambian de huella (fail-closed, cuentan como generación nueva al reanudar) y **ninguna fila tiene `niche` null**, así que ninguna sesión de suplementos se invalida.

⚠️ Durante el bloqueo las ramas `wornProduct` de `character.ts` y `lotes.ts` quedan **sin ejercitar** por ningún test. Lo que sigue cubierto es el spec en sí (`niches.test.ts`).

⚠️ **EN ROPA Y ZAPATOS EL PRODUCTO Y EL VESTUARIO SON EL MISMO OBJETO, y hoy eran dos campos que se contradecían dentro del mismo prompt.** El pipeline nació asumiendo un producto que el personaje SOSTIENE. Con una prenda: (1) `bloqueConsistencia` describe el vestuario —copiado del video original— y viaja íntegro a cada lote junto a `productDesc`, o sea el prompt afirma *"viste camiseta rosa"* y *"el producto es una blusa crema"* en el mismo texto; (2) el prompt que genera el avatar pide explícitamente *"sin el producto en el encuadre"*, que para ropa es justo al revés.

Por eso `NicheSpec.wornProduct` es el ÚNICO eje que conoce el código, y no una lista de features por nicho: es la diferencia que el pipeline necesita saber. Lo demás (rótulo del bloque de producto, nota del avatar, hint de la UI) cuelga de ese eje.

- **La prenda entra por el slot de producto que ya existe** (decisión del dueño del repo): en ropa esa foto ES la prenda. Cero UI nueva salvo el chip, cero columna nueva salvo `niche`.
- **El nicho se elige, no se detecta** (chip en `Section1Product`, persistido en el mismo POST de `analyze-product`): cuando una detección automática se equivoca, el video sale mal y el usuario no tiene dónde corregirlo.
- **El avatar NACE con la prenda puesta.** `character/route.ts` manda la foto del producto como imagen tanto al análisis de identidad como a `openaiGenerateImage` (que usa `images.edit` cuando hay imágenes, así que genera A PARTIR de la prenda real). Así `@image(1)` ya la trae y el bloque de consistencia la describe: **el mismo mecanismo que mantiene la identidad entre lotes mantiene la ropa**. La alternativa —vestirlo en cada lote— es virtual try-on repetido N veces sin memoria, o sea una prenda distinta por clip.
- `toNiche` normaliza todo lo desconocido a `'suplementos'`, y la columna nació con ese default: **toda sesión anterior se comporta exactamente igual**. Cubierto por tests.
- `scriptFingerprint` incluye `niche`: cambia la plantilla del prompt y el bloque de consistencia, así que sin él cambiar el chip y re-renderizar dejaría la misma huella con otro prompt.

⚠️ **EL FORMATO DE ROPA ES UN MONTAJE RÁPIDO, y eso choca de frente con la frontera de plano.** Medido sobre un UGC de ropa real de 28 s (`ssstik.io_@micasilva.ph`): el forense reporta **29 cortes de ~1 s**, con **9 planos distintos que se repiten** (cuerpo entero → plano medio → macro de puño → detalle de cintura → plano cenital → trasero…) y la secuencia se repite entera para la segunda variante de color de la prenda. `ffmpeg` con detección de escena encuentra **cero** cortes a umbral 0.3 y 0.15: misma pared, misma persona, mismo encuadre-familia entre cortes. O sea el corte es real y no se detecta por delta de píxeles — el forense sí lo ve.

Con eso, `groupIntoLotes` da:

| | lotes | qué pasa |
|---|---|---|
| sin frontera de plano | **2** (15 s + 14 s) | ~14 planos por clip: el encuadre no se copia (medido en el render del serum) |
| con frontera de plano | **24** (1–2 s cada uno) | fiel al montaje, **12× llamadas pagadas**, y clips de 1 s |

⚠️ **LA DEL MEDIO SE MIDIÓ Y NO EXISTE PARA EL ENCUADRE.** `groupIntoLotes` acepta `maxPlanos` (default 1) para admitir K encuadres por clip. Medido sobre los dos videos reales:

| K | ropa: lotes | ropa: lotes con encuadre ambiguo | ropa: coreografía | suero: lotes |
|---|---|---|---|---|
| sin frontera | 2 | 2 de 2 | **25 %** | 2 |
| **1** | **24** | **0** | **100 %** | **5** |
| 2 | 12 | 11 de 12 | 100 % | 3 |
| 3 | 7 | 7 de 7 | 100 % | 3 |
| 4 | 6 | 5 de 6 | 100 % | 2 |
| 6 | 4 | 4 de 4 | 74 % | 2 |

Con K=2 **once de doce lotes vuelven a tener dos encuadres**, y ya está comprobado con renders reales que un clip con dos planos se renderiza con uno solo. O sea K>1 no es un punto medio del encuadre: es la opción barata con pasos de más. Lo que K sí compra de verdad es la **coreografía en ropa**: sin frontera cae a 25 % (15 tomas en un solo prompt), y con K=3–4 se mantiene en 100 % a 3,5× de costo en vez de 12×.

El menú real, entonces, es de dos ejes y no de uno:

- **K=1** — 24 clips, encuadre y coreografía perfectos, **12× llamadas pagadas**.
- **K=3** — 7 clips, coreografía 100 %, **encuadre perdido**, 3,5×.
- **sin frontera** — 2 clips, encuadre perdido Y coreografía al 25 %: peor que las dos anteriores en todo salvo el precio.

`maxPlanos` se queda en **1** por defecto: cambiarlo es una decisión de plata, no un default.

⚠️ **LA SALIDA REAL NO ERA AGRUPAR MEJOR, ERA FUSIONAR LOS MICRO-CORTES (`mergeMicroCortes`, forensic.ts).** El costo del video de ropa no venía del agrupamiento sino de la granularidad del original: 29 cortes de ~1 s, y con la frontera de plano cada corte abre su propio lote, o sea su propia llamada pagada. Un corte de 1 s tampoco es una toma que el generador pueda producir con sentido — `MIN_DURATION` de KIE es 1 s y ahí sale una pose congelada, no una acción.

`mergeMicroCortes` fusiona cada micro-corte con su vecino hasta que toda toma llega a `MIN_TOMA_SEG` (3 s). **Domina a `maxPlanos` en el mismo presupuesto**, medido sobre el mismo video:

| estrategia | clips | encuadre | coreografía |
|---|---|---|---|
| `maxPlanos = 3`, sin fusión | 7 | **perdido** (7 de 7 ambiguos) | 100 % |
| **fusión a 3 s + `maxPlanos = 1`** | **7** | **1 encuadre por clip** | **92 %** |

Mismo número de clips, mismo costo, y el encuadre funciona. La diferencia es la honestidad del prompt: con `maxPlanos > 1` el clip recibe dos encuadres y el modelo renderiza uno —el otro se pierde en silencio—; con la fusión los dos cortes se vuelven UNA toma con UN encuadre declarado y la acción de ambos encadenada, o sea el prompt describe algo que el modelo sí puede hacer. Lo que se descarta (el encuadre del corte más corto) queda en `Fusion`, no desaparece.

Umbral medido sobre los dos videos (cortes → lotes · coreografía):

| `minSeg` | ropa (29 cortes) | suero (10 cortes) |
|---|---|---|
| sin fusión | 29 → **24** lotes · 100 % | 10 → 5 lotes · 100 % |
| 2 s | 8 → 8 · 92 % | 9 → 5 · 100 % |
| **3 s (default)** | **7 → 7 · 92 %** | **5 → 4 · 100 %** |
| 4 s | 5 → 5 · 92 % | 5 → 4 · 100 % |
| 5 s | 3 → 3 · **82 %** | 3 → 3 · 100 % |

Reglas, todas deliberadas: se fusiona el corte **más corto del video** (no de izquierda a derecha, así el resultado no depende del recorrido); lo absorbe el **vecino más corto** (para no terminar con una toma gigante y varias en el piso); el encuadre y la transición que sobreviven son los del **corte más largo** (un flash de 0,5 s no debe decidir el plano de toda la toma); diálogo y acción se **concatenan**, así que no se pierde texto y el ritmo en caracteres por segundo no se altera. Idempotente por construcción — sin eso, dos pasadas darían dos listas de cortes y por tanto dos huellas distintas para el mismo contenido.

⚠️ **Se compone con `repairCutTiming`, y en ese orden.** Unir dos diálogos mete un espacio: suma un carácter sin sumar duración, así que un corte que estaba justo en el techo queda apenas por encima (medido: 20,6 cps). Recronometrar después lo devuelve a 20,0.

⚠️ **NO SE FUSIONA A TRAVÉS DE UN PLANO SIN PERSONA (`muestraPersona`).** Un plano de producto y uno de persona no se pueden encadenar sin un corte, así que cada clase se fusiona solo con la suya. La detección es por palabras y no por LLM a propósito: un falso negativo (no reconocer a la persona) solo hace que ese corte no se fusione — o sea el comportamiento anterior a la fusión, que es seguro—, mientras que un clasificador cuesta plata y puede alucinar. **Verificado con un render real**: el lote de persona fusionado (11 s, dos cortes encadenados) salió como **una toma continua**, mismo fondo y misma luz, con la modelo girando de frente → perfil → espalda → frente y el plumeti intacto todo el clip. Cero cortes internos, cero flat-lay intruso.

Efecto sobre la sesión de ropa: **29 cortes → 7 lotes**, dos de ellos los flat-lays aislados (1,18 s y 1,06 s, que rinden clips de 1 s). Un flat-lay solo entre planos de persona se queda corto y solo, y eso es lo correcto: es una toma distinta, y meterla dentro de otra corrompe las dos.

⚠️ **El piso de `repairCutTiming` es un SUELO contra el vaciado, no un empujón hacia arriba.** El mínimo se acota a la duración que el corte ya tiene (`Math.min(minVisibleSeg, dur[i])`). Sin ese acote, un corte que la fusión dejó corto a propósito —justamente un flat-lay aislado— se inflaba hasta el piso y el anuncio entero crecía con él: medido, los 28 s del original se iban a **41,8 s**. Con el acote quedan 35,6 s, y lo que queda de crecimiento es el caso legítimo (diálogo que no entra en su corte).

⚠️ **UN CORTE MUDO ES HOLGURA PURA, Y EL REPARTO LO VACIABA.** `repairCutTiming` calculaba el mínimo de cada corte solo desde su diálogo, así que un corte sin diálogo tenía mínimo 0 y podía donar TODA su duración para financiar a los que no entran. Medido en la sesión real de ropa, después de fusionar a 3 s: las dos tomas de cierre —las únicas mudas— quedaron en **0,91 s y 1,27 s**, o sea el reparto deshizo justo lo que la fusión acababa de garantizar, y esos dos clips de 1 s son dos llamadas pagadas por un plano congelado. Ahora acepta `minVisibleSeg` (default **0**, para no cambiar el comportamiento de ningún caller existente) y `extract-template` le pasa `MIN_TOMA_SEG` después de fusionar. Post-fix, misma sesión: 3,21 s y 4,49 s.

⚠️ **Corre en `extract-template` y SOLO si la sesión no tiene guión adaptado todavía.** A diferencia de `repairCutTiming`, fusionar **sí cambia `tiempo`** — el tramo abarca los dos cortes — y `tiempo` es lo que `adapt-script` copió a `tiempoOriginal`, con lo que `camaraDeLote` empareja y lo que entra en `scriptFingerprint`. Hacerlo sobre una sesión ya adaptada desalinearía el guión con los cortes en silencio, que es exactamente lo que la reparación evita por no tocar ese campo. Si ya hay guión, la lista de cortes está comprometida.

⚠️ **No está atado al nicho a propósito.** Un corte de 1 s es igual de irrenderizable en suplementos, y en el video de suero la fusión baja de 5 a 4 lotes conservando el 100 % de la coreografía — o sea es más barato sin costar fidelidad. Atarlo a `ropa` sería suponer que el problema es del nicho cuando es de la granularidad.

✅ **VERIFICADO CON UN RENDER REAL end-to-end de ropa** (sesión `430c5961`, blusa de plumeti de ARTURO CALLE sobre el UGC de `@micasilva.ph`): 29 cortes → **6 lotes**, los 6 renderizaron 720×1280 9:16. Lo que funcionó y lo que no:

- ✅ **El avatar nació con la blusa puesta**, y con la prenda exacta: mismo celeste, mismo plumeti azul marino, escote en V y mangas de doble volante, con pantalón neutro. El `bloqueConsistencia` describe la blusa como vestuario (*"Viste una blusa celeste de cuello en V con pequeños puntos cuadrados irregulares…"*), que es lo que la sostiene entre lotes.
- ✅ **La fusión bajó el render de 24 a 6 llamadas pagadas.**
- ⚠️ **Una toma fusionada de acciones HETEROGÉNEAS salía con cortes internos — ARREGLADO.** El lote 1 encadenó cuatro cortes con "Luego," e incluía un **flat-lay** (la blusa extendida, sin persona) entre dos planos de la modelo; el render hizo exactamente eso: tres sub-tomas con fondos distintos (pared, suelo de baldosas, sala con sofá). **El render era fiel al prompt — el problema era el prompt**, que pedía un montaje dentro de un clip mientras el bloque `CONTINUIDAD` promete que nada cambia. Ver `muestraPersona` abajo.
- ⚠️ **En 1 de 6 clips (el lote 4) la blusa perdió el plumeti** y salió celeste lisa. Deriva del modelo, no del prompt.

⚠️ **El piso de la fusión obliga a que la reparación de tiempos también lo respete, y eso ALARGA el anuncio.** Ver `repairCutTiming(report, minVisibleSeg)` abajo: en esta sesión el total pasó de 28 s a 34,6 s porque las dos tomas mudas de cierre no cabían en su duración original una vez impuesto el piso de 3 s. Es el mismo caso que "el texto entero no entra": el único en que `duracionTotalSeg` crece.

⚠️ **Y el `vestuario` del forense se le queda chico a la ropa.** `ForensicReportSchema.vestuario` es `z.string()`, pero con este video Gemini devolvió espontáneamente un **array de objetos** (`{prenda, colores, tejidosVisibles, joyeria, maquillaje, detalles}` ×4, incluidas las DOS variantes de color de la misma camisa). El schema lo coacciona a string, así que no rompe — pero la estructura que el modelo quiere dar existe y hoy se aplana. Relacionado: `CONTINUIDAD` congela `producto` y `vestuario` por clip, así que una referencia que muestra la misma prenda en dos colores necesita que cada variante caiga en su propio lote (hoy ocurre por accidente, porque son tramos distintos del video, no por una regla).

**Schema:** `supabase/migrations/20260810000001_video_sessions.sql` (base de video_sessions) + `20260812000001_video_spec_rewire.sql` (columnas de INPUTS y VALIDATION) + `20260812000002_video_lotes.sql` (columnas de FASE 3/4/4.5/5: `adapted`, `character_prompt`, `consistency_block`, `voice_profile`, `lotes` jsonb) + `20260812000003_video_render_done.sql` (columna `render_done`, cacheada para el dashboard).

### Sesiones fantasma en el dashboard

⚠️ **EL WIZARD CREA LA FILA AL MONTAR LA PÁGINA, ASÍ QUE ABRIR UNA TOOL Y NO HACER NADA DEJA UNA SESIÓN.** Los tres wizards (`VideoWizard`, `AdWizard`, `LandingWizard`) llaman a `startNewSession()` desde el `useEffect` de montaje cuando no hay id en `localStorage`. Medido sobre la base: **103 de 144** filas de `sessions`, **40 de 107** de `branding_sessions`, **25 de 89** de `landing_sessions` y **22 de 57** de `video_sessions` no tienen ni siquiera su primer insumo. El dashboard las listaba todas, empujando el trabajo real hacia abajo.

⚠️ **Y EN DESARROLLO SE CREAN DE A DOS:** el StrictMode de React monta dos veces, y este efecto tiene un efecto de servidor. Se ve en los datos — las fantasma aparecen **en pareja con la sesión real y con el mismo minuto de creación**. Un `useRef` corta la segunda.

✅ **ARREGLADO EN LA RAÍZ (2026-08-27): LA FILA NACE CON EL PRIMER INSUMO.** El `useRef` de arriba y el filtro del listado ocultaban el síntoma; esto lo elimina. El bloqueo que lo demoró —*"el wizard necesita un `sessionId` para subir a `/upload-url`"*— resultó ser de una línea: `startNewSession` no DEVOLVÍA el id. Los tres stores ganan **`ensureSession()`**, que devuelve el id existente o crea la fila y lo devuelve, y el `useEffect` de montaje pasa a solo HIDRATAR: sin id guardado no hace nada. La llaman los tres primeros pasos (`Section0Reference` de video, `Section1Reference` de anuncios, `Section1Product` de landing), que son los que tienen el primer insumo real.

⚠️ **`Section1Product` tenía un `if (!sessionId) return null` que sin fila al montar daba PANTALLA EN BLANCO** — el mismo modo de fallo que este documento ya registra para `Section2Character` con `validation`. Se quitó: el formulario se pinta siempre y la fila nace al enviarlo.

✅ **Verificado en un navegador real**: con `localStorage` limpio, abrir el wizard de landing pinta el paso 1 completo (con "Continuar" deshabilitado hasta que haya nombre) y **`video_sessions` / `sessions` / `landing_sessions` se quedan en 60 / 144 / 89** — antes y después de cargar la página. Ninguna fila fantasma.

⚠️ **EL CAMBIO ROMPIÓ "EMPEZAR" EN LAS TRES TOOLS, Y LA CAUSA ES QUE ZUSTAND ES UN SINGLETON DE MÓDULO.** Reportado por el dueño del repo: *"el botón de crear nueva sesión me lleva al step final de la última que hice"*. `ToolIntro.empezar()` borra el id de `localStorage` y navega al wizard — eso ALCANZABA mientras el montaje creaba la sesión, porque el wizard llegaba vacío y creaba una fila nueva. Al mover la creación al primer insumo, el montaje pasó a hacer `return`… y **el store sobrevive la navegación del cliente**: el wizard se remontaba con la sesión anterior todavía en memoria y el usuario aterrizaba en su último paso.

Los tres stores ganan **`resetSession()`** (`set({ ...initialState })`, sin crear nada) y el montaje la llama cuando no hay id. La lección general: **al quitar un efecto secundario del montaje hay que preguntarse qué estado dependía de él para limpiarse**, no solo qué dependía de él para existir.

⚠️ **Y EL CAMINO DE ERROR HACÍA LO MISMO.** `.catch(() => startNewSession())` —un id borrado del dashboard, o de otra cuenta— creaba una fila en silencio, o sea el problema que este cambio vino a eliminar entrando por la puerta del fallo. Ahora **vacía el wizard Y BORRA el id de `localStorage`**: sin eso el id muerto se queda guardado y vuelve a fallar en cada visita (antes lo pisaba el `startNewSession` de ese mismo catch). Verificado con un id inexistente: paso 1, `localStorage` en null, cero filas nuevas.

**El listado filtra al LEER y no se borra ninguna fila.** Cada `list*Sessions` exige que exista el primer insumo de su tool (`reference_video_url`, `reference_url`, `product_name`, `brand_name`). Borrarlas sería una migración destructiva para arreglar un problema de presentación, y son inofensivas donde están. ⚠️ El `step` NO sirve de discriminante: nace en 0 y una sesión real también pasa por 0.

🔴 **TODO ESTO SE PERDIÓ EN VIDEO CON EL REINICIO DEL GENERADOR, Y SE RE-CABLEÓ (2026-09-08).** El commit `a3a25d6` devolvió `store/video.ts`, `VideoWizard.tsx`, `Section0Reference.tsx` y `lib/video-ads/db.ts` a la versión del 13 de agosto — o sea a ANTES del arreglo del 27 de agosto que describe esta sección. Anuncios, landing y branding lo conservaron, así que **la sección quedó describiendo tres tools de cuatro** y las dos referencias colgantes lo delataban: los comentarios de `store/wizard.ts` y `store/landing.ts` decían *"ver `ensureSession` en `store/video.ts`"* apuntando a una función que ya no existía. Es la misma clase que el `06c8259` de anuncios (una restricción apuntando a una sección borrada) y que `quitarRotuloDeToma`, y el modo de fallo del reinicio en general: **lo que se re-portó fue el pipeline del generador, no los arreglos de infraestructura de alrededor.**

Las **cinco** partes, que son cinco y no una —cada una tapa una puerta distinta y el arreglo no sirve a medias—: (1) el montaje ya no crea la fila, solo hidrata; (2) `ensureSession()` en `store/video.ts`, awaiteada en `Section0Reference` antes de subir (`uploadDirect` firma la subida contra el id — ése era el bloqueo que demoró el arreglo original); (3) `resetSession()`, sin la cual "Empezar" aterriza en el último paso de la sesión ANTERIOR, porque el store de zustand es un singleton de módulo que sobrevive la navegación del cliente; (4) el candado `useRef` contra el doble montaje del StrictMode; (5) el `.not('reference_video_url', 'is', null)` de `listVideoSessions`, que era el único de las cuatro tools que faltaba.

⚠️ **MEDIDO, Y LEELO CON CUIDADO: 23 de 71 filas de `video_sessions` (32 %) no tienen video de referencia, pero TODAS son anteriores al 27 de agosto.** O sea son las históricas previas al arreglo original: desde el reinicio nadie abrió la tool sin subir un video, así que la regresión estaba viva en el código y **todavía no había producido filas nuevas**. No lo escribas como "el reinicio creó 23 fantasma".

⚠️ **El filtro al leer se prueba por sus ARGUMENTOS, no por la forma de la cadena** (`db.test.ts`): un `.not` sobre otra columna pasaría igual un test que solo mira que exista. Es exactamente el criterio que ese archivo ya aplicaba para `claimFreshLotes`.

⚠️ **Lo que NO cambió:** `onRetry` (el reintento tras un error de sesión) y `onReset` ("empezar de nuevo") siguen llamando a `startNewSession`, igual que en `AdWizard`. Son acciones EXPLÍCITAS del usuario: ahí crear la fila es lo correcto, y confundirlas con el montaje es cómo esto se vuelve a romper.

