import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildImageTaskBody, parseImageTask, generateImage, NANO_PROMPT_MAX } from './nano-banana'

// Contrato con Nano Banana Pro (docs.kie.ai/market/google/pro-image-to-image). Va por el
// endpoint del MARKETPLACE (`jobs/createTask`, `state` string, `resultJson` como string
// con JSON adentro), no por el de Veo, que responde `successFlag` numérico. Mezclar los
// dos parsers deja el polling esperando para siempre.

describe('buildImageTaskBody', () => {
  it('9:16 y 2K por defecto — el avatar es el primer fotograma del clip', () => {
    const b = buildImageTaskBody({ prompt: 'una mujer joven' })
    expect(b.model).toBe('nano-banana-pro')
    expect(b.input.aspect_ratio).toBe('9:16')
    // 2K y no 4K: el frame alimenta un render de 720p, así que 4K es gasto sin destino.
    expect(b.input.resolution).toBe('2K')
    expect(b.input.output_format).toBe('png')
  })

  it('manda las referencias por URL, no en base64', () => {
    const b = buildImageTaskBody({ prompt: 'x', imageUrls: ['https://cdn.test/a.png', 'https://cdn.test/b.png'] })
    expect(b.input).toHaveProperty('image_input', ['https://cdn.test/a.png', 'https://cdn.test/b.png'])
  })

  it('sin referencias NO manda `image_input` vacío', () => {
    // Un array vacío no es lo mismo que ausente: el modo image-to-image se activa por la
    // presencia del campo, y mandarlo vacío es pedir una edición sin nada que editar.
    expect(buildImageTaskBody({ prompt: 'x' }).input).not.toHaveProperty('image_input')
    expect(buildImageTaskBody({ prompt: 'x', imageUrls: [] }).input).not.toHaveProperty('image_input')
  })
})

describe('parseImageTask', () => {
  it('lee la URL del resultJson, que viene como STRING con JSON adentro', () => {
    const d = parseImageTask({
      state: 'success',
      resultJson: JSON.stringify({ resultUrls: ['https://cdn.test/img.png'] }),
    })
    expect(d.state).toBe('success')
    expect(d.imageUrl).toBe('https://cdn.test/img.png')
  })

  it('un resultJson corrupto no rompe el polling: sigue sin resultado', () => {
    expect(parseImageTask({ state: 'generating', resultJson: '{no json' }).imageUrl).toBeNull()
    expect(parseImageTask({}).state).toBe('waiting')
    expect(parseImageTask(null).imageUrl).toBeNull()
  })

  it('propaga el motivo del fallo', () => {
    const d = parseImageTask({ state: 'fail', failMsg: 'content rejected' })
    expect(d.state).toBe('fail')
    expect(d.failMsg).toBe('content rejected')
  })
})

describe('generateImage', () => {
  it('rechaza un prompt que se pasa del tope ANTES de crear la tarea', async () => {
    // Verificar acá y no en KIE evita gastar la llamada para recibir un 422.
    await expect(generateImage({ prompt: 'x'.repeat(NANO_PROMPT_MAX + 1) }))
      .rejects.toThrow(new RegExp(String(NANO_PROMPT_MAX)))
  })
})

/**
 * ⚠️ COLGÓ EL DEV SERVER DE VERDAD. El bucle comprobaba su presupuesto DESPUÉS del
 * `await fetch`, y `fetch` en Node no tiene timeout: una conexión que KIE dejó abierta
 * sin responder impidió que el tope de 240 s se evaluara nunca. Proceso al 0 % de CPU,
 * dormido, con una conexión ESTAB a api.kie.ai y el request del navegador colgado.
 */
describe('generateImage — no se puede colgar', () => {
  it('el presupuesto se agota aunque KIE nunca conteste', async () => {
    process.env.KIE_API_KEY = 'k'
    // El stub REJECTA como lo haría `AbortSignal.timeout`, en vez de dejar una promesa
    // colgada y esperar al temporizador real. Lo que se prueba es que el bucle TERMINA
    // cuando la petición no devuelve nada, no la mecánica del AbortSignal — y así el test
    // no deja timers vivos que se le atribuyan a otro archivo (la suite salió flaky por
    // eso: dos fallos en tests ajenos que pasaban al correrlos aislados).
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('createTask')) {
        return new Response(JSON.stringify({ code: 200, data: { taskId: 't1' } }), { status: 200 })
      }
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    }))
    await expect(generateImage({ prompt: 'x' }, { timeoutMs: 300, pollMs: 1 }))
      .rejects.toThrow(/no respondió/)
  })

  it('un estado `fail` corta el bucle sin esperar al presupuesto', async () => {
    process.env.KIE_API_KEY = 'k'
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(
        String(url).includes('createTask')
          ? { code: 200, data: { taskId: 't1' } }
          : { data: { state: 'fail', failMsg: 'content rejected' } },
      ), { status: 200 })))
    await expect(generateImage({ prompt: 'x' }, { timeoutMs: 60_000, pollMs: 5 }))
      .rejects.toThrow(/content rejected/)
  })
})

afterEach(() => vi.unstubAllGlobals())
