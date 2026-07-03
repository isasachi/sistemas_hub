import { z } from 'zod'
import { callStructured } from '@/lib/gemini'
import type { Part } from '@google/genai'

// Recorte del producto para el ANCLA. El ancla es el render de la 1ª sección (un diseño
// completo con layout); pasar ese render entero a las demás secciones les hace clonar su
// estructura. Aislamos el producto: bbox por visión (gemini-2.5-flash) + crop con sharp →
// el ancla queda como un "swatch" del producto sin layout que imitar. Si el bbox falla o es
// absurdo, el caller se cae al render completo (nunca peor que hoy). Todo Gemini, $0-rule OK.

export type ProductBox = { x: number; y: number; w: number; h: number }

// Formato NATIVO de detección de Gemini: box_2d = [ymin, xmin, ymax, xmax] normalizado a
// 0-1000. Pedirlo en este formato (en el que el modelo está entrenado) da bboxes precisos;
// una convención custom {x,y,w,h}[0,1] pelea con el training y sale corrida/ancha.
const BoxSchema = z.object({
  box_2d: z.array(z.number()).length(4), // [ymin, xmin, ymax, xmax] en 0-1000
})

const SYSTEM = [
  'You are an object-detection annotator. You will be shown ONE marketing image that contains a',
  'physical product (a bottle, jar, tube, box or package) in the composition, surrounded by text,',
  'people and scenery. Return the TIGHT 2D bounding box of the MAIN physical product ONLY — just the',
  'product object(s), excluding its shadow, the surrounding text, any person and the background.',
  'Output box_2d as [ymin, xmin, ymax, xmax], each value an integer 0-1000 normalized to the image',
  '(y = top→bottom, x = left→right). If a pack of several identical units is shown, box the whole group tightly.',
].join(' ')

// Devuelve el box (en fracciones {x,y,w,h}) o null (falla / valores fuera de rango / recorte
// degenerado → el caller se cae al render completo).
export async function extractProductBox(base64: string, mimeType: string): Promise<ProductBox | null> {
  try {
    const parts: Part[] = [
      { inlineData: { mimeType, data: base64 } },
      { text: 'Detect the main physical product and return its box_2d as [ymin, xmin, ymax, xmax] in 0-1000.' },
    ]
    const { box_2d } = await callStructured('product_box', BoxSchema, parts, 2, SYSTEM)
    const [ymin, xmin, ymax, xmax] = box_2d.map((n) => n / 1000)
    const box: ProductBox = { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin }
    const inRange = [box.x, box.y, box.w, box.h].every((n) => n >= 0 && n <= 1)
    // Válido y no-degenerado: descarta ruido (w/h < 8%) y desbordes.
    if (!inRange || box.w < 0.08 || box.h < 0.08 || box.x + box.w > 1.001 || box.y + box.h > 1.001) return null
    return box
  } catch {
    return null
  }
}

// Recorta el producto del buffer del render, con ~6% de padding, clamp a los bordes.
// sharp trae binario nativo: se importa DINÁMICO dentro de la función y con try/catch, para
// que un fallo de carga en Vercel devuelva el render completo (fallback real) en vez de
// romper el módulo en import-time y 500-ear TODA generación de sección.
export async function cropProduct(buffer: Buffer, box: ProductBox): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default
    const img = sharp(buffer)
    const meta = await img.metadata()
    const W = meta.width ?? 0
    const H = meta.height ?? 0
    if (!W || !H) return buffer
    const padX = box.w * 0.06
    const padY = box.h * 0.06
    const left = Math.max(0, Math.round((box.x - padX) * W))
    const top = Math.max(0, Math.round((box.y - padY) * H))
    const right = Math.min(W, Math.round((box.x + box.w + padX) * W))
    const bottom = Math.min(H, Math.round((box.y + box.h + padY) * H))
    const width = right - left
    const height = bottom - top
    if (width < 1 || height < 1) return buffer
    return await img.extract({ left, top, width, height }).png().toBuffer()
  } catch {
    return buffer // sharp no cargó o el extract falló → render completo (nunca peor que hoy)
  }
}
