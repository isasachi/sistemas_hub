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

// Las imágenes ancla son generaciones PAGADAS de gpt-image-2: si no se mockean, cada test
// intentaría crearlas de verdad. ⚠️ Y desde 2026-08-24 las paga el HUB, no el usuario —
// salieron de KIE (Nano Banana Pro) y pasaron a OpenAI.
// ⚠️ Se mockea `@/lib/gemini`, no `llm-openai`: desde que la imagen salió a KIE (2026-08-25) las
// anclas van por `generateImage` con `preferGemini` — Gemini 3.1 Flash Image de primario. Mockear
// el módulo viejo dejaba la aserción de abajo pasando trivialmente, que es un test vacío.
vi.mock('@/lib/gemini', () => ({
  generateImage: vi.fn(async () => Buffer.from('png').toString('base64')),
}))
vi.mock('@/lib/storage', () => ({
  uploadToStorage: vi.fn(async (_id: string, _b: Buffer, _m: string, nombre: string) => `https://cdn.test/${nombre}.png`),
  fetchAsBase64: vi.fn(async () => ({ data: 'AAA', mimeType: 'image/png' })),
}))

// BYOK: el render usa la API key de KIE del usuario. Los tests corren con una
// cargada; el caso de la key ausente tiene su propio bloque al final.
vi.mock('@/lib/user-settings', () => ({
  currentKieKey: vi.fn().mockResolvedValue('kie-de-prueba'),
}))

vi.mock('@/lib/product-hunter/session', () => ({
  readUserId: vi.fn().mockResolvedValue('user-1'),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { getVideoSession, updateVideoSession, claimFreshLotes } from '@/lib/video-ads/db'
import { createVideoTask } from '@/lib/video-ads/kie'
import { generateImage } from '@/lib/gemini'
import { checkGenQuota, checkGlobalBackstop, recordGenQuota } from '@/lib/gen-quota'
import type { VideoSessionResponse } from '@/lib/video-ads/types'
import type { Lote } from '@/lib/video-ads/lotes'
import { currentKieKey } from '@/lib/user-settings'

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
  accionVisual: `la mujer hace la acción ${n}`, personaje: 'Mujer 25', producto: 'Frasco', locucion: `línea ${n}`,
})

// Dos tomas de 10 s: juntas suman 20 s (>15), así que `groupIntoLotes` las separa en
// 2 lotes reales — es el caso que prueba que la cuota nueva cobra 1 vez, no 2.
const ADAPTED_2_LOTES = {
  guionFinal: 'x', caracteresAdaptado: 1, diferenciaCaracteres: 0,
  tomas: [toma(1, 10), toma(2, 10)],
  variablesPendientes: [] as string[],
}

// Un guión COMPLETAMENTE distinto que igual produce 2 lotes: mismas duraciones, otro
// texto. Es el caso del fix round 4 y no es exótico — los lotes se arman empaquetando
// tomas en buckets de hasta LOTE_MAX_SEC, así que dos adaptaciones de duración parecida caen en
// la misma cantidad de lotes de forma rutinaria.
const ADAPTED_2_LOTES_OTRO_TEXTO = {
  ...ADAPTED_2_LOTES,
  tomas: [
    { ...toma(1, 10), accionVisual: 'la mujer hace otra acción distinta', locucion: 'otro guión completamente distinto' },
    { ...toma(2, 10), accionVisual: 'la mujer hace la segunda acción distinta', locucion: 'segunda línea distinta' },
  ],
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

/**
 * Corre un primer render completo sobre una sesión virgen y devuelve los lotes tal
 * como quedarían GUARDADOS en la fila: pasados por `JSON.parse(JSON.stringify(...))`,
 * que es el ida y vuelta que sufre un jsonb.
 *
 * Los fixtures de reanudación se arman con esto y no a mano a propósito: la huella
 * (`scriptHash`) la calcula la ruta, y un fixture con un hash escrito a mano pasaría
 * el test mientras el camino real falla. Este helper es la única forma de verificar
 * que la huella sobrevive el viaje por la DB.
 */
async function renderInicial(over: Partial<VideoSessionResponse> = {}): Promise<Lote[]> {
  vi.mocked(getVideoSession).mockResolvedValue(session(over))
  const res = await POST(req(), ctx())
  expect(res.status).toBe(200)
  const body = await res.json()
  vi.clearAllMocks() // se limpian las llamadas del primer render; las implementaciones siguen
  return JSON.parse(JSON.stringify(body.lotes)) as Lote[]
}

/** Simula el estado "el lote 1 se pagó, el 2 quedó pendiente" a partir de un render
 *  completo — el fallo parcial que hace que reanudar tenga sentido. */
function conPendiente(guardados: Lote[]): Lote[] {
  return guardados.map((l, i) =>
    i === 0 ? l : { ...l, taskId: null, prompt: '', status: 'idle' as const, videoUrl: null },
  )
}

describe('POST generate-lotes — fix round 2: cuota por video, no por lote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(claimFreshLotes).mockResolvedValue(true)
    vi.mocked(checkGenQuota).mockResolvedValue({ blocked: null, regensLeft: null })
    vi.mocked(checkGlobalBackstop).mockResolvedValue({ blocked: null })
    vi.mocked(createVideoTask).mockImplementation(async () => `task-${Math.random()}`)
  })

  // Regresión real: `duration` es una columna `int` en Postgres, y cuando
  // `repairCutTiming` empezó a repartir décimas entre los cortes las duraciones dejaron
  // de sumar entero (un guión real dio 46.8). Postgres rechazaba la fila con "invalid
  // input syntax for type integer" y el render moría en el claim, ANTES de crear
  // ninguna tarea — 500 opaco en el navegador. Los dos sitios que escriben la columna
  // tienen que mandar un entero.
  it('escribe `duration` como ENTERO aunque las tomas sumen décimas', async () => {
    const conDecimales = {
      ...ADAPTED_2_LOTES,
      tomas: [
        { ...ADAPTED_2_LOTES.tomas[0], duracionSeg: 2.9 },
        { ...ADAPTED_2_LOTES.tomas[1], duracionSeg: 11.9 },
      ],
    }
    vi.mocked(getVideoSession).mockResolvedValue(session({ adapted: conDecimales } as never))

    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)

    const escrituras = [
      ...vi.mocked(claimFreshLotes).mock.calls.map((c) => c[1]),
      ...vi.mocked(updateVideoSession).mock.calls.map((c) => c[1]),
    ].filter((p) => p && 'duration' in p)

    expect(escrituras.length).toBeGreaterThan(0)
    for (const patch of escrituras) {
      expect(Number.isInteger((patch as { duration: number }).duration)).toBe(true)
    }
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
    // Fixture desde el camino real (render completo → jsonb → reanudación): el guión
    // NO cambió, solo falta terminar de renderizar el lote 2.
    const guardados = await renderInicial()
    vi.mocked(getVideoSession).mockResolvedValue(
      session({ lotes: conPendiente(guardados) as unknown as VideoSessionResponse['lotes'] }),
    )

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(200)
    // El lote ya pagado sobrevive intacto: la huella cruzó el ida y vuelta por jsonb.
    const reanudado = await res.json()
    expect(reanudado.lotes[0].taskId).toBe(guardados[0].taskId)

    // Solo el lote 2 (pendiente) crea tarea nueva; el lote 1 se conserva tal cual.
    expect(createVideoTask).toHaveBeenCalledTimes(1)
    expect(checkGenQuota).not.toHaveBeenCalled() // el gate per-video NO aplica al reanudar
    expect(checkGlobalBackstop).toHaveBeenCalledTimes(1) // pero el backstop SÍ sigue aplicando
    expect(claimFreshLotes).not.toHaveBeenCalled() // ya no es la primera escritura

    const generationCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-generation')
    expect(generationCalls).toHaveLength(0)
  })

  // Las anclas son imágenes PAGADAS y además definen cómo se ve cada escena del clip:
  // regenerarlas al reanudar cambiaría el aspecto del lote pendiente respecto de los que
  // ya se pagaron, sin que nada lo reportara.
  it('reanudar REUSA las anclas guardadas en vez de regenerarlas', async () => {
    const guardados = await renderInicial()
    vi.mocked(getVideoSession).mockResolvedValue(
      session({
        lotes: conPendiente(guardados) as unknown as VideoSessionResponse['lotes'],
        // ⚠️ UNA ANCLA POR LOTE SALVO EL PRIMERO. Este fixture decía `frames: []` con el
        // comentario "un lote de una escena no necesita ancla": era cierto cuando las
        // anclas solo cubrían un cambio de escena DENTRO de un lote, y dejó de serlo cuando
        // pasaron a anclar el fondo entre clips. Lo que el test protege no cambió —
        // regenerarlas al reanudar cambiaría el aspecto del lote pendiente respecto de los
        // ya pagados—, cambió cuántas hay que guardar para que el reuso aplique.
        frames: guardados.slice(1).map((l) => `https://x.supabase.co/ancla-${l.n}-1.png`),
      } as never),
    )
    vi.mocked(generateImage).mockClear()

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(200)
    expect(generateImage).not.toHaveBeenCalled()
    // El lote pendiente recibe avatar, producto y DESPUÉS su ancla, en ese orden: es el
    // contrato del que dependen la leyenda `@image(n)` y el índice de cada ancla. Y el
    // ancla es la GUARDADA, no una nueva — que es el punto del test.
    const [creado] = vi.mocked(createVideoTask).mock.calls.slice(-1)
    expect(creado[0].images.map((i) => i.url)).toEqual([
      'https://x.supabase.co/character.png',
      'https://x.supabase.co/product.png',
      `https://x.supabase.co/ancla-${guardados[1].n}-1.png`,
    ])
  })

  it('resume:true SIN ningún taskId pagado se trata como intento nuevo: SÍ cobra', async () => {
    // Placeholders de un intento anterior que falló por completo (0 gastado) — un
    // cliente que mande resume:true igual no se libra de pagar la generación.
    const idle: Lote = { n: 1, tomas: [], duracionSeg: 10, prompt: '', taskId: null, status: 'idle', videoUrl: null, failMsg: null, scriptHash: null }
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

  // Fix round 5: antes esta rama IGNORABA el `Response` real de `checkGenQuota` y
  // devolvía siempre el mismo texto hardcodeado ("empieza otra sesión"), sin importar
  // qué capa bloqueó. Ahora se propaga el `blocked` tal cual — mismo patrón que la
  // rama de reanudación (`checkGlobalBackstop`).
  it('gate per-sesión bloqueado (regensLeft: 0): se devuelve el mensaje real de checkGenQuota, no uno inventado', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(checkGenQuota).mockResolvedValue({
      blocked: Response.json({ error: 'Llegaste al límite de 2 regeneraciones para este paso.' }, { status: 429 }),
      regensLeft: 0,
    })

    const res = await POST(req(), ctx())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('Llegaste al límite de 2 regeneraciones para este paso.')

    expect(claimFreshLotes).not.toHaveBeenCalled()
    expect(createVideoTask).not.toHaveBeenCalled()
  })

  // El bug que motivó el fix: un usuario que choca contra el backstop GLOBAL (500/día
  // de TODO el hub, `regensLeft: null`) recibía el consejo de "empieza otra sesión" —
  // que no puede funcionar, porque la sesión nueva gasta MÁS contra el mismo backstop
  // compartido. Con el fix, el mensaje real del backstop ("vuelve mañana") es el que
  // llega, y el texto viejo específico de sesión ya no aparece.
  it('backstop GLOBAL bloqueado (regensLeft: null): el mensaje NO sugiere abrir otra sesión', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(checkGenQuota).mockResolvedValue({
      blocked: Response.json({ error: 'El servicio alcanzó su límite diario de generaciones. Vuelve mañana.' }, { status: 429 }),
      regensLeft: null,
    })

    const res = await POST(req(), ctx())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/diario|mañana/i)
    expect(body.error).not.toMatch(/otra sesión/i)

    expect(claimFreshLotes).not.toHaveBeenCalled()
    expect(createVideoTask).not.toHaveBeenCalled()
  })

  it('fallo total en el primer lote (prompt que nunca cabe): NO cobra video-generation y guarda placeholders', async () => {
    // consistency_block absurdamente largo: el prompt no entra en KIE_PROMPT_MAX, así
    // que `buildLotePrompt` lanza antes de llamar a KIE por primera vez. El bloque de
    // consistencia no se recorta nunca — es lo único que sostiene la identidad entre
    // lotes — así que la única salida es fallar, no mandar una tarea que daría 422.
    vi.mocked(getVideoSession).mockResolvedValue(session({ consistency_block: 'x'.repeat(70_000) }))

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
      status: 'waiting', videoUrl: null, failMsg: null, scriptHash: 'huella-vieja',
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
    const viejo1: Lote = { n: 1, tomas: [], duracionSeg: 10, prompt: 'v1', taskId: 't-old-1', status: 'waiting', videoUrl: null, failMsg: null, scriptHash: 'huella-vieja' }
    const viejo2: Lote = { n: 2, tomas: [], duracionSeg: 10, prompt: 'v2', taskId: 't-old-2', status: 'waiting', videoUrl: null, failMsg: null, scriptHash: 'huella-vieja' }
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
      expect.stringContaining('el guión cambió'),
      expect.arrayContaining(['t-old-1', 't-old-2']),
    )
    errSpy.mockRestore()
  })
})

describe('POST generate-lotes — fix round 4: huella de contenido', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(claimFreshLotes).mockResolvedValue(true)
    vi.mocked(checkGenQuota).mockResolvedValue({ blocked: null, regensLeft: null })
    vi.mocked(checkGlobalBackstop).mockResolvedValue({ blocked: null })
    vi.mocked(createVideoTask).mockImplementation(async () => `task-${Math.random()}`)
  })

  // EL HUECO QUE FALTABA: mismo largo, distinto contenido. El guard de la cantidad de
  // lotes (round 3) no lo veía, y la revisión lo reprodujo ejecutándolo — `lote1.prompt`
  // con el texto del guión VIEJO y su taskId intacto, `lote2` con el del guión NUEVO:
  // un video que mezcla dos guiones. Con la huella, esto ya no es una reanudación.
  it('el guión se re-adaptó a otro texto con la MISMA cantidad de lotes: no reanuda, cobra y no mezcla', async () => {
    const guardados = await renderInicial() // render del guión original (2 lotes)
    const promptViejo = guardados[0].prompt
    const taskIdViejo = guardados[0].taskId

    // Mismo estado que una reanudación legítima (lote 1 pagado, lote 2 pendiente),
    // pero el guión guardado en la sesión ya es OTRO — misma cantidad de lotes.
    vi.mocked(getVideoSession).mockResolvedValue(session({
      lotes: conPendiente(guardados) as unknown as VideoSessionResponse['lotes'],
      adapted: ADAPTED_2_LOTES_OTRO_TEXTO,
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()

    // El síntoma medido por la revisión: NINGÚN lote conserva el render viejo.
    expect(body.lotes).toHaveLength(2)
    expect(body.lotes.some((l: Lote) => l.taskId === taskIdViejo)).toBe(false)
    expect(body.lotes.some((l: Lote) => l.prompt === promptViejo)).toBe(false)
    expect(createVideoTask).toHaveBeenCalledTimes(2) // los 2 lotes se rehacen de cero

    // Y es una generación nueva a todos los efectos: pasa por el gate per-video (no
    // por el backstop-only de reanudar) y cobra.
    expect(checkGenQuota).toHaveBeenCalledWith('s1', 'video-generation')
    expect(checkGlobalBackstop).not.toHaveBeenCalled()
    const generationCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-generation')
    expect(generationCalls).toHaveLength(1)

    // El taskId abandonado queda logueado CON el id de sesión (sin él, atar un mp4
    // rescatado a mano en KIE con su dueño depende del contexto del request).
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('sesión s1'),
      expect.arrayContaining([taskIdViejo]),
    )
    errSpy.mockRestore()
  })

  // Decisión para las filas escritas antes de que existiera la huella: no se reanudan.
  it('sesión legada sin huella (scriptHash ausente): se trata como generación nueva', async () => {
    const guardados = await renderInicial()
    const legado = conPendiente(guardados).map((l) => {
      const { scriptHash: _sinHuella, ...resto } = l
      return resto as Lote
    })
    vi.mocked(getVideoSession).mockResolvedValue(
      session({ lotes: legado as unknown as VideoSessionResponse['lotes'] }),
    )
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(200)

    expect(checkGenQuota).toHaveBeenCalledWith('s1', 'video-generation')
    const generationCalls = vi.mocked(recordGenQuota).mock.calls.filter((c) => c[1] === 'video-generation')
    expect(generationCalls).toHaveLength(1)
    const body = await res.json()
    expect(body.lotes.some((l: Lote) => l.taskId === guardados[0].taskId)).toBe(false)
    errSpy.mockRestore()
  })

  // El falso positivo del round 3: el log de abandono estaba ARRIBA del gate de cuota,
  // así que se disparaba incluso cuando el 429 cortaba sin escribir nada — mandando a
  // perseguir una pérdida que nunca ocurrió.
  it('si el gate de cuota corta con 429, NO se loguea ningún taskId abandonado', async () => {
    const guardados = await renderInicial()
    vi.mocked(getVideoSession).mockResolvedValue(session({
      lotes: conPendiente(guardados) as unknown as VideoSessionResponse['lotes'],
      adapted: ADAPTED_2_LOTES_OTRO_TEXTO, // huella distinta → no es reanudación
    }))
    vi.mocked(checkGenQuota).mockResolvedValue({
      blocked: Response.json({ error: 'generic' }, { status: 429 }),
      regensLeft: 0,
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(req({ resume: true }), ctx())
    expect(res.status).toBe(429)

    expect(createVideoTask).not.toHaveBeenCalled()
    expect(updateVideoSession).not.toHaveBeenCalled() // nada se pisó: nada se abandonó
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('POST generate-lotes — BYOK: la API key de KIE es del usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(claimFreshLotes).mockResolvedValue(true)
    vi.mocked(checkGenQuota).mockResolvedValue({ blocked: null, regensLeft: 2 })
    vi.mocked(currentKieKey).mockResolvedValue('kie-de-prueba')
  })

  it('la key del usuario llega a KIE', async () => {
    await POST(req(), ctx())
    expect(vi.mocked(createVideoTask).mock.calls[0][1]).toBe('kie-de-prueba')
  })

  // ⚠️ EL ORDEN IMPORTA Y ES LA RAZÓN DE ESTE TEST. Si la key se resolviera DESPUÉS
  // del gate de cuota, `checkGenQuota` ya habría escrito la fila de
  // `video-generation` y el primer `createVideoTask` moriría con un 401 de KIE: el
  // usuario perdería una generación de su cuota por no haber cargado una key.
  it('sin key: 400 sin cobrar cuota, sin llamar a KIE y sin tocar la sesión', async () => {
    vi.mocked(currentKieKey).mockResolvedValue(null)
    delete process.env.KIE_API_KEY

    const res = await POST(req(), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/API key de KIE/i)
    expect(vi.mocked(checkGenQuota)).not.toHaveBeenCalled()
    expect(vi.mocked(createVideoTask)).not.toHaveBeenCalled()
    expect(vi.mocked(recordGenQuota)).not.toHaveBeenCalled()
    expect(vi.mocked(claimFreshLotes)).not.toHaveBeenCalled()
  })

  // ⚠️ ESTE TEST AFIRMABA LO CONTRARIO Y SE INVIRTIÓ A PROPÓSITO (2026-08-24). El env
  // `KIE_API_KEY` ERA el respaldo del hub, y ese respaldo es justamente el agujero: un
  // usuario sin key renderizaba a costa de la cuenta del hub, en silencio y sin que nada
  // lo reportara. `resolveKey` ya no lo mira, ni en dev.
  it('con KIE_API_KEY en el entorno pero sin key del usuario: 400 igual, no renderiza', async () => {
    vi.mocked(currentKieKey).mockResolvedValue(null)
    vi.stubEnv('KIE_API_KEY', 'key-del-hub')

    const res = await POST(req(), ctx())
    expect(res.status).toBe(400)
    expect(vi.mocked(createVideoTask)).not.toHaveBeenCalled()
    expect(vi.mocked(checkGenQuota)).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
