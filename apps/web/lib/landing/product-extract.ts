import { generateImage } from '@/lib/gemini'
import type { Part } from '@google/genai'

// Placa canónica del producto — extracción quirúrgica derivada UNA vez por sesión.
// Aísla el producto de cualquier elemento que lo rodee en la referencia y lo re-renderiza
// solo, sobre fondo neutro limpio, reproduciendo TODO el label. Esa placa se usa como
// ancla idéntica en todas las secciones (Imagen 1) → el producto no deriva entre secciones.
// La referencia original se conserva aparte (Imágenes 2+) para los recursos gráficos que
// acompañan al producto. gemini-3.1-flash-image vía generateImage (hereda retry + español).

const EXTRACTION_PROMPT = [
  'TASK: produce a clean, canonical PRODUCT PLATE from the reference image(s).',
  'The reference may contain the product surrounded by other elements (props, hands, backgrounds,',
  'ingredients, decorative graphics). Surgically ISOLATE the product being sold and render ONLY it.',
  'Reproduce the product with total fidelity: identical shape, proportions, materials, colors and',
  'finish, and — critically — EVERY label reproduced exactly: all printed text, logos, icons and',
  'graphics on the packaging, spelled and placed as in the reference, sharp and legible. Do NOT invent,',
  'simplify, translate, restyle or omit any label detail. If several photos show the product from',
  'different angles, use them together to reconstruct it faithfully; render the most complete front view.',
  'Output: the product alone, centered, well-lit studio product shot on a plain neutral light-gray',
  'background, no props, no scene, no added text, no people. This is a reference plate, not an ad.',
].join(' ')

// Devuelve la placa como base64 PNG, o '' si la extracción no produjo imagen (el caller
// se cae a las fotos crudas — nunca peor que hoy).
export async function extractProductPlate(
  photos: { data: string; mimeType: string }[],
): Promise<string> {
  if (!photos.length) return ''
  const parts: Part[] = [
    ...photos.map((p) => ({ inlineData: { mimeType: p.mimeType, data: p.data } } as Part)),
    { text: EXTRACTION_PROMPT },
  ]
  return generateImage(parts, 3)
}
