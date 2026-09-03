import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession, claimFreshLotes } from '@/lib/video-ads/db'
import { createVideoTask, resolveKey, clampDuration, KIE_PROMPT_MAX, SIN_KEY, type VideoImage } from '@/lib/video-ads/kie'
import { currentKieKey } from '@/lib/user-settings'
import { anchorSpecs, generateAnchorImages } from '@/lib/video-ads/anchors'
import { personajesDe, hablantesPorTiempo, vozEnOffPorTiempo } from '@/lib/video-ads/personajes'
import { enProsa, corteMuestraPersona } from '@/lib/video-ads/forensic'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { generateImage } from '@/lib/gemini'
import { planoPorTiempoDe, groupIntoLotes, buildLotePrompt, camaraDeLote, type Lote } from '@/lib/video-ads/lotes'
import { totalDuration, resumeSeed, mergeRescue, isPaidResume, scriptFingerprint, renderDone } from '@/lib/video-ads/render-lotes'
import { AdaptedScriptSchema, type AdaptedScript } from '@/lib/video-ads/adapt'
import { extractPending } from '@/lib/video-ads/pending'
import { checkGenQuota, checkGlobalBackstop, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { STEP } from '@/lib/video-ads/steps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Guarda el resultado (completo o parcial) sin dejar que un fallo de escritura se
 * lleve puesto el `taskId` de tareas ya pagadas (fix round 1): si `updateVideoSession`
 * lanza dentro del catch de arriba, ese throw escapaba del handler y los identificadores
 * ya pagados se perdían sin dejar rastro. Acá quedan al menos logueados.
 */
async function saveRescue(id: string, lotes: Lote[], frames?: string[]) {
  try {
    // `render_done` (fix round 5) se recalcula con la MISMA fórmula que `lote-status`
    // usa para su propio `done` — acá casi siempre da `false` (los lotes recién
    // creados quedan `waiting`, no `success`/`fail`), pero escribirlo explícito evita
    // que una sesión que se está re-renderizando (`generate-lotes` volvió a tocar
    // `lotes` tras un `render_done: true` de una vuelta anterior) se quede mostrando
    // "listo" en el dashboard mientras el nuevo intento sigue en curso.
    // `Math.round`: la columna `duration` es `int` en Postgres y las duraciones dejaron
    // de ser enteras cuando `repairCutTiming` empezó a repartir décimas entre los cortes
    // (un guión real sumó 46.8). Sin redondear, Postgres rechaza la fila entera con
    // "invalid input syntax for type integer" y el render no arranca. Redondear y no
    // migrar la columna a numeric es deliberado: nadie lee este campo, es un resumen
    // para el dashboard, y la décima de segundo no significa nada ahí.
    // `frames` se escribe junto a `lotes` y no aparte: son el mismo artefacto: si una
    // reanudación leyera lotes de un intento y frames de otro, el clip pendiente
    // arrancaría donde no terminó el anterior.
    await updateVideoSession(id, {
      step: STEP.LOTES, lotes, duration: Math.round(totalDuration(lotes)),
      render_done: renderDone(lotes), ...(frames ? { frames } : {}),
    })
  } catch (err) {
    console.error(
      // Con el id de sesión: un mp4 recuperado a mano desde KIE hay que devolvérselo a
      // ALGUIEN, y sin el id eso depende de encontrar el request que lo generó.
      `[video-ads/generate-lotes] sesión ${id}: no se pudo guardar el rescate; taskId ya pagados:`,
      lotes.filter((l) => l.taskId).map((l) => l.taskId),
      err,
    )
  }
}

// Un render por lote sigue siendo una llamada pagada, pero la CUOTA (fix round 2) se
// mide por VIDEO, no por lote: 1 generación + 2 regens sin importar cuántos lotes
// tenga el guión. Un guión de 2 lotes no se queda sin regeneraciones y uno de 4 no
// se topa antes de arrancar — el tope real es "¿cuántas veces intentaste generar ESTE
// video?", no "¿cuántas llamadas a KIE hiciste?". Se sigue registrando una fila por
// lote (kind 'video-render', ver gen-quota.ts) para conservar la visibilidad del
// costo real y el backstop global diario, pero esa fila ya no topa nada por sí sola.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await readUserId()

  const session = await getVideoSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  if (!session.adapted || !session.consistency_block || !session.voice_profile)
    return NextResponse.json({ error: 'Completa los pasos anteriores' }, { status: 409 })
  // El personaje del render es el avatar GENERADO. `character_url` es la foto de
  // referencia que subió el usuario; se conserva como fallback para las sesiones
  // anteriores a `avatar_url`, que guardaban las dos cosas en la misma columna.
  // Los personajes del anuncio. Una sesión anterior da UNO, armado con las columnas
  // singulares, así que todo lo de abajo se comporta igual que antes.
  const gente = personajesDe(session)
  const personaUrl = gente[0]?.avatarUrl ?? session.avatar_url ?? session.character_url
  if (!personaUrl || !session.product_url)
    return NextResponse.json({ error: 'Faltan las imágenes de personaje y producto' }, { status: 409 })

  // El guión guardado pasa por schema en cada escritura previa y debería llegar
  // siempre válido, pero es dato de DB, no de este request: un `.parse` sin try acá
  // sería un ZodError sin manejar (500 opaco de Next) en vez de un JSON de error
  // controlado, igual que se evita más abajo para `buildLotePrompt`.
  let adapted: AdaptedScript
  try {
    adapted = AdaptedScriptSchema.parse(session.adapted)
  } catch (err) {
    console.error('[video-ads/generate-lotes] guión adaptado corrupto', err)
    return NextResponse.json(
      { error: 'El guión guardado no es válido. Vuelve a adaptarlo desde el paso anterior.' },
      { status: 500 },
    )
  }
  // Se mira el TEXTO, no solo la lista del modelo: en una corrida real devolvió la
  // lista vacía habiendo dejado marcadores. Un marcador que llega al render se lee en
  // voz alta dentro de un lote ya pagado.
  const marcadores = extractPending(adapted.guionFinal)
  if (marcadores.length || adapted.variablesPendientes.length)
    return NextResponse.json(
      { error: `El guión tiene variables sin completar: ${[...new Set([...marcadores, ...adapted.variablesPendientes])].join(', ')}` },
      { status: 409 },
    )

  // ⚠️ Estas NO son las imágenes que recibe el render: son las FUENTES de las que salen
  // los keyframes, y entran en la huella. Las del render son los frames frontera de cada
  // lote, que se generan más abajo y cambian de URL en cada corrida — meterlas en la
  // huella la volvería distinta siempre y `isPaidResume` no reanudaría nunca. Lo que
  // importa para saber si el contenido cambió es de qué avatar y qué producto salieron.
  const images: VideoImage[] = [
    { url: personaUrl, role: 'la persona' },
    { url: session.product_url, role: 'el producto' },
  ]

  // Se resuelven una sola vez, acá: son parte del prompt de CADA lote y también de la
  // huella de contenido, así que calcularlos dos veces (una para hashear y otra para
  // renderizar) sería la forma más fácil de que la huella deje de describir lo que
  // realmente se renderizó.
  const productDesc = session.product_scan?.productDescription ?? adapted.tomas[0]?.producto ?? 'el producto'
  // El `fondo` del forense incluye la iluminación (su prompt la pide ahí dentro), por
  // eso el prompt del lote lo rotula "ESCENARIO E ILUMINACIÓN".
  // ⚠️ YA NO ENTRA AL PROMPT DEL LOTE — desde que el escenario lo define la imagen (ver
  // `buildLotePrompt`), su ÚNICO consumidor es `scriptFingerprint`. Se conserva prosificado
  // y con su default a propósito: es un valor estable por sesión, y dejarlo en la huella
  // solo hace la reanudación MÁS conservadora (re-analizar la referencia invalida un
  // parcial), que es el lado correcto. Su lugar vivo en el pipeline es el prompt del
  // AVATAR, en `character.ts`.
  const escenario = enProsa(session.forensic_analysis?.fondo) || 'interior con luz natural'
  const cortes = session.forensic_analysis?.cortes ?? []
  // ⚠️ NO se pasa `cortes[0].camara` como fallback: mandar el encuadre del corte 1 a todos
  // los lotes es el defecto que `camaraDeLote` existe para arreglar, y la línea `CAMERA:`
  // del prompt lo afirma como un hecho. Sin emparejamiento no sabemos el encuadre, así que
  // el default de `camaraDeLote` no declara ninguna escala. Ver `CAMARA_SIN_DATO`.

  // ⚠️ EL MAPA DE PLANOS YA NO CIERRA LOTES por defecto (2026-08-24): `groupIntoLotes`
  // pasó a `maxPlanos = Infinity`, así que un clip de hasta 30 s concatena varias escenas
  // del original. Lo que hace viable ese cambio son las IMÁGENES ANCLA — cada escena
  // nueva del clip lleva su propio fotograma de referencia, que es justo lo que faltaba
  // cuando se midió que un clip con dos encuadres se renderizaba con uno.
  //
  // El mapa se sigue pasando porque es el dial: bajar `maxPlanos` a 1 devuelve el corte
  // por encuadre (máxima fidelidad, ~4× llamadas pagadas) sin tocar nada más. Y lo
  // consumen igual `anchorSpecs` (para saber dónde empieza cada escena) y el plano por
  // toma del prompt.
  const planoPorTiempo = planoPorTiempoDe(cortes)
  // ⚠️ La CLASE de toma (persona / solo producto) cierra el lote: un beat de b-roll que
  // comparte clip con una toma hablada se lo come el habla. Medido sobre 25 sesiones: los
  // lotes mezclados pasan de 8 a 0 por 1,07× de llamadas. Ver `clasePorTiempo`.
  const clasePorTiempo = new Map(cortes.map((c) => [c.tiempo, corteMuestraPersona(c)] as const))
  // ⚠️ Y `maxPlanos = 1`: UN encuadre por clip. Estaba en `Infinity` —o sea el mapa se
  // calculaba y no cerraba nada— y el resultado es el salto duro que reportó el dueño del
  // repo: un clip que empieza en plano de persona y termina en un macro del frasco a
  // pantalla completa. La frontera de CLASE no lo caza porque en ese plano la persona
  // sigue en cuadro; lo que cambia es el TEMA del encuadre.
  // Medido sobre 135 lotes: los que mezclan dos encuadres pasan de 18 a 0 por 1,15× de
  // llamadas. Y cada clip se renderiza de una sola pasada, así que pedirle dos encuadres
  // es pedirle un corte de montaje dentro de un plano-secuencia: devuelve uno de los dos.
  const agrupados = groupIntoLotes(adapted.tomas, planoPorTiempo, 1, clasePorTiempo)
  if (!agrupados.length) return NextResponse.json({ error: 'El guión no tiene tomas' }, { status: 409 })

  // Una cámara por lote, con los planos de SUS cortes: el spec pide replicar el
  // lenguaje visual del original y antes acá se mandaba el encuadre del corte 1 a
  // todos los lotes. Índice a índice con `agrupados` — y por tanto con `base` y con
  // `seed`, que son `agrupados` mapeado.
  const camaras = agrupados.map((l) => camaraDeLote(l, cortes))

  // Huella del contenido de ESTE intento (guión + personaje + voz + producto +
  // escenario + cámara + imágenes). Se estampa en todos los lotes que se persistan
  // —incluidos los placeholders `idle` de un rescate parcial— para que la próxima
  // llamada pueda comprobar, sin adivinar, si está reanudando el MISMO video o
  // empezando otro distinto (ver `isPaidResume`).
  // Quién habla en cada toma y cuáles son narración por encima. Se resuelven ACÁ, antes
  // de la huella, y no más abajo junto a los frames: los dos cambian el prompt del lote
  // (el rótulo `VOZ EN OFF`, la orden de no mover la boca, la atribución `P2 (padre)
  // dice:`) y deciden qué frames se generan, así que tienen que ENTRAR en el hash.
  const quien = hablantesPorTiempo(cortes, gente)
  const enOff = vozEnOffPorTiempo(cortes)

  const huella = scriptFingerprint({
    niche: session.niche,
    lotes: agrupados, consistencyBlock: session.consistency_block, productDesc,
    escenario, camaras, voz: session.voice_profile, movimiento: session.motion_profile,
    personajes: gente, images, quien, enOff,
  })
  const base: Lote[] = agrupados.map((l) => ({ ...l, scriptHash: huella }))

  // Reanudar es explícito (`{ resume: true }` en el body), no automático — si no, un
  // doble submit (doble clic, StrictMode) o un reintento tras un fallo parcial pasan
  // AMBOS por acá, recalculan `base` desde cero y crean tareas NUEVAS para lotes que
  // ya tienen `taskId`: el taskId viejo, ya pagado, queda huérfano sin forma de verlo.
  // La UI (Section6Lotes) manda `resume: true` tanto para "reintentar" un render que
  // quedó a medias como para "generar otra versión" después de volver al paso
  // anterior y re-adaptar el guión — en los dos casos la sesión YA tiene `lotes`
  // guardados. Solo el primer render de una sesión nueva (`lotes` en null) va sin el
  // flag. Esta rama no decide sola si eso cuenta como reanudación real o como
  // generación nueva que cobra: `resume` es la INTENCIÓN del cliente, `isPaidResume`
  // más abajo compara la huella del contenido para decidir el HECHO. Body vacío o
  // no-JSON se trata como "no es un reintento explícito", no como error.
  let resume = false
  try {
    const body: unknown = await req.json()
    resume = !!body && typeof body === 'object' && (body as { resume?: unknown }).resume === true
  } catch {
    /* sin body o no-JSON */
  }

  // ⚠️ Este guard es la razón por la que, MIENTRAS EL CONTENIDO NO CAMBIE, las "+2
  // regens" de VIDEO_GENERATION_LIMIT son inalcanzables dentro de una sesión (nota de
  // diseño completa en gen-quota.ts, junto a esa constante): en cuanto la primera
  // llamada crea una tarea, todo POST sin `resume` cae acá (409) y todo `resume` de
  // ese mismo contenido entra por `isPaidResume` sin volver a cobrar. El camino que SÍ
  // registra una segunda `video-generation` es re-hacer el guión (o el personaje o la
  // voz) y volver a llamar: ahí la huella deja de coincidir, no es reanudación, y se
  // cobra como lo que es — un video nuevo. Ese camino está topado por el límite, que
  // es exactamente para lo que existe.
  const existentes = session.lotes ?? []
  if (existentes.some((l) => l.taskId) && !resume) {
    return NextResponse.json(
      {
        error: 'Esta sesión ya tiene un render en curso o parcialmente completado. Reanúdalo en vez de reiniciar.',
        lotes: existentes,
      },
      { status: 409 },
    )
  }

  // `resume` es la INTENCIÓN del cliente; `reanuda` es el HECHO — solo es una
  // reanudación real si de verdad hay algo pagado Y lo guardado lleva la huella del
  // contenido que se va a renderizar ahora (fix rounds 2, 3 y 4; el porqué completo,
  // incluido qué entra en la huella, está en `isPaidResume`/`scriptFingerprint`,
  // render-lotes.ts).
  const reanuda = isPaidResume(resume, existentes, base, huella)

  // `wasVirgin`: la fila nunca fue tocada por esta ruta (`lotes` sigue en `null` en
  // la DB, no `[]` ni un array de placeholders de un intento fallido). Es la única
  // situación en la que el claim atómico de abajo puede aplicar sin rechazar de
  // rebote un reintento legítimo (ver `claimFreshLotes` en db.ts).
  const wasVirgin = session.lotes == null

  const seed: Lote[] = reanuda ? resumeSeed(base, existentes) : base
  const pendientes = seed.filter((l) => !l.taskId)
  // Nada por crear: o reanuda una sesión ya completa, o es un doble submit sobre una
  // que terminó justo antes — de cualquier modo, no hay nada pagado de más que hacer.
  if (!pendientes.length) return NextResponse.json({ lotes: seed })

  // BYOK: el render lo paga el usuario con SU cuenta de KIE. La key se resuelve y se
  // valida ACÁ, ANTES del gate de cuota: `checkGenQuota` escribiría la fila de
  // `video-generation` y después el primer `createVideoTask` moriría con un 401 de
  // KIE — o sea el usuario perdería una generación de su cuota por no haber cargado
  // una key. El orden es la única forma de que eso no pase.
  let kieKey: string
  try {
    kieKey = resolveKey(await currentKieKey())
  } catch {
    return NextResponse.json(
      { error: SIN_KEY },
      { status: 400 },
    )
  }

  // El backstop global diario aplica SIEMPRE que se vaya a llamar a KIE — reanudar
  // también gasta (crea tarea para los lotes que quedaron pendientes). El gate
  // per-video (`video-generation`, la cuota real ahora) NO aplica al reanudar: esa
  // generación ya se cobró la primera vez, y cobrarla de nuevo dejaría al usuario sin
  // forma de terminar un video que ya pagó.
  if (reanuda) {
    const { blocked } = await checkGlobalBackstop()
    if (blocked) return blocked
  } else {
    // Fix round 5: antes se descartaba el `Response` real de `checkGenQuota` y se
    // devolvía SIEMPRE el mismo mensaje ("empieza otra sesión"), sin importar cuál de
    // las dos capas bloqueó. `checkGenQuota` bloquea por dos motivos distintos —el
    // tope per-sesión (`regensLeft: 0`) o el backstop GLOBAL de todo el hub
    // (`regensLeft: null`, 500/día, ver gen-quota.ts)— y son dos avisos que no se
    // pueden intercambiar: a alguien que chocó con el backstop global, decirle "abre
    // otra sesión" es un consejo que no puede funcionar (la sesión nueva gasta MÁS
    // contra el mismo backstop compartido). El propio `blocked` ya trae el mensaje
    // correcto para cada caso — se devuelve tal cual, igual que la rama de
    // reanudación tres líneas arriba (`checkGlobalBackstop`), en vez de reinventarlo.
    const { blocked } = await checkGenQuota(id, 'video-generation')
    if (blocked) return blocked
  }

  // Había taskId pagados pero esta llamada NO es una reanudación (huella distinta, o
  // distinta cantidad de lotes): `reanuda` da `false` a propósito —el render viejo ya
  // no corresponde a este contenido— y esos taskId no viajan a `seed`, se abandonan.
  // Abandonarlos es correcto; abandonarlos EN SILENCIO es la misma clase de fallo que
  // el rescate del round 1 existe para evitar, así que quedan logueados con el id de
  // sesión (el mp4 se puede rescatar a mano desde KIE y hay que saber de quién es).
  //
  // El log va DEBAJO del gate de cuota, no arriba (fix round 4): arriba se disparaba
  // igual cuando el gate cortaba con 429 y no se escribía nada — un falso positivo que
  // manda a perseguir una pérdida que nunca ocurrió. Acá abajo ya está decidido que
  // esta llamada sigue y va a pisar lo guardado. No hace falta bajarlo aún más (debajo
  // del claim): `existentes.some(taskId)` implica `session.lotes != null`, o sea
  // `wasVirgin === false`, así que este caso nunca llega a intentar el claim.
  if (!reanuda && existentes.some((l) => l.taskId)) {
    // El motivo exacto importa para diagnosticar: "otra cantidad de lotes" y "misma
    // cantidad, otro contenido" se ven idénticos en la fila y se investigan distinto.
    const motivo = existentes.length !== base.length
      ? `otra cantidad de lotes (${existentes.length} → ${base.length})`
      : 'misma cantidad de lotes pero otro contenido (huella distinta)'
    console.error(
      `[video-ads/generate-lotes] sesión ${id}: el guión cambió — ${motivo}; se abandonan taskId ya pagados:`,
      existentes.filter((l) => l.taskId).map((l) => l.taskId),
    )
  }

  // Claim atómico (fix round 2): SOLO para el primer intento real sobre una sesión
  // nunca tocada. Cierra el race de un doble POST concurrente reclamando la fila
  // ANTES de gastar en KIE — si dos requests llegan casi juntos, solo uno gana la
  // escritura condicional y el otro corta acá, sin haber creado ninguna tarea
  // pagada. Ver el comentario largo en `claimFreshLotes` (db.ts) para el porqué del
  // alcance angosto (no cubre reintentos sobre una sesión ya tocada, aunque haya
  // fallado por completo la primera vez).
  if (!reanuda && wasVirgin) {
    // Mismo `Math.round` que en `saveRescue`, por el mismo motivo (columna `int`). Acá
    // se notó primero: el claim corre ANTES de crear ninguna tarea, así que el fallo
    // salía como 500 sin haber gastado nada.
    const claimed = await claimFreshLotes(id, { step: STEP.LOTES, lotes: seed, duration: Math.round(totalDuration(seed)), render_done: renderDone(seed) })
    if (!claimed) {
      return NextResponse.json(
        { error: 'Esta sesión ya tiene un render en curso o parcialmente completado. Reanúdalo en vez de reiniciar.' },
        { status: 409 },
      )
    }
  }

  /**
   * IMÁGENES ANCLA (`anchors.ts`). Reemplazan a los frames frontera de Veo.
   *
   * Un clip puede durar 30 s y contener varias escenas del original. La primera escena
   * de cada lote arranca del avatar; cada escena SIGUIENTE necesita un fotograma que le
   * diga cómo se ve, o el modelo la inventa y devuelve el mismo encuadre de antes.
   *
   * Se REUSAN las guardadas cuando esto es una reanudación real y coinciden en cantidad:
   * regenerarlas cambiaría el aspecto de un clip pendiente respecto de los que ya se
   * pagaron, sin que nada lo reporte. Se guardan en la misma columna `frames` que usaba
   * el sistema anterior —es un array de URLs y sirve igual—, así que no hay migración.
   *
   * ⚠️ La lista es PLANA y se reparte por lote con `porLote`: `frames` es un `string[]`
   * en la base, y meterle una estructura anidada obligaría a migrar la columna.
   */
  const specsPorLote = seed.map((l) =>
    anchorSpecs({
      lote: l,
      quien,
      planoPorTiempo,
      // Lo que declara si la escena muestra a una persona. Sin esto, `clase` cae al
      // heurístico sobre prosa, que el forense en telegrama rompe (ver `corteMuestraPersona`).
      microPorTiempo: new Map(cortes.flatMap((c) => (c.micro ? [[c.tiempo, c.micro] as const] : []))),
      vozEnOff: enOff,
      productDesc,
      personajes: gente,
    }),
  )
  const totalAnclas = specsPorLote.reduce((n, s) => n + s.length, 0)
  let anclasPlanas: string[]
  const guardadas = session.frames
  if (reanuda && Array.isArray(guardadas) && guardadas.length === totalAnclas) {
    anclasPlanas = guardadas
  } else {
    try {
      // Por lote y en paralelo dentro de cada uno. Las anclas son independientes entre sí
      // (no hay cadena que encadenar, al revés que con los keyframes), así que el tiempo
      // total es el de la más lenta y no la suma.
      const porLote = await Promise.all(
        specsPorLote.map((specs, i) =>
          generateAnchorImages({
            avatarUrl: personaUrl,
            productUrl: session.product_url!,
            specs,
            lote: seed[i].n,
            // ⚠️ Gemini 3.1 Flash Image (`nano-banana-2` en KIE) de primario y gpt-image-2 de
            // respaldo — mismo criterio que el avatar. Las referencias ya están en el bucket, así
            // que van como `fileData` y el transporte pasa la URL sin bajarla ni resubirla; el
            // ORDEN se conserva porque el prompt las cita como `@image(n)`.
            // ⚠️ Lo paga el HUB, no el usuario: lo del usuario es el render del clip.
            generate: async (input) => {
              const b64 = await generateImage(
                [
                  ...input.imageUrls.map((u) => ({ fileData: { fileUri: u, mimeType: 'image/jpeg' } })),
                  { text: input.prompt },
                ],
                3,
                { aspectRatio: '9:16', preferGemini: true },
              )
              return Buffer.from(b64, 'base64')
            },
            upload: (bytes, nombre) => uploadToStorage(id, bytes, 'image/png', nombre),
          }),
        ),
      )
      anclasPlanas = porLote.flat()
    } catch (err) {
      // Falla ANTES de crear ninguna tarea de video, así que no hay nada pagado que
      // rescatar — 502 y el usuario reintenta.
      console.error('[video-ads/generate-lotes] anclas:', err)
      return NextResponse.json({ error: 'No se pudieron generar los fotogramas de referencia.' }, { status: 502 })
    }
  }

  /** Reparte la lista plana de anclas de vuelta a su lote, en el mismo orden en que se generó. */
  const anclasDe = (i: number): string[] => {
    const desde = specsPorLote.slice(0, i).reduce((n, s) => n + s.length, 0)
    return anclasPlanas.slice(desde, desde + specsPorLote[i].length)
  }


  /**
   * Las imágenes que recibe el lote `i`, en el orden en que el prompt las cita:
   * avatar, producto y después sus fotogramas ancla.
   *
   * ⚠️ EL ORDEN ES EL CONTRATO. La leyenda del prompt (`@image(1) = …`) se arma
   * recorriendo este mismo array, y `anclasPorTiempo` calcula el índice de cada ancla
   * asumiendo que las dos primeras plazas son avatar y producto. Reordenar acá le da a
   * una toma la imagen de otra.
   *
   * El total nunca pasa de `MAX_IMAGES` porque `anchorSpecs` ya se topa en
   * `MAX_IMAGES - 2` justamente para dejar estas dos plazas libres.
   */
  const imagenesDe = (i: number): VideoImage[] => [
    { url: personaUrl, role: 'the person (identity reference)' },
    { url: session.product_url!, role: 'the product (must be reproduced exactly)' },
    ...anclasDe(i).map((url, j) => ({ url, role: specsPorLote[i][j].role })),
  ]

  /** `tiempoOriginal` → índice 1-based de su ancla dentro de `imagenesDe(i)`. */
  const anclasPorTiempo = (i: number): Map<string, number> =>
    new Map(specsPorLote[i].map((spec, j) => [spec.tiempo, j + 3])) // +3: avatar y producto ocupan 1 y 2

  const lotes: Lote[] = []
  // Distinto de un fallo de red/KIE (500): un prompt que no entra ni al piso es un
  // problema del guión, no del servicio — se reporta 400 con el mensaje de
  // `buildLotePrompt` (ya en español, ya dice qué acortar) en vez del 500 genérico.
  let promptError: string | null = null
  let apiError: unknown = null
  // Cuántas tareas se crearon REALMENTE en esta llamada (no las reanudadas, que ya
  // estaban pagadas de antes) — es lo único que decide si esta llamada cobra una
  // `video-generation` nueva.
  let creados = 0

  try {
    for (const [i, lote] of seed.entries()) {
      if (lote.taskId) { lotes.push(lote); continue } // reanudado: ya pagado, no se recrea

      // Una sola fuente para la duración: el texto del prompt ("Duración total del
      // clip") y el `durationSec` que se manda a KIE tienen que ser EXACTAMENTE el
      // mismo valor clampeado. Calcularlo dos veces (o clampear solo uno de los dos)
      // desincroniza lo que el prompt promete de lo que el modelo renderiza, y el
      // audio sale cortado a mitad de frase — justo lo que advierte la cabecera de
      // lotes.ts sobre "alguien río abajo lo clampea".
      // Los caracteres de la locución entran en la decisión: `snapDuration` nunca elige
      // una duración legal en la que el texto no quepa a CPS_MAX, porque eso sale como
      // diálogo atropellado o cortado a mitad de frase.
      const locucionChars = lote.tomas.reduce((n, t) => n + (t.locucion ?? '').length, 0)
      const durationSec = clampDuration(lote.duracionSeg, locucionChars, lote.tomas.length)
      const loteParaPrompt = durationSec === lote.duracionSeg ? lote : { ...lote, duracionSeg: durationSec }

      let prompt: string
      try {
        prompt = buildLotePrompt({
          lote: loteParaPrompt,
          consistencyBlock: session.consistency_block,
          productDesc,
          camara: camaras[i],
          voz: session.voice_profile,
          movimiento: session.motion_profile,
          personajes: gente,
          quien,
          vozEnOff: enOff,
          images: imagenesDe(i),
          anclas: anclasPorTiempo(i),
          niche: session.niche,
          // Para el plano POR TOMA cuando el lote mezcla más de uno: `camaras[i]` ya
          // viene deduplicado y concatenado, así que solo desde los cortes se puede
          // saber cuál corresponde a cuál (ver `buildLotePrompt`).
          cortes,
        })
      } catch (err) {
        // `buildLotePrompt` administra su propio presupuesto de caracteres (arma el
        // prompt por niveles de detalle decrecientes) y solo lanza cuando ni el nivel
        // mínimo entra en KIE_PROMPT_MAX. Ese mensaje ya es claro y está en español —
        // se propaga tal cual en vez de perderlo detrás del 500 genérico del catch de
        // afuera.
        promptError = err instanceof Error ? err.message : 'No se pudo armar el prompt del lote.'
        break
      }

      // Última red: `buildLotePrompt` garantiza `prompt.length <= KIE_PROMPT_MAX` o
      // lanza, así que esto no debería dispararse nunca. Se deja como guard defensivo
      // por si ese contrato cambia en el futuro sin que se note acá.
      if (prompt.length > KIE_PROMPT_MAX) {
        promptError = `El lote ${lote.n} quedó muy largo (${prompt.length} de ${KIE_PROMPT_MAX} caracteres). Acorta las líneas del guión.`
        break
      }

      const taskId = await createVideoTask({
        images: imagenesDe(i), prompt, durationSec, locucionChars, tomas: lote.tomas.length,
      }, kieKey)
      creados++
      lotes.push({ ...lote, duracionSeg: durationSec, prompt, taskId, status: 'waiting', videoUrl: null, failMsg: null })
      // Fila por lote: visibilidad del costo real y backstop global diario. Ya NO topa
      // per-step (kind fuera de IMAGE_KINDS) — el tope vive en 'video-generation'.
      await recordGenQuota(id, 'video-render', userId)
    }
  } catch (err) {
    apiError = err
  }

  // Una sola fila de `video-generation` por llamada que efectivamente gastó dinero,
  // sin importar cuántos lotes creó ni si terminó en error — reanudar (`reanuda`)
  // nunca cobra de nuevo, y un intento que no llegó a crear ninguna tarea (falló
  // armando el prompt del primer lote) tampoco cobra: no se gastó nada.
  if (!reanuda && creados > 0) {
    await recordGenQuota(id, 'video-generation', userId)
  }

  if (promptError) {
    // Los lotes que no llegaron a procesarse quedan como placeholder `idle` (no
    // como si nunca hubieran existido): sin esto, un render de 3 lotes que corta en
    // el 2 se guardaba con un array de largo 1, `lote-status` lo veía "completo"
    // (`done = lotes.every(...)` sobre un array corto) y la sesión quedaba marcada
    // terminada con dos tercios del video sin renderizar, sin salida para terminarla.
    const rescatados = mergeRescue(seed, lotes)
    await saveRescue(id, rescatados, anclasPlanas)
    return NextResponse.json({ error: promptError, lotes: rescatados }, { status: 400 })
  }

  if (apiError) {
    console.error('[video-ads/generate-lotes]', apiError)
    // Mismo rescate que en la rama de arriba: lo que sí arrancó (con taskId real) más
    // lo que queda como placeholder idle, para que la sesión sea reanudable.
    const rescatados = mergeRescue(seed, lotes)
    await saveRescue(id, rescatados, anclasPlanas)
    return NextResponse.json({ error: 'No se pudo iniciar el render de todos los lotes.' }, { status: 500 })
  }

  // `saveRescue`, no `updateVideoSession` directo (fix round 3): el camino feliz
  // también puede fallar al escribir, y sin el try/catch de `saveRescue` ese throw
  // escapaba el handler (500 opaco de Next, sin log) dejando la fila con los
  // placeholders `idle` del claim — las tareas recién creadas en KIE quedaban
  // pagadas y huérfanas, sin que `lote-status` supiera que existen. El patch es
  // idéntico al que escribía acá (`step`, `lotes`, `duration`, `render_done`), así
  // que el camino feliz no cambia; sólo se suma el log si la escritura falla.
  await saveRescue(id, lotes, anclasPlanas)
  return NextResponse.json({ lotes })
}
