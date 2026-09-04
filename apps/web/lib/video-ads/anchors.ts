import type { Lote } from './lotes'
import { MAX_IMAGES } from './kie'
import { corteMuestraPersona, type Micro } from './forensic'
import { etiqueta, type Personaje } from './personajes'

/**
 * IMÁGENES ANCLA — el sistema que reemplazó a los keyframes de Veo (2026-08-24).
 * ---------------------------------------------------------------------------
 * `grok-imagine/image-to-video` acepta hasta 7 imágenes de referencia por tarea, y de
 * eso cuelga todo el cambio de arquitectura: un clip puede durar 30 s y contener VARIAS
 * escenas del original, en vez de ser un plano único de 8 s.
 *
 * El problema que esto resuelve es viejo y estaba medido: pedirle a un modelo de video
 * dos encuadres distintos en un mismo clip devolvía UNO —el otro se perdía en silencio—
 * porque el modelo tenía que inventar cómo se ve la escena nueva. Con un fotograma ancla
 * por escena ya no la inventa: la copia.
 *
 * ⚠️ NO ES EL SISTEMA DE FRAMES DE VEO, aunque se le parezca. Aquel generaba el primer y
 * el ÚLTIMO fotograma de cada clip para que el modelo INTERPOLARA entre los dos (modo
 * `FIRST_AND_LAST_FRAMES_2_VIDEO`). Esto genera el fotograma que ABRE cada escena y lo
 * manda como material de referencia citado en el prompt (`@image(n)`); no hay
 * interpolación forzada y no hay frame de cierre. Por eso tampoco hay cadena que
 * encadenar entre lotes: cada ancla es independiente y se puede regenerar sola.
 *
 * ⚠️ Y LAS IMÁGENES YA NO LAS PAGA EL USUARIO. Los frames de Veo salían de Nano Banana
 * Pro, que corre en KIE con la key del usuario; las anclas salen de **gpt-image-2**, que
 * corre con la key de OpenAI del HUB. Es una reversión deliberada del BYOK de imagen
 * (ver AGENTS.md): el render sigue siendo del usuario, las imágenes vuelven a costarle
 * al hub.
 */

/** Separador con el que `mergeMicroCortes` une varias sub-acciones en una sola toma. */
const FUSION = /\s*(?:Luego,|Después,|Luego |Después )\s*/i

/**
 * La PRIMERA sub-acción de una coreografía fusionada.
 *
 * El ancla retrata el instante en que la escena EMPIEZA, no en el que termina — al revés
 * que los frames de cierre de Veo. La razón es la misma que allá pero al espejo: con el
 * texto entero delante el modelo devuelve un collage de todas las sub-acciones, medido
 * en su momento con seis paneles en una sola imagen.
 */
export function primeraAccion(accionVisual: string): string {
  const partes = accionVisual.split(FUSION)
  return (partes[0] ?? accionVisual).trim()
}

/**
 * La "clase" de una escena: qué se ve en ella. Dos tomas de la misma clase y el mismo
 * encuadre son la misma escena y comparten ancla; cuando cambia cualquiera de las dos,
 * empieza una escena nueva.
 *
 * `'—'` es el plano sin persona (un flat-lay del producto). `'persona'` es el plano de
 * persona sin atribución, o sea toda sesión anterior al soporte de varios personajes.
 *
 * ⚠️ Decide con `micro` cuando existe, y con la prosa solo si no: el forense escribe la
 * acción en telegrama y sin sujeto ("Sujeta pipeta con mano derecha, mira a cámara"), así
 * que buscar la palabra "mujer" ahí devuelve `false` para planos de persona evidentes.
 * Ver `corteMuestraPersona`.
 */
function clase(accion: string, micro: Micro | undefined, gente: Personaje[] | undefined): string {
  if (!corteMuestraPersona({ accion, micro })) return '—'
  if (!gente?.length) return 'persona'
  return gente.map((p) => p.id).sort().join('+')
}

export interface AnchorSpec {
  /** `tiempoOriginal` de la toma que ABRE esta escena. Es la clave de todo el sistema. */
  tiempo: string
  /** La escena no muestra a nadie: la referencia es SOLO el producto (ver `anchorSpecs`). */
  soloProducto?: boolean
  /** Prompt quirúrgico, en inglés, para generar el fotograma. */
  prompt: string
  /** Cómo se cita en la leyenda `@image(n)` del prompt del lote. */
  role: string
  /**
   * El instante del video ORIGINAL que mejor muestra la pose con la que ABRE esta escena
   * (`referenceFrameMs` del primer beat). Quien genera las anclas extrae ese fotograma y lo
   * pasa como referencia de POSE — ver `poseUrl`.
   */
  referenceFrameMs?: number
  /** El fotograma ya extraído y subido. Lo llena la ruta, no `anchorSpecs`. */
  poseUrl?: string
}

/**
 * Las escenas de un lote que necesitan su PROPIO fotograma ancla.
 *
 * La primera escena NO lleva ancla: arranca del avatar, que ya viaja como `@image(1)` en
 * todos los lotes. Solo las escenas SIGUIENTES necesitan una imagen que les diga cómo se
 * ven, porque son las que el modelo tendría que inventar.
 *
 * ⚠️ El tope es `MAX_IMAGES - 2`: el avatar y el producto ocupan dos de las siete plazas.
 * Pasarse haría que KIE rechazara la tarea. Cuando un lote tiene más escenas que plazas,
 * las que sobran se quedan sin ancla y se apoyan en la descripción de texto — es una
 * degradación, no un error, y por eso no lanza.
 */
export function anchorSpecs(args: {
  lote: Lote
  quien?: Map<string, Personaje[]>
  /** `tiempoOriginal` → encuadre del forense. Un cambio de encuadre abre escena nueva. */
  planoPorTiempo?: Map<string, string>
  /** `tiempoOriginal` → detalle atómico del corte. Es lo que declara si hay persona. */
  microPorTiempo?: Map<string, Micro>
  vozEnOff?: Set<string>
  productDesc: string
  personajes?: Personaje[]
}): AnchorSpec[] {
  const { lote, productDesc } = args
  const quien = args.quien ?? new Map<string, Personaje[]>()
  const planos = args.planoPorTiempo ?? new Map<string, string>()
  const off = args.vozEnOff ?? new Set<string>()
  const micros = args.microPorTiempo ?? new Map<string, Micro>()

  const specs: AnchorSpec[] = []
  let claseAnterior: string | null = null
  let planoAnterior: string | null = null

  for (const t of lote.tomas) {
    const c = clase(t.accionVisual, micros.get(t.tiempoOriginal), quien.get(t.tiempoOriginal))
    const plano = planos.get(t.tiempoOriginal) ?? ''
    const primera = claseAnterior === null
    const cambia = !primera && (c !== claseAnterior || (!!plano && plano !== planoAnterior))
    claseAnterior = c
    planoAnterior = plano

    /**
     * ⚠️ CADA LOTE ABRE CON SU PROPIA ANCLA, SALVO EL PRIMERO — y esto es lo que ancla el
     * FONDO entre clips.
     *
     * Antes solo se generaba ancla para un cambio de escena DENTRO de un lote, así que con
     * `maxPlanos = 1` casi nunca se generaba ninguna (medido: **0 anclas** en las dos
     * sesiones nuevas) y los N clips arrancaban del avatar solo por texto. Resultado
     * medido en la sesión `7e4ccbcf`: la persona, el suéter y el producto se sostienen en
     * los 5 clips, pero **el fondo deriva** — marco de puerta, dos cuadros, una puerta
     * blanca, una planta. Grok re-imagina el entorno en cada render.
     *
     * ✅ La premisa se midió antes de cablear esto (`scripts/probe-anclas.ts`, 2 imágenes):
     * dos anclas generadas desde el MISMO avatar conservan su habitación — mismo marco de
     * puerta, misma pared, misma luz. **gpt-image-2 conserva el escenario al editar; grok
     * lo re-inventa al generar video.** Esa diferencia es la que hace que esto funcione, y
     * NO se podía heredar: la medición que había en AGENTS.md era de Nano Banana Pro.
     *
     * ⚠️ *"El PRIMER lote no lleva ancla a propósito"* fue la regla hasta la ANCLA DE POSE
     * y ya NO vale — se conserva escrita porque su razonamiento sigue siendo correcto para
     * lo que medía: el avatar ya es una imagen válida de ese ESCENARIO. Lo que no es, es
     * una imagen válida de esa POSE. Ver el comentario de `abreLote`.
     *
     * Cuesta N imágenes por sesión (era N−1), las paga el hub. Es el precio del eje.
     */
    // ⚠️ EL PRIMER LOTE TAMBIÉN LLEVA ANCLA, y esto INVIERTE la decisión de arriba.
    // Aquélla decía que arrancar del avatar alcanzaba porque "ya ES una imagen válida de esa
    // escena". Lo es del ESCENARIO, no de la POSE: el avatar es un retrato neutro, así que
    // un anuncio que —como éste— ABRE con el gotero ya en la mejilla obliga al clip a gastar
    // sus primeros segundos llegando a esa posición. Lo señaló el dueño del repo mirando el
    // original: *"no lleva el gotero a su mejilla sino que ya empieza ahí"*.
    const abreLote = primera
    if (!abreLote && (primera || !cambia)) continue
    if (specs.length >= MAX_IMAGES - 2) {
      // ⚠️ SE LOGUEA, no se traga. Un recorte silencioso "se lee como que cubrimos todo"
      // cuando no: las escenas que se quedan sin ancla vuelven a depender solo del texto,
      // que es exactamente el problema que las anclas existen para resolver. Sin esta
      // línea, un clip que a partir de la sexta escena repite el mismo encuadre obliga a
      // releer la lógica de agrupación para entender por qué.
      console.info(
        `[video-ads/anchors] lote ${lote.n}: más escenas que plazas de imagen — ` +
        `${MAX_IMAGES - 2} llevan ancla y el resto se apoya solo en el texto del prompt. ` +
        'Bajar `maxPlanos` reparte esas escenas en más clips.',
      )
      break
    }

    specs.push({
      tiempo: t.tiempoOriginal,
      // El instante del original que retrata esta pose. Sin timeline no hay ninguno y el
      // ancla se genera como siempre, solo desde el texto.
      referenceFrameMs: (t.beats ?? [])[0]?.referenceFrameMs || undefined,
      // ⚠️ Una escena SIN persona (un flat-lay del producto) no lleva el avatar como
      // referencia: `images.edit` conserva lo que se le da, así que mandarle una persona
      // para una foto en la que no debe haber nadie es pedirle las dos cosas a la vez.
      soloProducto: c === '—',
      role: `anchor frame that opens shot ${t.n}${plano ? ` (${plano})` : ''}`,
      prompt: buildAnchorPrompt({
        accionVisual: t.accionVisual,
        camara: plano,
        productDesc,
        personajes: args.personajes,
        vozEnOff: off.has(t.tiempoOriginal),
        soloProducto: c === '—',
      }),
    })
  }
  return specs
}

/**
 * El prompt QUIRÚRGICO de un fotograma ancla.
 *
 * Va en inglés porque lo consume gpt-image-2. Conserva íntegras las cuatro lecciones que
 * costaron renders reales en la época de los keyframes, porque el modo de fallo es el
 * mismo aunque el modelo de imagen haya cambiado:
 *
 *  1. UNA SOLA FOTOGRAFÍA, no un collage. Con la coreografía fusionada entera delante, el
 *     generador devolvió una grilla de seis paneles.
 *  2. IGNORAR la ropa y los rasgos que menciona la coreografía: describen el video de
 *     REFERENCIA, no esta escena. Medido: la acción decía "vestida con la blusa y falda
 *     negras" mientras el producto del usuario era una blusa celeste, y en un prompt de
 *     edición el texto le gana a la imagen.
 *  3. NADA de teléfonos, cámaras ni trípodes en cuadro. Pedir "ángulo de teléfono
 *     apoyado" hizo que el modelo dibujara el teléfono en un trípode dentro de la foto.
 *  4. En VOZ EN OFF el encuadre lo manda la acción, no la necesidad de ver una cara.
 */
export function buildAnchorPrompt(args: {
  accionVisual: string
  camara: string
  productDesc: string
  personajes?: Personaje[]
  vozEnOff?: boolean
  /** La escena no muestra a nadie: es un plano del producto solo. */
  soloProducto?: boolean
}): string {
  const gente = args.personajes ?? []
  // ⚠️ UN FLAT-LAY NO ES UN RETRATO, y el resto de este prompt está escrito para un
  // retrato. Sin esta rama el modelo recibe "cambia la pose de la persona" para una foto
  // en la que no debe haber ninguna, y devuelve a alguien sosteniendo el producto.
  if (args.soloProducto) {
    return [
      'Take this product image and shoot it as a new photograph: the product alone.',
      '',
      'NO PERSON IN FRAME. No hands, no arms, no face, no body parts — nobody appears in',
      'this photograph at all.',
      '',
      'The product must look IDENTICAL to its reference image: same shape, label, colors',
      'and text. Never redesign it.',
      `Product: ${args.productDesc}`,
      '',
      args.camara
        ? `FRAMING — reproduce this camera shot exactly: ${args.camara}`
        : 'FRAMING — a natural product shot for a phone-shot UGC video.',
      '',
      'SCENE — this is the exact instant the following action BEGINS:',
      primeraAccion(args.accionVisual),
      'From that text take ONLY where the product sits and how it is placed. If it',
      'mentions a person, clothing or physical features, IGNORE them: nobody is in this',
      'photograph.',
      '',
      'It is ONE SINGLE PHOTOGRAPH: one framing, one moment. NOT a collage, NOT a grid.',
      'No phone, camera, tripod, ring light, text, caption, logo, graphic or watermark may',
      'appear in the image.',
      'Photoreal, shot on a phone camera, on a real surface with natural uneven lighting.',
      'NOT illustration, NOT 3D render, NOT a studio catalog shot, NOT stylized.',
    ].join('\n')
  }
  return [
    gente.length > 1
      ? `Take these images and compose ONE SINGLE frame with the ${gente.length} people together in the same scene: ${gente.map(etiqueta).join(' and ')}. Each one keeps EXACTLY their own face, hair and clothes from their reference image; do not mix them up or swap them.`
      : 'Take this image and change ONLY the framing and the pose of the person.',
    '',
    'Everything else stays IDENTICAL, no exceptions: the same person, the same face, the',
    'same hairstyle, the same full outfit (including trousers and shoes), the same',
    'accessories, the same room, the same walls, the same furniture and the same light.',
    'This is not a new scene: it is the same shoot, seen from another shot.',
    '',
    'It is ONE SINGLE PHOTOGRAPH: one framing, one moment. NOT a collage, NOT a grid, NOT',
    'a sequence, NOT several photos side by side.',
    '',
    args.camara
      ? `NEW FRAMING — reproduce this camera shot exactly: ${args.camara}`
      : 'NEW FRAMING — keep it natural for a phone-shot UGC video.',
    '',
    'POSE — this is the exact instant the following action BEGINS:',
    primeraAccion(args.accionVisual),
    '',
    // ⚠️ Lección 2: la coreografía viene del video de referencia y nombra a OTRA persona.
    'From that text take ONLY the movement and the position of the body. If it mentions',
    'clothing, colors, hairstyle or physical features, IGNORE them: they describe the',
    'reference video, not this scene. The clothes and the person are the ones in the',
    'image, unchanged.',
    ...(args.vozEnOff
      ? [
          '',
          'THIS SHOT IS NARRATED IN VOICE-OVER: the face does not need to be visible. Frame',
          'whatever the action describes — the feet, the hands, the product, the detail —',
          'even if that leaves the person out of frame or only partly visible. Do NOT raise',
          'the framing to show the face and do not put anyone talking to camera.',
        ]
      : []),
    '',
    `If the product appears in frame it must look identical to its reference image: ${args.productDesc}`,
    '',
    // ⚠️ Lección 3.
    'No phone, camera, tripod, ring light, text, caption, logo, graphic or watermark may',
    'appear in the image.',
    // El realismo es la misma exigencia que la del avatar: este fotograma define cómo se
    // ve la escena entera del clip, así que una piel plastificada acá contamina el video.
    'Photoreal, shot on a phone camera. Real skin with visible texture and pores, natural',
    'uneven lighting. NOT illustration, NOT 3D render, NOT airbrushed, NOT pastel, NOT',
    'smoothed, NOT stylized.',
  ].join('\n')
}

/**
 * Le agrega al prompt del ancla la referencia de POSE: el fotograma real del original en
 * el instante en que esta escena empieza.
 *
 * ⚠️ VA COMO ÚLTIMA IMAGEN Y MANDA SOBRE EL TEXTO. Todo este módulo está construido sobre
 * que **la imagen le gana al texto** —es lo que hace que el escenario deje de derivar—, y
 * la pose es justamente lo que peor sobrevive escrita: *"releases one drop onto her cheek"*
 * no dice a qué altura está el frasco ni hacia dónde mira. Dejar las dos fuentes sin
 * jerarquía es la contradicción dentro del mismo prompt que este repo ya pagó cinco veces.
 *
 * ⚠️ Y EL GUARD ES EL MISMO QUE YA ESTABA MEDIDO PARA EL TEXTO, ahora contra una imagen:
 * el fotograma es de OTRA persona, con otra ropa y otra habitación. De él se toma el
 * movimiento y nada más.
 */
function conPose(prompt: string, soloProducto?: boolean): string {
  return [
    prompt,
    '',
    'POSE REFERENCE — the LAST image is a real frame from the video being replicated.',
    soloProducto
      ? 'Copy from it where the product sits, at what angle and how the shot is framed. It overrides the text above wherever they disagree.'
      : 'Copy the POSE from it: where each hand is, what each hand holds, how close it is to the face or body, which way the body is turned and how the shot is framed. It overrides the POSE text above wherever they disagree.',
    'Take ONLY that from it. The person, the face, the hair, the clothes, the product and',
    'the room are the ones in the FIRST images — ignore everything else in the pose',
    'reference: it is a different person, in different clothes, in a different room,',
    'holding a different bottle.',
    // ⚠️ El fotograma sale de un video de redes: trae la marca de agua de la plataforma,
    // el arroba del autor y los subtítulos quemados. Es EXACTAMENTE la clase de artefacto
    // que este pipeline separa en `elementosGraficos` para que no se reproduzca, y acá
    // entra por una puerta nueva — dentro de una imagen que se ordena copiar.
    'The pose reference is a still from a social video: it has a platform watermark, a',
    'username and burned-in captions on top of it. NONE of that exists in the photograph',
    'you produce — no watermark, no username, no caption, no text of any kind.',
  ].join('\n')
}

/**
 * Genera los fotogramas ancla de un lote y devuelve sus URLs ya subidas al bucket.
 *
 * Se suben en vez de usar la URL que devuelva el generador porque esa es temporal: las
 * anclas tienen que sobrevivir a una reanudación del render días después.
 *
 * `generate` y `upload` se inyectan para que esto sea probable sin tocar Storage ni
 * ninguna API — es la misma forma que tenía `generateBoundaryFrames`, y por el mismo
 * motivo.
 *
 * ⚠️ En PARALELO, no en cadena. Cada ancla es independiente (no hay frame de cierre que
 * encadenar, al revés que con Veo), así que el tiempo del lote es el de la más lenta y
 * no la suma. Con `maxDuration = 300` en la ruta, eso es lo que hace viable generar
 * varias por lote.
 */
export async function generateAnchorImages(args: {
  avatarUrl: string
  productUrl: string
  specs: AnchorSpec[]
  generate: (input: { prompt: string; imageUrls: string[] }) => Promise<Buffer>
  upload: (bytes: Buffer, nombre: string) => Promise<string>
  /** Para nombrar el archivo: `ancla-<lote>-<i>`. */
  lote: number
}): Promise<string[]> {
  return Promise.all(
    args.specs.map(async (spec, i) => {
      const bytes = await args.generate({
        prompt: spec.poseUrl ? conPose(spec.prompt, spec.soloProducto) : spec.prompt,
        // La persona primero (es la identidad), el producto detrás para que no derive
        // cuando la acción lo mete en cuadro. El orden es el que cita el prompt.
        // ⚠️ En un plano SIN persona va solo el producto: darle el avatar a una foto en la
        // que no debe salir nadie es pedirle que conserve a alguien que sobra.
        // ⚠️ La pose va ÚLTIMA porque el prompt la cita así ("the LAST image").
        imageUrls: [
          ...(spec.soloProducto ? [args.productUrl] : [args.avatarUrl, args.productUrl]),
          ...(spec.poseUrl ? [spec.poseUrl] : []),
        ],
      })
      return args.upload(bytes, `ancla-${args.lote}-${i + 1}`)
    }),
  )
}
