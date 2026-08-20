import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * El paywall es la única pantalla desde la que se compra Y desde la que se cambia de
 * plan. Con un plan único redirigía al dashboard a quien ya tenía acceso; con tres,
 * esa misma línea la vuelve inalcanzable justo para quien quiere subir de plan.
 * Estos tests fijan ese comportamiento.
 */
const redirigidoA: string[] = []

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirigidoA.push(url)
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/whop', () => ({ getAccess: vi.fn() }))

import SuscripcionPage from './page'
import { getUser } from '@/lib/supabase/server'
import { getAccess } from '@/lib/whop'

const params = (p: Record<string, string> = {}) => Promise.resolve(p)

/** Renderiza la página y devuelve el HTML, o `REDIRECT:<url>` si redirigió. */
async function render(search: Record<string, string> = {}): Promise<string> {
  try {
    return renderToStaticMarkup(await SuscripcionPage({ searchParams: params(search) }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.startsWith('REDIRECT:')) return msg
    throw e
  }
}

beforeEach(() => {
  redirigidoA.length = 0
  vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'u@jrhub.pe' } as never)
  vi.mocked(getAccess).mockResolvedValue(null)
})

describe('/suscripcion', () => {
  it('sin sesión manda a login', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never)
    expect(await render()).toBe('REDIRECT:/login')
  })

  it('sin suscripción muestra los tres planes con su checkout', async () => {
    const html = await render()
    expect(html).toContain('Activa tu acceso')
    for (const t of [1, 2, 3]) expect(html).toContain(`/api/whop/checkout?plan=${t}`)
    expect(html).toContain('$29')
    expect(html).toContain('$69')
    expect(html).toContain('$89')
  })

  // ⚠️ EL BUG QUE ESTE ARCHIVO EXISTE PARA EVITAR. Con la guarda vieja
  // (`if (hasAccess) redirect('/dashboard')`) el usuario del plan 1 que quiere subir
  // al 3 rebotaba al dashboard: la página de precios era inalcanzable para las únicas
  // personas que podían cambiar de plan.
  it('con un plan activo NO redirige: muestra la grilla y marca el plan actual', async () => {
    vi.mocked(getAccess).mockResolvedValue({
      tier: 1, renewalPeriodEnd: null, grandfathered: false,
    })
    const html = await render()

    expect(redirigidoA).toHaveLength(0)
    expect(html).toContain('Tu plan')
    // El plan que ya tiene no ofrece checkout; los otros dos sí.
    expect(html).not.toContain('/api/whop/checkout?plan=1')
    expect(html).toContain('/api/whop/checkout?plan=2')
    expect(html).toContain('/api/whop/checkout?plan=3')
  })

  // Sin salida, quien ya pagó queda encerrado en el paywall.
  it('con acceso ofrece volver al panel', async () => {
    vi.mocked(getAccess).mockResolvedValue({
      tier: 2, renewalPeriodEnd: null, grandfathered: false,
    })
    expect(await render()).toContain('href="/dashboard"')
  })

  // Cambiar de plan crea una suscripción nueva en Whop y la vieja sigue cobrando.
  // Callarlo es cobrarle dos veces a alguien sin avisarle.
  it('avisa que contratar otro plan no cancela el anterior', async () => {
    vi.mocked(getAccess).mockResolvedValue({
      tier: 1, renewalPeriodEnd: null, grandfathered: false,
    })
    expect(await render()).toMatch(/cancelar\s+la anterior/i)
  })

  it('a un grandfathered no le ofrece comprar nada', async () => {
    vi.mocked(getAccess).mockResolvedValue({
      tier: 3, renewalPeriodEnd: null, grandfathered: true,
    })
    const html = await render()
    expect(html).not.toContain('/api/whop/checkout')
    expect(html).toContain('Ya incluido en tu acceso')
  })

  describe('vuelta del checkout (pago=ok)', () => {
    // El redirect del navegador y el webhook compiten.
    it('sin la fila todavía, muestra "estamos confirmando" en vez del paywall', async () => {
      const html = await render({ pago: 'ok' })
      expect(html).toContain('Estamos confirmando tu pago')
      expect(html).not.toContain('Activa tu acceso')
      expect(redirigidoA).toHaveLength(0)
    })

    it('con el webhook ya procesado, va al dashboard', async () => {
      vi.mocked(getAccess).mockResolvedValue({
        tier: 3, renewalPeriodEnd: null, grandfathered: false,
      })
      expect(await render({ pago: 'ok' })).toBe('REDIRECT:/dashboard')
    })
  })
})
