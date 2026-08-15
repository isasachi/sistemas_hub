import { describe, it, expect } from 'vitest'
import { sizeFor, toChatContent, splitImageParts, stripNulls, toStrictSchema, isPermanentOpenAiError } from './llm-openai'
import { z } from 'zod'
import type { Part } from '@google/genai'

describe('llm-openai (motor primario)', () => {

  it('sizeFor deriva el tamaño del ratio, no de tres buckets', () => {
    // 9:16 real: 864/1536 = 0.5625 exacto. Antes daba 1024x1536, que es 2:3 (0.667).
    expect(sizeFor('9:16')).toBe('864x1536')
    expect(sizeFor('3:4')).toBe('1152x1536')
    expect(sizeFor('4:5')).toBe('1232x1536')
    expect(sizeFor('1:1')).toBe('1536x1536')
    expect(sizeFor('16:9')).toBe('1536x864')
    expect(sizeFor('2:3')).toBe('1024x1536')
    expect(sizeFor(undefined)).toBe('864x1536')
    expect(sizeFor('basura')).toBe('1024x1536')
  })

  it('sizeFor siempre devuelve múltiplos de 16 (lo único que la API exige)', () => {
    for (const r of ['9:16', '3:4', '4:5', '1:1', '16:9', '21:9', '5:4', '3:2', '2:3'])
      for (const n of sizeFor(r).split('x').map(Number))
        expect(n % 16).toBe(0)
  })

  it('toChatContent traduce text + inlineData a content de chat', () => {
    const parts: Part[] = [
      { text: 'hola' },
      { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
    ]
    const c = toChatContent(parts)
    expect(c).toEqual([
      { type: 'text', text: 'hola' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ])
  })

  it('splitImageParts separa prompt de imágenes', () => {
    const parts: Part[] = [
      { inlineData: { mimeType: 'image/png', data: 'IMG1' } },
      { text: 'linea 1' },
      { inlineData: { mimeType: 'image/png', data: 'IMG2' } },
      { text: 'linea 2' },
    ]
    const { prompt, images } = splitImageParts(parts)
    expect(prompt).toBe('linea 1\nlinea 2')
    expect(images).toEqual([
      { data: 'IMG1', mimeType: 'image/png' },
      { data: 'IMG2', mimeType: 'image/png' },
    ])
  })

  it('stripNulls poda null (opcionales OpenAI) sin tocar el resto, recursivo', () => {
    expect(stripNulls({
      headline: 'hola',
      subheadline: null,
      cards: [{ title: 'a', body: null }],
      sections: [{ headline: 'x', bullets: null }],
      keep: 0,
      keepFalse: false,
    })).toEqual({
      headline: 'hola',
      cards: [{ title: 'a' }],
      sections: [{ headline: 'x' }],
      keep: 0,
      keepFalse: false,
    })
  })

  it('toStrictSchema: all-required + additionalProperties:false + opcionales nullable (recursivo en arrays)', () => {
    const Section = z.object({ headline: z.string().max(60), cta: z.string().max(25).optional() })
    const Landing = z.object({ sections: z.array(Section) })
    const strict = toStrictSchema(z.toJSONSchema(Landing)) as any

    expect(strict.additionalProperties).toBe(false)
    expect(strict.$schema).toBeUndefined()
    const item = strict.properties.sections.items
    expect(item.additionalProperties).toBe(false)
    // TODAS las props ahora requeridas (headline + cta), aunque cta era opcional
    expect(new Set(item.required)).toEqual(new Set(['headline', 'cta']))
    // headline (requerido) sigue string; cta (opcional) se volvió nullable
    expect(item.properties.headline.type).toBe('string')
    expect(item.properties.cta.type).toEqual(['string', 'null'])
    // se conservan las restricciones soportadas
    expect(item.properties.headline.maxLength).toBe(60)
  })
})

// ─── Fail-fast a Gemini (2026-08-15) ────────────────────────────────────────
describe('isPermanentOpenAiError', () => {
  // Un rechazo por contenido es tan determinista como un 401: el MISMO prompt con la MISMA imagen
  // se rechaza siempre. Medido sobre la placa de zona `gluteos_piernas`: 4/4 rechazos, y 52s con
  // 3 reintentos contra 22s con uno. Reintentarlo es tiempo tirado antes del fallback.
  it('moderation_blocked es permanente — no se reintenta, se cae a Gemini de una', () => {
    expect(isPermanentOpenAiError({ status: 400, code: 'moderation_blocked' })).toBe(true)
  })

  it('sigue tratando billing y auth como permanentes', () => {
    expect(isPermanentOpenAiError({ code: 'insufficient_quota' })).toBe(true)
    expect(isPermanentOpenAiError({ status: 401 })).toBe(true)
    expect(isPermanentOpenAiError({ status: 403 })).toBe(true)
  })

  // Lo transitorio SÍ se reintenta: si esto devolviera true, un 500 puntual de OpenAI mandaría
  // toda la generación a Gemini sin darle una segunda chance al primario.
  it('lo transitorio NO es permanente', () => {
    expect(isPermanentOpenAiError({ status: 500 })).toBe(false)
    expect(isPermanentOpenAiError({ status: 429, code: 'rate_limit_exceeded' })).toBe(false)
    expect(isPermanentOpenAiError(new Error('socket hang up'))).toBe(false)
    expect(isPermanentOpenAiError(undefined)).toBe(false)
  })
})
