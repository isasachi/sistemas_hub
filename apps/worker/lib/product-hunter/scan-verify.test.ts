import { describe, it, expect, vi } from 'vitest'
import { juzgarCluster, leerAnunciante, esFalloDeApi } from './scan-verify'
import type { ClusterInfo } from './product-key'
import * as ssr from './ssr-fetch'
import * as scraper from './scraper'

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

  it('devuelve null cuando hay conteo sin anuncios Y las lecturas vecinas también fallan', async () => {
    // Es la firma del soft-block de Meta. Tratarla como lectura buena marcó
    // 19.027 filas como procesadas sin un solo cluster, y las sacó de las dos
    // colas para siempre — el fallo más caro que tuvo este pipeline.
    vi.spyOn(ssr, 'readConnection').mockResolvedValue({ count: 9779, ads: [] })
    vi.spyOn(scraper, 'rachaVacia').mockReturnValue(3)   // veníamos leyendo en cero
    expect(await leerAnunciante(page, '123')).toBeNull()
    vi.restoreAllMocks()
  })

  it('SÍ resuelve cuando los vecinos leen bien: el vacío es de ese anunciante', async () => {
    // Medido: `count=19 ads=0` en 1Click Store con las lecturas de al lado
    // funcionando — sus anuncios no los parsea el extractor. Devolverlo como
    // inconcluso lo deja en la cola para siempre, y como la cola va por volumen
    // se acumulan en la cabeza: 24 de 25 filas inconclusas por esto.
    vi.spyOn(ssr, 'readConnection').mockResolvedValue({ count: 19, ads: [] })
    vi.spyOn(scraper, 'rachaVacia').mockReturnValue(0)   // la anterior trajo nodos
    const l = await leerAnunciante(page, '123')
    expect(l).not.toBeNull()
    expect(l!.muestra).toBe(0)
    vi.restoreAllMocks()
  })

  it('un anunciante SIN pauta activa (count 0) sí se lee: ahí el cero es el dato', async () => {
    vi.spyOn(ssr, 'readConnection').mockResolvedValue({ count: 0, ads: [] })
    const l = await leerAnunciante(page, '123')
    expect(l).not.toBeNull()
    expect(l!.adCount).toBe(0)
  })
})

// El barrido CORTA el lote cuando el proveedor se cayó y SIGUE cuando el fallo
// es de una fila. Con OpenAI como motor esa decisión se toma sobre un mensaje
// con otra forma que la del SDK de Anthropic (`5xx {`), así que hay que fijarla:
// una caída no reconocida deja el barrido horas quemando navegaciones —la parte
// cara— y marcando anunciantes como error.
describe('esFalloDeApi — el motor OpenAI también tiene que cortar el lote', () => {
  it('corta con 5xx y con 429, que son del proveedor', () => {
    expect(esFalloDeApi('openai 500: The server had an error processing your request.')).toBe(true)
    expect(esFalloDeApi('openai 429: Rate limit reached')).toBe(true)
    expect(esFalloDeApi('openai 402: insufficient_quota')).toBe(true)
  })

  it('NO corta con 400, que es un request MAL ARMADO por nosotros', () => {
    // El caso real: medio emoji en el texto. Abortar el barrido entero por una
    // fila que nosotros rompimos es la reacción equivocada.
    expect(esFalloDeApi('openai 400: Invalid body: failed to parse JSON value.')).toBe(false)
  })

  it('sigue reconociendo la forma de Anthropic', () => {
    expect(esFalloDeApi('500 {"type":"error"}')).toBe(true)
    expect(esFalloDeApi('credit balance is too low')).toBe(true)
  })
})

