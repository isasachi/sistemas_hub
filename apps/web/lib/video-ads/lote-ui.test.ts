import { describe, it, expect } from 'vitest'
import { isInFlight, isStuck } from './lote-ui'
import type { Lote } from './lotes'

const lote = (over: Partial<Lote>): Lote => ({
  n: 1,
  tomas: [],
  duracionSeg: 10,
  prompt: '',
  taskId: null,
  status: 'idle',
  videoUrl: null,
  failMsg: null,
  scriptHash: null,
  ...over,
})

describe('isInFlight', () => {
  it('true para un lote con taskId, sin video y sin fail — puede seguir cambiando', () => {
    const l = lote({ taskId: 'abc', status: 'generating', videoUrl: null })
    expect(isInFlight(l)).toBe(true)
  })

  it('false para un lote sin taskId — nunca se creó una tarea que consultar', () => {
    const l = lote({ taskId: null, status: 'idle', videoUrl: null })
    expect(isInFlight(l)).toBe(false)
  })

  it('false para un lote fallido — ya es un resultado final, no va a cambiar', () => {
    const l = lote({ taskId: 'abc', status: 'fail', videoUrl: null, failMsg: 'nsfw' })
    expect(isInFlight(l)).toBe(false)
  })

  it('false para un lote con video — ya terminó', () => {
    const l = lote({ taskId: 'abc', status: 'success', videoUrl: 'https://x/video.mp4' })
    expect(isInFlight(l)).toBe(false)
  })
})

describe('isStuck', () => {
  it('true para un lote sin taskId y sin video — el caso "a medias" de un render cortado', () => {
    const l = lote({ taskId: null, status: 'idle', videoUrl: null })
    expect(isStuck(l)).toBe(true)
  })

  it('false para un lote con taskId aunque todavía no tenga video — sigue en curso, no a medias', () => {
    const l = lote({ taskId: 'abc', status: 'generating', videoUrl: null })
    expect(isStuck(l)).toBe(false)
  })

  it('false para un lote fallido — el fail siempre viene con taskId, no es "a medias"', () => {
    const l = lote({ taskId: 'abc', status: 'fail', videoUrl: null, failMsg: 'nsfw' })
    expect(isStuck(l)).toBe(false)
  })

  it('false para un lote con video', () => {
    const l = lote({ taskId: 'abc', status: 'success', videoUrl: 'https://x/video.mp4' })
    expect(isStuck(l)).toBe(false)
  })
})
