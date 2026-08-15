import { describe, it, expect } from 'vitest'
import { snapAspectRatio } from './aspect'

describe('snapAspectRatio', () => {
  it('la referencia real que salió 16:9 por error (335x597) es 9:16', () => {
    expect(snapAspectRatio(335, 597)).toBe('9:16')
  })

  it('reconoce los formatos comunes', () => {
    expect(snapAspectRatio(1080, 1920)).toBe('9:16')
    expect(snapAspectRatio(1920, 1080)).toBe('16:9')
    expect(snapAspectRatio(1024, 1024)).toBe('1:1')
    expect(snapAspectRatio(1080, 1350)).toBe('4:5')
  })

  it('pega al más cercano sin inventar ratios nuevos', () => {
    expect(snapAspectRatio(1000, 1005)).toBe('1:1')
    expect(snapAspectRatio(941, 1672)).toBe('9:16')
  })
})
