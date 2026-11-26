import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const createUser = vi.fn()
const deleteUser = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser, deleteUser } } }),
}))
vi.mock('./admin', () => ({ otorgarCortesia: vi.fn().mockResolvedValue(undefined) }))

import { codigoEmpireValido, crearCuentaEmpire } from './cortesia-empire'
import { otorgarCortesia } from './admin'

const ENV = process.env.EMPIRE_CORTESIA_CODIGOS

beforeEach(() => {
  vi.clearAllMocks()
  process.env.EMPIRE_CORTESIA_CODIGOS = 'LANZA2026, beta-xyz'
  deleteUser.mockResolvedValue({ error: null })
})
afterEach(() => {
  process.env.EMPIRE_CORTESIA_CODIGOS = ENV
})

describe('codigoEmpireValido', () => {
  it('acepta cualquiera de los códigos de la env, recortando espacios', () => {
    expect(codigoEmpireValido('LANZA2026')).toBe(true)
    expect(codigoEmpireValido('beta-xyz')).toBe(true)
    expect(codigoEmpireValido('  beta-xyz ')).toBe(true)
  })

  it('rechaza códigos parecidos, vacíos y nulos', () => {
    for (const c of ['lanza2026', 'LANZA202', 'LANZA20266', '', null, undefined]) {
      expect(codigoEmpireValido(c)).toBe(false)
    }
  })

  // ⚠️ Fail-closed: sin env el registro está apagado, no abierto.
  it('sin la env ningún código sirve (tampoco el vacío)', () => {
    delete process.env.EMPIRE_CORTESIA_CODIGOS
    expect(codigoEmpireValido('LANZA2026')).toBe(false)
    expect(codigoEmpireValido('')).toBe(false)
    process.env.EMPIRE_CORTESIA_CODIGOS = ' , '
    expect(codigoEmpireValido('')).toBe(false)
  })
})

describe('crearCuentaEmpire', () => {
  it('crea la cuenta sin contraseña y le otorga Empire sin vencimiento', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    expect(await crearCuentaEmpire('a@b.pe')).toEqual({ ok: true, userId: 'u-1' })
    expect(createUser).toHaveBeenCalledWith({ email: 'a@b.pe', email_confirm: true })
    expect(createUser.mock.calls[0][0]).not.toHaveProperty('password')
    expect(otorgarCortesia).toHaveBeenCalledWith('u-1', 3, null)
  })

  // Quien llena el formulario no probó que el correo sea suyo.
  it('a una cuenta que ya existe NO le otorga nada', async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    })
    expect(await crearCuentaEmpire('a@b.pe')).toEqual({ ok: false, motivo: 'existe' })
    expect(otorgarCortesia).not.toHaveBeenCalled()
  })

  it('si la cortesía falla, borra la cuenta para que el reintento no choque con "ya existe"', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null })
    vi.mocked(otorgarCortesia).mockRejectedValueOnce(new Error('db caída'))
    expect(await crearCuentaEmpire('a@b.pe')).toEqual({ ok: false, motivo: 'error' })
    expect(deleteUser).toHaveBeenCalledWith('u-2')
  })

  it('otro error de Supabase es un error genérico, sin cortesía', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'Database error' } })
    expect(await crearCuentaEmpire('a@b.pe')).toEqual({ ok: false, motivo: 'error' })
    expect(otorgarCortesia).not.toHaveBeenCalled()
  })
})
