import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'https://hub.test' }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/enlace-acceso', async (orig) => ({
  ...(await orig<typeof import('@/lib/enlace-acceso')>()),
  enviarEnlaceAcceso: vi.fn(),
}))

import { sendLoginLink } from './auth'
import { enviarEnlaceAcceso } from '@/lib/enlace-acceso'

const fd = (campos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.append(k, v)
  return f
}

beforeEach(() => vi.clearAllMocks())

describe('sendLoginLink', () => {
  // ⚠️ El botón no puede servir para preguntar qué correos están registrados.
  it('responde LO MISMO haya cuenta o no', async () => {
    vi.mocked(enviarEnlaceAcceso).mockResolvedValueOnce({ ok: true })
    const conCuenta = await sendLoginLink({}, fd({ email: 'a@b.pe' }))
    vi.mocked(enviarEnlaceAcceso).mockResolvedValueOnce({ ok: false, motivo: 'sin-cuenta' })
    const sinCuenta = await sendLoginLink({}, fd({ email: 'a@b.pe' }))
    expect(sinCuenta).toEqual(conCuenta)
    expect(conCuenta.notice).toBeTruthy()
  })

  it('conserva el `next` interno y descarta uno externo', async () => {
    vi.mocked(enviarEnlaceAcceso).mockResolvedValue({ ok: true })
    await sendLoginLink({}, fd({ email: 'a@b.pe', next: '/registro/empire?codigo=X' }))
    expect(enviarEnlaceAcceso).toHaveBeenLastCalledWith('a@b.pe', 'https://hub.test', '/registro/empire?codigo=X')
    await sendLoginLink({}, fd({ email: 'a@b.pe', next: '//evil.com' }))
    expect(enviarEnlaceAcceso).toHaveBeenLastCalledWith('a@b.pe', 'https://hub.test', '/dashboard')
  })

  it('un email inválido no manda nada', async () => {
    expect((await sendLoginLink({}, fd({ email: 'x' }))).fieldErrors?.email).toBeTruthy()
    expect(enviarEnlaceAcceso).not.toHaveBeenCalled()
  })
})
