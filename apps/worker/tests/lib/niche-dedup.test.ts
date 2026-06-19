import { describe, it, expect } from 'vitest'
import { resolveGateAnswer } from '@/lib/product-hunter/niche-dedup'

const CANDS = ['rodilla', 'alopecia', 'cabello', 'espalda']

describe('resolveGateAnswer', () => {
  it('devuelve el id existente cuando el LLM matchea un mercado', () => {
    expect(resolveGateAnswer('alopecia', 'calvicie', CANDS)).toBe('alopecia')
  })

  it('NONE → null (mercado nuevo, se scrapea)', () => {
    expect(resolveGateAnswer('NONE', 'cafetera', CANDS)).toBeNull()
    expect(resolveGateAnswer('none', 'cafetera', CANDS)).toBeNull()
    expect(resolveGateAnswer('', 'cafetera', CANDS)).toBeNull()
  })

  it('no aliasa a sí mismo', () => {
    expect(resolveGateAnswer('rodilla', 'rodilla', CANDS)).toBeNull()
  })

  it('rechaza ids inventados que no están en la lista (anti-alucinación)', () => {
    expect(resolveGateAnswer('codo', 'codera', CANDS)).toBeNull()
  })

  it('normaliza mayúsculas/espacios del LLM contra los candidatos', () => {
    expect(resolveGateAnswer('  Rodilla ', 'dolor de rodilla', CANDS)).toBe('rodilla')
  })
})
