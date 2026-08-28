import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * QUÉ MODELO Y QUÉ TRANSPORTE ATIENDE CADA LLAMADA DE IMAGEN.
 * ---------------------------------------------------------------------------
 * ⚠️ ESTE TEST EXISTE PORQUE ESTE CABLEADO YA CAMBIÓ EN SILENCIO UNA VEZ Y COSTÓ TRES RONDAS
 * DE TRABAJO SOBRE EL PROMPT EQUIVOCADO. Al migrar la imagen a KIE (`0f51808`, 2026-08-25),
 * gpt-image-2 pasó a rechazar los prompts de landing 3 de 3 y `generateImage` cayó al respaldo
 * sin decir nada: el usuario vio que "el diseño cambió" sin que nadie tocara el diseño. Un
 * `console.warn` no es una señal — un test sí.
 *
 * Lo que se fija es el CONTRATO, no la implementación: quién atiende primero y quién de respaldo.
 */

const llamadas: string[] = []

vi.mock('./llm-openai', () => ({
  openaiGenerateImage: vi.fn(async () => { llamadas.push('openai:gpt-image-2'); return 'B64_OPENAI' }),
  openaiCallStructured: vi.fn(), openaiCallReasoning: vi.fn(), toChatContent: vi.fn(),
}))
vi.mock('./kie-image', () => ({
  kieGenerateImage: vi.fn(async (modelo: string) => { llamadas.push(`kie:${modelo}`); return `B64_KIE_${modelo}` }),
}))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: async () => { llamadas.push('sdk-google'); return { candidates: [] } } } },
  Modality: { IMAGE: 'IMAGE', TEXT: 'TEXT' },
}))

const { generateImage } = await import('./gemini')
const { openaiGenerateImage } = await import('./llm-openai')
const { kieGenerateImage } = await import('./kie-image')

beforeEach(() => {
  llamadas.length = 0
  vi.mocked(openaiGenerateImage).mockImplementation(async () => { llamadas.push('openai:gpt-image-2'); return 'B64_OPENAI' })
  vi.mocked(kieGenerateImage).mockImplementation(async (m: string) => { llamadas.push(`kie:${m}`); return `B64_KIE_${m}` })
  delete process.env.IMAGE_VIA
  delete process.env.LLM_PROVIDER
})

describe('landing (viaDirecta)', () => {
  it('atiende gpt-image-2 por el SDK de OpenAI, no por KIE', async () => {
    await generateImage([{ text: 'x' }], 3, { viaDirecta: true })
    expect(llamadas[0]).toBe('openai:gpt-image-2')
    expect(llamadas).not.toContain('kie:gpt-image-2')
  })

  // ⚠️ El respaldo NO puede ser el SDK de Google: su clave devuelve 429 (sin crédito, medido
  // 2026-08-27). Caer ahí sería pasar de un modelo que anda a uno muerto.
  it('si gpt-image-2 falla, el respaldo es nano-banana-2 POR KIE', async () => {
    vi.mocked(openaiGenerateImage).mockRejectedValueOnce(new Error('moderación'))
    const out = await generateImage([{ text: 'x' }], 3, { viaDirecta: true })
    expect(llamadas).toEqual(['kie:nano-banana-2'])
    expect(out).toBe('B64_KIE_nano-banana-2')
  })

  it('una respuesta VACÍA también cae al respaldo, no devuelve vacío', async () => {
    // El mock registra la llamada Y devuelve vacío: con `mockResolvedValueOnce` a secas se
    // pierde el registro y el test mediría el mock, no el despacho.
    vi.mocked(openaiGenerateImage).mockImplementationOnce(async () => { llamadas.push('openai:gpt-image-2'); return '' })
    await generateImage([{ text: 'x' }], 3, { viaDirecta: true })
    expect(llamadas).toEqual(['openai:gpt-image-2', 'kie:nano-banana-2'])
  })
})

describe('placa de zona (preferGemini)', () => {
  // gpt-image-2 modera el encuadre de cuerpo sin rostro en 4 de 4 corridas: el primario tiene que
  // ser nano-banana-2, y gpt-image-2 queda de segunda oportunidad.
  it('sin viaDirecta va por KIE con nano-banana-2 de primario', async () => {
    await generateImage([{ text: 'x' }], 3, { preferGemini: true })
    expect(llamadas[0]).toBe('kie:nano-banana-2')
  })

  it('con viaDirecta el par se invierte igual: nano-banana-2 por KIE primero', async () => {
    await generateImage([{ text: 'x' }], 3, { preferGemini: true, viaDirecta: true })
    expect(llamadas[0]).toBe('kie:nano-banana-2')
    expect(llamadas).not.toContain('sdk-google')
  })
})

describe('el resto del hub (anuncios, branding, video) sigue por KIE', () => {
  it('sin viaDirecta el primario es gpt-image-2 POR KIE, no el SDK', async () => {
    await generateImage([{ text: 'x' }], 3, {})
    expect(llamadas[0]).toBe('kie:gpt-image-2')
    expect(llamadas).not.toContain('openai:gpt-image-2')
  })

  it('y su respaldo sigue siendo nano-banana-2 por KIE', async () => {
    vi.mocked(kieGenerateImage).mockImplementationOnce(async () => { llamadas.push('kie:gpt-image-2'); throw new Error('falló') })
    await generateImage([{ text: 'x' }], 3, {})
    expect(llamadas).toEqual(['kie:gpt-image-2', 'kie:nano-banana-2'])
  })
})
