import { describe, it, expect } from 'vitest'
import { sizeFor, toChatContent, splitImageParts, stripNulls, toStrictSchema } from './llm-openai'
import { z } from 'zod'
import type { Part } from '@google/genai'

describe('llm-openai (motor primario)', () => {

  it('sizeFor mapea aspectRatio → tamaño válido de gpt-image-2', () => {
    expect(sizeFor('9:16')).toBe('1024x1536')
    expect(sizeFor('3:4')).toBe('1024x1536')
    expect(sizeFor('4:5')).toBe('1024x1536')
    expect(sizeFor('1:1')).toBe('1024x1024')
    expect(sizeFor('16:9')).toBe('1536x1024')
    expect(sizeFor(undefined)).toBe('1024x1536')
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
