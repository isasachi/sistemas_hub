import { describe, it, expect, vi, beforeEach } from 'vitest'

const callStructured = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/gemini', () => ({ callStructured: (...a: unknown[]) => callStructured(...a) }))

const { callVideoAds } = await import('./llm')
const { z } = await import('zod')

describe('callVideoAds', () => {
  beforeEach(() => callStructured.mockClear())

  // La causa raíz de "El producto no está flotando." dentro de la coreografía: esta tool
  // corría bajo `gemini-system.md`, el motor de anuncios ESTÁTICOS, que ordena declarar
  // la posición física del producto terminando en esa frase. Branding y landing ya tenían
  // system prompt propio; el video se había quedado con el ajeno.
  it('manda el system prompt del VIDEO, no el de anuncios estáticos', async () => {
    await callVideoAds('x', z.object({ ok: z.boolean() }), [{ text: 'hola' }])
    const system = callStructured.mock.calls[0][4] as string
    expect(system).toBeTruthy()
    expect(system).toContain('video ad replication engine')
    expect(system).not.toContain('static ad replication engine')
    expect(system).not.toContain('No está flotando')
    expect(system).not.toContain('physicalPosition')
  })

  it('sigue forzando Gemini', async () => {
    await callVideoAds('x', z.object({ ok: z.boolean() }), [{ text: 'hola' }])
    expect(callStructured.mock.calls[0][5]).toEqual({ preferGemini: true })
  })
})
