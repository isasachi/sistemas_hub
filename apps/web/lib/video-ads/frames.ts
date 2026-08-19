import type { Lote } from './lotes'
import { muestraPersona } from './forensic'

/**
 * FRAMES FRONTERA — los keyframes que Veo interpola en el modo
 * `FIRST_AND_LAST_FRAMES_2_VIDEO`.
 *
 * Para N lotes hacen falta N+1 frames: el lote i va del frame i-1 al frame i, así que el
 * último fotograma de un clip ES el primero del siguiente (el mismo archivo, no uno
 * parecido) y los clips encadenan de verdad.
 *
 * Por qué esto y no describir el movimiento en palabras: con dos poses conocidas el
 * modelo tiene que INTERPOLAR un movimiento real en vez de inventar uno. Es lo que
 * ataca el "movimiento robótico" por construcción. Y de paso la identidad pasa de estar
 * anclada en TEXTO (el bloque de consistencia repetido en cada prompt) a estarlo en
 * IMAGEN, que es el arreglo real de la deriva de la prenda.
 *
 * ⚠️ NO se extraen del video generado, se GENERAN por adelantado. Extraer exige haber
 * pagado el clip anterior para saber dónde empieza el siguiente; generarlos deja
 * auditarlos antes de gastar un solo render. Y como el modo obliga al modelo a terminar
 * en el frame que se le da, el frame generado ES el fotograma final del clip.
 */

/**
 * ⚠️ TODOS LOS FRAMES SALEN DEL AVATAR, EN PARALELO — no en cadena. Medido:
 *
 *  - Generar cada frame desde el ANTERIOR conserva la continuidad, pero es serial:
 *    ~58 s por imagen × 6 frames = 348 s, por encima del `maxDuration` de 300 de la ruta.
 *  - Generar cada frame desde el AVATAR ORIGINAL (una foto de catálogo, otra escena) NO
 *    conserva la continuidad: medido, el segundo frame salió con el pantalón cambiado de
 *    blanco a azul, otro encuadre y un teléfono en trípode dentro del cuadro.
 *  - Generar todos desde el FRAME 0 —que ya es la escena UGC real— sí la conserva, y en
 *    paralelo: misma habitación, misma pared, mismo pantalón, misma luz y mismo encuadre
 *    en los tres frames de la prueba, en 52,5 s las dos imágenes juntas.
 *
 * El frame 0 es el avatar (`avatar_url`), que desde la migración a Nano Banana Pro ya
 * nace 9:16 y encuadrado como foto de teléfono. Por eso hacen falta N llamadas y no N+1.
 */
export const FRAME_0_ES_EL_AVATAR = true

/**
 * Prompt DIFERENCIAL: "cambia únicamente la pose". No una descripción completa de la
 * escena — eso es lo que hace que cada llamada la reimagine.
 *
 * La lista de invariantes es explícita y larga a propósito: el pantalón entró en la
 * lista porque en la prueba real fue lo primero que cambió, y la prohibición de
 * teléfonos porque el lenguaje de cámara UGC nombra un teléfono y el modelo lo dibuja.
 */
/**
 * El separador con el que `mergeMicroCortes` (forensic.ts) encadena la acción de los
 * cortes que fusiona. Tiene que coincidir con el de allá.
 */
const FUSION = ' Luego, '

/**
 * La ÚLTIMA sub-acción de una coreografía fusionada.
 *
 * ⚠️ Medido, y era un fallo de verdad: `mergeMicroCortes` deja `accionVisual` como una
 * cadena de hasta NUEVE acciones unidas con "Luego,". Al pedirle a Nano Banana Pro "el
 * instante en que TERMINA esta acción" con ese texto entero delante, devolvió un
 * **collage de seis paneles** —cada sub-acción en su recuadro— en vez de una foto. Y el
 * clip que Veo interpoló desde ahí cortó a un flat-lay y después a la grilla.
 *
 * El frame de cierre retrata el final de la ÚLTIMA sub-acción, que es literalmente lo
 * que "el final de la toma" significa. Una acción sin fusionar se devuelve intacta.
 */
export function ultimaAccion(accionVisual: string): string {
  const partes = accionVisual.split(FUSION)
  return (partes[partes.length - 1] ?? accionVisual).trim()
}

export function buildFramePrompt(args: {
  /** La coreografía de la toma cuyo final retrata este frame. */
  accionVisual: string
  /** Cómo se ve el producto, para que no derive cuando aparece en cuadro. */
  productDesc: string
  /** true en el último frame del anuncio: no hay toma siguiente a la que encadenar. */
  esCierre?: boolean
}): string {
  return [
    'Toma esta imagen y cambia ÚNICAMENTE la POSE de la persona.',
    '',
    'Queda IDÉNTICO, sin excepción: la misma persona, la misma cara, el mismo peinado,',
    'la misma ropa completa (incluido el pantalón y el calzado), los mismos accesorios,',
    'la misma habitación, las mismas paredes, los mismos muebles, la misma luz, el mismo',
    'encuadre y la misma distancia de cámara. No es una escena nueva: es el mismo',
    'fotograma con la persona en otra posición.',
    '',
    'Es UNA SOLA FOTOGRAFÍA: un único encuadre, una única persona, un único momento.',
    'NO es un collage, ni una grilla, ni una secuencia, ni varias fotos juntas.',
    '',
    'NUEVA POSE — es el instante EXACTO en que TERMINA esta acción:',
    ultimaAccion(args.accionVisual),
    '',
    // ⚠️ La coreografía sale del análisis del video de REFERENCIA, así que menciona la
    // ropa y el aspecto de OTRA persona. Medido en la sesión de ropa: la acción dice
    // "vestida con la blusa y falda negras" mientras el producto del usuario es una
    // blusa celeste. Sin esta línea el texto pelea contra la imagen, y en un prompt de
    // edición el texto suele ganar.
    'De ese texto toma SOLO el movimiento y la posición del cuerpo. Si menciona ropa,',
    'colores, peinado o rasgos, IGNÓRALOS: describen el video de referencia, no esta',
    'escena. La ropa y la persona son las de la imagen, sin cambiar nada.',
    '',
    args.esCierre
      ? 'Es el último fotograma del anuncio: la pose de cierre de esa acción.'
      : 'Retrata el final de esa acción, no su inicio ni un punto intermedio.',
    '',
    `Si el producto aparece en cuadro, tiene que verse idéntico a su imagen de referencia: ${args.productDesc}`,
    '',
    'NO debe aparecer ningún teléfono, cámara, trípode, texto, subtítulo, logo, gráfico',
    'ni marca de agua.',
  ].join('\n')
}

/**
 * ⚠️ LA CADENA SE ROMPE EN CADA CORTE DE MONTAJE — medido en un render real.
 *
 * Compartir el frame frontera entre dos lotes solo tiene sentido si son la misma
 * escena. Si el lote i cierra en un flat-lay del producto y el i+1 abre con la persona,
 * ese frame compartido obliga a UNO de los dos clips a interpolar de un plano a otro:
 * o sea a hacer un corte de montaje dentro de un plano continuo, que es exactamente lo
 * que este diseño existe para evitar.
 *
 * Se vio en el render de prueba: el clip fue persona → detalle de la etiqueta → persona
 * dentro de los mismos 4 segundos. El frame era correcto; lo que estaba mal era
 * compartirlo.
 *
 * La clase se decide con `muestraPersona` (forensic.ts), la misma función con la que
 * `mergeMicroCortes` decide qué cortes puede fusionar — por el mismo motivo y con el
 * mismo criterio. Cuando cambia, el lote siguiente recibe su PROPIO fotograma inicial.
 */
function claseInicio(l: Lote): boolean {
  return muestraPersona(l.tomas[0]?.accionVisual ?? '')
}
function claseFin(l: Lote): boolean {
  return muestraPersona(ultimaAccion(l.tomas[l.tomas.length - 1]?.accionVisual ?? ''))
}

export interface FrameJob {
  lote: number
  /** `fin`: cierra el lote. `inicio`: lo abre, solo cuando la cadena se rompe. */
  rol: 'inicio' | 'fin'
  accionVisual: string
  esCierre: boolean
}

/**
 * Los frames a generar. Uno de cierre por lote, más uno de apertura en cada lote cuya
 * escena no continúa la del anterior.
 *
 * El avatar es una foto de la persona, así que abre el lote 1 solo si el lote 1 es un
 * plano de persona; un anuncio que arranque con un flat-lay necesita su propia apertura.
 */
export function frameSpecs(lotes: Lote[]): FrameJob[] {
  const jobs: FrameJob[] = []
  lotes.forEach((l, i) => {
    const anterior = i === 0 ? true /* el avatar es un plano de persona */ : claseFin(lotes[i - 1])
    if (claseInicio(l) !== anterior) {
      jobs.push({ lote: l.n, rol: 'inicio', accionVisual: l.tomas[0]?.accionVisual ?? '', esCierre: false })
    }
    jobs.push({
      lote: l.n, rol: 'fin',
      // El frame de cierre del lote retrata el final de su ÚLTIMA toma.
      accionVisual: l.tomas[l.tomas.length - 1]?.accionVisual ?? '',
      esCierre: i === lotes.length - 1,
    })
  })
  return jobs
}

/**
 * Empareja cada lote con sus dos keyframes, en el mismo orden en que `frameSpecs` los
 * pidió. Un lote con apertura propia NO reusa el cierre del anterior: ahí hay un corte.
 */
export function pairFrames(
  avatarUrl: string,
  jobs: FrameJob[],
  urls: string[],
): { inicio: string; fin: string }[] {
  const por = new Map(jobs.map((j, i) => [`${j.lote}:${j.rol}`, urls[i]]))
  const lotes = [...new Set(jobs.map((j) => j.lote))]
  let anteriorFin = avatarUrl
  return lotes.map((n) => {
    const inicio = por.get(`${n}:inicio`) ?? anteriorFin
    const fin = por.get(`${n}:fin`)!
    anteriorFin = fin
    return { inicio, fin }
  })
}

/**
 * Genera los frames de cierre de todos los lotes, EN PARALELO desde el avatar, y
 * devuelve sus URLs ya subidas al bucket propio.
 *
 * Se suben en vez de usar la URL que devuelve KIE porque esa es temporal: los frames
 * tienen que sobrevivir a una reanudación del render días después, y un frame caído
 * significa que el clip siguiente arranca en otra pose que la que dejó el anterior.
 *
 * `upload` se inyecta para que esto sea probable sin tocar Storage ni la API.
 */
export async function generateBoundaryFrames(args: {
  avatarUrl: string
  productUrl: string
  productDesc: string
  specs: ReturnType<typeof frameSpecs>
  generate: (input: { prompt: string; imageUrls: string[] }) => Promise<Buffer>
  upload: (bytes: Buffer, nombre: string) => Promise<string>
}): Promise<string[]> {
  return Promise.all(
    args.specs.map(async (spec) => {
      const bytes = await args.generate({
        prompt: buildFramePrompt({
          accionVisual: spec.accionVisual,
          productDesc: args.productDesc,
          esCierre: spec.esCierre,
        }),
        // El avatar primero: es la escena y la identidad. El producto va detrás para que
        // no derive cuando la acción lo mete en cuadro.
        imageUrls: [args.avatarUrl, args.productUrl],
      })
      return args.upload(bytes, `frame-${spec.lote}-${spec.rol}`)
    }),
  )
}
