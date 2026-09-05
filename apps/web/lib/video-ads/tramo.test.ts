import { describe, it, expect } from 'vitest'
import { tramosDeLotes, parseVentana, REF_MAX_SEC, PRESUPUESTO_SEC } from './tramo'
import type { Lote } from './lotes'

const toma = (n: number, duracionSeg: number, tiempoOriginal: string) => ({
  n, duracionSeg, tiempoOriginal,
  accionVisual: '', personaje: '', producto: '', locucion: '',
})
const lote = (n: number, tomas: ReturnType<typeof toma>[]): Lote => ({
  n, tomas, duracionSeg: tomas.reduce((s, t) => s + t.duracionSeg, 0),
  prompt: '', taskId: null, status: 'idle', videoUrl: null, failMsg: null, scriptHash: null,
})
/** La duración que se le pide al modelo. En los tests basta la del lote. */
const salida = (l: Lote) => l.duracionSeg

describe('tramosDeLotes', () => {
  it('LA TRAMPA: dos lotes que comparten `tiempoOriginal` NO reciben el mismo tramo', () => {
    // Los números son los reales de la sesión `520c9169`: `splitLongToma` partió la toma de
    // la ventana 16-35 en 11,3 s + 7,7 s, y los fragmentos cayeron en lotes distintos
    // conservando los dos la MISMA marca de tiempo.
    const lotes = [
      lote(3, [toma(4, 11.3, '00:16 - 00:35')]),
      lote(4, [toma(5, 7.7, '00:16 - 00:35')]),
    ]
    const [a, b] = tramosDeLotes(lotes, salida)
    expect(a).toEqual({ iniSeg: 16, finSeg: 27.3 })
    expect(b).toEqual({ iniSeg: 27.3, finSeg: 35 })
    // Y no se pisan: el fin de uno es el arranque del otro.
    expect(a!.finSeg).toBe(b!.iniSeg)
  })

  it('un lote con su ventana entera se la lleva completa', () => {
    const [t] = tramosDeLotes([lote(2, [toma(3, 6, '00:10 - 00:16')])], salida)
    expect(t).toEqual({ iniSeg: 10, finSeg: 16 })
  })

  it('un lote de dos tomas abarca de la primera ventana a la última', () => {
    const [t] = tramosDeLotes([lote(1, [toma(1, 3, '00:00 - 00:03'), toma(2, 7, '00:03 - 00:10')])], salida)
    expect(t).toEqual({ iniSeg: 0, finSeg: 10 })
  })

  it('respeta los dos topes de Wan: 15 s por clip y entrada+salida <= 30', () => {
    // Ventana de 19 s con un lote de 14 s de salida: el clip no puede pasar de 16 (30-14),
    // y tampoco de 15. Manda el más chico, y se recorta por el FINAL.
    const [t] = tramosDeLotes([lote(1, [toma(1, 14, '00:16 - 00:35')])], salida)
    expect(t).toEqual({ iniSeg: 16, finSeg: 31 })
    expect(t!.finSeg - t!.iniSeg).toBeLessThanOrEqual(REF_MAX_SEC)
    expect(t!.finSeg - t!.iniSeg + 14).toBeLessThanOrEqual(PRESUPUESTO_SEC)
  })

  it('una ventana ilegible da `null` — sin referencia, no un tramo inventado', () => {
    expect(tramosDeLotes([lote(1, [toma(1, 5, 'sin formato')])], salida)).toEqual([null])
  })

  it('un tramo por debajo del piso de 1 s da `null`', () => {
    // Ventana de 2 s repartida 19:1 entre dos lotes: al segundo le tocan 0,1 s.
    const lotes = [lote(1, [toma(1, 19, '00:00 - 00:02')]), lote(2, [toma(2, 1, '00:00 - 00:02')])]
    const [a, b] = tramosDeLotes(lotes, salida)
    expect(a).not.toBeNull()
    expect(b).toBeNull()
  })

  it('parseVentana rechaza lo que no es una ventana creciente', () => {
    expect(parseVentana('00:16 - 00:35')).toEqual([16, 35])
    expect(parseVentana('01:05 - 01:20')).toEqual([65, 80])
    expect(parseVentana('00:35 - 00:16')).toBeNull()
    expect(parseVentana('00:10')).toBeNull()
    expect(parseVentana('')).toBeNull()
  })
})
