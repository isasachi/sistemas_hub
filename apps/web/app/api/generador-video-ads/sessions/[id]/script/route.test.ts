import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(async () => undefined),
}))

import { POST } from './route'
import { getVideoSession } from '@/lib/video-ads/db'
import type { VideoSessionResponse } from '@/lib/video-ads/types'

const toma = (locucion: string) => ({
  n: 1, tiempoOriginal: '00:00 - 00:33', duracionSeg: 33,
  accionVisual: 'a', personaje: 'p', producto: 'x', locucion,
})

function session(locucion: string): VideoSessionResponse {
  return {
    id: 's1',
    forensic_analysis: { guionOriginal: 'x'.repeat(658) },
    adapted: {
      guionFinal: locucion, caracteresAdaptado: locucion.length, diferenciaCaracteres: 0,
      tomas: [toma(locucion)], variablesPendientes: [],
    },
  } as unknown as VideoSessionResponse
}

const req = (body: unknown) =>
  new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never
const ctx = () => ({ params: Promise.resolve({ id: 's1' }) })

describe('POST script — topes de edición', () => {
  beforeEach(() => vi.clearAllMocks())

  // Caso REAL que bloqueó al usuario: un video de referencia SIN CORTES da una sola
  // toma con el guión entero. 33 s continuos = 706 caracteres en una única línea, y el
  // tope estaba en 600. No pudo guardar ediciones que ya había escrito.
  it('acepta el guión entero en una sola línea (video sin cortes)', async () => {
    const largo = 'Tres razones para tomar esto. '.repeat(24) // ~720 chars
    expect(largo.length).toBeGreaterThan(700)
    vi.mocked(getVideoSession).mockResolvedValue(session(largo))

    const res = await POST(req({ locuciones: [{ indice: 0, texto: largo }] }), ctx())
    expect(res.status).toBe(200)
  })

  // El fallo salía como "Ediciones inválidas" a secas porque el catch del parse colapsa
  // todas las causas: había que leer los logs del servidor para saber qué pasaba.
  it('si una línea se pasa, dice cuál y por cuánto', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session('corta'))

    const res = await POST(req({ locuciones: [{ indice: 2, texto: 'x'.repeat(2600) }] }), ctx())
    expect(res.status).toBe(400)
    const { error } = (await res.json()) as { error: string }
    expect(error).toContain('toma 3')      // indice 2 → la tercera
    expect(error).toContain('2600')
    expect(error).toContain('100')         // cuánto sobra
    expect(error).not.toBe('Ediciones inválidas')
  })

  it('un body con forma equivocada dice que es el formato, no el largo', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session('corta'))
    const res = await POST(req({ locuciones: 'no soy un array' }), ctx())
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/formato/i)
  })
})
