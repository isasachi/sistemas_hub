import { describe, it, expect } from 'vitest'
import { toEntry, nombreDeCard } from './entry'
import type { RawProductRow, RawClusterRow } from '@ph/shared'

const fila = (extra: Partial<RawProductRow> = {}): RawProductRow => ({
  niche: 'acne', page_id: '123', ad_id: '1', name: 'Asarai', ad_count: 136,
  country: 'MX', raw_data: { title: 'Earth Tones Mask' }, scraped_at: '2026-08-16T00:00:00Z',
  ...extra,
})

describe('toEntry — sello de verificación', () => {
  it('marca verificado solo lo aprobado por el pipeline', () => {
    const e = toEntry(fila({ status: 'monoproducto', share: 0.9, senal_nicho: 'path' }))
    expect(e.verificado).toBe(true)
    expect(e.share).toBe(0.9)
    expect(e.senal).toBe('path')
  })

  // El 95% del inventario está 'pendiente' y se sirve igual: se muestra, pero
  // sin sello. Prometerlo verificado sería falso.
  it('no marca verificado lo que solo está scrapeado', () => {
    expect(toEntry(fila({ status: 'pendiente' })).verificado).toBe(false)
  })

  it('sin veredicto deja los campos en null, no en 0', () => {
    const e = toEntry(fila())
    expect(e.verificado).toBe(false)
    expect(e.share).toBeNull()
    expect(e.senal).toBeNull()
  })

  it('sin_verificar tampoco lleva sello', () => {
    expect(toEntry(fila({ status: 'sin_verificar', share: 0.8 })).verificado).toBe(false)
  })
})

describe('toEntry — fila de CLUSTER: la card identifica el producto, no la página', () => {
  const cluster = (extra: Partial<RawClusterRow> = {}): RawClusterRow => ({
    niche: 'rodilla', page_id: '123', cluster_key: 'tienda.com/products/rodillera',
    ad_count: 63, muestra_n: 15, muestra_tot: 30,
    titulo: 'Rodillera de compresión', cuerpo: 'alivia el dolor',
    url: 'https://tienda.com/products/rodillera', name: 'Tienda ABC', country: 'MX',
    status: 'monoproducto', ...extra,
  })

  it('cuenta los anuncios del PRODUCTO y el id lo distingue de sus hermanos', () => {
    const e = toEntry(cluster())
    expect(e.id).toBe('rodilla:123:tienda.com/products/rodillera')
    expect(e.adCount).toBe(63)          // el producto, no los 137 de la página
    expect(e.advertiser).toBe('Tienda ABC')
    expect(e.verificado).toBe(true)
  })

  // El 42% de los clusters no trae texto de producto en el título: plantillas
  // sin renderizar, el canvas de Facebook, "+5.500 VENDIDOS". El slug SÍ lo
  // identifica — es la misma señal con la que productKey agrupa.
  it('cuando el título es una plantilla sin renderizar, cae al slug de la landing', () => {
    const e = toEntry(cluster({ titulo: '{{product.name}}', url: 'https://t.com/products/faja-lumbar' }))
    expect(e.productName).toBe('faja lumbar')
  })

  it('el share del cluster sale de su parte de la muestra', () => {
    expect(toEntry(cluster()).share).toBe(0.5)
  })

  it('sin título ni url usable no inventa un nombre', () => {
    expect(toEntry(cluster({ titulo: null, url: null, product_name: null })).productName).toBeNull()
  })
})

// Todos los casos de acá salieron de una muestra de 189 productos servibles con
// 40+ anuncios (la vitrina real), no de ejemplos inventados.
describe('nombreDeCard — el título del anuncio no siempre nombra el producto', () => {
  const c = (titulo: string | null, url: string | null) => nombreDeCard({ titulo, url })

  it('un reclamo promocional pierde contra el slug de la landing', () => {
    expect(c('OFERTA 2x1', 'https://bienbuenochile.com/products/drenaje-linfatico-nature'))
      .toBe('drenaje linfatico nature')
    expect(c('PIDE Y PAGA AL RECIBIR ✨', 'https://t.com/products/lashmagnet')).toBe('lashmagnet')
    expect(c('+12.590 Clientes Satisfechas', 'https://t.com/products/cepillo-drenaje'))
      .toBe('cepillo drenaje')
    expect(c('HOY 50% Y ENVÍO GRATIS!', 'https://t.com/products/skinup-pro')).toBe('skinup pro')
  })

  it('una frase entera de copy también pierde: es un anuncio, no un nombre', () => {
    expect(c('Me casé con el genio mágico, pero lo perdí.', 'https://t.com/products/faja-lumbar'))
      .toBe('faja lumbar')
  })

  // Sin esto el arreglo rompería más de lo que arregla: son nombres de verdad.
  it('un título que SÍ nombra el producto se conserva', () => {
    expect(c('Complejo de Magnesio', 'https://t.com/products/xyz')).toBe('Complejo de Magnesio')
    expect(c('Calzones menstruales', 'https://t.com/products/xyz')).toBe('Calzones menstruales')
    expect(c('Depilación Láser en casa 🏡', 'https://t.com/p/lummia')).toBe('Depilación Láser en casa 🏡')
    // 8 palabras pero sin puntuación final: descriptivo, no una oración cerrada.
    expect(c('Una rutina dental más fácil para tu mascota', 'https://t.com/p/vetriuntrix'))
      .toBe('Una rutina dental más fácil para tu mascota')
  })

  it('el sufijo aleatorio del generador de landings se cae; un modelo numérico no', () => {
    expect(c(null, 'https://t.com/products/slim-rack-organizador-plegable-1jazf'))
      .toBe('slim rack organizador plegable')
    expect(c(null, 'https://t.com/products/mcch-taichi-2602')).toBe('mcch taichi 2602')
  })

  it('un slug que no nombra nada devuelve el título, aunque sea un reclamo', () => {
    // Id opaco de CMS y de la App Store.
    expect(c('OFERTA 2x1', 'https://drama.reelshort.com/es/drama/69d8604d4eb6d161cf064114'))
      .toBe('OFERTA 2x1')
    expect(c('Design the Next Century', 'http://itunes.apple.com/app/id1354260888'))
      .toBe('Design the Next Century')
    // camelCase = ruta del CMS, no un nombre escrito para leer.
    expect(c('Me casé con el genio mágico, pero lo perdí.', 'https://w2a.reelshort.com/w2a/booksAdvPageV2/'))
      .toBe('Me casé con el genio mágico, pero lo perdí.')
    // Genérico de tienda.
    expect(c('Never Have a Bad Outfit Day', 'https://t.com/pages/quiz'))
      .toBe('Never Have a Bad Outfit Day')
  })

  it('el nombre verificado del pipeline le gana a todo', () => {
    expect(nombreDeCard({ product_name: 'Faja Lumbar', titulo: 'OFERTA 2x1', url: 'https://t.com/p/x-y' }))
      .toBe('Faja Lumbar')
  })
})

describe('toEntry — la descripción redactada le gana al copy del anuncio', () => {
  const c = (extra: Partial<RawClusterRow>): RawClusterRow => ({
    niche: 'rodilla', page_id: '123', cluster_key: 't.com/p/x',
    ad_count: 63, muestra_n: 15, muestra_tot: 30,
    titulo: 'OFERTA 2x1', cuerpo: 'PIDE Y PAGA AL RECIBIR 💛 envío gratis',
    url: 'https://t.com/p/x', name: 'Tienda', country: 'MX',
    status: 'monoproducto', ...extra,
  })

  it('usa `descripcion` cuando el veredicto ya pasó por la fila', () => {
    expect(toEntry(c({ descripcion: 'Rodillera de compresión para aliviar el dolor al caminar.' })).body)
      .toBe('Rodillera de compresión para aliviar el dolor al caminar.')
  })

  // Fuera del tramo que la barrida cubrió, `descripcion` es null: la card tiene
  // que seguir mostrando lo de siempre en vez de quedarse sin texto.
  it('sin descripción cae al cuerpo del anuncio, como antes', () => {
    expect(toEntry(c({ descripcion: null })).body).toBe('PIDE Y PAGA AL RECIBIR 💛 envío gratis')
    expect(toEntry(c({})).body).toBe('PIDE Y PAGA AL RECIBIR 💛 envío gratis')
  })

  it('una descripción que solo trae plantillas no tapa al cuerpo', () => {
    expect(toEntry(c({ descripcion: '{{product.description}}' })).body)
      .toBe('PIDE Y PAGA AL RECIBIR 💛 envío gratis')
  })
})
