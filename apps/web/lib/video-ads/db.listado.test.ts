import { describe, it, expect, vi, beforeEach } from 'vitest'

// El listado del dashboard NO debe traer las sesiones vacías: el wizard crea la fila al
// montar la página, así que abrir la tool y no hacer nada deja una sesión en el historial.
// Medido sobre la base: 103 de 144 filas de anuncios, 40 de 107 de branding, 25 de 89 de
// landing y 22 de 57 de video no tienen ni siquiera su primer insumo.
const captura: Record<string, unknown[]> = { not: [], eq: [] }
const chain = {
  select: () => chain,
  eq: (...a: unknown[]) => { captura.eq.push(a); return chain },
  not: (...a: unknown[]) => { captura.not.push(a); return chain },
  order: () => chain,
  limit: () => Promise.resolve({ data: [], error: null }),
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => chain }) }))

beforeEach(() => { captura.not = []; captura.eq = [] })

describe('los listados del dashboard filtran las sesiones vacías', () => {
  it('video pide reference_video_url no nulo', async () => {
    const { listVideoSessions } = await import('./db')
    await listVideoSessions('u1')
    expect(captura.not).toContainEqual(['reference_video_url', 'is', null])
    // Y sigue filtrando por dueño: el filtro nuevo no puede haber desplazado al de siempre.
    expect(captura.eq).toContainEqual(['user_id', 'u1'])
  })
})
