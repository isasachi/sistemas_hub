import { describe, it, expect } from 'vitest'
import { sizeFor, toChatContent, splitImageParts, useOpenAI } from './llm-openai'
import type { Part } from '@google/genai'

describe('llm-openai (cableado alternativo)', () => {
  it('useOpenAI solo con LLM_PROVIDER=openai', () => {
    const prev = process.env.LLM_PROVIDER
    process.env.LLM_PROVIDER = 'openai'
    expect(useOpenAI()).toBe(true)
    process.env.LLM_PROVIDER = 'gemini'
    expect(useOpenAI()).toBe(false)
    delete process.env.LLM_PROVIDER
    expect(useOpenAI()).toBe(false)
    if (prev !== undefined) process.env.LLM_PROVIDER = prev
  })

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
})
