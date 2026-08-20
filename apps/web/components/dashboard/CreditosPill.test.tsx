import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// El pill no usa `usePathname`, pero AppShell —el módulo del que se importa— sí.
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))

import { CreditosPill } from './AppShell'

const html = (restantes: number, limite: number) =>
  renderToStaticMarkup(<CreditosPill restantes={restantes} limite={limite} />)

describe('contador de créditos de la barra', () => {
  it('muestra lo que QUEDA, no lo gastado', () => {
    const out = html(60, 100)
    expect(out).toContain('>60<')
    expect(out).not.toContain('>40<')
  })

  it('lleva a Mi cuenta y dice el total en el title', () => {
    const out = html(60, 100)
    expect(out).toContain('href="/cuenta"')
    expect(out).toContain('60 de 100')
  })

  // El umbral es el mismo que usa la página de cuenta (`creditosBajos`, @ph/shared):
  // si divergieran, la barra y la pantalla se contradirían sobre el mismo número.
  it('se pone ámbar cuando quedan pocas', () => {
    expect(html(60, 100)).not.toContain('amber')
    expect(html(10, 100)).toContain('amber')
  })

  it('se pone rojo en cero', () => {
    const out = html(0, 100)
    expect(out).toContain('233,61,61') // el rojo del sistema
    expect(out).not.toContain('amber')
  })

  // El piso de 3 del umbral existe para los planes chicos: el 15% de 30 son 4,5, así
  // que sin él el plan 1 avisaría recién con 4 restantes.
  it('avisa también en un plan chico', () => {
    expect(html(4, 30)).toContain('amber')
    expect(html(20, 30)).not.toContain('amber')
  })
})
