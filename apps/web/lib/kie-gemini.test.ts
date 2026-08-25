import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { kieGeminiStructured, kieGeminiReasoning, toSingleTypes, parseJsonLoose, schemaAceptado, SchemaNoSoportado } from './kie-gemini'

type Call = { url: string; body: Record<string, unknown> }
let calls: Call[] = []

function stubFetch(handler: (c: Call) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const c = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} }
    calls.push(c)
    return new Response(JSON.stringify(handler(c)), { status: 200 })
  }))
}
const ok = (content: string) => () => ({ choices: [{ message: { content }, finish_reason: 'stop' }] })

beforeEach(() => { calls = []; vi.stubEnv('KIE_API_KEY', 'key-del-hub') })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const Nombre = z.object({ nombre: z.string() })

describe('kieGeminiStructured', () => {
  it('va al endpoint de gemini-2.5-flash y devuelve el objeto parseado', async () => {
    stubFetch(ok('{"nombre":"Lumina"}'))
    expect(await kieGeminiStructured('t', Nombre, [{ text: 'x' }], 1, 'S')).toEqual({ nombre: 'Lumina' })
    expect(calls[0].url).toBe('https://api.kie.ai/gemini-2.5-flash/v1/chat/completions')
  })

  // ⚠️ Los dos vienen en TRUE por defecto en este endpoint: con `stream` la respuesta llega como
  // SSE y no como JSON, y con `include_thoughts` el razonamiento viaja dentro del contenido y
  // rompe el parse. Y sin `max_tokens` la salida larga vuelve truncada sin decirlo.
  it('apaga stream y thoughts, y pide un tope de salida', async () => {
    stubFetch(ok('{"nombre":"x"}'))
    await kieGeminiStructured('t', Nombre, [{ text: 'x' }], 1, 'S')
    expect(calls[0].body.stream).toBe(false)
    expect(calls[0].body.include_thoughts).toBe(false)
    expect(calls[0].body.max_tokens).toBe(16_384)
  })

  // ⚠️ La doc dice "solo URLs http" y es falso: verificado en vivo, acepta data URIs.
  it('manda las imágenes inline como data URI', async () => {
    stubFetch(ok('{"nombre":"x"}'))
    await kieGeminiStructured('t', Nombre, [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }], 1, 'S')
    const content = (calls[0].body.messages as { content: unknown }[])[1].content
    expect(JSON.stringify(content)).toContain('data:image/png;base64,QUJD')
  })

  // ⚠️ Un video grande EN BASE64 más un schema revienta a los ~69 s con un error que miente; por
  // URL responde. Por eso el forense manda `fileData` y KIE se baja el archivo él.
  it('manda un archivo remoto como URL, sin base64', async () => {
    stubFetch(ok('{"nombre":"x"}'))
    await kieGeminiStructured('t', Nombre, [{ fileData: { fileUri: 'https://sb.test/v.mp4', mimeType: 'video/mp4' } }, { text: 'x' }], 1, 'S')
    expect(JSON.stringify(calls[0].body)).toContain('https://sb.test/v.mp4')
    expect(JSON.stringify(calls[0].body)).not.toContain('base64,')
  })

  // ⚠️ KIE responde HTTP 200 con el error dentro del cuerpo: mirar solo `res.ok` lo deja pasar.
  it('un code de error dentro de un HTTP 200 lanza', async () => {
    stubFetch(() => ({ code: 400, msg: 'The server is currently being maintained' }))
    await expect(kieGeminiStructured('t', Nombre, [{ text: 'x' }], 1, 'S')).rejects.toThrow(/400/)
  })

  it('reintenta hasta maxRetries y después lanza', async () => {
    stubFetch(ok('{"otro":"campo"}'))
    await expect(kieGeminiStructured('t', Nombre, [{ text: 'x' }], 3, 'S')).rejects.toThrow()
    expect(calls).toHaveLength(3)
  })

  it('recorta los strings que se pasan del .max() en vez de tirar la respuesta', async () => {
    stubFetch(ok(JSON.stringify({ nombre: 'palabra '.repeat(20) })))
    const out = await kieGeminiStructured('t', z.object({ nombre: z.string().max(10) }), [{ text: 'x' }], 1, 'S')
    expect(out.nombre.length).toBeLessThanOrEqual(10)
    expect(calls).toHaveLength(1)
  })

  // ⚠️ El validador rechaza una propiedad llamada `type` (422). Se detecta ANTES de gastar la
  // llamada, y lanza un error propio para que el caller no lo confunda con un fallo del proveedor.
  it('no llama a KIE si el schema tiene una propiedad llamada "type"', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const ConType = z.object({ secciones: z.array(z.object({ type: z.string(), titular: z.string() })) })
    await expect(kieGeminiStructured('landing_copy', ConType, [{ text: 'x' }], 3, 'S')).rejects.toThrow(SchemaNoSoportado)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('kieGeminiReasoning', () => {
  it('devuelve el texto plano', async () => {
    stubFetch(ok('instructivo'))
    expect(await kieGeminiReasoning('sys', 'user')).toBe('instructivo')
  })
})

// ⚠️ Este endpoint rechaza `type: [x, null]` con un 400, con strict en true Y en false.
describe('toSingleTypes', () => {
  it('convierte el array de tipos en anyOf y conserva el campo en required', () => {
    const out = toSingleTypes({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: ['string', 'null'], maxLength: 40 } },
      required: ['a', 'b'],
    }) as { properties: Record<string, Record<string, unknown>>; required: string[] }
    expect(out.properties.b.type).toBeUndefined()
    expect(out.properties.b.anyOf).toEqual([{ type: 'string', maxLength: 40 }, { type: 'null' }])
    expect(out.required).toEqual(['a', 'b']) // lo que no se exige, el modelo lo omite
    expect(out.properties.a).toEqual({ type: 'string' })
  })

  // ⚠️ Con `items` FUERA de la rama el modelo lee "un array de cualquier cosa" y devuelve `{}`.
  it('mete los hermanos del type DENTRO de la rama tipada', () => {
    const out = toSingleTypes({
      type: 'object',
      properties: { xs: { description: 'lista', type: ['array', 'null'], items: { type: 'string' } } },
    }) as { properties: Record<string, { description?: string; anyOf: Record<string, unknown>[] }> }
    expect(out.properties.xs.anyOf[0]).toEqual({ type: 'array', items: { type: 'string' } })
    expect(out.properties.xs.anyOf[1]).toEqual({ type: 'null' })
    expect(out.properties.xs.description).toBe('lista') // la anotación se queda arriba
  })
})

describe('parseJsonLoose', () => {
  it('acepta el JSON con cerca de código y sin ella', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('no toca un JSON que lleva backticks adentro', () => {
    expect(parseJsonLoose('{"a":"usa ``` para citar"}')).toEqual({ a: 'usa ``` para citar' })
  })
})

describe('schemaAceptado', () => {
  it('rechaza una propiedad llamada type a cualquier profundidad', () => {
    expect(schemaAceptado({ type: 'object', properties: { a: { type: 'string' } } })).toBe(true)
    expect(schemaAceptado({ type: 'object', properties: { xs: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' } } } } } })).toBe(false)
  })
})
