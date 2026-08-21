import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PLANS } from '@ph/shared'
import { PlanCTA, avisoDeBaja } from './PlanCTA'

/**
 * El botón de checkout compartido por la tabla de precios y Mi cuenta. Lo que se
 * cuida acá es que BAJAR de plan diga qué se pierde: el clic es idéntico al de
 * subir, y lo que hay del otro lado no lo es.
 */
describe('avisoDeBaja', () => {
  it('nombra los dos planes y los números que cambian', () => {
    const t = avisoDeBaja(3, 1)
    expect(t).toContain(PLANS[3].nombre)
    expect(t).toContain(PLANS[1].nombre)
    expect(t).toContain(`${PLANS[3].porRango} → ${PLANS[1].porRango}`)
    expect(t).toContain(`${PLANS[3].creditos} → ${PLANS[1].creditos}`)
  })

  // Los rangos que pierde se DERIVAN de los planes. Escritos a mano, el aviso
  // acabaría prometiendo algo distinto de lo que el servidor sirve.
  it('lista los rangos del buscador que deja de ver', () => {
    expect(avisoDeBaja(3, 1)).toMatch(/50 a 100.*100 a más|100 a más.*50 a 100/)
    // De Scale a Start solo se pierde uno.
    const t = avisoDeBaja(2, 1)
    expect(t).toContain('50 a 100')
    expect(t).not.toContain('100 a más')
  })

  // Es cierto por construcción: el plan viejo se cancela `at_period_end`, así que
  // hasta esa fecha `getAccess` sigue devolviendo el tier alto.
  it('promete que conserva los beneficios hasta el fin del período pagado', () => {
    expect(avisoDeBaja(3, 1)).toMatch(/hasta que termine el período que ya pagaste/i)
  })
})

describe('PlanCTA', () => {
  const render = (props: Parameters<typeof PlanCTA>[0]) => renderToStaticMarkup(<PlanCTA {...props} />)

  // ⚠️ `<a>` y NUNCA `<Link>`: ese href crea una checkout configuration en Whop y
  // Next prefetchea los Link — se crearían con solo pasar el mouse.
  it('renderiza un <a> con el href del checkout', () => {
    const html = render({ tier: 2, actual: null, href: '/api/whop/checkout?plan=2', children: 'Ir' })
    expect(html).toContain('<a href="/api/whop/checkout?plan=2"')
    expect(html).toContain('Ir')
  })

  it('sin plan actual no hay nada que confirmar (la home no tiene sesión)', () => {
    expect(render({ tier: 1, actual: null, href: '#', children: 'x' })).not.toContain('onclick')
  })
})
