import sharp from 'sharp'

// ⚠️ El ratio del anuncio NO se le pregunta al modelo. Medido en la sesión 4c8f6c8b: la
// referencia era 335x597 (9:16 vertical) y `reference_analysis.format.ratio` salió "16:9";
// ese string viajó al instructivo ("Create a 16:9 image…") y el ad final salió 1376x768.
// El ratio es un dato del archivo — se mide con sharp y se pega al enum que acepta Gemini.
const SUPPORTED = ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'] as const
export type AspectRatio = (typeof SUPPORTED)[number]

export function snapAspectRatio(width: number, height: number): AspectRatio {
  const r = width / height
  return SUPPORTED.reduce((best, cur) => {
    const [w, h] = cur.split(':').map(Number)
    const [bw, bh] = best.split(':').map(Number)
    return Math.abs(Math.log(w / h) - Math.log(r)) < Math.abs(Math.log(bw / bh) - Math.log(r)) ? cur : best
  })
}

export async function aspectRatioOf(bytes: Buffer): Promise<AspectRatio | undefined> {
  try {
    const { width, height } = await sharp(bytes).metadata()
    if (!width || !height) return undefined
    return snapAspectRatio(width, height)
  } catch {
    return undefined // ponytail: formato ilegible → sin ratio forzado, mismo comportamiento que antes
  }
}
