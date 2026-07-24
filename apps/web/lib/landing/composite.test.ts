import { describe, it, expect } from 'vitest'
import { sniffImageMime } from './composite'

// Regresión del bug de cta-final negro: la escena de Gemini/OpenAI es PNG, pero renderComposite
// la etiquetaba image/jpeg → el decodificador de @vercel/og tiraba y la imagen salía negra.
describe('sniffImageMime', () => {
  it('detecta PNG por magic bytes', () => {
    expect(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png')
  })
  it('detecta JPEG por magic bytes', () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
  })
  it('detecta WEBP (RIFF....WEBP)', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
    expect(sniffImageMime(webp)).toBe('image/webp')
  })
  it('default seguro PNG ante bytes desconocidos (nunca jpeg, que es lo que rompía)', () => {
    expect(sniffImageMime(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe('image/png')
  })
})
