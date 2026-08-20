import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/user-settings', () => ({
  saveProfile: vi.fn().mockResolvedValue(undefined),
  setKieKey: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/storage', () => ({
  uploadToStorage: vi.fn().mockResolvedValue('https://x.supabase.co/avatars/u1.png?v=1'),
}))

import { guardarPerfil, guardarFacturacion, guardarKieKey, subirAvatar } from './actions'
import { getUser } from '@/lib/supabase/server'
import { saveProfile, setKieKey } from '@/lib/user-settings'
import { uploadToStorage } from '@/lib/storage'

const fd = (campos: Record<string, string | File>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.append(k, v)
  return f
}

const imagen = (bytes: number, type: string) =>
  new File([new Uint8Array(bytes)], 'foto', { type })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'u@jrhub.pe' } as never)
})

describe('sin sesión no se escribe nada', () => {
  beforeEach(() => vi.mocked(getUser).mockResolvedValue(null as never))

  it.each([
    ['perfil', () => guardarPerfil({}, fd({ fullName: 'Ana' }))],
    ['facturación', () => guardarFacturacion({}, fd({ billingName: 'ACME' }))],
    ['key de KIE', () => guardarKieKey({}, fd({ key: 'k' }))],
    ['avatar', () => subirAvatar({}, fd({ avatar: imagen(10, 'image/png') }))],
  ])('%s', async (_caso, correr) => {
    expect((await correr()).error).toMatch(/sesión/i)
    expect(saveProfile).not.toHaveBeenCalled()
    expect(setKieKey).not.toHaveBeenCalled()
    expect(uploadToStorage).not.toHaveBeenCalled()
  })
})

// ⚠️ Un action es un endpoint público. Si el usuario objetivo saliera del
// formulario, cualquiera podría escribirle el perfil a cualquier cuenta.
it('escribe sobre el usuario de la sesión, ignorando lo que venga en el formulario', async () => {
  await guardarPerfil({}, fd({ fullName: 'Ana', userId: 'otro-usuario', user_id: 'otro-usuario' }))
  expect(vi.mocked(saveProfile).mock.calls[0][0]).toBe('u1')
})

describe('avatar', () => {
  // ⚠️ EL BUCKET NO VALIDA NADA: `ad-uploads` es público, sin tope de tamaño ni
  // allowlist de mime, y `mimeToExt` cae a `.jpg` para cualquier tipo desconocido.
  // O sea un archivo arbitrario terminaría servido como imagen en una URL pública
  // si este guard desaparece.
  it.each(['application/pdf', 'text/html', 'image/svg+xml', 'application/octet-stream'])(
    'rechaza %s sin tocar el storage',
    async (type) => {
      const r = await subirAvatar({}, fd({ avatar: imagen(10, type) }))
      expect(r.error).toMatch(/PNG, JPG o WEBP/)
      expect(uploadToStorage).not.toHaveBeenCalled()
      expect(saveProfile).not.toHaveBeenCalled()
    },
  )

  it('rechaza una imagen de más de 2 MB sin tocar el storage', async () => {
    const r = await subirAvatar({}, fd({ avatar: imagen(2 * 1024 * 1024 + 1, 'image/png') }))
    expect(r.error).toMatch(/2 MB/)
    expect(uploadToStorage).not.toHaveBeenCalled()
  })

  it.each(['image/png', 'image/jpeg', 'image/webp'])('acepta %s', async (type) => {
    const r = await subirAvatar({}, fd({ avatar: imagen(1024, type) }))
    expect(r.ok).toBeTruthy()
    // Path determinista bajo `avatars/`, nombrado por el usuario de la sesión.
    expect(vi.mocked(uploadToStorage).mock.calls[0][0]).toBe('avatars')
    expect(vi.mocked(uploadToStorage).mock.calls[0][3]).toBe('u1')
    // Se persiste la URL COMPLETA, con el `?v=` que evita que el navegador siga
    // sirviendo la foto anterior cacheada (el path del bucket es fijo + upsert).
    expect(vi.mocked(saveProfile).mock.calls[0][1]).toEqual({
      avatarUrl: 'https://x.supabase.co/avatars/u1.png?v=1',
    })
  })

  it('sin archivo pide uno en vez de guardar vacío', async () => {
    expect((await subirAvatar({}, fd({}))).error).toMatch(/Elige una imagen/)
    expect((await subirAvatar({}, fd({ avatar: imagen(0, 'image/png') }))).error)
      .toMatch(/Elige una imagen/)
  })
})

describe('documento de facturación', () => {
  // Un RUC mal escrito es un comprobante que no se puede emitir.
  it.each([['12345678', 'DNI'], ['20123456789', 'RUC']])('acepta %s (%s)', async (doc) => {
    expect((await guardarFacturacion({}, fd({ taxId: doc }))).ok).toBeTruthy()
  })

  it.each(['1234567', '123456789', '2012345678912'])('rechaza %s dígitos', async (doc) => {
    const r = await guardarFacturacion({}, fd({ taxId: doc }))
    expect(r.error).toMatch(/8 dígitos y un RUC 11/)
    expect(saveProfile).not.toHaveBeenCalled()
  })

  // Un cliente extranjero tiene identificadores con letras: exigirle 8 u 11 dígitos
  // sería inventar una regla que SUNAT no pide.
  it('deja pasar un identificador no numérico', async () => {
    expect((await guardarFacturacion({}, fd({ taxId: 'ESB12345678' }))).ok).toBeTruthy()
  })

  it('vacío es válido: el campo es opcional', async () => {
    expect((await guardarFacturacion({}, fd({ taxId: '' }))).ok).toBeTruthy()
  })
})

describe('topes de largo', () => {
  it('corta un nombre demasiado largo antes de la DB', async () => {
    const r = await guardarPerfil({}, fd({ fullName: 'a'.repeat(81) }))
    expect(r.error).toMatch(/80 caracteres/)
    expect(saveProfile).not.toHaveBeenCalled()
  })

  it('corta una key de KIE absurda', async () => {
    const r = await guardarKieKey({}, fd({ key: 'k'.repeat(201) }))
    expect(r.error).toMatch(/demasiado larga/)
    expect(setKieKey).not.toHaveBeenCalled()
  })
})

// Los tres formularios escriben sobre la MISMA fila. Si uno guardara el objeto
// entero, un guardado de facturación borraría el nombre del perfil.
it('cada formulario guarda solo SUS campos', async () => {
  await guardarPerfil({}, fd({ fullName: 'Ana', phone: '+51 999' }))
  expect(vi.mocked(saveProfile).mock.calls[0][1]).toEqual({ fullName: 'Ana', phone: '+51 999' })

  vi.clearAllMocks()
  await guardarFacturacion({}, fd({ billingName: 'ACME', taxId: '20123456789', billingAddress: 'Lima' }))
  expect(vi.mocked(saveProfile).mock.calls[0][1]).toEqual({
    billingName: 'ACME', taxId: '20123456789', billingAddress: 'Lima',
  })
})
