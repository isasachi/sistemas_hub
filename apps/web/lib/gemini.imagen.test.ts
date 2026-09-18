import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * QUÉ MODELO ATIENDE CADA LLAMADA DE IMAGEN.
 * ---------------------------------------------------------------------------
 * ⚠️ ESTE TEST EXISTE PORQUE ESTE CABLEADO YA CAMBIÓ EN SILENCIO UNA VEZ Y COSTÓ TRES RONDAS
 * DE TRABAJO SOBRE EL PROMPT EQUIVOCADO. Al migrar la imagen a KIE (`0f51808`, 2026-08-25),
 * el modelo de OpenAI pasó a rechazar los prompts de landing 3 de 3 y `generateImage` cayó al
 * respaldo sin decir nada: el usuario vio que "el diseño cambió" sin que nadie tocara el diseño.
 * Un `console.warn` no es una señal — un test sí.
 *
 * Lo que se fija es el CONTRATO, no la implementación: quién atiende primero y quién de respaldo.
 * Desde el recableado del 2026-09-17 el primario es siempre el mismo y lo que cambia por pieza es
 * el RESPALDO, así que eso es lo que hay que poder leer de acá.
 */

const llamadas: string[] = []

vi.mock('./llm-openai', () => ({
  openaiGenerateImage: vi.fn(async () => { llamadas.push('openai:sunburst'); return 'B64_OPENAI' }),
  openaiCallStructured: vi.fn(), openaiCallReasoning: vi.fn(), toChatContent: vi.fn(),
}))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async ({ model }: { model: string }) => {
        llamadas.push(`google:${model}`)
        return { candidates: [{ content: { parts: [{ inlineData: { data: `B64_${model}` } }] } }] }
      },
    }
  },
  Modality: { IMAGE: 'IMAGE', TEXT: 'TEXT' },
}))

const { generateImage, geminiGenerateImage, NANO_BANANA_2, NANO_BANANA_PRO } = await import('./gemini')
const { openaiGenerateImage } = await import('./llm-openai')

beforeEach(() => {
  llamadas.length = 0
  vi.mocked(openaiGenerateImage).mockImplementation(async () => { llamadas.push('openai:sunburst'); return 'B64_OPENAI' })
})

describe('el primario es el mismo en todo el hub', () => {
  it('atiende el modelo de imagen de OpenAI por su SDK', async () => {
    await generateImage([{ text: 'x' }], 3, { respaldo: NANO_BANANA_2 })
    expect(llamadas).toEqual(['openai:sunburst'])
  })

  // Un rechazo por MODERACIÓN llega como un throw igual que un fallo de red, y el respaldo es la
  // respuesta correcta: reintentar con el que ya dijo que no es repetirle la pregunta.
  it('si el primario FALLA, atiende el respaldo que pidió el call site', async () => {
    vi.mocked(openaiGenerateImage).mockRejectedValueOnce(new Error('moderación'))
    const out = await generateImage([{ text: 'x' }], 3, { respaldo: NANO_BANANA_PRO })
    expect(llamadas).toEqual([`google:${NANO_BANANA_PRO}`])
    expect(out).toBe(`B64_${NANO_BANANA_PRO}`)
  })

  it('una respuesta VACÍA también cae al respaldo, no devuelve vacío', async () => {
    // El mock registra la llamada Y devuelve vacío: con `mockResolvedValueOnce` a secas se
    // pierde el registro y el test mediría el mock, no el despacho.
    vi.mocked(openaiGenerateImage).mockImplementationOnce(async () => { llamadas.push('openai:sunburst'); return '' })
    await generateImage([{ text: 'x' }], 3, { respaldo: NANO_BANANA_2 })
    expect(llamadas).toEqual(['openai:sunburst', `google:${NANO_BANANA_2}`])
  })

  // ⚠️ Los dos modelos de Google NO son intercambiables: el pro se paga donde la pieza es la cara
  // de la marca (identidad, mockup, secciones y talento de landing, avatar) y el flash donde es un
  // insumo (logo, etiqueta, anuncios). Que el call site elija mal no es un error de tipos, así que
  // esto fija que `respaldo` llegue de verdad al modelo y no se pise con un default.
  it('el respaldo NO está hardcodeado: cada call site elige el suyo', async () => {
    vi.mocked(openaiGenerateImage).mockRejectedValue(new Error('moderación'))
    await generateImage([{ text: 'x' }], 3, { respaldo: NANO_BANANA_2 })
    await generateImage([{ text: 'x' }], 3, { respaldo: NANO_BANANA_PRO })
    expect(llamadas).toEqual([`google:${NANO_BANANA_2}`, `google:${NANO_BANANA_PRO}`])
  })
})

describe('la placa de zona de landing', () => {
  // El modelo de OpenAI modera el encuadre de cuerpo sin rostro en 4 de 4 corridas, así que no
  // sirve ni de primario ni de respaldo: la placa va DERECHO a nano-banana-2.
  it('no toca el primario de OpenAI ni por asomo', async () => {
    const out = await geminiGenerateImage(NANO_BANANA_2, [{ text: 'x' }], 3, { aspectRatio: '3:4' })
    expect(llamadas).toEqual([`google:${NANO_BANANA_2}`])
    expect(llamadas).not.toContain('openai:sunburst')
    expect(out).toBe(`B64_${NANO_BANANA_2}`)
  })
})

describe('KIE ya no atiende ninguna imagen', () => {
  // El render de video con Grok sigue en KIE (`lib/video-ads/kie.ts`), pero ninguna IMAGEN.
  // Si alguien vuelve a meter un transporte intermedio acá, el síntoma es el de 2026-08-25.
  it('ningún camino de imagen importa un módulo de KIE', async () => {
    const fs = await import('fs')
    for (const f of ['lib/gemini.ts', 'lib/llm-openai.ts', 'lib/landing/talent.ts']) {
      expect(fs.readFileSync(`${process.cwd()}/${f}`, 'utf-8')).not.toMatch(/from '.*kie-image'/)
    }
  })
})
