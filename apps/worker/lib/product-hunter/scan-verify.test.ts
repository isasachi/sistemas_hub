import { describe, it, expect, vi } from 'vitest'
import { juzgarCluster, leerAnunciante } from './scan-verify'
import type { ClusterInfo } from './product-key'
import * as ssr from './ssr-fetch'

const medicion = (share: number) => ({
  adCount: 300, adCountGlobal: 300, share, dominante: 'k', distintos: 8,
  muestra: 30, senal: 'ninguna' as const, textos: ['rodillera de compresion'], masViejo: null,
})

const cluster = (o: Partial<ClusterInfo> = {}): ClusterInfo => ({
  key: 'tienda.com/products/rodillera', n: 12, titulo: 'Rodillera', cuerpo: 'alivia el dolor',
  url: 'https://tienda.com/products/rodillera', estimado: 120, publicable: true, ...o,
})

describe('juzgarCluster — una página multiproducto ya no se descarta entera', () => {
  it('con share bajo NO descarta: el share de la página dejó de ser el veredicto', async () => {
    // El gate viejo (`share < SHARE_MIN → descartado`) tiró 4.860 filas sin que
    // ningún modelo las mirara. Son justo las páginas que esto viene a atender.
    const v = await juzgarCluster(null, 'rodilla', 'Tienda ABC', medicion(0.2), cluster())
    expect(v.status).not.toBe('descartado')
  })

  it('descarta el cluster que no llega al piso de muestra', async () => {
    const v = await juzgarCluster(null, 'rodilla', 'Tienda ABC', medicion(0.2),
      cluster({ n: 2, publicable: false, estimado: 200 }))
    expect(v.status).toBe('descartado')
    expect(v.nota).toMatch(/muestra/)
  })

  it('la lista negra sigue mandando sobre el anunciante entero', async () => {
    // Un marketplace no deja de serlo porque uno de sus productos tenga volumen.
    const v = await juzgarCluster(null, 'rodilla', 'Temu México', medicion(0.9), cluster({ n: 20 }))
    expect(v.status).toBe('descartado')
    expect(v.nota).toMatch(/no es producto físico/)
  })

  it('sin LLM mide pero no sella', async () => {
    const v = await juzgarCluster(null, 'rodilla', 'Tienda ABC', medicion(0.9), cluster())
    expect(v.status).toBe('sin_verificar')
  })
})

describe('leerAnunciante — un conteo sin anuncios es un BLOQUEO, no un vacío', () => {
  const page = {} as never

  it('devuelve null cuando hay conteo pero la lista viene vacía', async () => {
    // Es la firma del soft-block de Meta. Tratarla como lectura buena marcó
    // 19.027 filas como procesadas sin un solo cluster, y las sacó de las dos
    // colas para siempre — el fallo más caro que tuvo este pipeline.
    vi.spyOn(ssr, 'readConnection').mockResolvedValue({ count: 9779, ads: [] })
    expect(await leerAnunciante(page, '123')).toBeNull()
    vi.restoreAllMocks()
  })

  it('un anunciante SIN pauta activa (count 0) sí se lee: ahí el cero es el dato', async () => {
    vi.spyOn(ssr, 'readConnection').mockResolvedValue({ count: 0, ads: [] })
    const l = await leerAnunciante(page, '123')
    expect(l).not.toBeNull()
    expect(l!.adCount).toBe(0)
  })
})
