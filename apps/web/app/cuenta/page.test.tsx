import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const redirigidoA: string[] = []

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirigidoA.push(url)
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/whop', () => ({ getAccess: vi.fn() }))
vi.mock('@/lib/credits', () => ({ creditStatus: vi.fn() }))
vi.mock('@/lib/user-settings', () => ({
  getProfile: vi.fn(),
  getKieKey: vi.fn().mockResolvedValue(null),
  maskKey: (k: string | null) => (k ? '••••1234' : null),
}))
// Los formularios son client components con `useActionState`: se stubean para que
// el test mida la lógica de la PÁGINA (qué bloques salen y con qué datos), que es
// lo que decide si un usuario puede o no llegar a sus datos.
vi.mock('./Formularios', () => ({
  PerfilForm: () => <div data-t="perfil" />,
  AvatarForm: () => <div data-t="avatar" />,
  KieKeyForm: () => <div data-t="kie" />,
}))

import CuentaPage from './page'
import { getUser } from '@/lib/supabase/server'
import { getAccess } from '@/lib/whop'
import { creditStatus } from '@/lib/credits'
import { getProfile } from '@/lib/user-settings'

const PERFIL_VACIO = { fullName: null, phone: null, avatarUrl: null }

async function render(): Promise<string> {
  try {
    return renderToStaticMarkup(await CuentaPage())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.startsWith('REDIRECT:')) return msg
    throw e
  }
}

beforeEach(() => {
  redirigidoA.length = 0
  vi.clearAllMocks()
  vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'u@jrhub.pe' } as never)
  vi.mocked(getProfile).mockResolvedValue(PERFIL_VACIO)
  vi.mocked(getAccess).mockResolvedValue({
    tier: 2, status: 'active', renewalPeriodEnd: '2026-09-20T15:00:00Z', grandfathered: false,
  })
  vi.mocked(creditStatus).mockResolvedValue({
    tier: 2, limite: 100, usados: 40, restantes: 60, desde: '2026-08-20',
  })
})

describe('/cuenta', () => {
  it('sin sesión manda a login', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never)
    expect(await render()).toBe('REDIRECT:/login')
  })

  it('muestra plan, estado, renovación y créditos', async () => {
    const html = await render()
    expect(html).toContain('Legacy Scale')
    expect(html).toContain('Activa')
    expect(html).toContain('20 de setiembre de 2026')  // es-PE dice "setiembre"
    expect(html).toContain('60')       // créditos restantes
    expect(html).toContain('de 100')
    // El período arranca en un día de calendario: no puede correrse al 19.
    expect(html).toContain('20 de agosto de 2026')
  })

  it('trae los formularios de perfil, avatar y key', async () => {
    const html = await render()
    for (const t of ['perfil', 'avatar', 'kie']) expect(html).toContain(`data-t="${t}"`)
  })

  // Los pagos los hace Whop como merchant-of-record: el hub no pide datos fiscales.
  it('no pide datos de facturación', async () => {
    const html = await render()
    expect(html).not.toMatch(/facturaci[óo]n/i)
    expect(html).not.toMatch(/RUC/)
  })

  // El cambio de plan tiene que poder hacerse ACÁ, no solo desde el paywall.
  it('ofrece cambiar a los otros dos planes, con su checkout', async () => {
    const html = await render()   // el usuario está en el plan 2
    expect(html).toContain('/api/whop/checkout?plan=1')
    expect(html).toContain('/api/whop/checkout?plan=3')
    expect(html).not.toContain('/api/whop/checkout?plan=2')
    expect(html).toContain('Subir')
    expect(html).toContain('Bajar')
  })

  // Un cambio crea una suscripción NUEVA en Whop y la vieja sigue cobrando.
  it('avisa que el plan anterior hay que cancelarlo', async () => {
    expect(await render()).toMatch(/cancelar\s+la anterior/i)
  })

  // ⚠️ LA RAZÓN POR LA QUE ESTA PÁGINA VIVE FUERA DEL GRUPO `(app)`. Ese layout
  // rebota a /suscripcion a quien no tenga suscripción activa, y `past_due` (una
  // tarjeta rechazada) pasa todos los meses. Si /cuenta estuviera adentro, el
  // usuario no podría entrar a corregir justamente sus datos de facturación.
  it('sin plan activo NO redirige: muestra los datos y ofrece ver planes', async () => {
    vi.mocked(getAccess).mockResolvedValue(null)
    const html = await render()

    expect(redirigidoA).toHaveLength(0)
    expect(html).toContain('No tienes un plan activo')
    expect(html).toContain('/suscripcion')
    // Lo suyo sigue accesible: es el motivo de entrar.
    expect(html).toContain('data-t="perfil"')
    expect(html).toContain('data-t="kie"')
    // Y sin plan no hay checkout de cambio: primero tiene que tener uno.
    expect(html).not.toContain('/api/whop/checkout')
  })

  // "Volver al panel" rebotaría al paywall: el layout de `(app)` lo manda ahí.
  it('sin plan, el enlace de salida apunta a los planes y no al panel', async () => {
    vi.mocked(getAccess).mockResolvedValue(null)
    const html = await render()
    expect(html).toContain('Ver planes')
    expect(html).not.toContain('href="/dashboard"')
  })

  it('con plan, el enlace de salida sí va al panel', async () => {
    expect(await render()).toContain('href="/dashboard"')
  })

  it('sin plan activo no inventa un contador de créditos', async () => {
    vi.mocked(getAccess).mockResolvedValue(null)
    const html = await render()
    expect(vi.mocked(creditStatus)).not.toHaveBeenCalled()
    expect(html).not.toContain('Créditos de imagen')
  })

  it('a un grandfathered no le ofrece cambiar de plan ni le habla de cobros', async () => {
    vi.mocked(getAccess).mockResolvedValue({
      tier: 3, status: null, renewalPeriodEnd: null, grandfathered: true,
    })
    const html = await render()
    expect(html).toContain('Acceso de por vida')
    expect(html).not.toContain('Cambiar de plan')
    expect(html).not.toContain('/api/whop/checkout')
  })

  it('con la suscripción cancelada dice cuándo TERMINA, no cuándo se renueva', async () => {
    vi.mocked(getAccess).mockResolvedValue({
      tier: 1, status: 'canceling', renewalPeriodEnd: '2026-09-20T00:00:00Z', grandfathered: false,
    })
    const html = await render()
    expect(html).toContain('Termina el')
    expect(html).not.toContain('Se renueva el')
  })

  // Un estado que Whop agregue mañana no puede pintar el string crudo en la cara
  // del usuario.
  it('un estado desconocido no se imprime crudo', async () => {
    vi.mocked(getAccess).mockResolvedValue({
      tier: 1, status: 'estado_nuevo_de_whop', renewalPeriodEnd: null, grandfathered: false,
    })
    const html = await render()
    expect(html).not.toContain('estado_nuevo_de_whop')
    expect(html).toContain('Sin información')
  })
})
