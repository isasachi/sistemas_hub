import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } }
  }),
  Modality: { IMAGE: 'IMAGE' },
}))

// Force re-import each test to get fresh module (clears singleton)
beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('callStructured', () => {
  it('returns parsed data when Gemini response is valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"name":"Lumina"}' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    const result = await callStructured('test', schema, [{ text: 'analyze' }])
    expect(result).toEqual({ name: 'Lumina' })
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('retries up to maxRetries on parse failure then throws', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"wrong":"field"}' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    await expect(callStructured('test', schema, [{ text: 'analyze' }], 2)).rejects.toThrow()
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('retries on JSON parse error', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not-json' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    await expect(callStructured('test', schema, [{ text: 'q' }], 1)).rejects.toThrow()
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })
})

describe('callReasoning', () => {
  it('returns text from response', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'Edit instruction here' })
    const { callReasoning } = await import('@/lib/gemini')
    const result = await callReasoning('sys prompt', 'user message')
    expect(result).toBe('Edit instruction here')
  })

  it('returns empty string when response has no text', async () => {
    mockGenerateContent.mockResolvedValue({ text: null })
    const { callReasoning } = await import('@/lib/gemini')
    const result = await callReasoning('sys', 'user')
    expect(result).toBe('')
  })
})
