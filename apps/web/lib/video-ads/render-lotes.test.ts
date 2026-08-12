import { describe, it, expect } from 'vitest'
import { totalDuration, resumeSeed, mergeRescue, renderQuotaError } from './render-lotes'
import type { Lote } from './lotes'

const lote = (n: number, over: Partial<Lote> = {}): Lote => ({
  n,
  tomas: [{ n, duracionSeg: 5, accionVisual: 'a', personaje: 'p', producto: 'x', locucion: 'l', tiempoOriginal: '00:00' }],
  duracionSeg: 5,
  prompt: '',
  taskId: null,
  status: 'idle',
  videoUrl: null,
  failMsg: null,
  ...over,
})

describe('totalDuration', () => {
  it('suma duracionSeg de todos los lotes, mezclando reales y placeholders', () => {
    const lotes = [lote(1, { duracionSeg: 8, taskId: 't1', status: 'waiting' }), lote(2, { duracionSeg: 6 })]
    expect(totalDuration(lotes)).toBe(14)
  })

  it('array vacío suma 0', () => {
    expect(totalDuration([])).toBe(0)
  })
})

describe('resumeSeed', () => {
  it('conserva el lote existente si ya tiene taskId (no lo recrea)', () => {
    const base = [lote(1), lote(2), lote(3)]
    const existentes = [lote(1, { taskId: 't1', status: 'waiting', prompt: 'ya armado' }), lote(2), lote(3)]
    const seed = resumeSeed(base, existentes)
    expect(seed[0]).toBe(existentes[0])
    expect(seed[0].taskId).toBe('t1')
  })

  it('usa el lote fresco de `base` si el existente no tiene taskId (nunca arrancó)', () => {
    const base = [lote(1, { prompt: 'fresco' }), lote(2)]
    const existentes = [lote(1, { prompt: 'viejo, sin taskId' }), lote(2)]
    const seed = resumeSeed(base, existentes)
    expect(seed[0].prompt).toBe('fresco')
  })

  it('sin lotes existentes, todo sale de base tal cual (primer render)', () => {
    const base = [lote(1), lote(2)]
    expect(resumeSeed(base, [])).toEqual(base)
  })

  it('un base más largo que los existentes usa el fresco para el índice que falta', () => {
    const base = [lote(1), lote(2), lote(3)]
    const existentes = [lote(1, { taskId: 't1' })]
    const seed = resumeSeed(base, existentes)
    expect(seed[0].taskId).toBe('t1')
    expect(seed[1]).toBe(base[1])
    expect(seed[2]).toBe(base[2])
  })
})

describe('mergeRescue', () => {
  // El caso que motivó el fix: sin esto, un array de largo 1 (solo lo completado)
  // hacía que `lote-status` calculara `done: true` con dos tercios del video sin
  // renderizar.
  it('fallo total (0 completados): el array de rescate son los placeholders completos de `seed`', () => {
    const seed = [lote(1), lote(2), lote(3)]
    const rescate = mergeRescue(seed, [])
    expect(rescate).toHaveLength(3)
    expect(rescate.every((l) => l.taskId === null && l.status === 'idle')).toBe(true)
  })

  it('fallo parcial (lote 1 completado, 2 y 3 quedan pendientes): conserva el taskId pagado', () => {
    const seed = [lote(1), lote(2), lote(3)]
    const completados = [lote(1, { taskId: 't1', status: 'waiting', prompt: 'p1' })]
    const rescate = mergeRescue(seed, completados)
    expect(rescate).toHaveLength(3)
    expect(rescate[0].taskId).toBe('t1')
    expect(rescate[1].taskId).toBeNull()
    expect(rescate[1].status).toBe('idle')
    expect(rescate[2].taskId).toBeNull()
  })

  it('todos completados: el resultado es exactamente `completados`, sin placeholders de más', () => {
    const seed = [lote(1), lote(2)]
    const completados = [lote(1, { taskId: 't1' }), lote(2, { taskId: 't2' })]
    expect(mergeRescue(seed, completados)).toEqual(completados)
  })
})

describe('renderQuotaError', () => {
  it('null cuando lo usado más lo pendiente entra en el límite', () => {
    expect(renderQuotaError(2, 0, 3)).toBeNull()
    expect(renderQuotaError(1, 2, 3)).toBeNull()
  })

  it('mensaje cuando se pasa del límite, singular/plural correcto', () => {
    // pendientes singular (1 render) contra una cuota ya agotada (0 restantes: plural).
    expect(renderQuotaError(1, 3, 3)).toMatch(/necesita 1 render y te quedan 0\./)
    // pendientes plural (2 renders) contra 1 restante (singular: "queda 1").
    expect(renderQuotaError(2, 2, 3)).toMatch(/necesita 2 renders y te queda 1\./)
    // pendientes plural contra 2 restantes (plural: "quedan 2").
    expect(renderQuotaError(3, 0, 2)).toMatch(/necesita 3 renders y te quedan 2\./)
  })

  it('reanudar reduce lo pendiente: 2 lotes ya pagados no cuentan contra el límite otra vez', () => {
    // Guión de 3 lotes, 2 ya renderizados y pagados (usados=2), falta 1 por crear.
    // Sin la distinción pendientes vs. total, esto se leería como "3 más" y bloquearía
    // un reintento que en realidad solo necesita 1.
    expect(renderQuotaError(1, 2, 3)).toBeNull()
  })
})
