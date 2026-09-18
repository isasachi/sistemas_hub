import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } }
  }),
  Modality: { IMAGE: 'IMAGE' },
}))

// ⚠️ EL RESPALDO SE MOCKEA, NO SE DEJA FALLAR SOLO. Desde el recableado del 2026-09-17 Gemini es
// el PRIMARIO y OpenAI el respaldo, así que un test que hace fallar a Gemini termina llamando al
// SDK de OpenAI de verdad — y sin `OPENAI_API_KEY` eso tira "Missing credentials", que es un
// throw y hace pasar un `rejects.toThrow()` por el motivo equivocado. Con el respaldo mockeado,
// cada test dice qué pasó: si tiró Gemini, si contestó el respaldo, o las dos cosas.
const mockOpenAiStructured = vi.fn()
const mockOpenAiReasoning = vi.fn()
vi.mock('@/lib/llm-openai', () => ({
  openaiCallStructured: (...a: unknown[]) => mockOpenAiStructured(...a),
  openaiCallReasoning: (...a: unknown[]) => mockOpenAiReasoning(...a),
  openaiGenerateImage: vi.fn(),
}))

// Force re-import each test to get fresh module (clears singleton)
beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mockOpenAiStructured.mockRejectedValue(new Error('respaldo no mockeado en este test'))
  mockOpenAiReasoning.mockRejectedValue(new Error('respaldo no mockeado en este test'))
})
afterEach(() => vi.unstubAllEnvs())

describe('callStructured', () => {
  it('returns parsed data when Gemini response is valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"name":"Lumina"}' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    const result = await callStructured('test', schema, [{ text: 'analyze' }])
    expect(result).toEqual({ name: 'Lumina' })
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('retries up to maxRetries on parse failure, then cae al respaldo', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"wrong":"field"}' })
    mockOpenAiStructured.mockResolvedValue({ name: 'del respaldo' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    expect(await callStructured('test', schema, [{ text: 'analyze' }], 2)).toEqual({ name: 'del respaldo' })
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(mockOpenAiStructured).toHaveBeenCalledTimes(1)
  })

  it('retries on JSON parse error', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not-json' })
    mockOpenAiStructured.mockResolvedValue({ name: 'del respaldo' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    expect(await callStructured('test', schema, [{ text: 'q' }], 1)).toEqual({ name: 'del respaldo' })
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  // Si los DOS fallan, tira: devolver un objeto vacío sería peor que el 500.
  it('si el respaldo también falla, tira', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not-json' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    await expect(callStructured('test', schema, [{ text: 'q' }], 1)).rejects.toThrow()
  })
})

describe('callReasoning', () => {
  it('returns text from response', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'Edit instruction here' })
    const { callReasoning } = await import('@/lib/gemini')
    const result = await callReasoning('sys prompt', 'user message')
    expect(result).toBe('Edit instruction here')
  })

  // ⚠️ Una respuesta VACÍA del primario cae al respaldo igual que un error, y eso NO es un
  // detalle: acá el vacío no tira, así que sin esta rama el llamador recibía '' sin enterarse
  // de que el modelo no contestó nada.
  it('una respuesta sin texto cae al respaldo', async () => {
    mockGenerateContent.mockResolvedValue({ text: null })
    mockOpenAiReasoning.mockResolvedValue('del respaldo')
    const { callReasoning } = await import('@/lib/gemini')
    expect(await callReasoning('sys', 'user')).toBe('del respaldo')
  })
})
