import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/roles', async (orig) => ({
  ...(await orig<typeof import('@/lib/roles')>()),
  currentAdmin: vi.fn(),
  setRole: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/credits', () => ({
  setCreditBonus: vi.fn().mockResolvedValue(undefined),
  // lib/admin importa estos dos; sin ellos el mock rompe el import, no el test.
  creditStatus: vi.fn(),
  isCreditKind: vi.fn(),
}))
// Parcial: las escrituras se espían, pero `manualMembershipId` se prueba de verdad.
vi.mock('@/lib/admin', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin')>()),
  otorgarCortesia: vi.fn().mockResolvedValue(undefined),
  quitarCortesia: vi.fn().mockResolvedValue(undefined),
}))

import { cambiarRol, otorgarAcceso, revocarAcceso, ajustarCreditos } from './actions'
import { currentAdmin, setRole, isBootstrapAdmin } from '@/lib/roles'
import { setCreditBonus } from '@/lib/credits'
import { otorgarCortesia, quitarCortesia, manualMembershipId } from '@/lib/admin'

const fd = (campos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.append(k, v)
  return f
}

const escrituras = () => [setRole, setCreditBonus, otorgarCortesia, quitarCortesia]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentAdmin).mockResolvedValue({ id: 'admin-1', email: 'jefe@jrhub.pe' })
})

/**
 * ⚠️ EL LÍMITE DE SEGURIDAD DE TODO EL PANEL. Un server action es un endpoint
 * público: si el gate de rol desaparece, cualquiera con una sesión puede otorgarse
 * el plan más caro y créditos infinitos. `/api/*` ni siquiera pasa por el middleware
 * (AGENTS.md), así que esto NO está cubierto por ninguna otra capa.
 */
describe('sin rol de admin no se escribe nada', () => {
  beforeEach(() => vi.mocked(currentAdmin).mockResolvedValue(null))

  it.each([
    ['rol', () => cambiarRol({}, fd({ userId: 'v', role: 'admin' }))],
    ['acceso', () => otorgarAcceso({}, fd({ userId: 'v', tier: '3' }))],
    ['revocar', () => revocarAcceso({}, fd({ userId: 'v' }))],
    ['créditos', () => ajustarCreditos({}, fd({ userId: 'v', bonus: '999' }))],
  ])('%s', async (_caso, correr) => {
    expect((await correr()).error).toMatch(/permiso/i)
    for (const escritura of escrituras()) expect(escritura).not.toHaveBeenCalled()
  })
})

it('sin usuario objetivo no se escribe nada', async () => {
  expect((await otorgarAcceso({}, fd({ tier: '3' }))).error).toMatch(/falta el usuario/i)
  expect(otorgarCortesia).not.toHaveBeenCalled()
})

describe('rol', () => {
  // Con un solo admin real, quitarse el rol deja el panel sin dueño y recuperarlo
  // exige tocar la env o la DB a mano.
  it('nadie se quita a sí mismo el rol de admin', async () => {
    const r = await cambiarRol({}, fd({ userId: 'admin-1', role: 'operador' }))
    expect(r.error).toMatch(/ti mismo/i)
    expect(setRole).not.toHaveBeenCalled()
  })

  it('sí puede degradar a otro', async () => {
    expect((await cambiarRol({}, fd({ userId: 'otro', role: 'operador' }))).ok).toBeTruthy()
    expect(setRole).toHaveBeenCalledWith('otro', 'operador')
  })

  it('un rol desconocido cae a operador y nunca a admin', async () => {
    await cambiarRol({}, fd({ userId: 'otro', role: 'superadmin' }))
    expect(setRole).toHaveBeenCalledWith('otro', 'operador')
  })
})

describe('acceso de cortesía', () => {
  // ⚠️ `toTier` normaliza cualquier basura al plan 1. Acá eso sería regalar el plan
  // equivocado en silencio, así que la acción rechaza en vez de normalizar.
  it.each(['0', '4', 'tres', ''])('rechaza el plan %s sin escribir', async (tier) => {
    expect((await otorgarAcceso({}, fd({ userId: 'v', tier }))).error).toMatch(/plan inválido/i)
    expect(otorgarCortesia).not.toHaveBeenCalled()
  })

  it('otorga el plan pedido', async () => {
    expect((await otorgarAcceso({}, fd({ userId: 'v', tier: '3' }))).ok).toBeTruthy()
    expect(otorgarCortesia).toHaveBeenCalledWith('v', 3)
  })

  it('revoca', async () => {
    expect((await revocarAcceso({}, fd({ userId: 'v' }))).ok).toBeTruthy()
    expect(quitarCortesia).toHaveBeenCalledWith('v')
  })
})

describe('créditos de cortesía', () => {
  it.each(['-1', 'muchos', '99999'])('rechaza %s sin escribir', async (bonus) => {
    expect((await ajustarCreditos({}, fd({ userId: 'v', bonus }))).error).toBeTruthy()
    expect(setCreditBonus).not.toHaveBeenCalled()
  })

  it('0 quita la cortesía en vez de fallar', async () => {
    expect((await ajustarCreditos({}, fd({ userId: 'v', bonus: '0' }))).ok).toMatch(/quitada/i)
    expect(setCreditBonus).toHaveBeenCalledWith('v', 0)
  })
})

/**
 * El id de la cortesía es la PK de `user_entitlements`. Que sea determinista por
 * usuario es lo que hace idempotente el otorgar (upsert) y posible el revocar: con un
 * uuid nuevo cada vez, dos cortesías del mismo usuario quedarían como dos filas vivas.
 */
it('el id de cortesía es determinista y no choca con uno de Whop', () => {
  expect(manualMembershipId('u1')).toBe(manualMembershipId('u1'))
  expect(manualMembershipId('u1')).not.toBe(manualMembershipId('u2'))
  expect(manualMembershipId('u1').startsWith('manual:')).toBe(true)
})

describe('admin de arranque por env', () => {
  // Sin esto nadie puede nombrarse el primer admin: el rol vive en una columna que
  // solo un admin puede escribir.
  it('lee ADMIN_EMAILS sin distinguir mayúsculas ni espacios', () => {
    vi.stubEnv('ADMIN_EMAILS', ' Jefe@JRHub.pe , otro@x.pe ')
    expect(isBootstrapAdmin('jefe@jrhub.pe')).toBe(true)
    expect(isBootstrapAdmin('ajeno@x.pe')).toBe(false)
    expect(isBootstrapAdmin(null)).toBe(false)
    vi.unstubAllEnvs()
  })

  it('sin la env nadie es admin de arranque', () => {
    vi.stubEnv('ADMIN_EMAILS', '')
    expect(isBootstrapAdmin('jefe@jrhub.pe')).toBe(false)
    vi.unstubAllEnvs()
  })
})
