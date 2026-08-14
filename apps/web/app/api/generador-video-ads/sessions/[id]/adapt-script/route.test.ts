import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gemini', () => ({ callStructured: vi.fn() }))
vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(async () => undefined),
}))
vi.mock('@/lib/gen-quota', () => ({
  checkGenQuota: vi.fn(async () => ({ blocked: null, regensLeft: null })),
  recordGenQuota: vi.fn(async () => undefined),
}))
vi.mock('@/lib/product-hunter/session', () => ({ readUserId: vi.fn(async () => 'u1') }))

import { POST } from './route'
import { callStructured } from '@/lib/gemini'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import type { VideoSessionResponse } from '@/lib/video-ads/types'
import type { AdaptedScript } from '@/lib/video-ads/adapt'

// El corte y la plantilla comparten andamiaje palabra por palabra: es la regla de copia
// de la FASE 2, y lo que permite que `alignSlots` funcione.
const DIALOGO = 'sobre todo si últimamente andas muy cansada por las noches'
const LOCUCION = 'sobre todo si últimamente andas muy [situación personal] por las noches'

function session(): VideoSessionResponse {
  return {
    id: 's1',
    product_name: 'Natrol', what_it_does: 'Gomitas de melatonina',
    angle: 'Testimonio', target_audience: 'Adultos', problem: 'No puedo dormir por las noches',
    validation: { rows: [], pending: [] },
    forensic_analysis: {
      guionOriginal: DIALOGO,
      cortes: [{ n: 1, tiempo: '00:00 - 00:06', duracionSeg: 6, accion: '', camara: '', dialogo: DIALOGO, textoOverlay: '', transicion: '' }],
    },
    template: {
      guionFillInBlank: LOCUCION,
      escenario: {}, edicion: {}, resumenParaUsuario: '',
      tomas: [{ n: 1, locucion: LOCUCION, accionVisual: 'a', duracionSeg: 6 }],
    },
  } as unknown as VideoSessionResponse
}

const req = () => new Request('http://x/api', { method: 'POST' }) as never
const ctx = () => ({ params: Promise.resolve({ id: 's1' }) })

/** Encadena las dos llamadas de la FASE 3: relleno y después coherencia. */
function responder(valores: { id: string; valor: string }[], coherencia: object) {
  vi.mocked(callStructured)
    .mockResolvedValueOnce({ valores, acciones: [] } as never)
    .mockResolvedValueOnce(coherencia as never)
}

const guardado = () =>
  vi.mocked(updateVideoSession).mock.calls.at(-1)![1].adapted as AdaptedScript

describe('POST adapt-script — ajuste de andamiaje', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getVideoSession).mockResolvedValue(session())
  })

  // La única excepción a la copia literal. Solo se aplica sobre el guión ADAPTADO; la
  // plantilla sigue siendo espejo del original.
  it('aplica el ajuste y guarda el texto de ANTES para que sea auditable', async () => {
    responder(
      [{ id: 'situación personal#1', valor: 'no puedo dormir' }],
      {
        correcciones: [],
        ajustes: [{
          n: 1, idHueco: 'situación personal#1',
          locucion: 'sobre todo si últimamente andas sin poder dormir por las noches',
          motivo: 'ningún adjetivo encaja tras "andas muy"',
        }],
      },
    )
    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)

    const a = guardado()
    expect(a.tomas[0].locucion).toBe('sobre todo si últimamente andas sin poder dormir por las noches')
    expect(a.ajustesAndamiaje).toHaveLength(1)
    expect(a.ajustesAndamiaje![0].antes).toContain('andas muy no puedo dormir')
    expect(a.guionFinal).toContain('andas sin poder dormir')
  })

  // El `idHueco` ata el cambio de andamiaje a su justificación. Sin esa comprobación
  // sería un permiso abierto para reescribir cualquier frase con cualquier excusa.
  it('ignora el ajuste cuyo hueco no pertenece a esa toma', async () => {
    responder(
      [{ id: 'situación personal#1', valor: 'cansada' }],
      {
        correcciones: [],
        ajustes: [{ n: 1, idHueco: 'hueco inventado#1', locucion: 'otra cosa totalmente distinta acá', motivo: 'x' }],
      },
    )
    await POST(req(), ctx())
    const a = guardado()
    expect(a.tomas[0].locucion).toBe('sobre todo si últimamente andas muy cansada por las noches')
    expect(a.ajustesAndamiaje).toBeUndefined()
  })

  it('ignora el ajuste que no pasa el guard de fidelidad', async () => {
    responder(
      [{ id: 'situación personal#1', valor: 'cansada' }],
      {
        correcciones: [],
        ajustes: [{
          n: 1, idHueco: 'situación personal#1',
          locucion: 'descubre hoy el secreto que todas están probando ya mismo',
          motivo: 'suena mejor',
        }],
      },
    )
    await POST(req(), ctx())
    const a = guardado()
    expect(a.tomas[0].locucion).toContain('sobre todo si últimamente')
    expect(a.ajustesAndamiaje).toBeUndefined()
  })

  // Sin ajustes, el campo no se escribe: las sesiones normales no cargan con él.
  it('sin ajustes no agrega el campo', async () => {
    responder([{ id: 'situación personal#1', valor: 'cansada' }], { correcciones: [], ajustes: [] })
    await POST(req(), ctx())
    expect(guardado().ajustesAndamiaje).toBeUndefined()
  })

  // Si el corrector revienta, la adaptación de la primera pasada tiene que sobrevivir.
  it('un fallo del corrector no tumba la adaptación', async () => {
    vi.mocked(callStructured)
      .mockResolvedValueOnce({ valores: [{ id: 'situación personal#1', valor: 'cansada' }], acciones: [] } as never)
      .mockRejectedValueOnce(new Error('modelo caído'))
    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    expect(guardado().tomas[0].locucion).toContain('andas muy cansada')
  })
})
