import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'https://hub.test' }),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/admin', () => ({ otorgarCortesia: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/enlace-acceso', async (orig) => ({
  ...(await orig<typeof import('@/lib/enlace-acceso')>()),
  enviarEnlaceAcceso: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/cortesia-empire', async (orig) => ({
  ...(await orig<typeof import('@/lib/cortesia-empire')>()),
  crearCuentaEmpire: vi.fn().mockResolvedValue({ ok: true, userId: 'nuevo-1' }),
}))

import { registrarEmpire, activarEmpire } from './actions'
import { getUser } from '@/lib/supabase/server'
import { otorgarCortesia } from '@/lib/admin'
import { enviarEnlaceAcceso } from '@/lib/enlace-acceso'
import { crearCuentaEmpire } from '@/lib/cortesia-empire'

const fd = (campos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.EMPIRE_CORTESIA_CODIGOS = 'BUENO'
})

/**
 * ⚠️ EL LÍMITE DE SEGURIDAD: un server action es un endpoint público. Sin el código
 * válido no se crea cuenta, no se otorga plan y no se manda correo — aunque la llamada
 * no haya pasado por la página que valida el código.
 */
describe('sin código válido no se escribe nada', () => {
  it.each([
    ['registrar', () => registrarEmpire({}, fd({ codigo: 'MALO', email: 'a@b.pe' }))],
    ['registrar sin código', () => registrarEmpire({}, fd({ email: 'a@b.pe' }))],
    ['activar', () => activarEmpire({}, fd({ codigo: 'MALO' }))],
  ])('%s', async (_caso, correr) => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u', email: 'a@b.pe' } as never)
    expect((await correr()).error).toMatch(/no es válido/i)
    expect(crearCuentaEmpire).not.toHaveBeenCalled()
    expect(otorgarCortesia).not.toHaveBeenCalled()
    expect(enviarEnlaceAcceso).not.toHaveBeenCalled()
  })
})

describe('registrarEmpire', () => {
  it('crea la cuenta y manda el enlace para entrar al dashboard', async () => {
    const r = await registrarEmpire({}, fd({ codigo: 'BUENO', email: '  Ana@B.pe ' }))
    expect(r).toEqual({ enviado: 'ana@b.pe' })
    expect(crearCuentaEmpire).toHaveBeenCalledWith('ana@b.pe')
    expect(enviarEnlaceAcceso).toHaveBeenCalledWith('ana@b.pe', 'https://hub.test', '/dashboard')
  })

  it('rechaza un email inválido sin crear nada', async () => {
    expect((await registrarEmpire({}, fd({ codigo: 'BUENO', email: 'no-es-email' }))).error).toBeTruthy()
    expect(crearCuentaEmpire).not.toHaveBeenCalled()
  })

  it('si el correo ya tiene cuenta, lo dice y no manda correo', async () => {
    vi.mocked(crearCuentaEmpire).mockResolvedValueOnce({ ok: false, motivo: 'existe' })
    expect(await registrarEmpire({}, fd({ codigo: 'BUENO', email: 'a@b.pe' }))).toEqual({ existe: true })
    expect(enviarEnlaceAcceso).not.toHaveBeenCalled()
  })

  // La cuenta y el plan ya existen: el usuario no tiene que volver a registrarse.
  it('si el correo falla, avisa que la cuenta SÍ quedó creada', async () => {
    vi.mocked(enviarEnlaceAcceso).mockResolvedValueOnce({ ok: false, motivo: 'limite' })
    const r = await registrarEmpire({}, fd({ codigo: 'BUENO', email: 'a@b.pe' }))
    expect(r.error).toMatch(/ya está creada/)
  })
})

describe('activarEmpire', () => {
  // La identidad sale de la sesión: un userId en el formulario se ignora.
  it('otorga Empire a la cuenta de la SESIÓN, nunca a un id del formulario', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'sesion-1', email: 'a@b.pe' } as never)
    await expect(activarEmpire({}, fd({ codigo: 'BUENO', userId: 'victima' }))).rejects.toThrow('NEXT_REDIRECT')
    expect(otorgarCortesia).toHaveBeenCalledWith('sesion-1', 3, null)
    expect(otorgarCortesia).toHaveBeenCalledTimes(1)
  })

  it('sin sesión no otorga nada', async () => {
    vi.mocked(getUser).mockResolvedValue(null)
    expect((await activarEmpire({}, fd({ codigo: 'BUENO' }))).error).toMatch(/inicia sesión/i)
    expect(otorgarCortesia).not.toHaveBeenCalled()
  })
})
