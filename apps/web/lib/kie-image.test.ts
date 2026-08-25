import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./storage', () => ({
  uploadToStorage: vi.fn(async (_s: string, _b: Buffer, _m: string, name: string) => `https://sb.test/kie-refs/${name}.png?v=1`),
}))

import { kieGenerateImage, buildImageBody, imageAspect, imageResolution } from './kie-image'
import { uploadToStorage } from './storage'

type Call = { url: string; body: Record<string, unknown> }
let calls: Call[] = []

function stubFetch(handler: (c: Call) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const c = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} }
    calls.push(c)
    const out = handler(c)
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 })
  }))
}

const tareaOk = (c: Call) => {
  if (c.url.includes('createTask')) return { code: 200, data: { taskId: 't1' } }
  if (c.url.includes('recordInfo')) return { code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://cdn.kie/out.png'] }) } }
  return new Response(Buffer.from('IMG'), { status: 200 })
}

beforeEach(() => { calls = []; vi.stubEnv('KIE_API_KEY', 'key-del-hub'); vi.clearAllMocks() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('buildImageBody', () => {
  // ⚠️ EL FALLO QUE ESTE TEST FIJA: los dos modelos nombran distinto el campo de referencias, y
  // mandar el equivocado NO falla — devuelve `state: success` habiendo IGNORADO la foto, o sea un
  // text-to-image disfrazado de edición.
  it('gpt-image-2 usa input_urls y nano-banana-2 usa image_input', () => {
    const gpt = buildImageBody('gpt-image-2', 'p', ['https://u/1.png'], '9:16', '2K')
    expect(gpt.model).toBe('gpt-image-2-image-to-image')
    expect((gpt.input as { input_urls?: string[] }).input_urls).toEqual(['https://u/1.png'])
    expect((gpt.input as { image_input?: string[] }).image_input).toBeUndefined()

    const nano = buildImageBody('nano-banana-2', 'p', ['https://u/1.png'], '9:16', '2K')
    expect(nano.model).toBe('nano-banana-2')
    expect((nano.input as { image_input?: string[] }).image_input).toEqual(['https://u/1.png'])
    expect((nano.input as { input_urls?: string[] }).input_urls).toBeUndefined()
  })

  it('sin referencias, gpt-image-2 cambia al modelo de texto→imagen', () => {
    expect(buildImageBody('gpt-image-2', 'p', [], 'auto', '1K').model).toBe('gpt-image-2-text-to-image')
    expect(buildImageBody('nano-banana-2', 'p', [], 'auto', '1K').model).toBe('nano-banana-2')
  })

  // ⚠️ El default de nano-banana-2 es JPG, y los call sites suben lo que vuelve como image/png.
  it('pide png explícito en los dos', () => {
    for (const m of ['gpt-image-2', 'nano-banana-2'] as const) {
      expect((buildImageBody(m, 'p', [], '1:1', '1K').input as { output_format: string }).output_format).toBe('png')
    }
  })
})

describe('kieGenerateImage', () => {
  it('sube las referencias inline y manda URLs, nunca base64', async () => {
    stubFetch(tareaOk)
    const b64 = await kieGenerateImage('gpt-image-2', [{ text: 'un ad' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }], 1)
    expect(b64).toBe(Buffer.from('IMG').toString('base64'))
    expect(uploadToStorage).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(calls[0].body)).not.toContain('base64,')
    expect((calls[0].body.input as { input_urls: string[] }).input_urls[0]).toMatch(/^https:\/\/sb\.test\//)
  })

  // ⚠️ Una referencia que YA vive en un bucket público se pasa tal cual: bajarla para volver a
  // subirla es lo que hacían el avatar y las anclas del video contra su propio bucket.
  it('una referencia remota se pasa sin subirla de nuevo', async () => {
    stubFetch(tareaOk)
    await kieGenerateImage('nano-banana-2', [{ fileData: { fileUri: 'https://sb.test/avatar.png', mimeType: 'image/png' } }, { text: 'x' }], 1)
    expect(uploadToStorage).not.toHaveBeenCalled()
    expect((calls[0].body.input as { image_input: string[] }).image_input).toEqual(['https://sb.test/avatar.png'])
  })

  // ⚠️ El ORDEN es contrato: el prompt de las anclas cita `@image(n)`, así que mezclar inline y
  // remotas no puede reordenarlas — le daría a una toma la imagen de otra.
  it('conserva el orden mezclando referencias remotas e inline', async () => {
    stubFetch(tareaOk)
    await kieGenerateImage('nano-banana-2', [
      { fileData: { fileUri: 'https://sb.test/1.png', mimeType: 'image/png' } },
      { inlineData: { mimeType: 'image/png', data: 'QUJD' } },
      { fileData: { fileUri: 'https://sb.test/3.png', mimeType: 'image/png' } },
      { text: 'x' },
    ], 1)
    const urls = (calls[0].body.input as { image_input: string[] }).image_input
    expect(urls[0]).toBe('https://sb.test/1.png')
    expect(urls[1]).toMatch(/kie-refs/)
    expect(urls[2]).toBe('https://sb.test/3.png')
  })

  it('un estado fail corta con el motivo de KIE', async () => {
    stubFetch((c) => c.url.includes('createTask')
      ? { code: 200, data: { taskId: 't1' } }
      : { code: 200, data: { state: 'fail', failMsg: 'nsfw' } })
    await expect(kieGenerateImage('gpt-image-2', [{ text: 'x' }], 1)).rejects.toThrow(/nsfw/)
  })

  // ⚠️ KIE responde HTTP 200 con el error dentro del cuerpo.
  it('un code de error dentro de un HTTP 200 lanza', async () => {
    stubFetch(() => ({ code: 500, msg: 'Internal Error' }))
    await expect(kieGenerateImage('gpt-image-2', [{ text: 'x' }], 1)).rejects.toThrow(/500/)
  })
})

describe('formato', () => {
  it('pasa los ratios que los dos modelos aceptan y cae a auto con el resto', () => {
    expect(imageAspect('9:16')).toBe('9:16')
    expect(imageAspect('3:4')).toBe('3:4')
    expect(imageAspect(undefined)).toBe('auto')
    expect(imageAspect('7:13')).toBe('auto')
  })

  // Documentado en los dos modelos: `auto` y 5:4/4:5 solo existen en 1K.
  it('baja a 1K los ratios que no soportan 2K', () => {
    expect(imageResolution('9:16')).toBe('2K')
    expect(imageResolution('4:5')).toBe('1K')
    expect(imageResolution('auto')).toBe('1K')
  })
})
