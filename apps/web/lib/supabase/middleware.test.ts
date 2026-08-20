import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Qué deja pasar el middleware. Importa porque es la PRIMERA de dos capas y las
 * dos deciden cosas distintas:
 *
 *   middleware  → ¿hay sesión? (y la restricción temporal de LOGIN_ALLOWLIST)
 *   (app)/layout → ¿hay suscripción activa?
 *
 * El contrato que este archivo fija: a quien se le venció el plan **no se le
 * cierra la sesión**. Pierde las tools, pero sigue pudiendo entrar a su cuenta y
 * al paywall — que son las dos únicas pantallas donde puede resolver el problema.
 */
let usuario: { id: string; email: string } | null = null

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: usuario } }) },
  }),
}))

import { updateSession } from './middleware'

const pedir = (path: string) => new NextRequest(`https://hub.test${path}`)

/** El destino del redirect, o null si dejó pasar. */
async function destino(path: string): Promise<string | null> {
  const res = await updateSession(pedir(path))
  const loc = res.headers.get('location')
  return loc ? new URL(loc).pathname + new URL(loc).search : null
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
  vi.stubEnv('LOGIN_ALLOWLIST', '')
  usuario = { id: 'u1', email: 'quien@jrhub.pe' }
})

describe('con sesión iniciada (el plan lo decide el layout, no acá)', () => {
  // ⚠️ EL PUNTO DEL ARCHIVO. El middleware NO consulta la suscripción, así que un
  // usuario con el plan vencido conserva su sesión y llega a estas dos pantallas.
  it.each(['/cuenta', '/suscripcion'])('deja pasar %s sin mirar la suscripción', async (path) => {
    expect(await destino(path)).toBeNull()
  })

  // /dashboard y /tools/* sí pasan el middleware: quien los bloquea por plan es
  // `(app)/layout.tsx`, que redirige a /suscripcion. Acá solo se comprueba que el
  // middleware no es el que corta (si cortara, cortaría también al que sí pagó).
  it.each(['/dashboard', '/tools/buscador-productos'])('deja pasar %s: el plan lo mira el layout', async (path) => {
    expect(await destino(path)).toBeNull()
  })

  it('la home y el login mandan al panel', async () => {
    expect(await destino('/')).toBe('/dashboard')
    expect(await destino('/login')).toBe('/dashboard')
  })
})

describe('sin sesión', () => {
  beforeEach(() => { usuario = null })

  it('las tools mandan al login conservando el destino', async () => {
    expect(await destino('/dashboard')).toBe('/login?next=%2Fdashboard')
    expect(await destino('/tools/generador-anuncios')).toBe('/login?next=%2Ftools%2Fgenerador-anuncios')
  })

  // /cuenta no está en el matcher de rutas protegidas: la protege la propia página
  // con `getUser()`. Se comprueba para que quede escrito que ese es el diseño y no
  // un olvido del middleware.
  it('/cuenta pasa el middleware y la protege la página', async () => {
    expect(await destino('/cuenta')).toBeNull()
  })
})

describe('LOGIN_ALLOWLIST (restricción temporal)', () => {
  // ⚠️ Es un gate de ACCESO AL HUB entero, anterior y ortogonal al paywall. Si
  // queda seteada al desplegar la suscripción, un cliente que pague no puede ni
  // iniciar sesión: el middleware lo trata como anónimo.
  it('un email fuera de la lista queda bloqueado aunque tenga sesión', async () => {
    vi.stubEnv('LOGIN_ALLOWLIST', 'demo1@jrhub.pe')
    usuario = { id: 'u2', email: 'cliente.que.pago@gmail.com' }
    expect(await destino('/dashboard')).toBe('/login?error=restricted')
  })

  it('vacía no restringe a nadie', async () => {
    vi.stubEnv('LOGIN_ALLOWLIST', '')
    usuario = { id: 'u2', email: 'cliente.que.pago@gmail.com' }
    expect(await destino('/dashboard')).toBeNull()
  })
})

describe('AUTH_DISABLED', () => {
  it('abre todo sin tocar Supabase', async () => {
    vi.stubEnv('AUTH_DISABLED', 'true')
    usuario = null
    const { proxy } = await import('@/proxy')
    expect((await proxy(pedir('/dashboard'))).headers.get('location')).toBeNull()
  })
})
