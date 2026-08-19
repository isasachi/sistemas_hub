import { describe, it, expect, vi } from 'vitest'
import { buildFramePrompt, frameSpecs, pairFrames, generateBoundaryFrames } from './frames'
import type { Lote } from './lotes'

const lote = (n: number, acciones: string[]): Lote => ({
  n,
  tomas: acciones.map((accionVisual, i) => ({
    n: i + 1, duracionSeg: 4, accionVisual, personaje: 'Mujer de 25',
    producto: 'Blusa celeste', locucion: `linea ${i + 1}`, tiempoOriginal: '00:00 - 00:04',
  })),
  duracionSeg: 4 * acciones.length,
  prompt: '', taskId: null, status: 'idle', videoUrl: null, failMsg: null, scriptHash: null,
})

describe('frameSpecs', () => {
  it('un frame por lote, retratando el final de su ÚLTIMA toma', () => {
    const specs = frameSpecs([lote(1, ['abre la caja', 'saca el frasco']), lote(2, ['aplica el suero'])])
    expect(specs).toHaveLength(2)
    expect(specs[0].accionVisual).toBe('saca el frasco')
    expect(specs[1].accionVisual).toBe('aplica el suero')
  })

  it('solo el último lote es cierre del anuncio', () => {
    const specs = frameSpecs([lote(1, ['a']), lote(2, ['b']), lote(3, ['c'])])
    expect(specs.map((s) => s.esCierre)).toEqual([false, false, true])
  })
})

describe('pairFrames', () => {
  // Esta es LA invariante del modo de frames. Si el lote i no recibe exactamente
  // (frame i-1, frame i), un clip arranca en una pose que no es donde terminó el
  // anterior y la continuidad —el motivo entero de usar keyframes— se pierde.
  it('el avatar abre el primer lote y cada frame cierra uno y abre el siguiente', () => {
    const pares = pairFrames('AVATAR', ['f1', 'f2', 'f3'])
    expect(pares).toEqual([
      { inicio: 'AVATAR', fin: 'f1' },
      { inicio: 'f1', fin: 'f2' },
      { inicio: 'f2', fin: 'f3' },
    ])
  })

  it('el fin de un lote y el inicio del siguiente son EL MISMO archivo, no uno parecido', () => {
    const pares = pairFrames('AVATAR', ['f1', 'f2', 'f3'])
    for (let i = 0; i < pares.length - 1; i++) {
      expect(pares[i].fin).toBe(pares[i + 1].inicio)
    }
  })

  it('un solo lote usa el avatar y su cierre', () => {
    expect(pairFrames('AVATAR', ['f1'])).toEqual([{ inicio: 'AVATAR', fin: 'f1' }])
  })
})

describe('buildFramePrompt', () => {
  const p = buildFramePrompt({ accionVisual: 'levanta el frasco hasta el mentón', productDesc: 'Frasco celeste de 30 ml' })

  it('es DIFERENCIAL: cambia solo la pose, no describe la escena de nuevo', () => {
    // Describir la escena entera es lo que hace que cada llamada la reimagine — medido:
    // el frame 2 salió con otro pantalón, otro encuadre y un teléfono en cuadro.
    expect(p).toMatch(/ÚNICAMENTE la POSE/)
    expect(p).toMatch(/IDÉNTICO/)
  })

  it('nombra el pantalón entre los invariantes — fue lo primero que cambió en la prueba real', () => {
    expect(p).toMatch(/pantal[oó]n/i)
  })

  it('prohíbe que aparezca el teléfono, que el lenguaje de cámara UGC invita a dibujar', () => {
    expect(p).toMatch(/tel[eé]fono/i)
    expect(p).toMatch(/tr[ií]pode/i)
  })

  it('retrata el FINAL de la acción, no su inicio', () => {
    expect(p).toContain('levanta el frasco hasta el mentón')
    expect(p).toMatch(/TERMINA esta acción/)
    expect(p).toMatch(/no su inicio/)
  })

  it('el último frame se anuncia como cierre del anuncio', () => {
    const cierre = buildFramePrompt({ accionVisual: 'sonríe a cámara', productDesc: 'x', esCierre: true })
    expect(cierre).toMatch(/último fotograma del anuncio/)
    expect(cierre).not.toMatch(/no su inicio/)
  })
})

describe('generateBoundaryFrames', () => {
  it('genera uno por lote, con el avatar y el producto como referencia, y sube cada uno', async () => {
    const generate = vi.fn(async (_input: { prompt: string; imageUrls: string[] }) => Buffer.from('png'))
    const upload = vi.fn(async (_b: Buffer, nombre: string) => `https://cdn.test/${nombre}.png`)
    const urls = await generateBoundaryFrames({
      avatarUrl: 'AVATAR', productUrl: 'PRODUCTO', productDesc: 'Frasco celeste',
      specs: frameSpecs([lote(1, ['a']), lote(2, ['b'])]),
      generate, upload,
    })
    expect(urls).toEqual(['https://cdn.test/frame-1.png', 'https://cdn.test/frame-2.png'])
    expect(generate).toHaveBeenCalledTimes(2)
    // El avatar PRIMERO: es la escena y la identidad de la que todo lo demás deriva.
    for (const call of generate.mock.calls) {
      expect(call[0].imageUrls).toEqual(['AVATAR', 'PRODUCTO'])
    }
  })

  it('conserva el ORDEN aunque las llamadas terminen desordenadas', async () => {
    // Corren en paralelo: si el resultado se armara por orden de llegada en vez de por
    // índice, el frame de un lote cerraría otro y los clips se pegarían cruzados.
    const upload = vi.fn(async (_b: Buffer, nombre: string) => `https://cdn.test/${nombre}.png`)
    let n = 0
    const generate = vi.fn(async (_input: { prompt: string; imageUrls: string[] }) => {
      const propio = n++
      await new Promise((r) => setTimeout(r, propio === 0 ? 30 : 1))
      return Buffer.from('png')
    })
    const urls = await generateBoundaryFrames({
      avatarUrl: 'A', productUrl: 'P', productDesc: 'x',
      specs: frameSpecs([lote(1, ['a']), lote(2, ['b']), lote(3, ['c'])]),
      generate, upload,
    })
    expect(urls).toEqual([
      'https://cdn.test/frame-1.png', 'https://cdn.test/frame-2.png', 'https://cdn.test/frame-3.png',
    ])
  })
})
