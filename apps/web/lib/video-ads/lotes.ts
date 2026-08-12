import { z } from 'zod'
import type { TomaFinal } from './adapt'

/**
 * FASE 5 del prompt maestro — agrupación de tomas en lotes de generación.
 * ---------------------------------------------------------------------------
 * Esto es aritmética, no criterio: agrupar por duración y cortar en 15 s no necesita
 * un LLM, y pedírselo lo volvería no determinista justo donde importa que no lo sea
 * (el tope de 15 s es también el techo duro del modelo de KIE).
 *
 * El 15 aparece dos veces por razones distintas que coinciden: es la regla del spec
 * y es `MAX_DURATION` de grok-imagine-video-1-5-preview. Si el modelo cambiara, hay
 * que revisar si el spec sigue queriendo 15.
 */

export const LOTE_MAX_SEC = 15

export const LoteSchema = z.object({
  n: z.number(),
  tomas: z.array(z.object({
    n: z.number(),
    duracionSeg: z.number(),
    accionVisual: z.string(),
    personaje: z.string(),
    producto: z.string(),
    locucion: z.string(),
    tiempoOriginal: z.string(),
  })),
  duracionSeg: z.number(),
  prompt: z.string(),
  taskId: z.string().nullable(),
  status: z.string(),      // idle | waiting | queuing | generating | success | fail
  videoUrl: z.string().nullable(),
})
export type Lote = z.infer<typeof LoteSchema>

/** Redondea a 1 decimal: sumar floats produce 14.299999999999999. */
const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * Parte una toma que por sí sola supera el tope. El spec pide dividir "solamente en
 * puntos naturales de acción o diálogo": se corta por frases y se reparte la duración
 * en proporción a los caracteres de cada tramo. Sin puntos que aprovechar, se parte
 * en trozos iguales — feo, pero preferible a un lote que la API rechaza.
 */
function splitLongToma(t: TomaFinal): TomaFinal[] {
  if (t.duracionSeg <= LOTE_MAX_SEC) return [t]

  const partes = t.locucion.split(/(?<=[.!?])\s+/).filter((s) => s.trim())
  const minPartes = Math.ceil(t.duracionSeg / LOTE_MAX_SEC)

  if (partes.length < minPartes) {
    // Sin suficientes frases: reparto uniforme conservando el texto en la primera.
    return Array.from({ length: minPartes }, (_, i) => ({
      ...t,
      duracionSeg: r1(t.duracionSeg / minPartes),
      locucion: i === 0 ? t.locucion : '',
    }))
  }

  const totalChars = partes.reduce((n, p) => n + p.length, 0) || 1
  return partes.map((p) => ({
    ...t,
    duracionSeg: r1((p.length / totalChars) * t.duracionSeg),
    locucion: p,
  }))
}

export function groupIntoLotes(tomas: TomaFinal[]): Lote[] {
  const expandidas = tomas.flatMap(splitLongToma)
  const lotes: Lote[] = []
  let actual: TomaFinal[] = []
  let acumulado = 0

  const cerrar = () => {
    if (!actual.length) return
    lotes.push({
      n: lotes.length + 1,
      tomas: actual.map((t) => ({
        n: t.n, duracionSeg: t.duracionSeg, accionVisual: t.accionVisual,
        personaje: t.personaje, producto: t.producto, locucion: t.locucion,
        tiempoOriginal: t.tiempoOriginal,
      })),
      duracionSeg: r1(acumulado),
      prompt: '', taskId: null, status: 'idle', videoUrl: null,
    })
    actual = []
    acumulado = 0
  }

  for (const t of expandidas) {
    // "Si agregar la siguiente Toma provoca que el lote supere 15.0 segundos: NO la
    // agregues. Esa Toma pasa automáticamente a ser la primera del siguiente Lote."
    if (actual.length && r1(acumulado + t.duracionSeg) > LOTE_MAX_SEC) cerrar()
    actual.push(t)
    acumulado += t.duracionSeg
  }
  cerrar()

  return lotes
}
