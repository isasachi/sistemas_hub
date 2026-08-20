import { describe, it, expect, vi } from 'vitest'
import { buildFramePrompt, frameSpecs, pairFrames, generateBoundaryFrames, ultimaAccion } from './frames'
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
    const specs = frameSpecs([lote(1, ['la mujer abre la caja', 'la mujer saca el frasco']), lote(2, ['la mujer aplica el suero'])])
    expect(specs).toHaveLength(2)
    expect(specs[0].accionVisual).toBe('la mujer saca el frasco')
    expect(specs[1].accionVisual).toBe('la mujer aplica el suero')
  })

  it('solo el último lote es cierre del anuncio', () => {
    const specs = frameSpecs([lote(1, ['la mujer saluda']), lote(2, ['la mujer sonríe']), lote(3, ['la mujer señala'])])
    expect(specs.map((s) => s.esCierre)).toEqual([false, false, true])
  })
})

describe('frameSpecs — la cadena se rompe en el corte de montaje', () => {
  // El avatar es un plano de PERSONA. Un lote de persona puede encadenar con él; un
  // flat-lay del producto, no: compartir ese frame obliga a un clip a interpolar de un
  // plano a otro, o sea a hacer un corte dentro de un plano continuo. Medido en un
  // render real: el clip fue persona → detalle de la etiqueta → persona en 4 segundos.
  const persona = (n: number) => lote(n, ['la mujer levanta la mano y mira a la cámara'])
  const flatlay = (n: number) => lote(n, ['la blusa extendida sobre el suelo, vista cenital'])

  it('lotes de la misma clase encadenan: solo frames de cierre', () => {
    const jobs = frameSpecs([persona(1), persona(2)])
    expect(jobs.map((j) => `${j.lote}:${j.rol}`)).toEqual(['1:fin', '2:fin'])
  })

  it('un flat-lay después de una persona recibe su PROPIA apertura', () => {
    const jobs = frameSpecs([persona(1), flatlay(2), persona(3)])
    expect(jobs.map((j) => `${j.lote}:${j.rol}`))
      .toEqual(['1:fin', '2:inicio', '2:fin', '3:inicio', '3:fin'])
  })

  it('si el anuncio ABRE con un flat-lay, el avatar no puede abrirlo', () => {
    const jobs = frameSpecs([flatlay(1), persona(2)])
    expect(jobs[0]).toMatchObject({ lote: 1, rol: 'inicio' })
  })
})

describe('pairFrames', () => {
  const persona = (n: number) => lote(n, ['la mujer levanta la mano y mira a la cámara'])
  const flatlay = (n: number) => lote(n, ['la blusa extendida sobre el suelo, vista cenital'])

  // Esta es LA invariante del modo de frames DENTRO de una escena continua: si el lote i
  // no recibe exactamente (cierre de i-1, cierre de i), un clip arranca en una pose que
  // no es donde terminó el anterior y la continuidad se pierde.
  it('el avatar abre el primero y cada cierre abre el siguiente', () => {
    const jobs = frameSpecs([persona(1), persona(2), persona(3)])
    const pares = pairFrames('AVATAR', jobs, ['f1', 'f2', 'f3'])
    expect(pares).toEqual([
      { inicio: 'AVATAR', fin: 'f1' },
      { inicio: 'f1', fin: 'f2' },
      { inicio: 'f2', fin: 'f3' },
    ])
    for (let i = 0; i < pares.length - 1; i++) expect(pares[i].fin).toBe(pares[i + 1].inicio)
  })

  it('en el corte de montaje NO se comparte el frame', () => {
    const jobs = frameSpecs([persona(1), flatlay(2)])
    // jobs: 1:fin, 2:inicio, 2:fin
    const pares = pairFrames('AVATAR', jobs, ['f1', 'ini2', 'f2'])
    expect(pares).toEqual([
      { inicio: 'AVATAR', fin: 'f1' },
      { inicio: 'ini2', fin: 'f2' },
    ])
    expect(pares[0].fin).not.toBe(pares[1].inicio)
  })

  it('un solo lote usa el avatar y su cierre', () => {
    const jobs = frameSpecs([persona(1)])
    expect(pairFrames('AVATAR', jobs, ['f1'])).toEqual([{ inicio: 'AVATAR', fin: 'f1' }])
  })
})

// ⚠️ FALLO MEDIDO EN UN RENDER REAL. `mergeMicroCortes` deja `accionVisual` como una
// cadena de hasta nueve acciones unidas con "Luego,". Con ese texto entero, Nano Banana
// Pro devolvió un COLLAGE DE SEIS PANELES en vez de una foto, y el clip que Veo
// interpoló desde ahí cortó a un flat-lay y después a la grilla.
describe('ultimaAccion', () => {
  it('se queda con la última sub-acción de una coreografía fusionada', () => {
    expect(ultimaAccion('abre la caja Luego, saca el frasco Luego, lo levanta'))
      .toBe('lo levanta')
  })

  it('una acción sin fusionar vuelve intacta', () => {
    expect(ultimaAccion('levanta el frasco hasta el mentón')).toBe('levanta el frasco hasta el mentón')
  })

  it('el prompt lleva SOLO la última, no la cadena entera', () => {
    const p = buildFramePrompt({ accionVisual: 'gira el torso Luego, señala la manga', productDesc: 'x' })
    expect(p).toContain('señala la manga')
    expect(p).not.toContain('gira el torso')
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

  it('exige UNA sola fotografía — el modelo devolvió un collage de seis paneles', () => {
    expect(p).toMatch(/UNA SOLA FOTOGRAF[IÍ]A/)
    expect(p).toMatch(/NO es un collage/)
    expect(p).toMatch(/grilla/)
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

  // La coreografía viene del análisis del video de REFERENCIA y menciona la ropa de otra
  // persona ("vestida con la blusa y falda negras" en la sesión de ropa, con un producto
  // celeste). En un prompt de edición el texto le gana a la imagen si nadie lo acota.
  it('manda ignorar la ropa y el aspecto que mencione la coreografía', () => {
    expect(p).toMatch(/SOLO el movimiento y la posición del cuerpo/)
    expect(p).toMatch(/IGN[OÓ]RALOS/)
    expect(p).toMatch(/describen el video de referencia/)
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
      specs: frameSpecs([lote(1, ['la mujer saluda']), lote(2, ['la mujer sonríe'])]),
      generate, upload,
    })
    expect(urls).toEqual(['https://cdn.test/frame-1-fin.png', 'https://cdn.test/frame-2-fin.png'])
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
      specs: frameSpecs([lote(1, ['la mujer saluda']), lote(2, ['la mujer sonríe']), lote(3, ['la mujer señala'])]),
      generate, upload,
    })
    expect(urls).toEqual([
      'https://cdn.test/frame-1-fin.png', 'https://cdn.test/frame-2-fin.png', 'https://cdn.test/frame-3-fin.png',
    ])
  })
})

/**
 * VARIOS PERSONAJES en los frames (slice 4). La cadena ya se rompía entre un plano de
 * persona y uno de producto; con varios hace falta más: **un plano del padre y uno del
 * hijo tampoco pueden compartir fotograma**. Es un corte de montaje igual que el flat-lay,
 * y compartirlo obligaría a un clip a interpolar de una cara a otra.
 */
describe('frameSpecs — la cadena se rompe cuando cambia QUIÉN está en cuadro', () => {
  const pers = (id: string, rol: string) => ({
    id, rol, desc: '', etnia: '', acento: '', voz: '', fotoUrl: null,
    avatarUrl: `https://cdn/${id}.png`, consistencyBlock: null,
    voiceProfile: null, motionProfile: null,
  })
  const hijo = pers('P1', 'hijo')
  const padre = pers('P2', 'padre')
  const conT = (n: number, tiempo: string, accion: string) => ({
    ...lote(n, [accion]),
    tomas: [{ ...lote(n, [accion]).tomas[0], tiempoOriginal: tiempo }],
  })

  it('dos lotes de la MISMA persona encadenan', () => {
    const quien = new Map([['t1', [hijo]], ['t2', [hijo]]])
    const jobs = frameSpecs(
      [conT(1, 't1', 'la mujer saluda'), conT(2, 't2', 'la mujer sonríe')] as never, quien,
    )
    expect(jobs.map((j) => `${j.lote}:${j.rol}`)).toEqual(['1:fin', '2:fin'])
  })

  it('un cambio de persona ROMPE la cadena y pide apertura propia', () => {
    const quien = new Map([['t1', [hijo]], ['t2', [padre]]])
    const jobs = frameSpecs(
      [conT(1, 't1', 'el hombre joven habla'), conT(2, 't2', 'el hombre mayor responde')] as never, quien,
    )
    expect(jobs.map((j) => `${j.lote}:${j.rol}`)).toEqual(['1:fin', '2:inicio', '2:fin'])
  })

  it('pasar de uno solo a los dos juntos también rompe', () => {
    const quien = new Map([['t1', [hijo]], ['t2', [hijo, padre]]])
    const jobs = frameSpecs(
      [conT(1, 't1', 'el hombre joven habla'), conT(2, 't2', 'los dos hombres se abrazan')] as never, quien,
    )
    expect(jobs.some((j) => j.lote === 2 && j.rol === 'inicio')).toBe(true)
  })

  it('cada job sabe a QUIÉN retrata: es de donde salen sus avatares de referencia', () => {
    const quien = new Map([['t1', [hijo]], ['t2', [hijo, padre]]])
    const jobs = frameSpecs(
      [conT(1, 't1', 'el hombre joven habla'), conT(2, 't2', 'los dos hombres se abrazan')] as never, quien,
    )
    expect(jobs.find((j) => j.lote === 1)?.personajes.map((p) => p.id)).toEqual(['P1'])
    expect(jobs.find((j) => j.lote === 2 && j.rol === 'fin')?.personajes.map((p) => p.id))
      .toEqual(['P1', 'P2'])
  })

  it('SIN mapa se comporta exactamente como antes del soporte de varios', () => {
    const lotes = [conT(1, 't1', 'la mujer saluda'), conT(2, 't2', 'la mujer sonríe')] as never
    expect(frameSpecs(lotes).map((j) => `${j.lote}:${j.rol}`))
      .toEqual(frameSpecs(lotes, new Map()).map((j) => `${j.lote}:${j.rol}`))
  })
})

describe('generateBoundaryFrames — referencias por personaje', () => {
  const p2 = {
    id: 'P2', rol: 'padre', desc: '', etnia: '', acento: '', voz: '', fotoUrl: null,
    avatarUrl: 'https://cdn/P2.png', consistencyBlock: null, voiceProfile: null, motionProfile: null,
  }

  it('usa el avatar de QUIEN sale, no el del protagonista', async () => {
    const generate = vi.fn(async (_i: { prompt: string; imageUrls: string[] }) => Buffer.from('x'))
    await generateBoundaryFrames({
      avatarUrl: 'AVATAR-PROTA', productUrl: 'PROD', productDesc: 'x',
      specs: [{ lote: 1, rol: 'fin', accionVisual: 'a', esCierre: true, personajes: [p2], vozEnOff: false }],
      generate, upload: async () => 'u',
    })
    expect(generate.mock.calls[0][0].imageUrls).toEqual(['https://cdn/P2.png', 'PROD'])
  })

  it('sin personajes cae al avatar del protagonista — sesiones sin atribución', async () => {
    const generate = vi.fn(async (_i: { prompt: string; imageUrls: string[] }) => Buffer.from('x'))
    await generateBoundaryFrames({
      avatarUrl: 'AVATAR-PROTA', productUrl: 'PROD', productDesc: 'x',
      specs: [{ lote: 1, rol: 'fin', accionVisual: 'a', esCierre: true, personajes: [], vozEnOff: false }],
      generate, upload: async () => 'u',
    })
    expect(generate.mock.calls[0][0].imageUrls).toEqual(['AVATAR-PROTA', 'PROD'])
  })
})
