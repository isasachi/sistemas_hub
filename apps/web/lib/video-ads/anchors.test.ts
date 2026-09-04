import { describe, it, expect } from 'vitest'
import { anchorSpecs, buildAnchorPrompt, primeraAccion, generateAnchorImages } from './anchors'
import { groupIntoLotes } from './lotes'
import { MAX_IMAGES } from './kie'
import type { TomaFinal } from './adapt'

const toma = (n: number, tiempo: string, accionVisual: string): TomaFinal => ({
  n, tiempoOriginal: tiempo, duracionSeg: 4, accionVisual,
  personaje: '', producto: '', locucion: `linea ${n}`,
})

const PERSONA = 'La mujer sostiene el frasco y mira a cámara'
const PRODUCTO = 'Detalle del frasco sobre la mesa, sin persona en cuadro'

describe('primeraAccion', () => {
  // El ancla retrata el INICIO de la escena; el frame de cierre de Veo retrataba el
  // final. Con la coreografía fusionada entera delante, el generador devolvió un collage.
  it('se queda con la primera sub-acción de una coreografía fusionada', () => {
    expect(primeraAccion('Levanta el frasco. Luego, lo abre. Luego, se aplica el serum.'))
      .toBe('Levanta el frasco.')
  })

  it('una acción sin fusionar se devuelve intacta', () => {
    expect(primeraAccion(PERSONA)).toBe(PERSONA)
  })
})

describe('anchorSpecs', () => {
  const planos = new Map([['t1', 'Plano medio'], ['t2', 'Plano medio'], ['t3', 'Primer plano']])

  // ⚠️ INVIERTE la regla anterior (*"el primer lote no lleva ancla, arranca del avatar"*).
  // El avatar es una imagen válida del ESCENARIO y no de la POSE: es un retrato neutro, y
  // un anuncio que abre con el gotero ya en la mejilla gastaba sus primeros segundos
  // llegando ahí.
  it('el primer lote TAMBIÉN abre con su propia ancla', () => {
    const lote = groupIntoLotes([toma(1, 't1', PERSONA), toma(2, 't2', PERSONA)])[0]
    const specs = anchorSpecs({ lote, planoPorTiempo: planos, productDesc: 'frasco' })
    expect(specs).toHaveLength(1)
    expect(specs[0].tiempo).toBe('t1')
  })

  // El instante del original del que sale el fotograma de la pose. Sin timeline no hay
  // ninguno y el ancla se genera como siempre, solo desde el texto.
  it('el ancla lleva el instante del primer beat de su toma', () => {
    const t1 = { ...toma(1, 't1', PERSONA), beats: [{ startSec: 0, endSec: 2, referenceFrameMs: 3500, action: 'a', productStateBefore: '', productStateAfter: '', importance: 'major' as const }] }
    const specs = anchorSpecs({ lote: groupIntoLotes([t1])[0], productDesc: 'frasco' })
    expect(specs[0].referenceFrameMs).toBe(3500)
    expect(anchorSpecs({ lote: groupIntoLotes([toma(1, 't1', PERSONA)])[0], productDesc: 'frasco' })[0].referenceFrameMs)
      .toBeUndefined()
  })

  // ⚠️ EL EJE QUE ANCLA EL FONDO ENTRE CLIPS. Sin esto, con `maxPlanos = 1` un lote de una
  // sola escena no generaba ninguna ancla — medido, **0 anclas en dos sesiones enteras** —
  // y cada clip re-imaginaba el entorno: en `7e4ccbcf` los 5 clips conservaron la persona y
  // el suéter pero pasaron por un marco de puerta, dos cuadros, una puerta blanca y una
  // planta. La premisa se midió antes de cablearlo: dos anclas generadas desde el mismo
  // avatar conservan su habitación (gpt-image-2 conserva al editar; grok re-inventa al
  // generar video).
  it('todo lote que no sea el primero abre con su propia ancla', () => {
    const base = groupIntoLotes([toma(1, 't1', PERSONA), toma(2, 't2', PERSONA)])[0]
    const specs = anchorSpecs({ lote: { ...base, n: 3 }, planoPorTiempo: planos, productDesc: 'frasco' })
    expect(specs).toHaveLength(1)
    expect(specs[0].tiempo).toBe('t1')
    expect(specs[0].soloProducto).toBe(false)
  })

  it('un cambio de encuadre abre una escena nueva y pide su ancla', () => {
    const lote = groupIntoLotes([toma(1, 't1', PERSONA), toma(3, 't3', PERSONA)])[0]
    const specs = anchorSpecs({ lote, planoPorTiempo: planos, productDesc: 'frasco' })
    expect(specs).toHaveLength(2)
    expect(specs[1].tiempo).toBe('t3')
    expect(specs[1].role).toContain('Primer plano')
  })

  // Es el mismo criterio con el que `mergeMicroCortes` decide qué puede fusionar: un
  // flat-lay del producto y un plano de persona no son la misma escena.
  it('pasar de un plano de persona a uno sin persona abre escena nueva', () => {
    const lote = groupIntoLotes([toma(1, 't1', PERSONA), toma(2, 't2', PRODUCTO)])[0]
    const specs = anchorSpecs({ lote, productDesc: 'frasco' })
    expect(specs).toHaveLength(2)
    // ⚠️ Y se marca como plano SIN persona: `images.edit` conserva lo que se le da, así
    // que mandarle el avatar a un flat-lay devuelve a alguien sosteniendo el producto.
    expect(specs[1].soloProducto).toBe(true)
  })

  it('un flat-lay pide el producto SOLO como referencia, sin el avatar', async () => {
    const lote = groupIntoLotes([toma(1, 't1', PERSONA), toma(2, 't2', PRODUCTO)])[0]
    const specs = anchorSpecs({ lote, productDesc: 'frasco' })
    const pedidos: string[][] = []
    await generateAnchorImages({
      avatarUrl: 'https://cdn/avatar.png', productUrl: 'https://cdn/producto.png',
      lote: 1, specs,
      generate: async (i) => { pedidos.push(i.imageUrls); return Buffer.from('x') },
      upload: async () => 'https://cdn/x.png',
    })
    expect(pedidos[1]).toEqual(['https://cdn/producto.png'])
    // Y su prompt prohíbe explícitamente que aparezca nadie.
    expect(specs[1].prompt).toMatch(/NO PERSON IN FRAME/)
    expect(specs[1].prompt).not.toMatch(/pose of the person/)
  })

  // ⚠️ EL FOTOGRAMA VA ÚLTIMO PORQUE EL PROMPT LO CITA ASÍ ("the LAST image"). Y el bloque
  // de pose solo se emite cuando hay fotograma: nombrar una imagen que no se manda es la
  // referencia colgante que este repo ya registró tres veces.
  it('el fotograma de pose va como última imagen, y su bloque solo existe con él', async () => {
    const lote = groupIntoLotes([toma(1, 't1', PERSONA)])[0]
    const specs = anchorSpecs({ lote, productDesc: 'frasco' })
    const pedidos: { prompt: string; imageUrls: string[] }[] = []
    const correr = () => generateAnchorImages({
      avatarUrl: 'https://cdn/avatar.png', productUrl: 'https://cdn/producto.png',
      lote: 1, specs,
      generate: async (i) => { pedidos.push(i); return Buffer.from('x') },
      upload: async () => 'https://cdn/x.png',
    })
    await correr()
    expect(pedidos[0].imageUrls).toEqual(['https://cdn/avatar.png', 'https://cdn/producto.png'])
    expect(pedidos[0].prompt).not.toMatch(/POSE REFERENCE/)

    specs[0].poseUrl = 'https://cdn/pose.jpg'
    await correr()
    expect(pedidos[1].imageUrls).toEqual(['https://cdn/avatar.png', 'https://cdn/producto.png', 'https://cdn/pose.jpg'])
    expect(pedidos[1].prompt).toMatch(/POSE REFERENCE — the LAST image/)
    // El fotograma sale de un video de redes: trae marca de agua y subtítulos quemados.
    expect(pedidos[1].prompt).toMatch(/no watermark, no username, no caption/)
  })

  // ⚠️ El avatar y el producto ocupan dos de las siete plazas de `image_urls`. Pasarse
  // haría que KIE rechazara la tarea entera.
  it('nunca pide más anclas de las que caben junto al avatar y el producto', () => {
    const muchas = Array.from({ length: 12 }, (_, i) =>
      toma(i + 1, `t${i}`, i % 2 ? PERSONA : PRODUCTO))
    const lote = groupIntoLotes(muchas)[0]
    const specs = anchorSpecs({ lote, productDesc: 'frasco' })
    expect(specs.length).toBeLessThanOrEqual(MAX_IMAGES - 2)
    expect(specs.length + 2).toBeLessThanOrEqual(MAX_IMAGES)
  })
})

describe('buildAnchorPrompt', () => {
  const p = buildAnchorPrompt({
    accionVisual: 'Levanta el frasco. Luego, se lo acerca a la mejilla.',
    camara: 'Primer plano del rostro',
    productDesc: 'Frasco celeste de 30 ml',
  })

  it('va en inglés: lo consume gpt-image-2', () => {
    expect(p).toMatch(/ONE SINGLE PHOTOGRAPH/)
  })

  // Las cuatro lecciones que costaron renders reales en la época de los keyframes. El
  // modelo de imagen cambió, el modo de fallo no.
  it('prohíbe el collage', () => {
    expect(p).toMatch(/NOT a collage, NOT a grid/)
    // Y retrata el INICIO de la escena, no la cadena entera de sub-acciones.
    expect(p).toContain('Levanta el frasco.')
    expect(p).not.toContain('se lo acerca a la mejilla')
  })

  it('manda ignorar la ropa y los rasgos que menciona la coreografía', () => {
    expect(p).toMatch(/IGNORE them: they describe the\nreference video/)
  })

  it('prohíbe teléfonos, cámaras y trípodes en cuadro', () => {
    expect(p).toMatch(/No phone, camera, tripod/)
  })

  it('exige realismo fotográfico, sin piel suavizada ni estilizada', () => {
    expect(p).toMatch(/NOT airbrushed, NOT pastel, NOT/)
    expect(p).toMatch(/Real skin with visible texture/)
  })

  it('en voz en off el encuadre lo manda la acción, no la cara', () => {
    const off = buildAnchorPrompt({
      accionVisual: 'Detalle de los pies con la bota', camara: 'Plano detalle',
      productDesc: 'bota', vozEnOff: true,
    })
    expect(off).toMatch(/the face does not need to be visible/)
  })
})

describe('generateAnchorImages', () => {
  it('genera una imagen por spec, con avatar y producto como referencia', async () => {
    const pedidos: { prompt: string; imageUrls: string[] }[] = []
    const urls = await generateAnchorImages({
      avatarUrl: 'https://cdn/avatar.png',
      productUrl: 'https://cdn/producto.png',
      lote: 2,
      specs: [
        { tiempo: 't3', role: 'anchor A', prompt: 'prompt A' },
        { tiempo: 't5', role: 'anchor B', prompt: 'prompt B' },
      ],
      generate: async (input) => { pedidos.push(input); return Buffer.from('png') },
      upload: async (_b, nombre) => `https://cdn/${nombre}.png`,
    })
    expect(urls).toEqual(['https://cdn/ancla-2-1.png', 'https://cdn/ancla-2-2.png'])
    // El orden de las referencias es el que cita el prompt: persona primero.
    expect(pedidos[0].imageUrls).toEqual(['https://cdn/avatar.png', 'https://cdn/producto.png'])
    expect(pedidos.map((p) => p.prompt)).toEqual(['prompt A', 'prompt B'])
  })

  it('sin specs no genera ninguna imagen', async () => {
    const urls = await generateAnchorImages({
      avatarUrl: 'a', productUrl: 'b', lote: 1, specs: [],
      generate: async () => { throw new Error('no debería llamarse') },
      upload: async () => 'x',
    })
    expect(urls).toEqual([])
  })
})
