import { describe, it, expect, vi, beforeEach } from 'vitest'

// La rama que importa es "no hay identidad": ahí nacían las sesiones huérfanas.
// Mockeamos la cookie store de Next; getUser no se toca porque el test corre con
// AUTH_DISABLED=true (el camino del dev server, que es donde se detectó el bug).
let cookieValue: string | undefined

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'ph_uid' && cookieValue ? { value: cookieValue } : undefined) }),
}))
vi.mock('@/lib/supabase/server', () => ({ getUser: async () => null }))

const { ensureUserId, PH_USER_COOKIE } = await import('./session')

describe('ensureUserId', () => {
  beforeEach(() => {
    process.env.AUTH_DISABLED = 'true'
    cookieValue = undefined
  })

  it('adopta la cookie existente y NO pide persistirla', async () => {
    cookieValue = 'fa36419f-5551-488a-84b6-62cb09257ca6'
    const { uid, setCookie } = await ensureUserId()
    expect(uid).toBe('fa36419f-5551-488a-84b6-62cb09257ca6')
    expect(setCookie).toBeUndefined()
  })

  it('sin cookie ACUÑA una identidad y devuelve el Set-Cookie que la persiste', async () => {
    const { uid, setCookie } = await ensureUserId()
    // Lo que rompía: acá antes salía undefined → user_id null en la fila.
    expect(uid).toMatch(/^[0-9a-f-]{36}$/)
    expect(setCookie).toContain(`${PH_USER_COOKIE}=${uid}`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Path=/')
  })
})
