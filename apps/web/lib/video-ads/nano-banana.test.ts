import { describe, it, expect } from 'vitest'
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
