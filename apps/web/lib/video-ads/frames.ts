import type { Lote } from './lotes'

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
    'NUEVA POSE — es el instante EXACTO en que TERMINA esta acción:',
    args.accionVisual,
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
 * Los frames que necesita cada lote, en orden. Devuelve una entrada por lote con la
 * acción cuyo FINAL retrata su frame de cierre.
 *
 * Separado de la generación para poder probar el reparto sin llamar a la API: que el
 * lote i reciba (frame i-1, frame i) es la invariante que hace que los clips encadenen,
 * y equivocarla pega el final de un clip con el principio de otro que no le corresponde.
 */
export function frameSpecs(lotes: Lote[]): { lote: number; accionVisual: string; esCierre: boolean }[] {
  return lotes.map((l, i) => ({
    lote: l.n,
    // El frame de cierre del lote retrata el final de su ÚLTIMA toma.
    accionVisual: l.tomas[l.tomas.length - 1]?.accionVisual ?? '',
    esCierre: i === lotes.length - 1,
  }))
}

/**
 * Empareja cada lote con sus dos keyframes. `frames[i]` es el cierre del lote i, y el
 * frame 0 —el avatar— abre el primero.
 */
export function pairFrames(avatarUrl: string, cierres: string[]): { inicio: string; fin: string }[] {
  const todos = [avatarUrl, ...cierres]
  return cierres.map((_, i) => ({ inicio: todos[i], fin: todos[i + 1] }))
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
      return args.upload(bytes, `frame-${spec.lote}`)
    }),
  )
}
