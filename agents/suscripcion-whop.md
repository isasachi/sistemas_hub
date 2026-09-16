## Suscripción — Whop (`lib/whop.ts`) y planes (`@ph/shared` `plans.ts`)

Paywall del hub: **tres planes**, sin prueba gratis, que desbloquean el ACCESO al área privada (`/dashboard` y `/tools/*`) y, según el tier, cuánto sirve el buscador y cuántas imágenes entran en el período. Whop entra **solo como capa de pago/entitlement** — la identidad sigue siendo Supabase Auth. Se descartaron "Sign in with Whop" (OAuth 2.1 + PKCE) y la app embebida en el iframe de Whop: obligarían a migrar sesiones y no compran nada sobre el login que ya existe.

| plan | nombre | precio | buscador | productos por rango | créditos de imagen |
|---|---|---|---|---|---|
| 1 | Legacy Start | $29.90 | `0-50` | 10 | 30 |
| 2 | Legacy Scale | $69.90 | `0-50` + `50-100` | 20 | 100 |
| 3 | Legacy Empire | $89.90 | los tres rangos | 50 | 180 |

⚠️ **EL PRECIO DE `PLANS` TIENE QUE SER EL DE WHOP, Y SE MUESTRA CON CENTAVOS.** Los tres planes cobran **.90**, no números redondos ni `.99` — verificado contra la API el 2026-08-21 (`formatted_price`: `"$29.90 / month"`, `"$69.90 / month"`, `"$89.90 / month"`). La tabla publicaba $29/$69/$89, así que la card anunciaba una cifra y el checkout cobraba otra: es la misma clase de mentira que las dos tablas de precios separadas, pero peor, porque la contradicción aparece en el momento de pagar. Y el precio se pinta con `precioUSD` y no interpolando el número: `${29.9}` da **"$29.9"**, que se lee como un precio distinto del "$29.90" de Whop.

⚠️ **NO HAY PRUEBA GRATIS.** `trial_period_days` es null en los tres planes y `createCheckout` no manda ningún campo de prueba, así que ninguna pantalla puede prometerla: se cayeron la constante `PRUEBA_DIAS` del paywall, el subtítulo de la home y los CTA "Empezar prueba gratis" (ahora nombran el plan), y los "Comenzar gratis" del hero y la barra. `grantsAccess('trialing')` **se queda igual** — habilitar una prueba en Whop es una casilla allá y cero código acá, y sin esa rama el día que se habilite dejaría afuera a quien acaba de entrar.

**La calculadora de costos y el generador de video vienen en los TRES planes**, sin tope por tier: el render de video lo paga el usuario con su propia API key de KIE (ver "BYOK" abajo), así que no hay costo del hub que racionar.

### La tabla de precios (`components/planes/PlanesGrid.tsx`)

**UN solo componente para la home y para `/suscripcion`.** Hasta el 2026-08-20 la home vendía **"Explorador S/ 0 · Operador S/ 149 · Agencia S/ 399"** con features inventadas ("marcas guardadas", "generaciones ilimitadas"): eran precios provisionales de antes de que existiera cobro, y quedaron publicados en la landing **después** de que el paywall real saliera a producción. Dos tablas de precios separadas = una miente. Ahora las dos pantallas pintan el mismo componente y todos los números salen de `PLANS`.

**Los candados se DERIVAN de `unlocksBucket`**, no de una lista escrita a mano: si mañana un plan desbloquea otro rango, la card lo refleja sola.

**La jerarquía visual sale del BRANDBOOK, no del gusto.** El sistema tiene dos ejes y acá caen justos: **carmesí = acción** ("un solo objeto carmesí pleno por pantalla") se lo lleva **Scale**, que es el plan que se quiere que se elija; **crema = prestigio** (`.jr-btn-gold`, "el único relleno crema del sistema") se lo lleva **Empire**, que tiene que leerse premium sin robarle el carmesí a Scale. Start queda en el botón secundario. Hay tests que fijan que haya exactamente UN `lp-cta` y UN `jr-btn-gold` en la grilla.

⚠️ **Con un plan ya contratado, el destacado pasa a ser el del usuario, no Scale.** Resaltarle el plan que queremos vender por encima de la card del que ya pagó es venderle tapándole lo suyo.

⚠️ **Los CTA son `<a>` nativos en los DOS contextos, nunca `<Link>`.** En `/suscripcion` ese href crea una checkout configuration en Whop y Next prefetchea los Link — se crearían con solo pasar el mouse. Se usa `<a>` también en la home (donde no haría falta) para que nadie pueda equivocarse al reutilizar el componente.

**Iconos de `lucide-react` y no emoji** (`Star`, `Crown`, `Search`, `Sparkles`, `Check`, `Lock`), que es la convención del hub: el emoji se renderiza distinto en cada sistema operativo y desentona en un diseño oscuro.

⚠️ **`PLANS` (`packages/shared/plans.ts`) es la ÚNICA definición de qué incluye cada plan.** Lo leen el paywall, el serving del buscador, el contador de créditos y la pantalla de ajustes. Escribir "10 productos" a mano en la UI es cómo el paywall termina vendiendo algo que el servidor no entrega. Vive en `@ph/shared` y no en `apps/web/lib` porque el componente cliente del buscador también lo necesita para pintar los candados.

**Flujo:** `GET /api/whop/checkout?plan=1|2|3` valida el tier server-side y crea una *checkout configuration* → el usuario paga en Whop → Whop llama a `POST /api/whop/webhook` → el webhook escribe `user_entitlements` (con su `tier`) → el gate del layout la lee. **La API de Whop nunca se consulta en el path de request**: el webhook es la única escritura y el hub solo lee su propia tabla (mismo criterio que la regla de costo de buscador-productos).

⚠️ **EL TIER VIAJA EN `metadata`, NO EN `data.plan_id` — y esa es la decisión importante.** La forma del sobre del webhook ya es una suposición (ver abajo); leer el plan de `data.plan_id` apilaría una segunda suposición encima, con un modo de fallo peor: un suscriptor de $89 aterrizando en silencio en el plan 1 (10 productos, 30 créditos) es un pedido de reembolso, no un 500. Lo único que la doc afirma explícito es *"Payments and memberships created from a checkout session inherit its metadata"* — el mismo mecanismo por el que ya llega el `supabase_user_id`. Por eso el checkout escribe `metadata: { supabase_user_id, tier }` y `tierFromEvent` lo lee de ahí; `data.plan_id` contra `WHOP_PLAN_ID_{1,2,3}` es la red para quien compre desde un link pegado fuera de nuestro checkout, y el último recurso es el plan **1**. **El fallback es siempre al plan más bajo y se loguea**: equivocarse hacia arriba regala el plan caro y nadie reclama; hacia abajo es un ticket visible.

⚠️ **Son TRES planes de Whop distintos, no un plan con precio variable.** Whop ata el precio a la suscripción, así que bajar o subir el precio de un plan no mueve a quien ya está adentro — y quien se suscribió a $1 en una prueba de cobros se queda en $1. Cambiar de plan es cambiar de `WHOP_PLAN_ID_N`.

⚠️ **`getAccess` se queda con el tier MÁS ALTO de las memberships vivas.** Un usuario puede tener varias filas (canceló una y compró otra, o subió de plan): quedarse con la peor sería cobrarle el plan caro y servirle el barato. Un `tier` nulo —fila escrita antes de que existiera la columna— vale como plan 1.

⚠️ **EL ENTITLEMENT CUELGA DEL MEMBERSHIP, NO DEL PAGO.** Durante una prueba **no existe ningún `payment.succeeded`**, así que un gate colgado de los eventos de pago dejaría al usuario afuera exactamente durante la prueba que lo trajo. Hoy los planes no tienen prueba, pero la decisión se sostiene igual: es lo que permite habilitarla sin tocar código. Los estados de membership son nueve (`trialing`, `active`, `past_due`, `completed`, `canceled`, `expired`, `unresolved`, `drafted`, `canceling`) y `grantsAccess` otorga en tres: `trialing`, `active` y `canceling` (canceló pero el período pagado sigue corriendo — quitárselo antes sería cobrarle por algo que no puede usar). `past_due` **no** da acceso: Whop reintenta el cobro y al recuperarlo manda `membership.activated`, que lo devuelve a `active`.

⚠️ **El estado sale SIEMPRE del payload (`data.status`), nunca del nombre del evento.** Un `membership.activated` de una membership que ya está `past_due` no puede otorgar acceso por el solo hecho de llamarse "activated". Cubierto por test.

⚠️ **`metadata.supabase_user_id` es la llave que ata el pago a la cuenta, y por eso el checkout se crea server-side.** Un link de plan pelado (`plan_XXX`, o `<WhopCheckoutEmbed planId>`) es más barato de implementar pero **no tiene dónde poner el `user.id`**, y deja mapear solo por email — que se rompe la primera vez que alguien paga con un correo distinto al de su cuenta.

⚠️ **La firma se verifica sobre el CUERPO CRUDO.** `await req.text()`, nunca `req.json()`: volver a serializar cambia bytes (orden de claves, espacios) y la verificación falla. Se usa **`standardwebhooks@1.0.0`** y no `@whop/sdk`: Whop implementa el spec de Standard Webhooks, y su SDK propio está en **0.0.42** — pre-1.0 en un path de dinero.

⚠️ **La idempotencia sale de la TABLA, no del handler.** La entrega es at-least-once con reintentos ~3 días y el mismo `webhook-id`, así que el evento llega repetido. `whop_membership_id` es la **PK** de `user_entitlements` y el handler es un upsert — no hay lógica de deduplicación que se pueda olvidar en un refactor.

⚠️ **Un evento desconocido o incompleto se responde 200 igual.** Un no-2xx dispara reintentos por ~3 días y termina **desactivando el endpoint** (72 h + 10 fallos). Solo se devuelve 500 cuando el evento era bueno y la escritura falló.

⚠️ **La ruta del webhook tiene que quedar FUERA del gate de auth, y hoy lo está gratis** porque el matcher de `proxy.ts` excluye `/api/*`. Si alguien cubre las rutas de API con ese matcher, tiene que exceptuar `/api/whop/webhook` explícitamente.

⚠️ **NO VERIFICADO CONTRA UN EVENTO REAL: la forma del sobre.** `entitlementFromEvent` asume `{ id, type, data: <membership> }` con `metadata` colgando de `data`, y eso sale de la **prosa** de la doc, no de un payload de muestra. Si Whop anida distinto, la función devuelve `null` para TODO evento y el webhook responde 200 en silencio para siempre. El test no puede atraparlo porque construye el payload con la misma suposición. **Primer paso del smoke: mandar el evento de prueba desde el dashboard y loguear el cuerpo crudo una vez.**

⚠️ **`/suscripcion` YA NO REDIRIGE A QUIEN PAGÓ, y esa línea era un bug de tres planes.** Con plan único, *"ya tiene acceso → al dashboard"* era correcto: no había nada que hacer ahí. Con tres, deja la página de precios **inalcanzable justo para quien puede cambiar de plan** — el usuario del plan 1 que quiere subir al 3 rebotaba al dashboard, y el link "Cambiar de plan" de `/ajustes` no llevaba a ningún lado. Ahora la grilla se muestra siempre, con el plan actual marcado y sin checkout, y hay una salida explícita al panel (sin ella queda encerrado). La única redirección que sobrevive es la de `pago=ok`. Cubierto por `app/suscripcion/page.test.tsx`.

⚠️ **WHOP NO TIENE ENDPOINT DE CAMBIO DE PLAN, así que el cambio se hace CANCELANDO la anterior (`cancelPreviousMemberships`).** Verificado contra la doc el 2026-08-21: `PATCH /memberships/{id}` solo escribe `metadata` —no hay `plan_id`— y crear el checkout no acepta ningún parámetro de reemplazo. Contratar otro plan crea una suscripción NUEVA y la vieja seguiría cobrando. Antes eso se resolvía **pidiéndoselo al usuario** ("acuérdate de cancelar la anterior desde tu cuenta de Whop"); ahora lo hace el webhook con `POST /memberships/{id}/cancel`. Los ids salen de NUESTRA tabla, no de `GET /memberships`, así que no hace falta ningún scope de lectura de members — solo `membership:cancel`, que la key ya tiene (canario: `POST /memberships/mem_inexistente/cancel` devuelve **404**, no 403).

⚠️ **`cancellation_mode: 'at_period_end'`, NUNCA `immediate`.** `immediate` revoca acceso que el usuario YA PAGÓ. Con `at_period_end` no se pierde nada, y encaja con que `getAccess` se quede con el tier más alto: una **subida** aplica al instante (el nuevo tier ya es el más alto) y una **bajada** recién cuando termina el período pagado — la semántica normal de una suscripción, y exactamente lo que promete el aviso de confirmación.

⚠️ **Corre DESPUÉS de `saveEntitlement` y solo si el evento DA acceso.** Cancelar antes de que el pago esté confirmado dejaría al usuario sin ningún plan, y un `deactivated` no puede arrastrarse al resto de sus memberships. Es **best-effort**: un fallo se loguea y la respuesta sigue siendo 200 — devolver 500 haría que Whop reintente ~3 días y vuelva a correr todo el handler por algo ya guardado, y el peor caso de no cancelar es un cobro de más que se arregla a mano, bastante mejor que el endpoint desactivado. Por lo mismo, la entrega at-least-once hace que este cancel **se repita** (nuestra fila sigue `active` hasta que llegue el `deactivated`), así que un "ya estaba cancelándose" de Whop no se trata como error. Y el `fetch` lleva `AbortSignal.timeout`: en Node no hay timeout por defecto y esto corre dentro del handler — la misma lección que ya dejó `fetchKie`.

⚠️ **`Access.bajaA` existe porque el cambio deja DOS memberships vivas.** Al bajar de plan, `getAccess` sigue devolviendo el tier alto (correcto: está pagado), así que sin este campo alguien que acaba de pasarse a Start vería *"Legacy Empire"* en Mi cuenta y ninguna señal de que su compra se aplicó. Se calcula comparando la membership **más reciente** contra la de tier más alto; una subida no lo activa, porque ahí la nueva ya ES la más alta.

⚠️ **La confirmación de bajada vive en `PlanCTA`, el ÚNICO botón de checkout.** Lo comparten la tabla de precios (home y `/suscripcion`) y el bloque "Tu plan" de Mi cuenta — el cambio se puede hacer desde los dos lados y tiene que avisar igual en los dos. Es la única parte cliente de esa tabla: el resto se renderiza en el servidor y la frontera queda en el botón. Los números del aviso se derivan de `PLANS` y los rangos que se pierden de `lockedBuckets`, no escritos a mano. Sigue siendo un `<a>` y no un `<Link>`, por el prefetch.

⚠️ **El free trial se configura en el CHECKOUT LINK, no en el plan** — así que si algún día se habilita, comprobarlo mirando el plan no alcanza. Hoy no hay prueba por ningún lado (plan y checkout, los dos verificados) y ninguna pantalla la promete; ver arriba.

⚠️ **EL WEBHOOK SECRET DE WHOP EMPIEZA CON `ws_`, Y ASÍ COMO VIENE ROMPE LA VERIFICACIÓN ENTERA.** Medido el 2026-08-21 con el secret real: `new Webhook('ws_…')` **lanza** `Base64Coder: incorrect characters for decoding`, la ruta lo cacha y devuelve 401 a TODO evento — Whop reintenta ~3 días y termina desactivando el endpoint, y el único rastro es un log de "firma inválida" mientras nadie que pague recibe acceso. Las dos partes usan el secreto distinto: Whop firma con la clave = los BYTES LITERALES de la cadena `ws_…`, y `standardwebhooks` solo sabe quitar el prefijo `whsec_` y **base64-decodifica** el resto. `webhookKey` (`lib/whop.ts`) entrega el secreto entero base64-encodeado detrás de ese prefijo, así la librería recupera exactamente los bytes con los que Whop firmó. **Solo toca el formato `ws_`**: un `whsec_…` o un base64 pelado pasan intactos — cuando el adaptador era más ancho rompió los tests que ya existían. La conversión va en código y no en la variable de entorno para que en la env se pegue TAL CUAL lo que da Whop, sin un paso que alguien tenga que recordar al rotar el secreto.

⚠️ **Y NINGÚN TEST LO VEÍA, por la misma trampa que este documento ya describe para el sobre.** Los tests de la ruta firmaban con `new Webhook(SECRET)` — la MISMA librería que verifica, y con un base64 inventado — así que probaban que la librería es consistente consigo misma, no que entienda a Whop. El test nuevo firma como lo documenta Whop y sin la librería: HMAC-SHA256 sobre `{id}.{timestamp}.{cuerpo}` con la clave = los bytes del `ws_…`, en base64, header `webhook-signature: v1,<firma>`.

⚠️ **EL WEBHOOK SE CREA EN `api_version: "v1"` A MANO — el default de la API es v2, y los nombres de evento son OTROS.** Creado sin especificar versión, Whop devuelve un webhook **v2** cuyos eventos se llaman `membership_went_valid` / `membership_went_invalid`; `entitlementFromEvent` filtra por `membership.activated` / `membership.deactivated`, así que devolvería `null` para todo y el webhook respondería 200 sin escribir nunca una fila — éxito silencioso. El campo `api_version` **sí** se acepta al crear (`"v1"`), pese a que un error de la API sugiere lo contrario; `api_version_date` en cambio se rechaza con *"only supported for v1 webhooks"*, o sea no sirve para pedir v1. Hoy vive `hook_zgfEL7Ymjlf90` → `https://legacybrand.vercel.app/api/whop/webhook`, v1, con esos dos eventos y `resource_id` (**no** `company_id`, que la API rechaza) = `biz_tO37L4wdeqTzmj`.

⚠️ **El secret se muestra UNA sola vez, al crear.** `GET /webhooks/{id}` no lo devuelve. Perderlo obliga a borrar el webhook y crear otro.

✅ **Verificado en producción con un evento de prueba** (`POST /webhooks/{id}/test`): la ruta respondió con **nuestro propio 500 "no configurado"**, no con un redirect a `/login` — o sea `/api/whop/webhook` es alcanzable desde afuera y queda fuera del gate de auth, que hasta ahora era una suposición sobre el matcher de `proxy.ts`. ⚠️ Los eventos de prueba **no** quedan registrados en `GET /webhooks/{id}/deliveries` (devuelve vacío), así que esa ruta no sirve para inspeccionar el sobre: la forma de `{id, type, data}` sigue **sin verificar contra un payload real**, y la prueba pendiente es mandar el test event con el secret ya desplegado y ver un 200.

⚠️ **EL REDIRECT DEL NAVEGADOR Y EL WEBHOOK COMPITEN.** Al volver del checkout la fila puede no existir todavía. Con `redirect_url` apuntando a `/dashboard`, el gate rebotaba al paywall y alguien que acababa de pagar leía *"Activa tu acceso"* — o sea "mi pago falló", que es un pedido de reembolso. Por eso el checkout vuelve a **`/suscripcion?pago=ok`**, donde la página distingue ese caso; si el webhook ya llegó, redirige sola a `/dashboard`. El refresco es manual a propósito: un auto-refresh giraría para siempre si el webhook nunca llega.

**`hasAccess` fail-CLOSED ante error de DB**, al revés que `gen-quota.ts`. Ese módulo fail-abre a propósito porque es un backstop de **costo**; esto es un paywall.

**El gate vive en `app/(app)/layout.tsx`**, no en el middleware: ese layout ya hacía un round-trip para el `user`. `app/suscripcion/page.tsx` vive **fuera** del grupo `(app)` a propósito: adentro, el propio gate la bloquearía y sería un loop de redirects.

⚠️ **ESTO GATEA LA UI Y NADA MÁS — hueco PREVIO, no introducido por el paywall.** `/api/*` no pasa por `proxy.ts` ni por el layout. Las rutas caras **no piden sesión de ninguna clase**; lo que las topa es `checkGenQuota` (costo, no autorización). **Dos excepciones que sí autentican por su cuenta, porque lo que devuelven depende de quién pregunta:** `buscador-productos/search` (el plan decide qué se sirve) y `ajustes/kie-key` (escribe en la cuenta).

**Grandfathering por env (`WHOP_GRANDFATHERED_EMAILS`)**, no por filas sembradas. Son los 3 correos de `LOGIN_ALLOWLIST`, fijos y conocidos. **Entran como plan 3**: el cambio no puede quitarles nada de lo que ya usaban.

**Costos reales (`docs.whop.com/fees`):** 2.7% + $0.30 tarjeta doméstica, +1.5% internacional, +1% conversión de moneda — un cobro en PEN liquidado a USD cae en ~5.2% + $0.30. Disputa $15. Payout: ACH next-day $2.50, wire $23. **Banco local en Perú confirmado disponible** (2026-08-19). ⚠️ Pendiente de producto, no técnico: boleta/factura SUNAT — Whop es merchant-of-record US-céntrico.

**Env:** `WHOP_API_KEY`, `WHOP_PLAN_ID_1`, `WHOP_PLAN_ID_2`, `WHOP_PLAN_ID_3`, `WHOP_WEBHOOK_SECRET`, `WHOP_GRANDFATHERED_EMAILS`, `CREDITS_EPOCH`, y `WHOP_API_BASE` **solo** para apuntar al sandbox (`https://sandbox-api.whop.com/api/v1`) — producción es el default del código, así que en prod la variable **se omite**. De `WHOP_API_BASE` también se deriva el host del checkout cuando `purchase_url` viene relativo. **Schema:** `20260819000002_whop_entitlements.sql` + `20260820000001_plan_tiers.sql`.

### Qué pierde y qué conserva un usuario sin plan

Dos capas, y deciden cosas distintas — confundirlas es de dónde salieron dos bugs de esta rama:

| capa | pregunta | qué corta |
|---|---|---|
| `proxy.ts` → `updateSession` | ¿hay sesión? (+ `LOGIN_ALLOWLIST`) | `/dashboard` y `/tools/*` sin sesión → `/login` |
| `(app)/layout.tsx` | ¿hay suscripción activa? | `/dashboard` y `/tools/*` sin plan → `/suscripcion` |

**El middleware NO consulta la suscripción**, así que a quien se le vence el plan **no se le cierra la sesión**: sigue entrando, pierde las tools y conserva `/cuenta` y `/suscripcion`, que son las dos únicas pantallas donde puede resolver el problema. Las dos viven fuera del grupo `(app)` justamente por eso. Fijado en `lib/supabase/middleware.test.ts`.

⚠️ **Que una pantalla sea alcanzable no significa que se pueda LLEGAR a ella.** El enlace a `/cuenta` vive en `AppShell`, que solo se pinta dentro de `(app)` — o sea justo donde el usuario sin plan no entra. Sacar la página de `(app)` no sirve de nada si el único enlace queda del otro lado del gate: por eso `/suscripcion` linkea a `/cuenta` siempre, y el "volver" de `/cuenta` apunta a `/suscripcion` cuando no hay plan (si apuntara al panel, rebotaría al paywall). Los dos casos tienen test.

⚠️ **`LOGIN_ALLOWLIST` es un gate de acceso al hub ENTERO, anterior y ortogonal al paywall — y hoy está seteada en Vercel producción.** Si sigue puesta al desplegar la suscripción, un cliente que pague **no puede ni iniciar sesión**: el middleware lo trata como anónimo y lo manda a `/login?error=restricted`. Hay que vaciarla en el mismo deploy. Ver [[login-restriction-state]].

### Mi cuenta (`app/cuenta`)

Perfil (foto, nombre, teléfono), plan con cambio de plan en línea, créditos y la API key de KIE, en una sola pantalla. Reemplaza a `/ajustes`, que fue su primera versión y nunca se desplegó.

⚠️ **VIVE FUERA DEL GRUPO `(app)`, igual que el paywall y por el mismo motivo.** Ese layout rebota a `/suscripcion` a quien no tenga suscripción activa — así que un usuario en `past_due` (una tarjeta rechazada: pasa todos los meses) no podría entrar a ver ni arreglar su propia cuenta —ni cambiar de plan, que es exactamente lo que necesita hacer en ese momento—. Acá se autentica sola y el bloque del plan sabe decir "sin plan activo" sin inventar un contador de créditos. Es el mismo bug que la guarda vieja de `/suscripcion`, un directorio más allá.

**Las mutaciones son server actions (`app/cuenta/actions.ts`), no rutas de API** — el repo ya usa ese patrón en `app/actions/auth.ts`, y así los formularios no necesitan fetch ni JSON. ⚠️ **Cada action resuelve la sesión por su cuenta y escribe sobre `user.id`**: un action es un endpoint público, y si el usuario objetivo saliera del formulario cualquiera podría escribirle el perfil —o la API key de KIE— a otra cuenta. Cubierto por test.

⚠️ **EL BUCKET NO VALIDA NADA, así que el avatar se valida antes de tocarlo.** `ad-uploads` es `public: true`, con `file_size_limit` null y `allowed_mime_types` null (verificado contra el proyecto), y `mimeToExt` cae a `.jpg` para cualquier tipo desconocido — o sea un archivo arbitrario terminaría servido como imagen en una URL pública. El allowlist (PNG/JPG/WEBP) y el tope de 2 MB viven en el action. El path es `avatars/<user.id>.<ext>` con upsert, y la URL guardada conserva el `?v=<ts>` de `uploadToStorage`: sin ese cache-bust el navegador sigue pintando la foto anterior, porque el path no cambia.

⚠️ **La zona horaria de las fechas va FIJA.** Sin `timeZone`, `toLocaleDateString` usa la del SERVIDOR — UTC en Vercel, la del equipo en local — así que la misma renovación se veía en días distintos según dónde corriera. Se separan dos casos: `renewal_period_end` es un instante y se traduce a `America/Lima` (mismo criterio que `limaSearchDay`); `credits.desde` ya es un día de calendario en formato `YYYY-MM-DD`, que se parsea como medianoche UTC, así que se formatea en UTC — traducirlo a Lima lo correría un día hacia atrás.

**Perfil y avatar escriben sobre la MISMA fila**, así que `saveProfile` es un patch parcial: subir una foto no puede vaciar el nombre.

⚠️ **NO HAY HISTORIAL DE PAGOS, y es una decisión, no un olvido.** Mostrarlo de verdad exige capturar `payment.succeeded` del webhook, o sea una **segunda** suposición sobre la forma del sobre — la primera ya está documentada como no verificada. Si esa suposición falla, la tabla queda vacía para siempre y la pantalla muestra "aún no hay pagos" con toda naturalidad: éxito silencioso, el peor modo de fallo del proyecto. Mientras tanto se muestra lo que SÍ es dato real y ya está en `user_entitlements`: plan, estado de la membresía (los 9 de Whop, traducidos; uno desconocido dice "sin información" en vez de imprimir el string crudo) y fecha de renovación. Se agrega **después** del smoke que confirme el payload, y ahí es una función.

⚠️ **NO HAY DATOS DE FACTURACIÓN, y estuvieron.** Se construyeron (razón social, RUC/DNI, dirección) y se **eliminaron** el 2026-08-20 con sus columnas (`20260820000003_drop_billing.sql`, aplicada con `user_settings` verificadamente vacía): los pagos se hacen solo por Whop, que es merchant-of-record y emite los comprobantes, así que eran datos que nadie iba a leer — tanto que la propia pantalla tenía que aclararle al usuario que todavía no se usaban. Se dropearon en vez de dejarlas muertas por el precedente de `testimonial_avatars`, que sigue en la base sin que nada la toque. **No las reintroduzcas** sin que exista antes quien emita el comprobante.

**El cambio de plan se hace DESDE acá, no solo desde el paywall.** El bloque "Tu plan" muestra el plan actual en grande (estado con color según los 9 de Whop, renovación) y debajo los otros dos como opciones con su checkout — `<a>` y no `<Link>`, porque Next prefetchea los Link y esa URL crea una checkout configuration en Whop. A un grandfathered no se le ofrece ninguna: ya tiene todo.

⚠️ **`ESTADO[status] ?? fallback`, NUNCA `(status && ESTADO[status]) ?? fallback`.** Con `status` en string vacío el `&&` devuelve `""`, que no es nullish, así que el `??` no se dispara y la insignia queda en blanco en vez de decir "sin información". Lo cazó el typecheck, no un test.

**Contador de créditos en la barra del panel** (`CreditosPill`, AppShell), al lado del avatar y enlazado a `/cuenta`. ⚠️ Se pinta en el render de servidor de cada página: **se actualiza al navegar, no en vivo**, así que generar una imagen sin cambiar de página deja el número viejo. Es aceptable porque el valor que manda lo impone el servidor en `checkGenQuota` — esto solo informa.

⚠️ **El umbral de "quedan pocas" (`creditosBajos`) vive en `@ph/shared/plans.ts`, no en `lib/credits.ts`.** Lo necesitan la página (server) y el pill (client), y `lib/credits.ts` arrastra `next/headers` y el cliente de Supabase: importarlo desde el cliente metería todo eso en el bundle del navegador. El piso de 3 es para los planes chicos — el 15% de 30 son 4,5, así que sin él el plan 1 avisaría recién con 4 restantes.

**Schema:** `20260820000002_user_profile.sql` (columnas de perfil) + `20260820000003_drop_billing.sql` (quita las de facturación).

### Créditos de imagen (`lib/credits.ts`)

30 / 100 / 180 imágenes por período según el plan. Cada imagen generada consume 1.

**No hay tabla de saldo: el saldo ES el conteo de filas de `ph_gen_usage` en el período.** Esa tabla ya tenía una fila por generación exitosa (`user_id`, `kind`, `gen_day`), así que no existe el estado desincronizado clásico ("descontó el crédito pero la imagen falló").

⚠️ **`CREDIT_KINDS` NO ES `IMAGE_KINDS`, y son dos listas a propósito.** `IMAGE_KINDS` (el cap per-step de `gen-quota.ts`) incluye `video-character`, `video-generation` y `video-forensic` porque son igual de caros que una imagen. Los créditos NO: el video lo paga el usuario con su propia key de KIE y viene incluido en los tres planes, así que no puede comerse las imágenes que se vendieron para anuncios, branding y landing. Reusar una lista para las dos cosas es exactamente ese bug. Cubierto por un test que lo afirma kind por kind.

`anuncios-image` lo registran tanto `generate-image` como `refine-image`, así que **una regeneración cuesta un crédito** — es lo pedido ("cada imagen generada consume 1"). El cap per-step (1 gen + 3 regens) sigue vigente en paralelo: son dos límites ortogonales.

⚠️ **El período se ancla al DÍA DEL MES de `renewal_period_end`, no al mes calendario.** Quien se suscribe el 28 recibiría sus créditos el 28 y otra tanda el 1 — dos meses de créditos por un pago. Y se calcula desde el día del mes en vez de restarle un mes a la fecha guardada para que se **auto-corrija** si el webhook de renovación se demora: con la resta, una `renewal_period_end` vencida abriría una ventana infinita y el usuario no volvería a recibir créditos nunca. Sin fecha (grandfathered) el ancla es el día 1.

⚠️ **`CREDITS_EPOCH` (default `2026-08-20`) es el piso absoluto del conteo.** Sin él, el primer período de un usuario que ya venía usando el hub —los grandfathered, que arrastran meses de `ph_gen_usage`— arrancaría con los créditos gastados de entrada. Es una fecha y no una migración que borre filas: esas filas siguen alimentando el backstop global diario.

⚠️ **`checkCredits` resuelve la suscripción desde la SESIÓN, no desde el `userId` que le pasan.** El tier de los grandfathered depende del email y ese dato solo lo tiene `getUser()`. Efecto útil: **16 de las 17 rutas caras no cambiaron de firma** — el gate entró entero dentro de `checkGenQuota`. Sin sesión no hay créditos que contar y se deja pasar: no es un agujero nuevo (esas rutas nunca pidieron sesión), y lo que las topa ahí sigue siendo el backstop global diario.

⚠️ **La excepción es el stream de branding, y el motivo vale para cualquier ruta SSE futura.** `generador-branding/generar` llama a `checkGenQuota` DENTRO del `ReadableStream`, o sea con los headers de la respuesta ya enviados — su propio comentario lo dice, por eso `ensureUserId()` corre afuera. Leer cookies ahí adentro es frágil, y `checkCredits` fail-abre en silencio si `getUser()` falla: los créditos simplemente no se cobrarían en la tool que más imágenes genera. Esa ruta resuelve `currentCreditOwner()` **antes** de abrir el stream y se lo pasa a `checkGenQuota`. Se pasa el **owner** (id + plan) y no el saldo a propósito: el saldo se recuenta contra la DB en cada etapa, así que las 4 imágenes de una corrida de branding sí se descuentan entre sí.

⚠️ Tope conocido: `creditStatus` lee hasta 5.000 filas y filtra en JS. Los kinds de texto comparten la tabla, así que un usuario muy pesado podría pasarse y quedarse con créditos sin contar. Falla ABIERTO, que es el lado correcto para un control de costo; el upgrade es contar en Postgres con un `or(...like...)`.

Fail-**OPEN** ante error de DB, igual que el resto de `gen-quota`: es control de costo, no el paywall.

### BYOK: la API key de KIE es del usuario, y NO HAY KEY GLOBAL

El render de video lo paga el usuario con su cuenta de KIE — por eso el generador de video viene incluido en los tres planes. La key se carga en **`/cuenta`** (`user_settings.kie_api_key`) y se pasa por parámetro a `createVideoTask`/`getTaskDetail` (`kie.ts`) y a `generateImage` (`nano-banana.ts`).

⚠️ **EL AVATAR Y LOS FRAMES SE COBRABAN AL HUB, y esa era la fuga real (arreglado 2026-08-24).** El render sí era BYOK desde el principio, pero `nano-banana.ts` tenía su propio `apiKey()` leyendo `process.env.KIE_API_KEY` **sin parámetro y sin excepción**: TODA generación de avatar (`character/route.ts`) y TODO fotograma frontera (`generate-lotes/route.ts`) — que son tareas pagadas de KIE igual que el video — salían de la cuenta del hub mientras el clip salía de la del usuario. Son dos `Authorization` en ese archivo (crear la tarea y sondearla), no uno.

⚠️ **Y `resolveKey` caía a `process.env.KIE_API_KEY`, así que ese respaldo tapaba el agujero en silencio.** El fallback se eliminó **entero, también para dev**: un usuario sin key ya no renderiza a costa del hub, falla. Un respaldo silencioso es el peor modo de fallo posible para un control de costo — mientras estuvo puesto, nada distinguía "el BYOK funciona" de "lo está pagando el hub". `SIN_KEY` (kie.ts) es el mensaje único de las dos rutas y de la pantalla.

⚠️ **La pertenencia está cerrada por construcción, y conviene saber por qué.** La key se resuelve con `currentKieKey()` → `getUser()` (identidad de cuenta) y la fila con `getVideoSession(id, readUserId())`, que filtra por `.eq('user_id', uid)` y prefiere el id autenticado. O sea la sesión y la key resuelven a la MISMA identidad: la key de A no puede pagar el render de B. El único hueco era el camino sin sesión (`readUserId` cae a la cookie anónima y `currentKieKey` devuelve null), que antes entraba por el fallback del env y hoy da 400.

⚠️ **La key se resuelve y se valida ANTES del gate de cuota, y el orden es el arreglo.** Si se resolviera después, `checkGenQuota` ya habría escrito la fila y la primera llamada a KIE moriría con un 401: el usuario perdería una generación de su cuota por no haber cargado una key. Vale para `generate-lotes` (`video-generation`) y ahora también para `character` (`video-character`), que tenía el orden al revés. Sin key las dos responden **400 sin cobrar cuota, sin llamar a KIE y sin tocar la sesión**. Cubierto por test.

⚠️ **`lote-status` NO puede reventar por falta de key.** En KIE una tarea solo la ve la cuenta que la creó, así que sin key no hay a quién preguntarle — pero el sondeo es lo único que se salta: la ruta sigue recalculando `done` y corrigiendo la columna cacheada `render_done`. Un `return` temprano parecía la solución obvia y rompía justamente esa reconciliación (lo cazaron dos tests que ya existían). El caso real son los renders creados cuando existía la key global del hub.

⚠️ **El gate de la UI está en la ENTRADA de la tool, no en el paso de render** (`KieKeyRequired`, server component sobre `page.tsx` y `wizard/page.tsx`). El análisis forense de la referencia lo paga el HUB (Gemini, ~14 MB de video) y es el paso 1; el avatar es la primera llamada a KIE y es el paso 6. Dejar entrar sin key le quema al usuario el paso caro del hub para estrellarlo cinco pasos después. Un solo chequeo cubre todo el gasto río abajo. `sesion/[id]` (vista de solo lectura de un render viejo) queda FUERA del gate a propósito: sin key no se genera nada, pero mirar lo ya hecho no cuesta nada.

⚠️ **El aviso de bienvenida (`KieKeyPrompt`) sale del layout de `(app)`, con la condición `tiene plan && no tiene key`.** No hay columna nueva ni "has_seen_modal": el "más tarde" es una bandera de `localStorage` y la condición se apaga sola al guardar la key. **No distingue "acaba de pagar" de "lleva meses sin key"**, y no debe: detectar la recencia del pago exigiría capturar `payment.succeeded` del webhook, o sea una segunda suposición sobre la forma del sobre que este documento ya marca como no verificada. No se pinta en `/cuenta` ni en `/suscripcion` porque viven fuera del grupo — o sea no molesta justo donde se arregla.

⚠️ **La key se guarda en claro** (RLS on sin políticas → solo el service role, el mismo blindaje que el resto del proyecto) y **nunca vuelve al cliente**: la pantalla muestra `maskKey` (los últimos 4 caracteres). Una key en el DOM es una key en el historial del navegador y en cualquier captura de pantalla. Por eso `UserProfile` —lo que sí viaja a la pantalla— no la incluye, y el layout solo recibe el booleano.

### Panel de usuarios (`/admin`) — roles y soporte

Lista de usuarios, ficha por usuario, consumo y acciones de soporte. Roles en `user_settings.role`: **`admin`** y **`operador`** (migración `20260821000001_user_roles.sql`).

⚠️ **NO HAY MATRIZ DE PERMISOS, y es una decisión.** Con un solo rol privilegiado, una tabla de permisos cuesta una tabla, un join y una pantalla para responder exactamente lo mismo que un `= 'admin'` — es la interfaz-con-una-implementación que el repo evita en otros lados. Se convierte en permisos cuando exista un TERCER rol que necesite una rebanada distinta (soporte que lee pero no otorga acceso), no antes.

⚠️ **EL DEFAULT DE LA COLUMNA NO ALCANZA: un usuario que nunca guardó nada NO TIENE FILA en `user_settings`.** La ausencia también significa `operador`, así que `getRole` trata el null como el valor por defecto. Y **el primer admin no puede salir de esa columna** —nadie podría nombrarse a sí mismo—: sale de **`ADMIN_EMAILS`** (env, lista de correos separados por coma), mismo patrón y mismo argumento que `WHOP_GRANDFATHERED_EMAILS`. Es además la salida de emergencia si alguien se quita el rol por error.

⚠️ **`/admin` VIVE FUERA DEL GRUPO `(app)`, y acá el motivo es más fuerte que en `/cuenta`.** Ese layout redirige a `/suscripcion` a quien no tenga suscripción activa: un admin sin plan —la env de grandfathering vaciada, un segundo admin que nunca compró, o el dueño con la tarjeta rechazada (`past_due`, pasa todos los meses)— quedaría encerrado justo fuera de la única pantalla capaz de arreglar entitlements. **El acceso de administración no puede depender de tener un plan pagado.** A quien no es admin se le responde **404**, no un "no tienes permiso": ese mensaje confirma que la ruta existe y a quién buscar.

⚠️ **LAS MUTACIONES SON SERVER ACTIONS, NUNCA RUTAS DE `/api/*`.** Esas rutas no pasan por `proxy.ts` ni por ningún layout (ver "esto gatea la UI y nada más"), así que un endpoint de API que otorgue plan sería escalada de privilegios abierta a internet. Cada action arranca por `currentAdmin()`, que resuelve la sesión por su cuenta y verifica el rol contra la DB.

⚠️ **Y acá el `userId` del formulario SÍ se usa — al revés que en `app/cuenta/actions.ts`.** En "Mi cuenta" el objetivo es siempre el de la sesión y aceptarlo del cliente dejaría que cualquiera le escriba a otro. En administración el objetivo es otra persona por definición: lo que no puede venir del cliente es el **permiso**. La distinción está fijada por el test `'sin rol de admin no se escribe nada'`, que cubre las cuatro acciones.

**Lo que el panel muestra:**

- **Lista** — correo, nombre, rol, plan, estado de acceso, alta y último ingreso. ⚠️ **El correo no está en ninguna tabla nuestra**: `user_entitlements` guarda un `user_id` uuid y `user_settings` tampoco lo tiene, así que la única fuente es `auth.users` vía `auth.admin.listUsers()` — y **eso no se puede joinear con PostgREST**. Por eso el cruce va en memoria: 3 consultas fijas sin importar cuántos usuarios haya. ponytail: se recorren hasta 10 páginas de 1000; pasado eso la lista se corta y hay que paginar de verdad.
- **Estado de acceso** — `access` en null no distingue "nunca pagó" de "se le venció la tarjeta", y ésa es justo la diferencia que decide qué hacer con esa persona. Por eso `AdminUser.ultimoEstado` conserva el último estado conocido aunque ya no dé acceso.
- **Consumo** — `ph_gen_usage` en los últimos 30 días, agrupado por tipo y por usuario. **Es la única visibilidad que existe del costo real de Gemini/OpenAI.** ponytail: UNA consulta con tope de 20.000 filas y todo el agrupado en JS; el backstop global permite 500/día, así que cubre 40 días a tope absoluto.
- **Actividad** — sesiones por tool sobre las 5 tablas de sesión (`sessions`, `video_sessions`, `landing_sessions`, `branding_sessions`, `calc_sessions`). Una consulta por tabla con `count: 'exact'` + `limit(1)` ordenado, así el total y la fecha de la última salen en un solo viaje. Una tabla que falle cuenta 0 en vez de romper la ficha: `sessions` se creó en una migración condicional y puede no existir en todos los entornos.

**Acciones de soporte:**

⚠️ **EL ACCESO DE CORTESÍA ES EL FAILSAFE QUE NO EXISTÍA.** El webhook de Whop tiene su forma de sobre documentada como **no verificada** contra un evento real: si falla, alguien paga y no recibe acceso, y hasta ahora la única salida era SQL a mano. La cortesía escribe una fila de `user_entitlements` con `whop_membership_id = 'manual:<userId>'`, `status: 'active'` y `renewal_period_end` en null.

- **El id es DETERMINISTA por usuario**, y eso es lo que hace idempotente el otorgar: `whop_membership_id` es la PK, así que otorgar dos veces actualiza la misma fila en vez de dejar dos cortesías sueltas. Con un uuid nuevo cada vez habría que revocarlas de a una.
- **Convive con la membership real sin pisarla**: son dos filas del mismo `user_id` y `pickAccess` se queda con el tier más alto de las vivas.
- **`renewal_period_end` va en null a propósito**: no hay período pagado que anclar, y `periodStart` (credits.ts) ancla los créditos al día 1, que es lo que ya hace con los grandfathered.
- **Revocar BORRA la fila `manual:`**, no la marca cancelada: una fila muerta solo confunde la ficha, y la membership real de Whop —si existe— vuelve a mandar sola. ⚠️ **No toca las memberships reales**, y no debe: el webhook es su única escritura, así que "revocarlas" acá duraría hasta el siguiente evento. Cancelar un plan pagado se hace en Whop.
- **`otorgarAcceso` rechaza un tier inválido en vez de normalizarlo.** `toTier` cae al plan 1 ante cualquier basura, y acá eso sería regalar el plan equivocado en silencio.

⚠️ **LOS CRÉDITOS DE CORTESÍA SON UN SUMANDO (`user_settings.credit_bonus`), NO UN "RESET" DEL PERÍODO.** El saldo ES el conteo de filas de `ph_gen_usage` (credits.ts), así que resetear significaría **borrar esas filas** — las mismas que alimentan el backstop global diario y la única visibilidad del costo. Sumar compensa al usuario sin destruir el dato, y además permite regalar 20 en vez de solo volver a cero. `creditStatus` lo lee y lo suma al límite del plan, así que el usuario lo ve en `/cuenta` y en la píldora de la barra. ponytail: es una lectura por PK más en el gate de generación; si pesa, el upgrade es resolverlo junto con `access` en `currentCreditOwner`.

⚠️ **Nadie se quita a sí mismo el rol de admin.** Con un solo admin real eso deja el panel sin dueño y recuperarlo exige tocar la env o la DB a mano. El costo de la guarda es un `if`; el del incidente, un deploy.

**`pickAccess` se extrajo de `getAccess` (whop.ts) y es la razón de que el panel no duplique la regla de dinero.** El panel lee las filas de todos los usuarios de una sola vez y las agrupa en memoria, pero quién manda entre varias memberships tiene que decidirse en UN solo lugar: dos definiciones es cómo el panel termina mostrando un plan distinto del que el hub sirve. `getAccess` ahora delega en ella; el caso grandfathered se queda afuera porque depende del email, no de las filas.

**Env:** `ADMIN_EMAILS`. **Schema:** `20260821000001_user_roles.sql` (columnas `role` y `credit_bonus` sobre `user_settings`).

