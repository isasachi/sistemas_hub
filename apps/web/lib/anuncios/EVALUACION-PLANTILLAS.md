# Evaluación — sistema de plantillas y generación múltiple (spec 2026-09-04)

Lectura del spec contra el código real de `generador-anuncios`. No es un resumen del spec:
es qué de eso ya existe, qué choca con algo medido en este repo, y en qué orden conviene hacerlo.

---

## 1. La bifurcación — es UNA pregunta y todo cuelga de ella

El spec mezcla dos cosas que son **ortogonales**, y separarlas es lo más útil que se puede decir acá:

| eje | qué es | secciones del spec |
|---|---|---|
| **A · biblioteca de plantillas** | la app cura N plantillas y el usuario elige una | §2-4, §6, §13, §31, §33 |
| **B · generación múltiple** | una referencia → N anuncios conceptualmente distintos | §14-23, §29, §35 |

**B no necesita A.** Se puede generar un lote de 8 anuncios distintos sobre la referencia que el
usuario ya sube hoy, sin una sola plantilla curada, sin assets nuevos y sin tocar el análisis forense.

**A sí cambia el producto.** Hoy la promesa es *"replica ESTE anuncio que te gusta"*; con la
biblioteca pasa a ser *"elige una de NUESTRAS plantillas"*. Eso es un proyecto de contenido
(diseñar y compilar 6-8 plantillas × 2 diseños × 3 ratios = 36 assets, §33) más una ruta de admin
para compilar blueprints, más `Section1Reference` convertido en camino alternativo.

**Recomendación: hacer B primero, sobre la referencia del usuario.** Entrega la promesa visible del
spec ("una plantilla → 8 anuncios") a una fracción del costo, y deja A como decisión de producto
separada que se puede tomar después con B ya funcionando.

⚠️ **Esto INVIERTE el MVP del propio spec (§32) a propósito.** Ahí se propone arrancar por seis
familias de plantillas —o sea el eje A— y dejar el lote para después. La razón para darlo vuelta es
que §32 asume que la biblioteca habilita la generación múltiple, y no la habilita: B corre sobre la
referencia que el wizard ya sube. Empezando por A se paga el 70 % del trabajo antes de entregar
nada de lo que el spec promete en su título. Queda dicho explícitamente para que sea una posición
que se acepta o se rechaza, no una contradicción que aparezca después.

---

## 2. §6 ("no correr el forense en cada generación") ya está resuelto

Es el cambio que el spec llama *"uno de los más importantes"*, y en este repo **ya se cumple**:

- `analyze-reference` corre UNA vez y persiste `sessions.reference_analysis`.
- `generate-image` hace `ReferenceAnalysisSchema.parse(session.reference_analysis)` — no re-analiza.
- Lo mismo `generate-copy` y `refine-image`.

O sea el forense ya corre una vez por sesión, no por render. Lo que el spec agrega es correrlo una
vez por *plantilla* en vez de por *sesión* — y eso solo tiene sentido si las plantillas son nuestras
(eje A). Con la referencia del usuario, cada referencia es nueva por definición: no hay nada que
cachear entre sesiones.

**Consecuencia:** el argumento de latencia/costo que el spec usa para justificar la biblioteca no
aplica al estado actual. Si la biblioteca se hace, que sea por la razón de producto (curaduría,
calidad garantizada, onboarding sin referencia), no por ahorro de forense.

---

## 3. Lo que el spec pide y ya existe — mapa campo por campo

| spec | ya es |
|---|---|
| §7.1 elementos **invariantes** | `layoutDescription`, `composition`, `physicalPosition`, `typography`, `colorimetry` + el bloque `WHAT STAYS` de `step5.md` |
| §7.2 elementos **variables** | el `CopyElement[]` — ya se deriva un elemento por bloque de texto visible de la referencia |
| §7.3 elementos **adaptativos** | `bodyFocus` + `attentionMarkers` + la adaptación demográfica de §10 de `step5.md` (`hero_subject.adapt_to_audience` del spec, literal) |
| §8 slots con significado semántico | `element` se nombra por su **rol persuasivo** (headline, subhead, badge, CTA), nunca por posición — el prompt de `generate-copy` ya lo exige |
| §8 `sourcePriority` | ya implícito: A come de los comentarios, B del andamiaje de la referencia |
| §9 comentarios → perfil, no → slots | ya está a medias: *"take the idea, not the wording"*, *"never paste a comment as a quote"*. Falta el artefacto estructurado |
| §10 copy planner (intención antes que redacción) | la versión B ya es exactamente eso en tres etapas: transcribir → templar → rellenar |
| §11 pase global de coherencia | existe en video-ads (`buildCoherenceInstruction`), NO en anuncios |
| §12 validación de layout | `llm-clamp.ts` (`stringsEnElTope`, `correccionDeLargo`) |
| §22 detección de duplicados semánticos | `mismosTextos` en `Section4Copy` — el detector de "las dos salieron iguales" |
| §28 el modelo de imagen no es el planner | `step5.md` + `callReasoning` ya resuelven layout/copy/paleta/zona antes de llamar al modelo de imagen |

**El spec es más chico de lo que parece.** Lo genuinamente nuevo es: el Batch Planner, el perfil de
audiencia estructurado, el validador de diversidad y el almacenamiento de N variantes.

---

## 4. Los cuatro choques con cosas ya medidas en este repo

### 4.1 🔴 La cuota per-step bloquea el lote al 5º anuncio

`anuncios-image` está en `IMAGE_KINDS` con `GEN_PER_STEP_LIMIT = 4` (1 gen + 3 regens), contado
por `(session_id, kind)` exacto. **Un lote de 8 recibe 429 en el quinto.**

El mecanismo para arreglarlo **ya existe y es gratis**: `landing-section` viaja como
`landing-section:${type}` y `isImageKind`/`isCreditKind` matchean **por prefijo** mientras el
conteo per-step es por kind **exacto**. O sea `anuncios-image:v1 … anuncios-image:vN` le da a cada
variante su propio bucket de 4 (1 gen + 3 regens por variante) sin tocar `gen-quota.ts`.

⚠️ Eso multiplica por N las imágenes que una sesión puede pedir. **Es una decisión de precio del
dueño del repo**, misma clase que `LOTE_MAX_SEC` — no un efecto colateral que se pueda tomar acá.

### 4.2 🔴 Los créditos: 8 anuncios son 8 créditos, y el spec no los menciona

`anuncios-image` es un `CREDIT_KIND` (match por prefijo, así que `:vN` también cuenta).

| plan | créditos/período | un lote de 8 es |
|---|---|---|
| Legacy Start ($29.90) | 30 | **27 % del mes en un clic** |
| Legacy Scale ($69.90) | 100 | 8 % |
| Legacy Empire ($89.90) | 180 | 4,4 % |

El selector `[1][3][5][10]` de §30 tiene que **mostrar el costo y gatearse contra `creditStatus`**
antes de disparar. La maquinaria ya existe (`checkCredits`, `creditosBajos`, el pill de la barra);
lo que falta es que el selector la lea. Sin esto, un usuario del plan 1 quema su mes en tres clics
y el fallo se reporta como 429 a mitad de lote, con parte de los créditos ya gastados.

**Corolario de diseño:** la cuota se tiene que verificar para las N tareas **antes de crear la
primera**, igual que hace `generate-lotes` en video — medio lote es dinero gastado en algo inservible.

### 4.2b 🟡 Hay una TERCERA capa de cuota, y es la que produce un 429 que nadie sabe atribuir

Por encima de las dos anteriores está `GEN_GLOBAL_DAILY_LIMIT` (500/día, **todos los usuarios,
todos los kinds, imagen y texto**). Un lote de 8 no la roza; varios usuarios generando lotes el
mismo día sí. El mensaje que devuelve es *"El servicio alcanzó su límite diario de generaciones"* —
o sea el usuario no puede hacer nada al respecto y el soporte no puede saber de quién fue el gasto
sin mirar `ph_gen_usage`. No bloquea el MVP; hay que tenerlo presente al elegir el tope de N.

### 4.3 🟡 §28 lleva razón, pero el blueprint NO puede reemplazar a la imagen de referencia

El spec propone compilar la plantilla a JSON (`visualBlueprint`) y mandarle eso al modelo de imagen.
Este repo tiene medido tres veces lo contrario: **la imagen le gana al texto.**

- Landing: quitar el bloque `SETTING AND LIGHTING` en TEXTO hizo que el fondo saliera igual a la
  imagen de referencia en 2 de 2 draws; con el bloque salían habitaciones distintas cada vez.
- Video-ads: el avatar como `@image(1)` imponía su encuadre a todo el anuncio por encima de
  cualquier instrucción de texto.
- Anuncios: `editImage` manda la referencia como Imagen 1 y de ahí sale el layout.

**Entonces:** el blueprint es metadata para el PLANNER (decidir qué va en cada slot), nunca un
sustituto de la imagen de referencia en la llamada de render. La Imagen 1 se sigue adjuntando.

### 4.4 🟡 §12: `maxCharacters` como `maxLength` de schema NO acorta — CORTA

Medido en landing: OpenAI aplica `maxLength` **al decodificar**, así que no devuelve texto largo
que se pueda reintentar: devuelve el texto **cortado exactamente en el tope**, a mitad de frase
(*"…¡No te quedes a"*), y zod lo acepta porque 90 ≤ 90. Gemini al revés: lo ignora y devuelve de más.

El flujo de §12 (`fits? no → rewrite shorter`) es correcto **si se implementa con `llm-clamp.ts`**:
`stringsEnElTope` detecta el muñón comparando contra el schema, `correccionDeLargo` arma el
reintento nombrando los campos. Reusar eso, no escribir un `.max()` nuevo.

---

## 5. Dos requisitos que el spec no nombra y rompen cosas si se ignoran

**El thumbnail del dashboard.** `listSessions` selecciona `image_url` y filtra
`reference_url is not null`. Cualquier diseño de variantes tiene que **seguir poblando
`sessions.image_url`** (con la primera variante que termine, igual que `lote-status` hace con
`video_url`) o el historial se queda sin miniatura.

**`sessions` es una tabla LEGADA sin migración de creación.** Toda columna nueva va con guard
(`do $$ begin if to_regclass('public.sessions') is not null then … end $$`), precedente en
`20260824000001_anuncios_what_it_is.sql`. Para N variantes hay dos caminos y el segundo es más limpio:

- columna `variants jsonb` sobre `sessions` — barato, y repite la forma de `video_sessions.lotes`
  (que ya se demostró que aguanta: estado por ítem, reanudable, huella de contenido).
- tabla hija `ad_variants` — mejor si las variantes se van a listar, borrar o regenerar de a una.

Con `lotes` como precedente vivo y funcionando, **la columna jsonb es la opción lazy correcta**.

---

## 6. La evidencia más fuerte a favor del Batch Planner ya está en este repo

El spec advierte (§16) que N llamadas sueltas de *"genera otro anuncio diferente"* producen
variación superficial. **Eso ya pasó acá, medido, con n=2:** las versiones A y B salían
byte-idénticas porque B era *"A con 2-5 palabras sustituidas"* — no era una versión distinta, era
un parche sobre A. Solo se separaron cuando cada una recibió un **trabajo genuinamente distinto**
(A reescribe desde cero, B es fill-in-the-blank de la referencia).

`Section4Copy` todavía carga el detector de *"las dos salieron iguales"* por eso.

**Si hizo falta a n=2, es obligatorio a n=8.** El validador de diversidad de §22 no es un extra:
es lo que impide que el lote sea el mismo anuncio ocho veces. Y por el mismo motivo, cada variante
necesita su propio **encargo** (concepto + ángulo + fuente de información), no un "hazlo distinto".

---

## 7. MVP recomendado — el orden importa

Todo sobre la referencia del usuario, sin biblioteca de plantillas.

**Paso 0 — decisión del dueño del repo, bloquea todo lo demás.**
¿Cuántas imágenes puede pedir una sesión, y qué le cuestan al usuario? (§4.1 y §4.2). Sin esta
respuesta el lote no se puede cablear: es la misma clase de decisión que el cap de video.

**Paso 1 — Perfil de audiencia (§9).** Una llamada de texto que convierte los comentarios crudos en
`{vocabulario, dolores, deseos, objeciones, registro}`. Barato, cero imágenes, y es el insumo que
alimenta la diversidad del lote (§23: cada variante ataca un cluster distinto de preocupación).
Se persiste en la sesión; se calcula una vez.

**Paso 2 — Batch Planner (§16-19).** UNA llamada que ve el lote entero y devuelve N encargos
distintos: concepto, estrategia de hook, dolor/deseo que ataca, fuente. El planner mira todo junto
— es el mismo argumento por el que las identidades de varios personajes de video se resuelven en
una sola llamada: llamadas separadas devuelven N variantes de lo mismo.

**Paso 3 — Copy por variante + validador de diversidad.** El copy de cada encargo reusa
`generate-copy` (que ya sabe leer los bloques de texto de la referencia). El validador compara los
N conceptos y solo reemplaza los duplicados, no el lote entero.

**Paso 4 — Render en paralelo con estado por variante.** Estado `planned|rendering|done|failed` por
ítem, en `sessions.variants` jsonb. Una variante caída no tumba el lote (§29). ⚠️ El tiempo de
pared: gpt-image-2 tarda 40-90 s medidos, `maxDuration = 300`. **8 en paralelo dentro de un solo
request es una apuesta**; el precedente que funcionó es branding (4 secuenciales = 5,8 min → muere;
en `Promise.all` = 2,9 min). Con 8 conviene el patrón de video: crear, devolver, y que el cliente
sondee — no un stream que tiene que sobrevivir 5 minutos.

**Lo que NO entra en el MVP:** la biblioteca de plantillas curadas, los 36 assets, la ruta de
compilación de blueprints, los niveles de variación (§21 — el default "Diverse" alcanza), y la
organización por objetivo publicitario (§31).

---

## 8. Lo que conviene NO hacer

1. **No reemplazar la imagen de referencia por el blueprint JSON en la llamada de render** (§4.3).
2. **No implementar §12 con `.max()` de zod sobre el schema del modelo** (§4.4) — usar `llm-clamp`.
3. **No empezar por la biblioteca de plantillas.** Es el 70 % del trabajo del spec y el 0 % de su
   promesa visible; B funciona sin ella.
4. **No darle el copy de la referencia al pase de coherencia global (§11).** Medido en video-ads:
   el corrector empieza a devolver el producto VIEJO como corrección. La primera pasada sí lo lleva
   —su trabajo es sustituirlo—; el del corrector es juzgar lo ya escrito.
5. **No poner anti-ejemplos con forma de valor en los prompts nuevos.** Este repo lo pagó cuatro
   veces (el `"S/ 199"` de la oferta, el `"3x2"` del checklist, la FASE 3 de video, el ejemplo de
   `transicion`): un anti-ejemplo con forma de valor es una plantilla que rellenar.
6. **No cambiar `CopyElement`/`ReferenceAnalysis` a campos `.nullish()`.** Lo que no se le exige al
   modelo lo omite en silencio (medido cinco veces). Los campos nuevos van
   `.nullable().catch(null)`: exigidos al modelo, tolerantes con las sesiones ya guardadas.

---

## 9. Resumen en una línea

El spec tiene dos ejes; **el valioso es la generación múltiple y no necesita la biblioteca de
plantillas**. La mitad de lo que pide ya está construido con otros nombres. Lo que falta es un
Batch Planner con encargos genuinamente distintos, un perfil de audiencia estructurado y
almacenamiento de N variantes — y antes de nada, la decisión de cuánto puede costarle un lote al
usuario, porque hoy la cuota lo corta en el quinto anuncio.
