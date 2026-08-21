import { describe, expect, it, vi, beforeEach } from 'vitest'

const upsert = vi.fn().mockResolvedValue({ error: null })
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ upsert }) }),
}))
vi.mock('./supabase/server', () => ({ getUser: vi.fn() }))

import { saveProfile } from './user-settings'

beforeEach(() => vi.clearAllMocks())

/**
 * ⚠️ VARIOS ESCRITORES SOBRE LA MISMA FILA: perfil, avatar, API key de KIE, rol y
 * créditos de cortesía viven todos en `user_settings`. El upsert de Supabase pisa las
 * columnas que se le mandan, así que un escritor que mande el objeto ENTERO borraría
 * lo que cargaron los otros.
 *
 * Para `role` eso no es un campo perdido: la columna es `NOT NULL DEFAULT 'operador'`,
 * o sea que pisarla DEGRADA A UN ADMIN EN SILENCIO y lo deja fuera de un panel que
 * solo otro admin puede devolverle. Por eso se afirma la ausencia de las columnas
 * ajenas y no solo la presencia de las propias.
 */
describe('saveProfile escribe SOLO lo que le pasan', () => {
  const filaEscrita = () => upsert.mock.calls[0][0] as Record<string, unknown>

  it('no toca el rol ni los créditos de cortesía', async () => {
    await saveProfile('u1', { fullName: 'Ana' })
    expect(filaEscrita()).not.toHaveProperty('role')
    expect(filaEscrita()).not.toHaveProperty('credit_bonus')
    expect(filaEscrita()).not.toHaveProperty('kie_api_key')
  })

  it('guardar el teléfono no vacía el nombre del perfil', async () => {
    await saveProfile('u1', { phone: '+51 999 999 999' })
    expect(filaEscrita()).not.toHaveProperty('full_name')
    expect(filaEscrita()).toMatchObject({ user_id: 'u1', phone: '+51 999 999 999' })
  })
})
