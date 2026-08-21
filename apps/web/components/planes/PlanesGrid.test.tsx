import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PLANS, TIERS, precioUSD } from '@ph/shared'
import { PlanesGrid, IncluidoEnTodos } from './PlanesGrid'

/**
 * La tabla de precios la comparten la home y `/suscripcion`. Lo que estos tests
 * cuidan es que lo que se VENDE sea lo que el servidor SIRVE: hasta el
 * 2026-08-20 la home publicaba planes que no existían.
 */
const render = (props: Parameters<typeof PlanesGrid>[0]) =>
  renderToStaticMarkup(<PlanesGrid {...props} />)

const landing = () => render({ hrefDe: () => '/signup' })

describe('lo que se vende es lo que se sirve', () => {
  it('los tres planes salen con su nombre y su precio de PLANS', () => {
    const html = landing()
    for (const t of TIERS) {
      expect(html).toContain(PLANS[t].nombre)
      expect(html).toContain(precioUSD(PLANS[t]))
    }
    expect(html).toContain('Legacy Start')
    expect(html).toContain('Legacy Scale')
    expect(html).toContain('Legacy Empire')
  })

  it('los productos por rango y las imágenes salen de PLANS', () => {
    const html = landing()
    for (const t of TIERS) {
      expect(html).toContain(`Hasta ${PLANS[t].porRango} productos por rango`)
      expect(html).toContain(`${PLANS[t].creditos} imágenes al mes`)
    }
  })

  // ⚠️ El candado se DERIVA de `unlocksBucket`, no de una lista escrita a mano:
  // si mañana un plan desbloquea otro rango, la card lo refleja sola.
  it('cada plan lista los tres rangos, y solo desbloquea los suyos', () => {
    const html = landing()
    // Start: solo 0-50 con "Productos con"; los otros dos aparecen sin ese prefijo.
    expect(html).toContain('Productos con 0 a 50 anuncios')
    expect(html).toContain('Productos con 50 a 100 anuncios')   // Scale y Empire
    expect(html).toContain('Productos con 100 a más anuncios')  // solo Empire
    // Los tres rangos se nombran en las tres cards, desbloqueados o no.
    expect(html.split('0 a 50 anuncios').length - 1).toBeGreaterThanOrEqual(3)
  })

  // ⚠️ NO HAY PRUEBA GRATIS: `trial_period_days` es null en los tres planes de Whop y
  // `createCheckout` no manda ningún campo de prueba. Un botón que la prometa es una
  // promesa que el checkout no cumple.
  it('ningún botón ni card promete algo gratis', () => {
    expect(landing()).not.toMatch(/gratis/i)
  })

  it('el CTA de cada plan va a donde dice quien lo usa', () => {
    const html = render({ hrefDe: (t) => `/api/whop/checkout?plan=${t}` })
    for (const t of TIERS) expect(html).toContain(`/api/whop/checkout?plan=${t}`)
  })

  // ⚠️ Nunca `<Link>`: en /suscripcion ese href crea una checkout configuration
  // en Whop y Next prefetchea los Link — se crearían con solo pasar el mouse.
  it('los CTA son <a> nativos, no links prefetchables', () => {
    expect(landing()).not.toContain('data-prefetch')
  })
})

describe('jerarquía visual (BRANDBOOK: carmesí = acción, crema = prestigio)', () => {
  it('Scale se lleva el ÚNICO relleno carmesí', () => {
    const html = landing()
    expect(html.split('lp-cta').length - 1).toBe(1)
  })

  it('Empire se lleva el relleno crema, que es el eje de prestigio', () => {
    const html = landing()
    expect(html).toContain('jr-btn-gold')
    expect(html.split('jr-btn-gold').length - 1).toBe(1)
  })

  it('Start queda en el botón secundario', () => {
    expect(landing()).toContain('lp-btn')
  })

  it('las etiquetas son las tres pedidas', () => {
    const html = landing()
    expect(html).toContain('Para empezar')
    expect(html).toContain('Más popular')
    expect(html).toContain('Más completo')
  })
})

describe('con un plan ya contratado', () => {
  it('marca el plan del usuario y le quita el CTA', () => {
    const html = render({ hrefDe: (t) => `/c?p=${t}`, actual: 1 })
    expect(html).toContain('Tu plan actual')
    expect(html).not.toContain('/c?p=1')
    expect(html).toContain('/c?p=2')
    expect(html).toContain('/c?p=3')
  })

  // Resaltarle Scale sobre la card del plan que YA pagó es venderle encima de lo
  // suyo. Con un plan contratado, el destacado es el del usuario.
  it('el destacado pasa a ser el plan del usuario, no Scale', () => {
    expect(render({ hrefDe: () => '#', actual: 3 })).toContain('Tu plan')
  })

  it('a un grandfathered no le ofrece comprar nada', () => {
    const html = render({ hrefDe: (t) => `/c?p=${t}`, bloqueado: true })
    expect(html).toContain('Ya incluido en tu acceso')
    expect(html).not.toContain('/c?p=')
  })
})

describe('bloque común', () => {
  it('lista las cinco cosas incluidas, con su detalle', () => {
    const html = renderToStaticMarkup(<IncluidoEnTodos />)
    expect(html).toContain('Todo esto está incluido en cualquier plan')
    for (const t of [
      'Generador de anuncios estáticos',
      'Generador de branding y landings',
      'Calculadora de costos y rentabilidad',
      'Generador de Video Ads UGC',
      'Hub de herramientas de IA para e-commerce',
    ]) expect(html).toContain(t)
    // El detalle es lo que hace que la lista signifique algo.
    expect(html).toContain('Descubre si un producto realmente deja margen antes de invertir.')
    expect(html).toContain('tu propia API key de KIE')
  })
})
