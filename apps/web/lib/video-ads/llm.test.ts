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

  // El orden de proveedores dejó de ser cosa de este envoltorio el 2026-09-17: Gemini es el
  // primario de TODO el hub y `preferGemini` se borró. Lo que este wrapper sigue garantizando
  // —y lo que se rompe si alguien llama a `callStructured` a pelo desde una ruta de video— es el
  // system prompt, que es lo que fija el test de arriba.
  it('no le pasa opciones al router: el par es el default del hub', async () => {
    await callVideoAds('x', z.object({ ok: z.boolean() }), [{ text: 'hola' }])
    expect(callStructured.mock.calls[0][5]).toBeUndefined()
  })
})
