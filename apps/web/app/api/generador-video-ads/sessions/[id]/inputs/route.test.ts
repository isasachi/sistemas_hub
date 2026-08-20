import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import type { VideoSessionResponse } from '@/lib/video-ads/types'

// Fix de la revisión: `Section2Character` sube la foto directo al bucket
// (uploadDirect) y nunca había una ruta que persistiera esa URL en la sesión —
// `session.character_url` se quedaba en null para siempre y "Personaje" nunca
// podía confirmarse por imagen. Ahora esta ruta recibe `characterUrl` (si llega,
// foto recién subida en este mismo submit) y hace merge con lo que ya tenía la
// fila antes de construir la matriz.

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/generador-video-ads/sessions/s1/inputs', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function ctx(id = 's1') {
  return { params: Promise.resolve({ id }) }
}

const FULL_BODY = {
  productName: 'Serum Eunoia',
  productDescription: 'Suero de niacinamida',
  angle: 'Testimonio',
  targetAudience: 'Mujeres 20-35',
  problem: 'Marcas de acné',
  characterDesc: '',
  characterEthnicity: 'Latina peruana',
  accent: 'Español peruano de Lima',
  voice: '',
  constraints: '',
}

function session(overrides: Partial<VideoSessionResponse> = {}) {
  return { id: 's1', step: 2, character_url: null, ...overrides } as unknown as VideoSessionResponse
}

describe('POST /api/generador-video-ads/sessions/[id]/inputs — persistencia de character_url', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persiste la characterUrl del body cuando llega (foto recién subida en este paso)', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ character_url: null }))

    const res = await POST(req({ ...FULL_BODY, characterUrl: 'https://x.supabase.co/character.png' }), ctx())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ character_url: 'https://x.supabase.co/character.png' }))
    // Sin descripción de personaje, pero CON imagen: "Personaje" confirma por REFERENCIA.
    const personaje = data.validation.rows.find((r: { variable: string }) => r.variable === 'Personaje')
    expect(personaje.estado).toBe('CONFIRMADA')
    expect(personaje.fuente).toBe('REFERENCIA')
  })

  it('conserva la character_url que ya tenía la sesión si el body no manda una nueva', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ character_url: 'https://x.supabase.co/ya-subida.png' }))

    const res = await POST(req(FULL_BODY), ctx())
    await res.json()

    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ character_url: 'https://x.supabase.co/ya-subida.png' }))
  })

  it('sin foto en el body ni en la sesión, "Personaje" depende de characterDesc', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ character_url: null }))

    const res = await POST(req(FULL_BODY), ctx()) // characterDesc: '' en FULL_BODY
    const data = await res.json()

    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ character_url: null }))
    const personaje = data.validation.rows.find((r: { variable: string }) => r.variable === 'Personaje')
    expect(personaje.estado).toBe('PENDIENTE')
  })

  it('404 cuando la sesión no existe', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(null)
    const res = await POST(req(FULL_BODY), ctx())
    expect(res.status).toBe(404)
    expect(updateVideoSession).not.toHaveBeenCalled()
  })
})

/**
 * ⚠️ LA MEZCLA POR ID ES LO QUE EVITA BORRAR LO QUE CUESTA PLATA. El wizard solo manda lo
 * que el USUARIO define de cada personaje; el avatar, el bloque de consistencia, el perfil
 * de voz y el de movimiento los genera FASE 4 y viven en la misma columna. Escribir el
 * array del wizard tal cual los borraría, y volver a este paso a corregir una tilde
 * obligaría a re-generar N avatares.
 */
describe('POST inputs — varios personajes', () => {
  const YA_GENERADO = {
    id: 'P1', rol: 'hijo', desc: 'viejo', etnia: 'x', acento: 'x', voz: '',
    fotoUrl: 'https://cdn/foto.png', avatarUrl: 'https://cdn/avatar.png',
    consistencyBlock: 'Bloque generado', voiceProfile: { acento: 'mexicano' },
    motionProfile: { calidadMovimiento: 'fluido', manerismos: 'tics' },
  }
  const DOS = [
    { id: 'P1', rol: 'hijo', desc: 'Hombre de 30', etnia: 'Latino mexicano', acento: 'Mexicano de ciudad', voz: '' },
    { id: 'P2', rol: 'padre', desc: 'Hombre de 60', etnia: 'Latino mexicano', acento: 'Mexicano rural', voz: '' },
  ]

  beforeEach(() => {
    vi.mocked(getVideoSession).mockResolvedValue({
      id: 's1', step: 1, character_url: null, personajes: [YA_GENERADO],
    } as unknown as VideoSessionResponse)
  })

  it('conserva el avatar y los perfiles ya generados al re-guardar los inputs', async () => {
    await POST(req({ ...FULL_BODY, personajes: DOS }), ctx())
    const patch = vi.mocked(updateVideoSession).mock.calls.at(-1)![1] as never as
      { personajes: Record<string, unknown>[] }

    const p1 = patch.personajes.find((p) => p.id === 'P1')!
    expect(p1.avatarUrl).toBe('https://cdn/avatar.png')
    expect(p1.consistencyBlock).toBe('Bloque generado')
    expect(p1.voiceProfile).toEqual({ acento: 'mexicano' })
    // …y lo que el usuario acaba de editar SÍ se actualiza.
    expect(p1.desc).toBe('Hombre de 30')
    expect(p1.acento).toBe('Mexicano de ciudad')
  })

  it('un personaje nuevo nace sin nada generado, no hereda lo del otro', async () => {
    await POST(req({ ...FULL_BODY, personajes: DOS }), ctx())
    const patch = vi.mocked(updateVideoSession).mock.calls.at(-1)![1] as never as
      { personajes: Record<string, unknown>[] }
    const p2 = patch.personajes.find((p) => p.id === 'P2')!
    expect(p2.avatarUrl).toBeNull()
    expect(p2.consistencyBlock).toBeNull()
  })

  it('las columnas singulares siguen el PROTAGONISTA — es el camino legado', async () => {
    await POST(req({ ...FULL_BODY, personajes: DOS }), ctx())
    const patch = vi.mocked(updateVideoSession).mock.calls.at(-1)![1] as never as Record<string, unknown>
    expect(patch.character_desc).toBe('Hombre de 30')
    expect(patch.accent).toBe('Mexicano de ciudad')
  })

  it('sin la lista NO se escribe la columna: las sesiones viejas quedan intactas', async () => {
    await POST(req(FULL_BODY), ctx())
    const patch = vi.mocked(updateVideoSession).mock.calls.at(-1)![1] as never as Record<string, unknown>
    expect('personajes' in patch).toBe(false)
    expect(patch.character_desc).toBe(FULL_BODY.characterDesc)
  })
})
