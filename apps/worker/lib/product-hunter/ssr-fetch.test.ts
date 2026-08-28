import { describe, it, expect } from 'vitest'
import { EXTRACTOR_JS, advertiserUrl, readConnection } from './ssr-fetch'

// Se evalúa la MISMA fuente que corre en el browser, no una copia.
const extract = new Function(`return (${EXTRACTOR_JS})`)() as (html: string) => {
  count: number | null
  ads: { page_id: string; title: string | null; link_url: string | null; body: string | null }[]
} | null

const envolver = (conn: string) => `<html><script type="application/json">{"data":{"x":{"search_results_connection":${conn}}}}</script></html>`

const nodo = (id: string, extra = '') =>
  `{"node":{"collated_results":[{"ad_archive_id":"1","collation_count":2,"page_id":"${id}","snapshot":{"page_name":"Tienda ${id}","title":"Serum","link_url":"https://x.com/products/serum"${extra}}}]}}`

describe('extractor SSR', () => {
  it('saca el conteo y los anuncios', () => {
    const r = extract(envolver(`{"count":61,"edges":[${nodo('AAA')}]}`))
    expect(r?.count).toBe(61)
    expect(r?.ads).toHaveLength(1)
    expect(r?.ads[0].page_id).toBe('AAA')
    expect(r?.ads[0].link_url).toBe('https://x.com/products/serum')
  })

  // El balanceo tiene que respetar las llaves que viven DENTRO de un string:
  // el copy publicitario trae emojis, comillas escapadas y llaves de plantilla
  // ({{product.name}}) todo el tiempo.
  it('no se corta con llaves y comillas dentro del texto del anuncio', () => {
    const body = `"body":"{{product.name}} dijo \\"funciona\\" {ojo}"`
    const r = extract(envolver(`{"count":3,"edges":[${nodo('BBB', ',' + body)}]}`))
    expect(r?.count).toBe(3)
    expect(r?.ads[0].body).toBe('{{product.name}} dijo "funciona" {ojo}')
  })

  it('junta varios edges y varios collated_results', () => {
    const r = extract(envolver(`{"count":9,"edges":[${nodo('A')},${nodo('B')}]}`))
    expect(r?.ads.map((a) => a.page_id)).toEqual(['A', 'B'])
  })

  // Distinguir "no hay datos" de "cero anuncios" es lo que evita fabricar
  // monoproductos a partir de un fetch bloqueado.
  it('devuelve null cuando el HTML no trae el payload', () => {
    expect(extract('<html>bloqueado</html>')).toBeNull()
  })

  it('devuelve null si el JSON está truncado', () => {
    expect(extract(envolver('{"count":5,"edges":[{"node":'))).toBeNull()
  })

  it('count null pero lista vacía cuando el anunciante no tiene anuncios', () => {
    const r = extract(envolver('{"count":0,"edges":[]}'))
    expect(r?.count).toBe(0)
    expect(r?.ads).toEqual([])
  })
})

describe('advertiserUrl', () => {
  // sort_data sesga la proporción hasta 40 puntos (medido en verify-product.ts).
  it('no ordena por impresiones', () => {
    expect(advertiserUrl('123')).not.toContain('sort_data')
  })
  it('mide al anunciante en todos los países', () => {
    expect(advertiserUrl('123')).toContain('country=ALL')
  })
})

describe('readConnection — fallback por navegación', () => {
  const RESULTADO = { count: 50, ads: [{ page_id: '1' }] }

  /** Page falsa: decide qué hace el fetch y qué hace la navegación. */
  const fakePage = (opts: { fetchDevuelve: unknown; navDevuelve?: unknown; navFalla?: boolean }) => {
    const llamadas: string[] = []
    return {
      llamadas,
      evaluate: async (js: string) => {
        // El camino rápido arma un fetch; el fallback lee el DOM ya navegado.
        if (js.includes('fetch(')) { llamadas.push('fetch'); return opts.fetchDevuelve }
        llamadas.push('dom')
        return opts.navDevuelve ?? null
      },
      goto: async () => {
        llamadas.push('goto')
        if (opts.navFalla) throw new Error('net::ERR_ABORTED')
        return null
      },
      waitForTimeout: async () => {},
    }
  }

  it('cuando el fetch resuelve, NO navega (la navegación cuesta el doble)', async () => {
    const p = fakePage({ fetchDevuelve: RESULTADO })
    const r = await readConnection(p as never, 'https://x/y')
    expect(r).toEqual(RESULTADO)
    expect(p.llamadas).toEqual(['fetch'])
  })

  // Medido: el fetch same-origin moría con "Failed to fetch" mientras la
  // navegación al MISMO url devolvía los 30 anuncios. Sin este fallback el
  // barrido se corta por bloqueo persistente teniendo el contenido a mano.
  it('cuando el fetch se cae, lee navegando', async () => {
    const p = fakePage({ fetchDevuelve: null, navDevuelve: RESULTADO })
    const r = await readConnection(p as never, 'https://x/y')
    expect(r).toEqual(RESULTADO)
    expect(p.llamadas).toEqual(['fetch', 'goto', 'dom'])
  })

  it('si también falla la navegación, sigue siendo INCONCLUSO (null)', async () => {
    const p = fakePage({ fetchDevuelve: null, navFalla: true })
    expect(await readConnection(p as never, 'https://x/y')).toBeNull()
  })
})
