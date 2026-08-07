import { describe, it, expect } from 'vitest'
import { pickIntroState, type HistoryItem } from '@/components/tools/ui/types'

const s = (p: Partial<HistoryItem>): HistoryItem => ({
  id: 'x', created_at: '2026-08-07', step: 0, title: 'Sesión', thumb: null, done: false, ...p,
})

describe('pickIntroState', () => {
  it('ofrece retomar solo si la última pasó del paso 1 sin terminar', () => {
    expect(pickIntroState([s({ id: 'a', step: 2 })]).resume?.id).toBe('a')
    // Recién creada: no es "algo a medias".
    expect(pickIntroState([s({ id: 'a', step: 0 })]).resume).toBeNull()
    // Terminada: no hay nada que retomar.
    expect(pickIntroState([s({ id: 'a', step: 4, done: true })]).resume).toBeNull()
  })

  it('la última terminada sigue apareciendo aunque encima haya una a medias', () => {
    const r = pickIntroState([s({ id: 'nueva', step: 2 }), s({ id: 'vieja', step: 4, done: true })])
    expect(r.resume?.id).toBe('nueva')
    expect(r.last?.id).toBe('vieja')
  })

  it('sin sesiones (o sin cargar todavía) no muestra ningún aviso', () => {
    expect(pickIntroState(null)).toEqual({ last: null, resume: null })
    expect(pickIntroState([])).toEqual({ last: null, resume: null })
  })
})
