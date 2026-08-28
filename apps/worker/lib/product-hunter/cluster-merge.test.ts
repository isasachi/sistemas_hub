import { describe, it, expect } from 'vitest'
import { textoDeCluster, fusionarPorEmbedding, UMBRAL_FUSION } from './cluster-merge'
import type { ClusterInfo } from './product-key'

const c = (o: Partial<ClusterInfo> = {}): ClusterInfo => ({
  key: 'k', n: 1, titulo: null, cuerpo: null, url: null,
  estimado: 0, publicable: true, ...o,
})

describe('textoDeCluster — qué se embebe', () => {
  // Sin esto, `api.whatsapp.com/send` aporta el slug "send" a TODOS los
  // clusters del anunciante y los textos colapsan: medido, 983 pares en la
  // banda 0.9+ y ocho con similitud EXACTA 1.000 entre productos distintos.
  it('el slug de un link de chat NO entra', () => {
    const t = textoDeCluster(c({ titulo: 'Pestañas', url: 'https://api.whatsapp.com/send?phone=1' }))
    expect(t).not.toContain('send')
    expect(t).toContain('Pestañas')
  })

  it('el slug de una landing real SÍ entra, en palabras', () => {
    const t = textoDeCluster(c({ url: 'https://t.com/products/rodillera-de-compresion' }))
    expect(t).toContain('rodillera de compresion')
  })

  // Sin el cuerpo, el MISMO producto en dos idiomas daba 0.714 y quedaba por
  // DEBAJO de dos productos distintos con el mismo título plantilla (0.939):
  // el orden se invertía justo en el caso que importa.
  it('el cuerpo del anuncio va primero: es el campo con más texto de producto', () => {
    const t = textoDeCluster(c({ cuerpo: 'alivia el dolor de rodilla', titulo: 'Oferta' }))
    expect(t.indexOf('alivia el dolor')).toBeLessThan(t.indexOf('Oferta'))
  })
})

describe('fusionarPorEmbedding', () => {
  // Precisión 1.00 con 31 fusiones sobre 140 pares etiquetados. Era 0.95 (misma
  // precisión, 25 fusiones) y se bajó CON medición al cambiar lo que se embebe.
  // A 0.82 la precisión cae a 0.85: 10 fusiones erróneas, o sea publicar un
  // catálogo como si fuera un producto, que es el fallo caro de este eje.
  it('el umbral por defecto es 0.92', () => {
    expect(UMBRAL_FUSION).toBe(0.92)
  })

  it('fusiona los que pasan el umbral y suma sus anuncios', () => {
    const cs = [c({ key: 'a', n: 10 }), c({ key: 'b', n: 6 }), c({ key: 'c', n: 3 })]
    // a y b idénticos; c ortogonal.
    const vecs = [[1, 0], [1, 0], [0, 1]]
    const out = fusionarPorEmbedding(cs, vecs, 0.95)
    expect(out).toHaveLength(2)
    expect(out[0].n).toBe(16)        // 10 + 6
    expect(out[0].key).toBe('a')     // se conserva la clave del más grande
    expect(out[1].n).toBe(3)
  })

  it('sin pares por encima del umbral devuelve lo mismo', () => {
    const cs = [c({ key: 'a', n: 5 }), c({ key: 'b', n: 4 })]
    const out = fusionarPorEmbedding(cs, [[1, 0], [0, 1]], 0.95)
    expect(out.map((x) => x.key)).toEqual(['a', 'b'])
  })

  // El estimado es proporcional a la muestra, así que fusionar dos clusters
  // tiene que sumar también su estimado — si no, la card muestra un producto
  // con 16 anuncios de muestra y el conteo de uno de 10.
  it('suma el estimado además de la muestra', () => {
    const cs = [c({ key: 'a', n: 10, estimado: 100 }), c({ key: 'b', n: 6, estimado: 60 })]
    const out = fusionarPorEmbedding(cs, [[1, 0], [1, 0]], 0.95)
    expect(out[0].estimado).toBe(160)
  })
})
