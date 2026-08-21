// Cada caso de acá salió de una landing REAL de la primera corrida. Se usan
// snippets mínimos en vez de guardar el HTML entero como fixture porque esas
// páginas pesan ~225 KB cada una y lo que hay que fijar es la SEÑAL, no el
// markup de una tienda que va a cambiar la semana que viene.
import { describe, it, expect } from 'vitest'
import { parseLanding } from './parse'
import { scoreEcommerce } from './ecommerce'
import { classifyPhysical, isSocialDestination } from './physical'
import { canonicalizeName, normalizeName } from '../products/canonicalize'
import { similarity } from '../products/similarity'
import { extractProduct, fingerprint } from '../products/extract'

const page = (body: string, head = '') => `<html><head>${head}</head><body>${body}</body></html>`

describe('parseLanding', () => {
  it('lee un Product de JSON-LD con precio, marca y sku', () => {
    const ld = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product',
      name: 'Cepillo de Dientes Oral-B CrissCross', brand: { '@type': 'Brand', name: 'Oral-B' },
      sku: 'ORB-123', offers: { '@type': 'Offer', price: '19990', priceCurrency: 'COP' },
    })
    const s = parseLanding(page('<h1>Cepillo</h1>', `<script type="application/ld+json">${ld}</script>`))
    expect(s.hasProductSchema).toBe(true)
    expect(s.jsonLd?.brand).toBe('Oral-B')
    expect(s.jsonLd?.sku).toBe('ORB-123')
    expect(s.jsonLd?.price).toBe(19990)
    expect(s.jsonLd?.currency).toBe('COP')
  })

  it('un JSON-LD roto no tira el análisis', () => {
    const s = parseLanding(page('<h1>x</h1>', '<script type="application/ld+json">{roto</script>'))
    expect(s.hasProductSchema).toBe(false)
  })

  it('encuentra el Product dentro de @graph', () => {
    const ld = JSON.stringify({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'Product', name: 'Protector Bucal' }] })
    expect(parseLanding(page('', `<script type="application/ld+json">${ld}</script>`)).jsonLd?.name)
      .toBe('Protector Bucal')
  })

  // ⚠️ El caso que motivó `isProductUrl`: ficha real de Shopify cuyo carrito lo
  // pinta el JS, así que el HTML servido no lo muestra.
  it('reconoce la ficha de producto de Shopify aunque el carrito no se vea', () => {
    const s = parseLanding(
      page('<p>Pasta Dental Natural 8 en 1</p><p>$ 89.900</p>', '<link rel="canonical" href="https://t.online/products/pasta-dental">'),
      'https://trendysmarket.online/products/pasta-dental-natural-8-en-1-occotap',
    )
    expect(s.isProductUrl).toBe(true)
    expect(s.hasAddToCart).toBe(false)   // así llegaba, y es correcto
    expect(s.hasPrice).toBe(true)
  })

  it('la home de una tienda NO es ficha de producto', () => {
    expect(parseLanding(page('<p>bienvenidos</p>'), 'https://tienda.com/').isProductUrl).toBe(false)
  })

  it('detecta la página de una clínica que pide agendar cita', () => {
    const s = parseLanding(page('<p>Odontología estética. Agenda tu cita hoy. Nuestras sedes.</p>'))
    expect(s.hasAppointment).toBe(true)
    expect(s.isServicePage).toBe(true)
  })

  it('el precio necesita símbolo de moneda: un número suelto no cuenta', () => {
    expect(parseLanding(page('<p>llama al 300 123 4567 desde 2019</p>')).hasPrice).toBe(false)
    expect(parseLanding(page('<p>COP 89.900</p>')).hasPrice).toBe(true)
  })
})

describe('ecommerce + physical son variables DISTINTAS (spec §24)', () => {
  const clinica = parseLanding(page('<p>Clínica dental. Agenda tu cita. Primera consulta gratis.</p>'))
  const tienda = parseLanding(
    page('<p>Agregar al carrito</p><p>$ 79.900</p><p>Envío gratis</p><p>en stock</p><img><img><img>'),
    'https://tienda.com/products/x',
  )

  it('la clínica no es ninguna de las dos', () => {
    expect(scoreEcommerce(clinica).ecommerce).toBe(false)
    expect(classifyPhysical(clinica).physical).toBe(false)
  })

  it('la tienda con carrito y envío es las dos', () => {
    expect(scoreEcommerce(tienda).ecommerce).toBe(true)
    expect(classifyPhysical(tienda).physical).toBe(true)
  })

  it('un curso con checkout es ecommerce pero NO físico', () => {
    const curso = parseLanding(page(
      '<p>Curso online. Acceso inmediato al curso. Finalizar compra. $ 49.900. en stock</p><img><img><img>',
    ))
    expect(classifyPhysical(curso).physical).toBe(false)
  })

  it('sin landing legible no se afirma que sea físico', () => {
    expect(classifyPhysical(null).physical).toBe(false)
  })

  it('la lista negra de @ph/shared corta antes de mirar la landing', () => {
    const v = classifyPhysical(null, 'Clinica Dental Sonrisas', 'agenda tu cita')
    expect(v.physical).toBe(false)
    expect(v.reason).toMatch(/lista negra/)
  })
})

describe('isSocialDestination', () => {
  it('un chat o un perfil no son una landing', () => {
    for (const d of ['api.whatsapp.com', 'instagram.com', 'wa.me', 'm.me', 'linktr.ee', 'www.instagram.com']) {
      expect(isSocialDestination(d)).toBe(true)
    }
  })
  it('una tienda sí lo es', () => {
    expect(isSocialDestination('trendysmarket.online')).toBe(false)
    expect(isSocialDestination(null)).toBe(false)
  })
})

describe('canonicalizeName', () => {
  it('saca el HTML que viene DENTRO del JSON-LD', () => {
    expect(canonicalizeName('Crema dental con <b>Patanjali</b>')).toBe('Crema dental con Patanjali')
  })
  it('saca emojis y símbolos de marca', () => {
    expect(canonicalizeName('Spray-Magic™😍')).toBe('Spray-Magic')
  })
  it('saca la promo pero conserva lo que distingue al producto', () => {
    const out = canonicalizeName('Irrigador Bucal Pro 2x1 ¡ENVÍO GRATIS! 50% dto')
    expect(out).toContain('Irrigador Bucal Pro')
    expect(out).not.toMatch(/2x1|GRATIS|50/)
  })
  it('quita el sufijo de tienda solo cuando se lo piden', () => {
    expect(canonicalizeName('Pasta Dental 8 en 1 – Trendy Market', { stripStore: true })).toBe('Pasta Dental 8 en 1')
    expect(canonicalizeName('Pasta Dental 8 en 1 – Trendy Market')).toContain('Trendy Market')
  })
  it('lo que queda vacío devuelve null', () => {
    expect(canonicalizeName('😍')).toBeNull()
    expect(canonicalizeName(null)).toBeNull()
  })
})

describe('similarity', () => {
  it('reconoce el mismo producto con una palabra distinta', () => {
    expect(similarity('irrigador bucal pro', 'irrigador dental pro')).toBeGreaterThan(0.7)
  })
  it('separa productos distintos', () => {
    expect(similarity('pasta dental', 'faja reductora')).toBeLessThan(0.3)
  })
  it('ignora las palabras vacías', () => {
    expect(similarity('crema de la noche', 'crema noche')).toBe(1)
  })
})

describe('fingerprint', () => {
  const s = parseLanding(page('<p>$ 10.000</p>'), 'https://tienda.com/products/x')

  it('el dominio entra SIEMPRE: dos tiendas con el mismo genérico no se mezclan', () => {
    const a = extractProduct({ headline: 'Colágeno Hidrolizado', landingUrl: 'https://a.com/products/col' }, s)
    const b = extractProduct({ headline: 'Colágeno Hidrolizado', landingUrl: 'https://b.com/products/col' }, s)
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })

  it('sin nada que identificar devuelve null', () => {
    expect(fingerprint(extractProduct({ headline: null, landingUrl: null }, null))).toBeNull()
  })

  it('el nombre del anuncio da confianza por DEBAJO del umbral de elegibilidad', () => {
    const p = extractProduct({ headline: 'Compra ya el mejor producto', landingUrl: 'https://a.com/x' }, null)
    expect(p.source).toBe('ad-headline')
    expect(p.confidence).toBeLessThan(0.70)
  })

  it('el JSON-LD manda sobre el título', () => {
    const ld = JSON.stringify({ '@type': 'Product', name: 'Nombre Real' })
    const withLd = parseLanding(page('', `<title>Título de la tienda</title><script type="application/ld+json">${ld}</script>`))
    const p = extractProduct({ headline: 'copy publicitario', landingUrl: 'https://a.com/p' }, withLd)
    expect(p.canonicalName).toBe('Nombre Real')
    expect(p.source).toBe('json-ld')
  })
})

describe('normalizeName', () => {
  it('deja la forma comparable', () => {
    expect(normalizeName('Pasta Dental 8 en 1 — OCCOTAP')).toBe('pasta dental 8 en 1 occotap')
  })
})
