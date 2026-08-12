import { describe, it, expect, vi, beforeEach } from 'vitest'

// `groupIntoLotes`/`buildLotePrompt` (lotes.ts) NO se mockean: son puros y
// deterministas, y correrlos de verdad es lo que deja probar el caso de "un guión
// de 2 lotes cobra 1 sola vez" sin fingir el agrupado a mano.
vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
  claimFreshLotes: vi.fn(),
}))

vi.mock('@/lib/video-ads/kie', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/video-ads/kie')>()),
  createVideoTask: vi.fn(),
}))

vi.mock('@/lib/gen-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gen-quota')>()),
  checkGenQuota: vi.fn(),
  checkGlobalBackstop: vi.fn(),
  recordGenQuota: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/product-hunter/session', () => ({
  readUserId: vi.fn().mockResolvedValue('user-1'),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { getVideoSession, updateVideoSession, claimFreshLotes } from '@/lib/video-ads/db'
import { createVideoTask } from '@/lib/video-ads/kie'
import { checkGenQuota, checkGlobalBackstop, recordGenQuota } from '@/lib/gen-quota'
import type { VideoSessionResponse } from '@/lib/video-ads/types'
import type { Lote } from '@/lib/video-ads/lotes'

function req(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/generador-video-ads/sessions/s1/generate-lotes', {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = 's1') {
  return { params: Promise.resolve({ id }) }
}

const VOZ = {
  idioma: 'es', varianteRegional: 'PE', acento: 'peruano', pronunciacion: 'clara',
  ritmo: 'medio', velocidad: 'media', entonacion: 'natural', energia: 'media',
  pausas: 'breves', tono: 'cálido', timbre: 'medio', edadVocal: '25-30', estilo: 'cercano',
}

const toma = (n: number, duracionSeg: number) => ({
  n, tiempoOriginal: '00:00-00:10', duracionSeg,
  accionVisual: `acción ${n}`, personaje: 'Mujer 25', producto: 'Frasco', locucion: `línea ${n}`,
})

// Dos tomas de 10 s: juntas suman 20 s (>15), así que `groupIntoLotes` las separa en
// 2 lotes reales — es el caso que prueba que la cuota nueva cobra 1 vez, no 2.
const ADAPTED_2_LOTES = {
  guionFinal: 'x', caracteresAdaptado: 1, diferenciaCaracteres: 0,
  tomas: [toma(1, 10), toma(2, 10)],
  variablesPendientes: [] as string[],
}

function session(overrides: Partial<VideoSessionResponse> = {}): VideoSessionResponse {
  return {
    id: 's1',
    adapted: ADAPTED_2_LOTES,
    consistency_block: 'Mujer de 25 años, cabello negro, tono de piel trigueño.',
    voice_profile: VOZ,
    character_url: 'https://x.supabase.co/character.png',
    product_url: 'https://x.supabase.co/product.png',
    product_scan: { productDescription: 'Frasco celeste de 100ml' },
    forensic_analysis: { fondo: 'cocina', cortes: [{ camara: 'primer plano' }] },
    lotes: null,
    ...overrides,
  } as unknown as VideoSessionResponse
}

describe('POST generate-lotes — fix round 2: cuota por video, no por lote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(claimFreshLotes).mockResolvedValue(true)
    vi.mocked(checkGenQuota).mockResolvedValue({ blocked: null, regensLeft: null })
    vi.mocked(checkGlobalBackstop).mockResolvedValue({ blocked: null })
    vi.mocked(createVideoTask).mockImplementation(async () => `task-${Math.random()}`)
  })

  it('un guión de 2 lotes cobra UNA sola video-generation, no una por lote', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())

    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lotes).toHaveLength(2)
    expect(body.lotes.every((l: Lote) => l.taskId)).toBe(true)

    expect(createVideoTask).toHaveBeenCalledTimes(2)
    const generationCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-generation')
    expect(generationCalls).toHaveLength(1)
    const renderCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-render')
    expect(renderCalls).toHaveLength(2)
  })

  it('reanudar (resume:true) con un lote ya pagado NO vuelve a cobrar video-generation', async () => {
    const yaPagado: Lote = {
      n: 1, tomas: [], duracionSeg: 10, prompt: 'ya armado', taskId: 't1',
      status: 'waiting', videoUrl: null, failMsg: null,
    }
    const pendiente: Lote = { n: 2, tomas: [], duracionSeg: 10, prompt: '', taskId: null, status: 'idle', videoUrl: null, failMsg: null }
    // 2 lotes existentes (mismo largo que ADAPTED_2_LOTES, el default de `session()`)
    // — el guión NO cambió de forma, solo falta terminar de renderizar el lote 2.
    vi.mocked(getVideoSession).mockResolvedValue(
      session({ lotes: [yaPagado, pendiente] as unknown as VideoSessionResponse['lotes'] }),
    )

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(200)

    // Solo el lote 2 (pendiente) crea tarea nueva; el lote 1 se conserva tal cual.
    expect(createVideoTask).toHaveBeenCalledTimes(1)
    expect(checkGenQuota).not.toHaveBeenCalled() // el gate per-video NO aplica al reanudar
    expect(checkGlobalBackstop).toHaveBeenCalledTimes(1) // pero el backstop SÍ sigue aplicando
    expect(claimFreshLotes).not.toHaveBeenCalled() // ya no es la primera escritura

    const generationCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-generation')
    expect(generationCalls).toHaveLength(0)
  })

  it('resume:true SIN ningún taskId pagado se trata como intento nuevo: SÍ cobra', async () => {
    // Placeholders de un intento anterior que falló por completo (0 gastado) — un
    // cliente que mande resume:true igual no se libra de pagar la generación.
    const idle: Lote = { n: 1, tomas: [], duracionSeg: 10, prompt: '', taskId: null, status: 'idle', videoUrl: null, failMsg: null }
    vi.mocked(getVideoSession).mockResolvedValue(
      session({ lotes: [idle, { ...idle, n: 2 }] as unknown as VideoSessionResponse['lotes'] }),
    )

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(200)

    expect(checkGenQuota).toHaveBeenCalledWith('s1', 'video-generation') // gate normal, no bypass
    const generationCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-generation')
    expect(generationCalls).toHaveLength(1)
  })

  it('race perdido: claimFreshLotes devuelve false → 409 SIN llamar a KIE ni cobrar nada', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session()) // lotes: null (virgen)
    vi.mocked(claimFreshLotes).mockResolvedValue(false)

    const res = await POST(req(), ctx())
    expect(res.status).toBe(409)

    expect(createVideoTask).not.toHaveBeenCalled()
    expect(recordGenQuota).not.toHaveBeenCalled()
    expect(updateVideoSession).not.toHaveBeenCalled()
  })

  it('gate de video-generation bloqueado: 429 en la unidad nueva, sin tocar KIE ni el claim', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(checkGenQuota).mockResolvedValue({
      blocked: Response.json({ error: 'generic' }, { status: 429 }),
      regensLeft: 0,
    })

    const res = await POST(req(), ctx())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/video/i)
    expect(body.error).not.toMatch(/render/i)

    expect(claimFreshLotes).not.toHaveBeenCalled()
    expect(createVideoTask).not.toHaveBeenCalled()
  })

  it('fallo total en el primer lote (prompt que nunca cabe): NO cobra video-generation y guarda placeholders', async () => {
    // consistency_block absurdamente largo: ni el nivel mínimo de buildLotePrompt
    // entra en KIE_PROMPT_MAX, así que lanza antes de llamar a KIE por primera vez.
    vi.mocked(getVideoSession).mockResolvedValue(session({ consistency_block: 'x'.repeat(6000) }))

    const res = await POST(req(), ctx())
    expect(res.status).toBe(400)

    expect(createVideoTask).not.toHaveBeenCalled()
    const generationCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-generation')
    expect(generationCalls).toHaveLength(0)

    // El rescate guarda los 2 lotes como placeholders idle, no un array vacío.
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({
      lotes: expect.arrayContaining([
        expect.objectContaining({ taskId: null, status: 'idle' }),
      ]),
    }))
  })
})

describe('POST generate-lotes — fix round 3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(claimFreshLotes).mockResolvedValue(true)
    vi.mocked(checkGenQuota).mockResolvedValue({ blocked: null, regensLeft: null })
    vi.mocked(checkGlobalBackstop).mockResolvedValue({ blocked: null })
    vi.mocked(createVideoTask).mockImplementation(async () => `task-${Math.random()}`)
  })

  // Regresión A: antes del fix, el `updateVideoSession` de la rama de éxito estaba
  // FUERA de todo try/catch — si fallaba, el throw escapaba el handler (500 opaco,
  // sin log) dejando la fila con los placeholders `idle` que escribió el claim: las
  // tareas recién creadas en KIE (ya pagadas) quedaban sin forma de encontrarlas.
  it('si falla la escritura final, se loguea (no crashea) y el response sigue reflejando lo creado en KIE', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(updateVideoSession).mockRejectedValueOnce(new Error('db down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(req(), ctx())
    expect(res.status).toBe(200) // el render en KIE sí funcionó — eso es lo que refleja el status
    const body = await res.json()
    expect(body.lotes).toHaveLength(2)
    expect(body.lotes.every((l: Lote) => l.taskId)).toBe(true)

    // El taskId pagado queda en el log, no perdido en un throw sin manejar.
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('no se pudo guardar el rescate'),
      expect.arrayContaining([expect.any(String)]),
      expect.any(Error),
    )
    errSpy.mockRestore()
  })

  // Regresión B: el exploit que la revisión encontró. `video-adapt` no tiene tope
  // per-step, así que re-adaptar el guión a más tomas y mandar `resume: true` hacía
  // que `reanuda` siguiera dando `true` (había un taskId pagado de ANTES) — el gate
  // de `video-generation` se saltaba entero y `resumeSeed` emparejaba por índice
  // contra un guión que ya no correspondía. Con el fix, un cambio en la cantidad de
  // lotes hace que NO sea reanudación real: cobra de nuevo y no reusa ningún índice.
  it('el guión se re-adaptó a más lotes: resume:true NO evita el cobro ni reusa el taskId viejo', async () => {
    const viejo: Lote = {
      n: 1, tomas: [], duracionSeg: 10, prompt: 'guión viejo', taskId: 't-old',
      status: 'waiting', videoUrl: null, failMsg: null,
    }
    // `session()` trae ADAPTED_2_LOTES (2 lotes) por defecto; `existentes` solo tiene
    // 1 → el guión "creció" respecto de lo que se pagó la última vez.
    vi.mocked(getVideoSession).mockResolvedValue(session({ lotes: [viejo] as unknown as VideoSessionResponse['lotes'] }))

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(200)

    // Se trató como intento nuevo: pasó por el gate per-video, no por el backstop-only.
    expect(checkGenQuota).toHaveBeenCalledWith('s1', 'video-generation')
    expect(checkGlobalBackstop).not.toHaveBeenCalled()

    // Ningún lote reusa el taskId viejo — los 2 lotes del guión nuevo se crean de cero.
    expect(createVideoTask).toHaveBeenCalledTimes(2)
    const body = await res.json()
    expect(body.lotes.some((l: Lote) => l.taskId === 't-old')).toBe(false)

    // Y SÍ cobra — el hueco que permitía renders gratis re-adaptando el guión queda cerrado.
    const generationCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-generation')
    expect(generationCalls).toHaveLength(1)
  })

  it('el guión se re-adaptó a menos lotes: resume:true tampoco lo trata como reanudación, y loguea los taskId abandonados', async () => {
    const viejo1: Lote = { n: 1, tomas: [], duracionSeg: 10, prompt: 'v1', taskId: 't-old-1', status: 'waiting', videoUrl: null, failMsg: null }
    const viejo2: Lote = { n: 2, tomas: [], duracionSeg: 10, prompt: 'v2', taskId: 't-old-2', status: 'waiting', videoUrl: null, failMsg: null }
    // 2 lotes pagados de antes; ADAPTED_2_LOTES (el default de `session()`) también
    // produce 2 — para forzar el encogido, uso un guión de 1 sola toma corta.
    vi.mocked(getVideoSession).mockResolvedValue(session({
      lotes: [viejo1, viejo2] as unknown as VideoSessionResponse['lotes'],
      adapted: { guionFinal: 'x', caracteresAdaptado: 1, diferenciaCaracteres: 0, tomas: [toma(1, 5)], variablesPendientes: [] },
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(200)

    expect(checkGenQuota).toHaveBeenCalledWith('s1', 'video-generation')
    const body = await res.json()
    // Ninguno de los 2 taskId viejos sobrevive: no se descartan en silencio dentro de
    // un array que igual se guarda como si todo estuviera bien — el intento entero
    // se trata como nuevo.
    expect(body.lotes.some((l: Lote) => l.taskId === 't-old-1' || l.taskId === 't-old-2')).toBe(false)

    // Pero abandonarlos deja rastro: no es lo mismo "se perdió" que "se perdió y
    // quedó quién preguntó por qué" (mismo criterio que `saveRescue` desde el round 1).
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('el guión cambió de forma'),
      expect.arrayContaining(['t-old-1', 't-old-2']),
    )
    errSpy.mockRestore()
  })
})
